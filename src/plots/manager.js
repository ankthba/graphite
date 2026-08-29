// PlotManager: turns state items into three.js objects, incrementally rebuilds
// on edits and slider changes, tracks per-item compile errors for the UI.
import * as THREE from 'three';
import { parse } from '../math/parser.js';
import { freeVars } from '../math/compiler.js';
import {
  gridSurfaceGeometry, applyColormap, surfaceMaterial, wireframeOverlay,
  buildCurveObject, buildVectorFieldObject, buildImplicitGeometry,
  buildContoursObject, buildPointObject, makeArrow, disposeDeep,
  buildSectionObject, buildRiemannBoxes,
} from './build.js';

export class PlotManager {
  constructor(viewport, state) {
    this.viewport = viewport;
    this.state = state;
    this.objects = new Map();   // itemId -> THREE.Object3D
    this.meta = new Map();      // itemId -> { usedSliders:Set, f2, ast, domain, ... }

    state.on('item-geometry', (item) => this.rebuild(item));
    state.on('item-removed', (item) => this.remove(item.id));
    state.on('slider-value', (slider) => this.onSlider(slider.name));
  }

  remove(id) {
    const obj = this.objects.get(id);
    if (obj) {
      this.viewport.plotRoot.remove(obj);
      disposeDeep(obj);
      this.objects.delete(id);
      this.meta.delete(id);
      this.viewport.requestRender();
    }
  }

  onSlider(name) {
    for (const item of this.state.items) {
      const m = this.meta.get(item.id);
      if (m && m.usedSliders && m.usedSliders.has(name)) this.rebuild(item);
    }
  }

  itemForObject(obj) {
    let o = obj;
    while (o) {
      if (o.userData.itemId) return this.state.get(o.userData.itemId);
      o = o.parent;
    }
    return null;
  }

  rebuild(item) {
    if (item.type === 'slider') return;
    this.remove(item.id);
    const runtime = { errors: {}, unknown: [] };
    item.runtime = runtime;
    let obj = null;
    try {
      if (item.visible) {
        if (item.type === 'surface') obj = this.buildSurface(item, runtime);
        else if (item.type === 'parametric') obj = this.buildParametric(item, runtime);
        else if (item.type === 'curve') obj = this.buildCurve(item, runtime);
        else if (item.type === 'implicit') obj = this.buildImplicit(item, runtime);
        else if (item.type === 'field') obj = this.buildField(item, runtime);
        else if (item.type === 'point') obj = this.buildPoint(item, runtime);
        else if (item.type === 'vector') obj = this.buildVector(item, runtime);
      }
    } catch (e) {
      runtime.errors._build = e.message;
      console.error('build failed', item, e);
    }
    if (obj) {
      obj.userData.itemId = item.id;
      // solid geometry drops a soft shadow on the floor; translucent meshes
      // (trace planes, Riemann boxes, tinted overlays) must not cast
      const solid = (item.opacity ?? 1) >= 0.6;
      obj.traverse((o) => {
        if ((o.isMesh || o.isInstancedMesh) && !o.isSprite) {
          const m = o.material;
          o.castShadow = solid && !(m && m.transparent && m.opacity < 0.6);
        }
      });
      this.objects.set(item.id, obj);
      this.viewport.plotRoot.add(obj);
    }
    this.state.emit('runtime-updated', item);
    this.state.emit('item-rebuilt', item); // fires on EVERY rebuild path, incl. slider ticks
    this.viewport.requestRender();
  }

  // Domain bounds, t-ranges, and implicit levels may reference sliders too —
  // track them so those sliders also trigger rebuilds.
  _trackConstSliders(item, srcs) {
    const m = this.meta.get(item.id);
    if (!m) return;
    const sliders = this.state.sliders();
    for (const src of srcs) {
      try {
        for (const v of freeVars(parse(String(src ?? '')))) {
          if (v in sliders) m.usedSliders.add(v);
        }
      } catch { /* malformed bound: surfaced by evalConst fallback + red underline */ }
    }
  }

