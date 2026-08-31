// Inspector — the Calc III probe. Click an object to analyze it at a point:
//  · function surface  → f, fx, fy, ∇f, tangent plane, normal, traces,
//                        directional derivative D_u f with an angle control
//  · implicit surface  → F, ∇F, tangent plane to the level surface
//  · vector field      → F(p), |F|, div F, curl F (numeric)
//  · anything else     → coordinates
// Overlays update live while sliders animate.
import * as THREE from 'three';
import { derivative, toString as astToString } from '../math/autodiff.js';
import { makeArrow, disposeDeep, buildCurveObject, gridSurfaceGeometry } from '../plots/build.js';

const fmt = (v) => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(3);
  return String(Math.round(v * 1000) / 1000);
};
const fmtV = (v) => `⟨${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])}⟩`;

const COL = {
  plane: 0x2f6bdb, normal: '#2f6bdb', grad: '#e07f10', dir: '#8b5cf6',
  traceX: '#d0453a', traceY: '#1e8e57', curl: '#8b5cf6',
};

export class Inspector {
  constructor(viewport, state, manager, els) {
    this.vp = viewport;
    this.state = state;
    this.manager = manager;
    this.card = els.card;
    this.btn = els.btn;
    this.statusEl = els.status || null;
    this.active = false;
    this.target = null;   // { kind, itemId, ... }
    this.overlay = null;
    this.dirDeg = 45;     // directional-derivative angle (degrees from +x)

    this.btn.onclick = () => this.toggle();

    const canvas = viewport.renderer.domElement;
    let downPos = null;
    canvas.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.active || !downPos) return;
      const dx = e.clientX - downPos[0], dy = e.clientY - downPos[1];
      if (dx * dx + dy * dy > 25) return;
      this.onClick(e.clientX, e.clientY);
    });

    // 'item-rebuilt' fires on every geometry rebuild, including slider ticks,
    // so tangent planes / probes track animated surfaces live.
    state.on('item-rebuilt', (item) => {
      if (this.target && this.target.itemId === item.id) this.refresh();
    });
    state.on('item-removed', (item) => {
      if (this.target && this.target.itemId === item.id) this.clear();
    });
  }

  toggle(force) {
    this.active = force !== undefined ? force : !this.active;
    this.btn.classList.toggle('active', this.active);
    this.vp.container.classList.toggle('inspecting', this.active);
    if (!this.active) this.clear();
  }

  onClick(cx, cy) {
    const hit = this.vp.pick(cx, cy);
    if (hit) {
      const item = this.manager.itemForObject(hit.object);
      const meta = item && this.manager.meta.get(item.id);
      if (item?.type === 'surface' && item.mode === 'cartesian' && meta?.f2) {
        this.target = { kind: 'surface', itemId: item.id, a: hit.point.x, b: hit.point.y };
        return this.refresh();
      }
      if (item?.type === 'field' && meta?.evalVec) {
        this.target = { kind: 'field', itemId: item.id, p: [hit.point.x, hit.point.y, hit.point.z] };
        return this.refresh();
      }
      if (item?.type === 'implicit' && meta?.f3) {
        this.target = { kind: 'implicit', itemId: item.id, p: [hit.point.x, hit.point.y, hit.point.z] };
        return this.refresh();
      }
      if (item) {
        this.target = { kind: 'generic', itemId: item.id };
        this.clearOverlay();
        this.markPoint(hit.point.toArray());
        return this.buildGenericCard(item, hit.point);
      }
    }
    // nothing hit: if a vector field exists, probe it where the ray crosses z = 0
    const fieldItem = this.state.items.find((i) => i.type === 'field' && i.visible && this.manager.meta.get(i.id)?.evalVec);
    if (fieldItem) {
      const ray = this.vp.mathRay(cx, cy);
      if (Math.abs(ray.direction.z) > 1e-9) {
        const t = -ray.origin.z / ray.direction.z;
        if (t > 0) {
          const p = ray.origin.clone().addScaledVector(ray.direction, t);
          const B = this.state.settings.bounds;
          if (p.x >= B.xmin && p.x <= B.xmax && p.y >= B.ymin && p.y <= B.ymax) {
            this.target = { kind: 'field', itemId: fieldItem.id, p: [p.x, p.y, 0] };
            return this.refresh();
          }
        }
      }
    }
    this.clear();
  }

  refresh() {
    if (!this.target) return;
    const item = this.state.get(this.target.itemId);
    const meta = item && this.manager.meta.get(this.target.itemId);
    if (!item || !meta) return this.clear();
    if (this.target.kind === 'surface') this.refreshSurface(item, meta);
    else if (this.target.kind === 'field') this.refreshField(item, meta);
    else if (this.target.kind === 'implicit') this.refreshImplicit(item, meta);
    else if (this.target.kind === 'generic') return this.clear(); // marked point is stale after a rebuild
    this.vp.requestRender();
  }

  /* ================= function surface ================= */

  refreshSurface(item, meta) {
    const { a, b } = this.target;
    const f = meta.f2;
    if (!f) return this.clear();
    const c = f(a, b);
    if (!Number.isFinite(c)) return this.clear();
    const span = this.vp.span;
    const h = Math.max(span * 1e-5, 1e-8);
    const fx = (f(a + h, b) - f(a - h, b)) / (2 * h);
    const fy = (f(a, b + h) - f(a, b - h)) / (2 * h);
    const gradMag = Math.hypot(fx, fy);

    // second partials (wider step for stability) → Hessian discriminant
    const h2 = Math.max(span * 5e-4, 1e-6);
    const fxx = (f(a + h2, b) - 2 * c + f(a - h2, b)) / (h2 * h2);
    const fyy = (f(a, b + h2) - 2 * c + f(a, b - h2)) / (h2 * h2);
    const fxy = (f(a + h2, b + h2) - f(a + h2, b - h2) - f(a - h2, b + h2) + f(a - h2, b - h2)) / (4 * h2 * h2);
    const disc = fxx * fyy - fxy * fxy;

    let sfx = '', sfy = '';
    try {
      sfx = astToString(derivative(meta.ast, 'x'));
      sfy = astToString(derivative(meta.ast, 'y'));
    } catch { /* numeric only */ }

    this.buildSurfaceOverlay(item, meta, a, b, c, fx, fy, { fxx, fyy, fxy });
    this.buildSurfaceCard(a, b, c, fx, fy, gradMag, sfx, sfy, { fxx, fyy, fxy, disc });
    this._setStatus(`inspect (${fmt(a)}, ${fmt(b)}, ${fmt(c)})`);
  }

  _setStatus(txt) {
    if (this.statusEl) this.statusEl.textContent = txt || '';
  }

  buildSurfaceOverlay(item, meta, a, b, c, fx, fy, H) {
    this.clearOverlay();
    const g = new THREE.Group();
    const span = this.vp.span;
    const B = this.state.settings.bounds;

    // 2nd-degree Taylor approximation patch (optional)
    if (this.showTaylor && H) {
      const s = Math.min(meta.domain.aMax - meta.domain.aMin, meta.domain.bMax - meta.domain.bMin) * 0.26;
      const { geo } = gridSurfaceGeometry((du, dv, out) => {
        out[0] = a + du; out[1] = b + dv;
        out[2] = c + fx * du + fy * dv + 0.5 * (H.fxx * du * du + 2 * H.fxy * du * dv + H.fyy * dv * dv);
        return true;
      }, { nu: 40, nv: 40, uMin: -s, uMax: s, vMin: -s, vMax: s, clipZ: [B.zmin, B.zmax] });
      const taylor = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
        color: 0x8b5cf6, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
        roughness: 0.5, depthWrite: false,
      }));
      taylor.renderOrder = 3;
      taylor.userData.unpickable = true;
      g.add(taylor);
    }

    g.add(dotMesh([a, b, c], span));

    // tangent plane
    const n = new THREE.Vector3(-fx, -fy, 1).normalize();
    const size = Math.min(meta.domain.aMax - meta.domain.aMin, meta.domain.bMax - meta.domain.bMin) * 0.4;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        color: COL.plane, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
      }));
    plane.position.set(a, b, c);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    plane.userData.unpickable = true;
    plane.renderOrder = 3;
    g.add(plane);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(plane.geometry),
      new THREE.LineBasicMaterial({ color: COL.plane, transparent: true, opacity: 0.8 }));
    edges.position.copy(plane.position);
    edges.quaternion.copy(plane.quaternion);
    edges.userData.unpickable = true;
    g.add(edges);

    // normal + gradient (floor) arrows
    const nArrow = makeArrow(COL.normal, span * 0.0028);
    nArrow.userData.setArrow([a, b, c], [n.x, n.y, n.z], span * 0.13);
    g.add(nArrow);
    const gradMag = Math.hypot(fx, fy);
    const floor = B.zmin + span * 0.004;
    if (gradMag > 1e-9) {
      const gArrow = makeArrow(COL.grad, span * 0.003);
      const len = Math.min(Math.max(gradMag * span * 0.05, span * 0.04), span * 0.4);
      gArrow.userData.setArrow([a, b, floor], [fx, fy, 0], len);
      g.add(gArrow);
    }

    // dashed drop line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a, b, c), new THREE.Vector3(a, b, B.zmin),
    ]);
    const drop = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({
      color: 0x9aa1ad, dashSize: span * 0.02, gapSize: span * 0.015, transparent: true, opacity: 0.75,
    }));
    drop.computeLineDistances();
    drop.userData.unpickable = true;
    g.add(drop);

    // trace curves through the point
    const f = meta.f2;
    const d = meta.domain;
    const r = span * 0.002;
    const clip = item.clip ? [B.zmin, B.zmax] : null;
    const inZ = (z) => !clip || (z >= clip[0] && z <= clip[1]);
    const traceY = buildCurveObject((t, out) => {
      out[0] = a; out[1] = t; out[2] = f(a, t); return inZ(out[2]);
    }, { tmin: d.bMin, tmax: d.bMax, samples: 160, radius: r, color: COL.traceY });
    const traceX = buildCurveObject((t, out) => {
      out[0] = t; out[1] = b; out[2] = f(t, b); return inZ(out[2]);
    }, { tmin: d.aMin, tmax: d.aMax, samples: 160, radius: r, color: COL.traceX });
    traceX.traverse((o) => { o.userData.unpickable = true; });
    traceY.traverse((o) => { o.userData.unpickable = true; });
    g.add(traceX, traceY);

    // directional-derivative arrows (updated in place by updateDirArrows)
    this._dirState = { a, b, c, fx, fy, floor };
    this._dirFloor = makeArrow(COL.dir, span * 0.003);
    this._dirSurf = makeArrow(COL.dir, span * 0.0028);
    g.add(this._dirFloor, this._dirSurf);
    this.updateDirArrows();

    this.overlay = g;
    this.vp.overlayRoot.add(g);
  }

  updateDirArrows() {
    if (!this._dirState || !this._dirFloor) return;
    const { a, b, c, fx, fy, floor } = this._dirState;
    const span = this.vp.span;
    const th = this.dirDeg * Math.PI / 180;
    const ux = Math.cos(th), uy = Math.sin(th);
    const du = fx * ux + fy * uy;
    this._dirFloor.userData.setArrow([a, b, floor], [ux, uy, 0], span * 0.11);
    const sv = new THREE.Vector3(ux, uy, du).normalize();
    this._dirSurf.userData.setArrow([a, b, c], [sv.x, sv.y, sv.z], span * 0.13);
    this._duValue = du;
    this.vp.requestRender();
  }

  // Built once per inspected surface; later refreshes (e.g. every frame of a
  // slider animation) only update the tagged value cells, so the θ slider,
  // Taylor checkbox, and close button keep working while the surface moves.
  buildSurfaceCard(a, b, c, fx, fy, gradMag, sfx, sfy, H) {
    const key = `surface:${this.target.itemId}`;
    const th = this.dirDeg * Math.PI / 180;
    const du = fx * Math.cos(th) + fy * Math.sin(th);
    const tp = `z = ${fmt(c)} ${sgn(fx)} ${fmt(Math.abs(fx))}(x ${sgn(-a)} ${fmt(Math.abs(a))}) ${sgn(fy)} ${fmt(Math.abs(fy))}(y ${sgn(-b)} ${fmt(Math.abs(b))})`;
    const verdict = gradMag < 0.03
      ? `≈ critical point → ${H.disc > 1e-9 ? (H.fxx > 0 ? 'local minimum' : 'local maximum')
        : H.disc < -1e-9 ? 'saddle point' : 'inconclusive (D ≈ 0)'}`
      : '';

    if (this._cardKey === key && !this.card.hidden && this.card.querySelector('[data-dir]')) {
      const set = (sel, txt) => { const el = this.card.querySelector(sel); if (el) el.textContent = txt; };
      set('[data-ab]', `(${fmt(a)}, ${fmt(b)})`);
      set('[data-fab]', fmt(c));
      set('[data-fx]', fmt(fx));
      set('[data-fy]', fmt(fy));
      set('[data-grad]', `⟨${fmt(fx)}, ${fmt(fy)}⟩`);
      set('[data-gmag]', fmt(gradMag));
      set('[data-sfx]', trunc(sfx, 42));
      set('[data-sfy]', trunc(sfy, 42));
      set('[data-hess]', `${fmt(H.fxx)}, ${fmt(H.fyy)}, ${fmt(H.fxy)}`);
      set('[data-disc]', fmt(H.disc));
      set('[data-tp]', tp);
      set('[data-du]', fmt(du));
      const vr = this.card.querySelector('[data-verdict]');
      if (vr) { vr.textContent = verdict; vr.parentElement.style.display = verdict ? '' : 'none'; }
      return;
    }

    this._cardKey = key;
    this.card.innerHTML = `
      <div class="ins-title">Surface at a point <button class="ins-close" title="Close">✕</button></div>
      <table>
      <tr><td>(a, b)</td><td data-ab>(${fmt(a)}, ${fmt(b)})</td></tr>
      <tr><td>f(a, b)</td><td data-fab>${fmt(c)}</td></tr>
      <tr><td>∂f/∂x</td><td data-fx>${fmt(fx)}</td></tr>
      <tr><td>∂f/∂y</td><td data-fy>${fmt(fy)}</td></tr>
      <tr><td>∇f</td><td data-grad>⟨${fmt(fx)}, ${fmt(fy)}⟩</td></tr>
      <tr><td>|∇f|</td><td data-gmag>${fmt(gradMag)}</td></tr>
      ${(sfx || sfy) ? `<tr><td colspan="2" class="ins-sec">SYMBOLIC PARTIALS</td></tr>
        <tr><td>fₓ</td><td data-sfx style="font-size:11px">${escapeHtml(trunc(sfx, 42))}</td></tr>
        <tr><td>f_y</td><td data-sfy style="font-size:11px">${escapeHtml(trunc(sfy, 42))}</td></tr>` : ''}
      <tr><td colspan="2" class="ins-sec">SECOND-DERIVATIVE TEST</td></tr>
      <tr><td>fₓₓ, f_yy, fₓ_y</td><td data-hess>${fmt(H.fxx)}, ${fmt(H.fyy)}, ${fmt(H.fxy)}</td></tr>
      <tr><td>D = fₓₓf_yy − fₓ_y²</td><td data-disc>${fmt(H.disc)}</td></tr>
      <tr${verdict ? '' : ' style="display:none"'}><td colspan="2" style="text-align:left;color:var(--accent)" data-verdict>${verdict}</td></tr>
      <tr><td colspan="2" class="ins-sec">TANGENT PLANE</td></tr>
      <tr><td colspan="2" style="font-size:11px;text-align:left" data-tp>${tp}</td></tr>
      <tr><td colspan="2" class="ins-sec">DIRECTIONAL DERIVATIVE <span style="color:${COL.dir}">u</span></td></tr>
      <tr><td>θ = <span data-ang>${Math.round(this.dirDeg)}</span>°</td><td>D&#7524;f = <span data-du>${fmt(du)}</span></td></tr>
      <tr><td colspan="2"><input type="range" min="0" max="360" step="1" value="${this.dirDeg}" data-dir></td></tr>
      <tr><td colspan="2"><label class="check-row" style="margin-top:4px"><input type="checkbox" data-taylor ${this.showTaylor ? 'checked' : ''}> quadratic approximation (Taylor)</label></td></tr>
      </table>`;
    this.card.hidden = false;
    this.card.querySelector('.ins-close').onclick = () => this.clear();
    const slider = this.card.querySelector('[data-dir]');
    slider.oninput = () => {
      this.dirDeg = +slider.value;
      this.updateDirArrows();
      this.card.querySelector('[data-ang]').textContent = Math.round(this.dirDeg);
      this.card.querySelector('[data-du]').textContent = fmt(this._duValue);
    };
    const taylor = this.card.querySelector('[data-taylor]');
    taylor.onchange = () => {
      this.showTaylor = taylor.checked;
      this.refresh();
    };
  }

  /* ================= vector field ================= */

  refreshField(item, meta) {
    const p = this.target.p;
    const F = meta.evalVec;
    if (!F) return this.clear();
    const span = this.vp.span;
    const h = Math.max(span * 1e-5, 1e-8);
    const v = [0, 0, 0];
    if (!F(p[0], p[1], p[2], v) || !v.every(Number.isFinite)) return this.clear();
    const val = [...v];
    // Jacobian by central differences: J[i][j] = dF_i/dx_j
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const vp1 = [0, 0, 0], vm1 = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      const pp = [...p], pm = [...p];
      pp[j] += h; pm[j] -= h;
      F(pp[0], pp[1], pp[2], vp1); F(pm[0], pm[1], pm[2], vm1);
      for (let i = 0; i < 3; i++) J[i][j] = (vp1[i] - vm1[i]) / (2 * h);
    }
    const div = J[0][0] + J[1][1] + J[2][2];
    const curl = [J[2][1] - J[1][2], J[0][2] - J[2][0], J[1][0] - J[0][1]];
    const mag = Math.hypot(...val);
    const curlMag = Math.hypot(...curl);

    // overlay: marker + F arrow + curl arrow + flow line through p
    this.clearOverlay();
    const g = new THREE.Group();
    g.add(dotMesh(p, span));
    if (mag > 1e-9) {
      const ar = makeArrow(COL.grad, span * 0.003);
      ar.userData.setArrow(p, val, Math.min(Math.max(mag * span * 0.05, span * 0.05), span * 0.35));
      g.add(ar);
    }
    if (curlMag > 1e-7) {
      const ar = makeArrow(COL.curl, span * 0.003);
      ar.userData.setArrow(p, curl, Math.min(Math.max(curlMag * span * 0.05, span * 0.05), span * 0.35));
      g.add(ar);
    }

    // unit-speed streamline through p, integrated with RK4 both ways
    {
      const B = this.state.settings.bounds;
      const margin = 0.15 * span;
      const inBox = (q) =>
        q[0] >= B.xmin - margin && q[0] <= B.xmax + margin &&
        q[1] >= B.ymin - margin && q[1] <= B.ymax + margin &&
        q[2] >= B.zmin - margin && q[2] <= B.zmax + margin;
      const tmp = [0, 0, 0];
      const dirF = (q, out, sgn) => {
        if (!F(q[0], q[1], q[2], tmp)) return false;
        const m = Math.hypot(tmp[0], tmp[1], tmp[2]);
        if (!Number.isFinite(m) || m < 1e-9) return false;
        out[0] = sgn * tmp[0] / m; out[1] = sgn * tmp[1] / m; out[2] = sgn * tmp[2] / m;
        return true;
      };
      const ds = span / 250;
      const half = (sgn) => {
        const pts = [];
        let q = [...p];
        const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0], qt = [0, 0, 0];
        for (let i = 0; i < 700; i++) {
          if (!dirF(q, k1, sgn)) break;
          for (let d = 0; d < 3; d++) qt[d] = q[d] + k1[d] * ds / 2;
          if (!dirF(qt, k2, sgn)) break;
          for (let d = 0; d < 3; d++) qt[d] = q[d] + k2[d] * ds / 2;
          if (!dirF(qt, k3, sgn)) break;
          for (let d = 0; d < 3; d++) qt[d] = q[d] + k3[d] * ds;
          if (!dirF(qt, k4, sgn)) break;
          q = q.map((v0, d) => v0 + ds * (k1[d] + 2 * k2[d] + 2 * k3[d] + k4[d]) / 6);
          if (!inBox(q) || !q.every(Number.isFinite)) break;
          pts.push(new THREE.Vector3(q[0], q[1], q[2]));
        }
        return pts;
      };
      const line = [...half(-1).reverse(), new THREE.Vector3(p[0], p[1], p[2]), ...half(1)];
      if (line.length > 3) {
        const curve = new THREE.CatmullRomCurve3(line, false, 'catmullrom', 0);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, Math.min(line.length * 2, 1400), span * 0.0022, 8, false),
          new THREE.MeshPhysicalMaterial({ color: 0x0bab9c, roughness: 0.35, clearcoat: 0.3 }));
        tube.userData.unpickable = true;
        g.add(tube);
      }
    }

    this.overlay = g;
    this.vp.overlayRoot.add(g);

    this._cardKey = null;
    this.card.innerHTML = `
      <div class="ins-title">Vector field at a point <button class="ins-close">✕</button></div>
      <table>
        <tr><td>p</td><td>(${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])})</td></tr>
        <tr><td><span style="color:${COL.grad}">F(p)</span></td><td>${fmtV(val)}</td></tr>
        <tr><td>|F|</td><td>${fmt(mag)}</td></tr>
        <tr><td colspan="2" class="ins-sec">DERIVATIVES (numeric)</td></tr>
        <tr><td>div F</td><td>${fmt(div)}</td></tr>
        <tr><td><span style="color:${COL.curl}">curl F</span></td><td>${fmtV(curl)}</td></tr>
        <tr><td>|curl F|</td><td>${fmt(curlMag)}</td></tr>
      </table>
      <div style="margin-top:6px" class="note">The <span style="color:#0bab9c">teal curve</span> is the flow line through p. Click empty space to probe on the z = 0 plane.</div>`;
    this.card.hidden = false;
    this.card.querySelector('.ins-close').onclick = () => this.clear();
    this._setStatus(`inspect (${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])})`);
  }

  /* ================= implicit surface ================= */

  refreshImplicit(item, meta) {
    const p = this.target.p;
    const F = meta.f3;
    if (!F) return this.clear();
    const span = this.vp.span;
    const h = Math.max(span * 1e-5, 1e-8);
    const Fp = F(p[0], p[1], p[2]);
    const grad = [
      (F(p[0] + h, p[1], p[2]) - F(p[0] - h, p[1], p[2])) / (2 * h),
      (F(p[0], p[1] + h, p[2]) - F(p[0], p[1] - h, p[2])) / (2 * h),
      (F(p[0], p[1], p[2] + h) - F(p[0], p[1], p[2] - h)) / (2 * h),
    ];
    const gm = Math.hypot(...grad);

    this.clearOverlay();
    const g = new THREE.Group();
    g.add(dotMesh(p, span));
    if (gm > 1e-9) {
      const n = grad.map((v) => v / gm);
      const ar = makeArrow(COL.normal, span * 0.0028);
      ar.userData.setArrow(p, n, span * 0.13);
      g.add(ar);
      const size = span * 0.3;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ color: COL.plane, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      plane.position.set(...p);
      plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n));
      plane.userData.unpickable = true;
      plane.renderOrder = 3;
      g.add(plane);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(plane.geometry),
        new THREE.LineBasicMaterial({ color: COL.plane, transparent: true, opacity: 0.8 }));
      edges.position.copy(plane.position);
      edges.quaternion.copy(plane.quaternion);
      edges.userData.unpickable = true;
      g.add(edges);
    }
    this.overlay = g;
    this.vp.overlayRoot.add(g);

    this._cardKey = null;
    this.card.innerHTML = `
      <div class="ins-title">Level surface at a point <button class="ins-close">✕</button></div>
      <table>
        <tr><td>p</td><td>(${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])})</td></tr>
        <tr><td>F(p)</td><td>${fmt(Fp)}</td></tr>
        <tr><td><span style="color:${COL.normal}">∇F(p)</span></td><td>${fmtV(grad)}</td></tr>
        <tr><td>|∇F|</td><td>${fmt(gm)}</td></tr>
      </table>
      <div style="margin-top:6px" class="note">∇F is normal to the level surface — shown with its tangent plane.</div>`;
    this.card.hidden = false;
    this.card.querySelector('.ins-close').onclick = () => this.clear();
    this._setStatus(`inspect (${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])})`);
  }

  /* ================= misc ================= */

  markPoint(p) {
    const g = new THREE.Group();
    g.add(dotMesh(p, this.vp.span));
    this.overlay = g;
    this.vp.overlayRoot.add(g);
    this.vp.requestRender();
  }

  buildGenericCard(item, p) {
    this._cardKey = null;
    this.card.innerHTML = `
      <div class="ins-title">Point <button class="ins-close">✕</button></div>
      <table>
        <tr><td>object</td><td style="font-family:var(--font-ui)">${escapeHtml(labelFor(item))}</td></tr>
        <tr><td>point</td><td>(${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})</td></tr>
      </table>`;
    this.card.hidden = false;
    this.card.querySelector('.ins-close').onclick = () => this.clear();
    this._setStatus(`inspect (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})`);
  }

  clearOverlay() {
    this._dirFloor = this._dirSurf = this._dirState = null;
    if (this.overlay) {
      this.vp.overlayRoot.remove(this.overlay);
      disposeDeep(this.overlay);
      this.overlay = null;
      this.vp.requestRender();
    }
  }

  clear() {
    this.target = null;
    this._cardKey = null;
    this.clearOverlay();
    this.card.hidden = true;
    this._setStatus('');
  }
}

function dotMesh(p, span) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(span * 0.01, 16, 16),
    new THREE.MeshPhysicalMaterial({ color: 0x1f2226, emissive: 0x1f2226, emissiveIntensity: 0.25, roughness: 0.3 }));
  dot.position.set(p[0], p[1], p[2]);
  dot.userData.unpickable = true;
  return dot;
}

const sgn = (v) => (v >= 0 ? '+' : '−');
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const labelFor = (item) => ({
  surface: 'surface', parametric: 'parametric surface', curve: 'space curve',
  implicit: 'implicit surface', field: 'vector field', point: 'point', vector: 'vector',
}[item.type] || item.type);