  // compile several expression props; returns {fns, ok} and fills runtime
  _compileSet(item, runtime, defs) {
    const used = new Set();
    const unknown = new Set();
    const fns = {};
    const asts = {};
    let ok = true;
    for (const [prop, intrinsics] of defs) {
      const c = this.state.compileExpr(String(item[prop] ?? ''), intrinsics);
      if (c.error) { runtime.errors[prop] = c.error; ok = false; continue; }
      for (const u of c.unknown) unknown.add(u);
      for (const u of c.used) used.add(u);
      if (c.unknown.length) { ok = false; continue; }
      fns[prop] = this.state.bind(c, intrinsics.length);
      asts[prop] = c.ast;
    }
    runtime.unknown = [...unknown];
    this.meta.set(item.id, { usedSliders: used, asts });
    return { fns, asts, ok };
  }

  _domain(item) {
    const s = this.state;
    return {
      aMin: s.evalConst(item.aMin, -5), aMax: s.evalConst(item.aMax, 5),
      bMin: s.evalConst(item.bMin, -5), bMax: s.evalConst(item.bMax, 5),
    };
  }

  /* ---------------- surface (cartesian / cylindrical / spherical) ---------------- */
  buildSurface(item, runtime) {
    const intr = SURFACE_INTR[item.mode];
    const defs = [['expr', intr]];
    const hasRestrict = item.restrict && String(item.restrict).trim();
    if (hasRestrict) defs.push(['restrict', intr]);
    const { fns, asts, ok } = this._compileSet(item, runtime, defs);
    if (!ok) return null;
    this._trackConstSliders(item, [item.aMin, item.aMax, item.bMin, item.bMax]);
    // domain restriction: keep only where g ≤ 0 (in the mode's own coordinates)
    const g = hasRestrict ? fns.restrict : null;
    const fRaw = fns.expr;
    const f = g ? (u, v) => (g(u, v) > 0 ? NaN : fRaw(u, v)) : fRaw;
    const d = this._domain(item);
    const B = this.state.settings.bounds;
    const clip = item.clip ? [B.zmin, B.zmax] : null;
    const res = item.res | 0;

    let map, f2 = null;
    if (item.mode === 'cartesian') {
      map = (x, y, out) => { out[0] = x; out[1] = y; out[2] = f(x, y); return true; };
      f2 = f;
    } else if (item.mode === 'cylindrical') {
      map = (r, th, out) => {
        const z = f(r, th);
        out[0] = r * Math.cos(th); out[1] = r * Math.sin(th); out[2] = z;
        return true;
      };
    } else { // spherical: rho = f(theta, phi)
      map = (th, ph, out) => {
        const rho = f(th, ph);
        const sp = Math.sin(ph);
        out[0] = rho * sp * Math.cos(th); out[1] = rho * sp * Math.sin(th); out[2] = rho * Math.cos(ph);
        return true;
      };
    }

    const { geo, zRange } = gridSurfaceGeometry(map, {
      nu: res, nv: res, uMin: d.aMin, uMax: d.aMax, vMin: d.bMin, vMax: d.bMax, clipZ: clip,
    });
    const group = new THREE.Group();
    const useCmap = !!item.cmap;
    if (useCmap) applyColormap(geo, item.cmap, zRange);
    const mesh = new THREE.Mesh(geo, surfaceMaterial({
      color: item.color, opacity: item.opacity, useVertexColors: useCmap,
    }));
    mesh.renderOrder = item.opacity < 1 ? 2 : 0;
    group.add(mesh);
    if (item.wire) group.add(wireframeOverlay(geo, this.state.settings.dark ? 0xffffff : 0x223, 0.13));

    if (item.contours && item.mode === 'cartesian' && geo.getIndex().count > 0) {
      const n = Math.max(2, item.contourCount | 0);
      const [lo, hi] = zRange;
      const levels = [];
      for (let i = 1; i <= n; i++) levels.push(lo + (hi - lo) * (i / (n + 1)));
      group.add(buildContoursObject(f2, {
        xmin: d.aMin, xmax: d.aMax, ymin: d.bMin, ymax: d.bMax,
        nx: 150, ny: 150, levels, zRange,
        cmapName: item.cmap || 'viridis',
        floorZ: B.zmin + (B.zmax - B.zmin) * 0.002,
        onSurface: true, onFloor: item.contourFloor,
      }));
    }

    // movable cross-section trace plane (value clamped to the live window)
    if (item.mode === 'cartesian' && item.section && item.section !== 'none') {
      const [sLo, sHi] = item.section === 'x' ? [d.aMin, d.aMax]
        : item.section === 'y' ? [d.bMin, d.bMax] : [B.zmin, B.zmax];
      const sVal = Math.min(sHi, Math.max(sLo, +item.sectionVal || 0));
      group.add(buildSectionObject(f2, {
        axis: item.section, val: sVal,
        domain: d, bounds: B, span: this.viewport.span,
      }));
    }

    // Riemann sum boxes for ∬ f dA
    if (item.mode === 'cartesian' && item.riemann) {
      const n = Math.min(40, Math.max(2, item.riemannN | 0));
      const rb = buildRiemannBoxes(f2, { domain: d, n });
      group.add(rb.group);
      runtime.riemann = { sum: rb.sum, fine: rb.fine, n };
    }

    // stash for the inspector
    const m = this.meta.get(item.id);
    m.f2 = f2; m.domain = d; m.zRange = zRange; m.ast = asts.expr; m.mode = item.mode;
    return group;
  }

  /* ---------------- parametric surface ---------------- */
  buildParametric(item, runtime) {
    const { fns, ok } = this._compileSet(item, runtime, [
      ['ex', ['u', 'v']], ['ey', ['u', 'v']], ['ez', ['u', 'v']],
    ]);
    if (!ok) return null;
    this._trackConstSliders(item, [item.aMin, item.aMax, item.bMin, item.bMax]);
    const d = this._domain(item);
    const B = this.state.settings.bounds;
    const res = item.res | 0;
    const map = (u, v, out) => {
      out[0] = fns.ex(u, v); out[1] = fns.ey(u, v); out[2] = fns.ez(u, v);
      return true;
    };
    const { geo, zRange } = gridSurfaceGeometry(map, {
      nu: res, nv: res, uMin: d.aMin, uMax: d.aMax, vMin: d.bMin, vMax: d.bMax,
      clipZ: item.clip ? [B.zmin, B.zmax] : null,
    });
    const group = new THREE.Group();
    const useCmap = !!item.cmap;
    if (useCmap) applyColormap(geo, item.cmap, zRange);
    const mesh = new THREE.Mesh(geo, surfaceMaterial({
      color: item.color, opacity: item.opacity, useVertexColors: useCmap,
    }));
    mesh.renderOrder = item.opacity < 1 ? 2 : 0;
    group.add(mesh);
    if (item.wire) group.add(wireframeOverlay(geo, this.state.settings.dark ? 0xffffff : 0x223, 0.13));
    return group;
  }

  /* ---------------- space curve ---------------- */
  buildCurve(item, runtime) {
    const { fns, ok } = this._compileSet(item, runtime, [
      ['ex', ['t']], ['ey', ['t']], ['ez', ['t']],
    ]);
    if (!ok) return null;
    this._trackConstSliders(item, [item.tMin, item.tMax]);
    const tmin = this.state.evalConst(item.tMin, 0);
    const tmax = this.state.evalConst(item.tMax, 1);
    const span = this.viewport.span;
    const evalPt = (t, out) => {
      out[0] = fns.ex(t); out[1] = fns.ey(t); out[2] = fns.ez(t);
      return true;
    };
    const group = buildCurveObject(evalPt, {
      tmin, tmax, samples: item.samples | 0,
      radius: span * 0.004 * (item.thick || 1), color: item.color,
    });

    const m = this.meta.get(item.id);
    m.evalPt = evalPt; m.tmin = tmin; m.tmax = tmax;

    // arc length (polyline sum over the samples)
    {
      let L = 0, have = false;
      const q = [0, 0, 0], q2 = [0, 0, 0];
      const n = Math.min(item.samples | 0, 2000) || 400;
      for (let i = 0; i <= n; i++) {
        const t = tmin + (tmax - tmin) * (i / n);
        evalPt(t, q2);
        if (Number.isFinite(q2[0]) && Number.isFinite(q2[1]) && Number.isFinite(q2[2])) {
          if (have) L += Math.hypot(q2[0] - q[0], q2[1] - q[1], q2[2] - q[2]);
          q[0] = q2[0]; q[1] = q2[1]; q[2] = q2[2];
          have = true;
        } else have = false;
      }
      m.arcLength = L;
    }

    if (item.frame) {
      const arrows = {
        T: makeArrow('#e8604c', 0.02), N: makeArrow('#3fbf7f', 0.02), B: makeArrow('#5b8def', 0.02),
      };
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(span * 0.011, 14, 14),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2 }));
      dot.userData.unpickable = true;
      const fg = new THREE.Group();
      fg.add(arrows.T, arrows.N, arrows.B, dot);
      group.add(fg);
      m.frame = { arrows, dot };
      if (item.showVA) {
        m.frame.v = makeArrow('#e07f10', 0.018);   // velocity r′
        m.frame.a = makeArrow('#b0498d', 0.018);   // acceleration r″
        fg.add(m.frame.v, m.frame.a);
      }
      if (item.showOsc) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.012, 8, 128),
          new THREE.MeshPhysicalMaterial({ color: 0x8b5cf6, roughness: 0.4, clearcoat: 0.3 }));
        ring.userData.unpickable = true;
        fg.add(ring);
        m.frame.ring = ring;
      }
      this.updateFrame(item);
    }
    return group;
  }

  // TNB frame at item.frameT ∈ [0,1] — cheap update, no geometry rebuild
  updateFrame(item) {
    const m = this.meta.get(item.id);
    if (!m || !m.frame || !m.evalPt) return;
    const { tmin, tmax, evalPt, frame } = m;
    const t = tmin + (tmax - tmin) * item.frameT;
    const h = Math.max((tmax - tmin) * 1e-4, 1e-7);
    const p = [0, 0, 0], p1 = [0, 0, 0], p2 = [0, 0, 0];
    evalPt(t, p); evalPt(t + h, p1); evalPt(t - h, p2);
    const d1 = p1.map((v, i) => (v - p2[i]) / (2 * h));           // r'
    const dd = p1.map((v, i) => (v - 2 * p[i] + p2[i]) / (h * h)); // r''
    const speed = Math.hypot(...d1);
    const T = d1.map((v) => v / (speed || 1));
    // N ∝ r'' - (r''·T)T
    const dot = dd[0] * T[0] + dd[1] * T[1] + dd[2] * T[2];
    let N = dd.map((v, i) => v - dot * T[i]);
    const nl = Math.hypot(...N);
    N = nl > 1e-9 ? N.map((v) => v / nl) : [0, 0, 0];
    const Bv = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    const cross = [
      d1[1] * dd[2] - d1[2] * dd[1], d1[2] * dd[0] - d1[0] * dd[2], d1[0] * dd[1] - d1[1] * dd[0],
    ];
    const kappa = speed > 1e-9 ? Math.hypot(...cross) / (speed ** 3) : 0;
    const span = this.viewport.span;
    const len = span * 0.13;
    frame.arrows.T.userData.setArrow(p, T, len);
    frame.arrows.N.userData.setArrow(p, N, nl > 1e-9 ? len : 0);
    frame.arrows.B.userData.setArrow(p, Bv, nl > 1e-9 ? len : 0);
    frame.dot.position.set(...p);

    const clampLen = (mag) => Math.min(Math.max(mag * span * 0.035, span * 0.05), span * 0.45);
    if (frame.v) {
      const vm = Math.hypot(...d1), am = Math.hypot(...dd);
      frame.v.userData.setArrow(p, d1, vm > 1e-9 ? clampLen(vm) : 0);
      frame.a.userData.setArrow(p, dd, am > 1e-9 ? clampLen(am) : 0);
    }
    if (frame.ring) {
      const R = kappa > 1e-9 ? 1 / kappa : Infinity;
      if (Number.isFinite(R) && R < span * 2.5 && nl > 1e-9) {
        frame.ring.visible = true;
        frame.ring.position.set(p[0] + N[0] * R, p[1] + N[1] * R, p[2] + N[2] * R);
        const M4 = new THREE.Matrix4().makeBasis(
          new THREE.Vector3(...T), new THREE.Vector3(...N), new THREE.Vector3(...Bv));
        frame.ring.quaternion.setFromRotationMatrix(M4);
        frame.ring.scale.set(R, R, R);
      } else frame.ring.visible = false;
    }
    m.frameInfo = {
      t, p, T, N, B: Bv, kappa, speed, arcLength: m.arcLength,
      R: kappa > 1e-9 ? 1 / kappa : Infinity,
    };
    this.state.emit('frame-updated', item, m.frameInfo);
    this.viewport.requestRender();
  }

  /* ---------------- implicit surface ---------------- */
  buildImplicit(item, runtime) {
    const { fns, ok } = this._compileSet(item, runtime, [['expr', ['x', 'y', 'z']]]);
    if (!ok) return null;
    this._trackConstSliders(item, [item.level]);
    const level = this.state.evalConst(item.level, 0);
    const B = this.state.settings.bounds;
    const n = item.res | 0;
    const m = this.meta.get(item.id);
    m.f3 = fns.expr; m.level = level;
    const { geo, zRange } = buildImplicitGeometry(fns.expr, {
      ...B, nx: n, ny: n, nz: n, level,
    });
    const group = new THREE.Group();
    const useCmap = !!item.cmap;
    if (useCmap) applyColormap(geo, item.cmap, zRange);
    const mesh = new THREE.Mesh(geo, surfaceMaterial({
      color: item.color, opacity: item.opacity, useVertexColors: useCmap,
    }));
    mesh.renderOrder = item.opacity < 1 ? 2 : 0;
    group.add(mesh);
    return group;
  }

  /* ---------------- vector field ---------------- */
  buildField(item, runtime) {
    const { fns, ok } = this._compileSet(item, runtime, [
      ['ep', ['x', 'y', 'z']], ['eq', ['x', 'y', 'z']], ['er', ['x', 'y', 'z']],
    ]);
    if (!ok) return null;
    const evalVec = (x, y, z, out) => {
      out[0] = fns.ep(x, y, z); out[1] = fns.eq(x, y, z); out[2] = fns.er(x, y, z);
      return true;
    };
    this.meta.get(item.id).evalVec = evalVec;
    return buildVectorFieldObject(evalVec, {
      bounds: this.state.settings.bounds,
      density: item.density | 0, scale: item.scale, normalize: item.normalize,
      cmapName: item.cmap, solidColor: item.color, opacity: item.opacity,
    });
  }

  /* ---------------- point & vector ---------------- */
  buildPoint(item, runtime) {
    const { fns, ok } = this._compileSet(item, runtime, [
      ['ex', []], ['ey', []], ['ez', []],
    ]);
    if (!ok) return null;
    const span = this.viewport.span;
    return buildPointObject({
      x: fns.ex(), y: fns.ey(), z: fns.ez(),
      color: item.color, size: span * 0.012 * (item.size || 1), label: item.label,
    });
  }

  buildVector(item, runtime) {
    const { fns, ok } = this._compileSet(item, runtime, [
      ['ex', []], ['ey', []], ['ez', []], ['ox', []], ['oy', []], ['oz', []],
    ]);
    if (!ok) return null;
    const from = [fns.ox(), fns.oy(), fns.oz()];
    const dir = [fns.ex(), fns.ey(), fns.ez()];
    const len = Math.hypot(...dir);
    const g = new THREE.Group();
    const arrow = makeArrow(item.color, this.viewport.span * 0.0035);
    arrow.userData.setArrow(from, dir, len);
    // unlike overlay arrows, a plotted vector should be clickable in Inspect
    arrow.traverse((o) => { o.userData.unpickable = false; });
    g.add(arrow);
    return g;
  }
}

const SURFACE_INTR = {
  cartesian: ['x', 'y'],
  cylindrical: ['r', 'theta'],
  spherical: ['theta', 'phi'],
};
