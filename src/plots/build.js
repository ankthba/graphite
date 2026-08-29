// Geometry builders for every plot type. All positions are in math coordinates
// (z up); the viewport's world group handles orientation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { marchingCubes } from '../geometry/implicit.js';
import { marchingSquares } from '../geometry/contours.js';
import { colormap } from '../colormaps.js';

export function disposeDeep(obj) {
  obj.traverse((o) => {
    if (o.isInstancedMesh) o.dispose(); // frees instance matrix/color buffers
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    }
  });
}

const FIN = Number.isFinite;

/* ================= grid surfaces (cartesian / cylindrical / spherical / parametric) ================= */

// map(u,v) must write [x,y,z] into out and return true, or return false for undefined.
export function gridSurfaceGeometry(map, { nu, nv, uMin, uMax, vMin, vMax, clipZ = null }) {
  const W = nu + 1, H = nv + 1;
  const pos = new Float32Array(W * H * 3);
  const ok = new Uint8Array(W * H);
  const out = [0, 0, 0];
  let zLo = Infinity, zHi = -Infinity;
  for (let j = 0; j < H; j++) {
    const v = vMin + (vMax - vMin) * (j / nv);
    for (let i = 0; i < W; i++) {
      const u = uMin + (uMax - uMin) * (i / nu);
      const idx = j * W + i;
      let good = map(u, v, out) && FIN(out[0]) && FIN(out[1]) && FIN(out[2]);
      if (good && clipZ && (out[2] < clipZ[0] || out[2] > clipZ[1])) good = false;
      if (good) {
        pos[idx * 3] = out[0]; pos[idx * 3 + 1] = out[1]; pos[idx * 3 + 2] = out[2];
        ok[idx] = 1;
        if (out[2] < zLo) zLo = out[2];
        if (out[2] > zHi) zHi = out[2];
      }
    }
  }
  const indices = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (ok[a] && ok[b] && ok[c] && ok[d]) indices.push(a, b, d, a, d, c);
      else if (ok[a] && ok[b] && ok[d]) indices.push(a, b, d);
      else if (ok[a] && ok[d] && ok[c]) indices.push(a, d, c);
      else if (ok[a] && ok[b] && ok[c]) indices.push(a, b, c);
      else if (ok[b] && ok[d] && ok[c]) indices.push(b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  if (!FIN(zLo)) { zLo = 0; zHi = 1; }
  if (zHi - zLo < 1e-12) { zHi = zLo + 1; }
  return { geo, zRange: [zLo, zHi] };
}

export function applyColormap(geo, cmapName, zRange) {
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const cm = colormap(cmapName);
  const out = [0, 0, 0];
  const [lo, hi] = zRange;
  const inv = 1 / (hi - lo);
  for (let i = 0; i < n; i++) {
    cm((pos.getZ(i) - lo) * inv, out);
    colors[i * 3] = out[0]; colors[i * 3 + 1] = out[1]; colors[i * 3 + 2] = out[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function surfaceMaterial({ color = '#5b8def', opacity = 1, useVertexColors = false, flat = false }) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: useVertexColors ? 0xffffff : new THREE.Color(color),
    vertexColors: useVertexColors,
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.35,
    side: THREE.DoubleSide,
    flatShading: flat,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  return mat;
}

export function wireframeOverlay(geo, color, opacity = 0.22) {
  const wf = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  wf.userData.unpickable = true;
  return wf;
}

/* ================= space curves ================= */

// evalPt(t, out[3]) -> bool. Splits at undefined regions; tube per run.
export function buildCurveObject(evalPt, { tmin, tmax, samples = 400, radius, color }) {
  const group = new THREE.Group();
  const runs = [];
  let cur = [];
  const out = [0, 0, 0];
  for (let i = 0; i <= samples; i++) {
    const t = tmin + (tmax - tmin) * (i / samples);
    if (evalPt(t, out) && FIN(out[0]) && FIN(out[1]) && FIN(out[2])) {
      cur.push(new THREE.Vector3(out[0], out[1], out[2]));
    } else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color), roughness: 0.35, metalness: 0.1, clearcoat: 0.4,
  });
  for (const run of runs) {
    if (run.length < 2) continue;
    const path = new THREE.CatmullRomCurve3(run, false, 'catmullrom', 0.0);
    const tube = new THREE.TubeGeometry(path, Math.min(run.length * 2, 1200), radius, 10, false);
    const mesh = new THREE.Mesh(tube, mat);
    group.add(mesh);
    // rounded end caps
    for (const p of [run[0], run[run.length - 1]]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 10), mat);
      cap.position.copy(p);
      group.add(cap);
    }
  }
  return group;
}

/* ================= arrows ================= */

// Unit arrow pointing +Z with total length 1; scale/orient via setArrow.
export function makeArrow(color, thickness = 0.02) {
  const headLen = 0.28, headR = thickness * 3.2;
  const shaft = new THREE.CylinderGeometry(thickness, thickness, 1 - headLen, 8);
  shaft.translate(0, (1 - headLen) / 2, 0);
  const head = new THREE.ConeGeometry(headR, headLen, 12);
  head.translate(0, 1 - headLen / 2, 0);
  const geo = mergeGeometries([shaft, head]);
  geo.rotateX(Math.PI / 2); // point along +Z
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.4, metalness: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.unpickable = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.setArrow = (from, dir, len) => {
    const d = new THREE.Vector3(...dir);
    if (!FIN(d.x) || !FIN(d.y) || !FIN(d.z) || !FIN(from[0]) || !FIN(from[1]) || !FIN(from[2])
      || d.lengthSq() < 1e-20 || !FIN(len) || len <= 0) { g.visible = false; return; }
    g.visible = true;
    g.position.set(...from);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
    g.scale.set(len, len, len);
  };
  return g;
}

/* ================= vector fields ================= */

export function buildVectorFieldObject(evalVec, {
  bounds, density = 6, scale = 1, normalize = false, cmapName = 'turbo',
  solidColor = '#5b8def', opacity = 1,
}) {
  const { xmin, xmax, ymin, ymax, zmin, zmax } = bounds;
  const nx = density, ny = density, nz = density;
  const cellMin = Math.min((xmax - xmin) / nx, (ymax - ymin) / ny, (zmax - zmin) / nz);
  const samples = [];
  const out = [0, 0, 0];
  let maxMag = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = xmin + (xmax - xmin) * ((i + 0.5) / nx);
    const y = ymin + (ymax - ymin) * ((j + 0.5) / ny);
    const z = zmin + (zmax - zmin) * ((k + 0.5) / nz);
    if (!evalVec(x, y, z, out)) continue;
    if (!FIN(out[0]) || !FIN(out[1]) || !FIN(out[2])) continue;
    const mag = Math.hypot(out[0], out[1], out[2]);
    if (mag < 1e-12) continue;
    samples.push({ p: [x, y, z], v: [out[0], out[1], out[2]], mag });
    if (mag > maxMag) maxMag = mag;
  }
  const group = new THREE.Group();
  if (!samples.length) return group;
  // drop the near-zero tail so it doesn't render as clutter
  const kept = samples.filter((s) => s.mag > maxMag * 0.02);

  const thickness = cellMin * 0.022;
  const headLen = 0.32, headR = thickness * 3.1;
  const shaft = new THREE.CylinderGeometry(thickness, thickness, 1 - headLen, 6);
  shaft.translate(0, (1 - headLen) / 2, 0);
  const head = new THREE.ConeGeometry(headR, headLen, 10);
  head.translate(0, 1 - headLen / 2, 0);
  const arrowGeo = mergeGeometries([shaft, head]);
  arrowGeo.rotateX(Math.PI / 2);

  const mat = new THREE.MeshPhysicalMaterial({
    roughness: 0.45, metalness: 0.08, transparent: opacity < 1, opacity,
  });
  const inst = new THREE.InstancedMesh(arrowGeo, mat, kept.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
  const cm = cmapName ? colormap(cmapName) : null;
  const cOut = [0, 0, 0], col = new THREE.Color();
  const solid = new THREE.Color(solidColor);
  const baseLen = cellMin * 0.85 * scale;
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    dir.set(s.v[0], s.v[1], s.v[2]).normalize();
    Q.setFromUnitVectors(zAxis, dir);
    const rel = s.mag / maxMag;
    const len = normalize ? baseLen : baseLen * (0.15 + 0.85 * rel);
    S.set(len, len, len);
    M.compose(new THREE.Vector3(s.p[0] - dir.x * len / 2, s.p[1] - dir.y * len / 2, s.p[2] - dir.z * len / 2), Q, S);
    inst.setMatrixAt(i, M);
    if (cm) {
      cm(Math.pow(rel, 0.7), cOut);
      inst.setColorAt(i, col.setRGB(cOut[0], cOut[1], cOut[2]));
    } else {
      inst.setColorAt(i, solid);
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);
  return group;
}

/* ================= implicit surfaces ================= */

export function buildImplicitGeometry(f, opts) {
  const { positions, normals } = marchingCubes(f, opts);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  let zLo = Infinity, zHi = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    if (positions[i] < zLo) zLo = positions[i];
    if (positions[i] > zHi) zHi = positions[i];
  }
  if (!FIN(zLo)) { zLo = 0; zHi = 1; }
  if (zHi - zLo < 1e-12) zHi = zLo + 1;
  return { geo, zRange: [zLo, zHi] };
}

/* ================= contour curves ================= */

// f2(x,y) -> z surface contours: lines at z = level (on surface) and projected
// onto the floor. Returns a group; each level tinted by the colormap.
export function buildContoursObject(f2, {
  xmin, xmax, ymin, ymax, nx = 160, ny = 160, levels, zRange, cmapName, floorZ, onSurface = true, onFloor = true,
}) {
  const res = marchingSquares((x, y) => f2(x, y), { xmin, xmax, ymin, ymax, nx, ny, levels });
  const group = new THREE.Group();
  const cm = colormap(cmapName || 'viridis');
  const [lo, hi] = zRange;
  const inv = 1 / (hi - lo);
  const eps = (hi - lo) * 0.004;
  const positions = [], colors = [], fPositions = [], fColors = [];
  const c = [0, 0, 0];
  for (const { level, paths } of res) {
    cm((level - lo) * inv, c);
    const cr = c[0] * 0.85, cg = c[1] * 0.85, cb = c[2] * 0.85;
    for (const path of paths) {
      for (let i = 0; i + 3 < path.length; i += 2) {
        if (onSurface) {
          positions.push(path[i], path[i + 1], level + eps, path[i + 2], path[i + 3], level + eps);
          colors.push(cr, cg, cb, cr, cg, cb);
        }
        if (onFloor) {
          fPositions.push(path[i], path[i + 1], floorZ, path[i + 2], path[i + 3], floorZ);
          fColors.push(c[0], c[1], c[2], c[0], c[1], c[2]);
        }
      }
    }
  }
  const mk = (pts, cols, opacity) => {
    if (!pts.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity, linewidth: 1,
    }));
    l.userData.unpickable = true;
    group.add(l);
  };
  mk(positions, colors, 0.95);
  mk(fPositions, fColors, 0.8);
  return group;
}

/* ================= cross sections (trace planes) ================= */

// A movable trace plane x=c, y=c, or z=c through a z=f(x,y) surface, with the
// intersection curve drawn on the surface. Curve color matches the fixed axis.
const SECTION_COLORS = { x: '#d0453a', y: '#1e8e57', z: '#2f6bdb' };

export function buildSectionObject(f2, { axis, val, domain, bounds, span }) {
  const group = new THREE.Group();
  const color = new THREE.Color(SECTION_COLORS[axis]);
  const { aMin, aMax, bMin, bMax } = domain;
  const B = bounds;

  // translucent plane
  let w, h, pos, quat = new THREE.Quaternion();
  if (axis === 'x') {
    // rotY 90°: plane width → z-axis, height stays y, normal → +x
    w = B.zmax - B.zmin; h = bMax - bMin;
    pos = [val, (bMin + bMax) / 2, (B.zmin + B.zmax) / 2];
    quat.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  } else if (axis === 'y') {
    w = aMax - aMin; h = B.zmax - B.zmin;
    pos = [(aMin + aMax) / 2, val, (B.zmin + B.zmax) / 2];
    quat.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  } else {
    w = aMax - aMin; h = bMax - bMin;
    pos = [(aMin + aMax) / 2, (bMin + bMax) / 2, val];
  }
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
  plane.position.set(...pos);
  plane.quaternion.copy(quat);
  plane.renderOrder = 2;
  plane.userData.unpickable = true;
  group.add(plane);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(plane.geometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }));
  edges.position.copy(plane.position);
  edges.quaternion.copy(plane.quaternion);
  edges.userData.unpickable = true;
  group.add(edges);

  // intersection curve(s)
  const r = span * 0.0035;
  const inZ = (z) => Number.isFinite(z) && z >= B.zmin && z <= B.zmax;
  const colorHex = SECTION_COLORS[axis];
  if (axis === 'x') {
    group.add(buildCurveObject((t, out) => {
      out[0] = val; out[1] = t; out[2] = f2(val, t); return inZ(out[2]);
    }, { tmin: bMin, tmax: bMax, samples: 240, radius: r, color: colorHex }));
  } else if (axis === 'y') {
    group.add(buildCurveObject((t, out) => {
      out[0] = t; out[1] = val; out[2] = f2(t, val); return inZ(out[2]);
    }, { tmin: aMin, tmax: aMax, samples: 240, radius: r, color: colorHex }));
  } else {
    const res = marchingSquares(f2, {
      xmin: aMin, xmax: aMax, ymin: bMin, ymax: bMax, nx: 140, ny: 140, levels: [val],
    });
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.3 });
    let count = 0;
    for (const path of res[0]?.paths || []) {
      if (++count > 300) { console.warn('cross section: z-section truncated at 300 curves'); break; }
      const pts = [];
      for (let i = 0; i + 1 < path.length; i += 2) pts.push(new THREE.Vector3(path[i], path[i + 1], val));
      if (pts.length < 2) continue;
      const closed = pts[0].distanceToSquared(pts[pts.length - 1]) < 1e-16;
      if (closed) pts.pop();
      const curve = new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(pts.length * 2, 800), r, 8, closed), mat);
      tube.userData.unpickable = true;
      group.add(tube);
    }
  }
  group.traverse((o) => { o.userData.unpickable = true; });
  return group;
}

/* ================= Riemann sum boxes ================= */

// Midpoint Riemann boxes for ∬f dA over the rectangular domain (masked cells
// skipped). Returns the boxes plus the midpoint sum and a fine estimate.
export function buildRiemannBoxes(f2, { domain, n }) {
  const { aMin, aMax, bMin, bMax } = domain;
  const dx = (aMax - aMin) / n, dy = (bMax - bMin) / n;
  const cells = [];
  let sum = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const xm = aMin + (i + 0.5) * dx, ym = bMin + (j + 0.5) * dy;
    const h = f2(xm, ym);
    if (!Number.isFinite(h)) continue;
    sum += h * dx * dy;
    if (Math.abs(h) > 1e-9) cells.push([xm, ym, h]);
  }
  // fine midpoint estimate for comparison
  let fine = 0;
  const m = 160, fdx = (aMax - aMin) / m, fdy = (bMax - bMin) / m;
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const v = f2(aMin + (i + 0.5) * fdx, bMin + (j + 0.5) * fdy);
    if (Number.isFinite(v)) fine += v * fdx * fdy;
  }

  const group = new THREE.Group();
  if (cells.length) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshPhysicalMaterial({
      roughness: 0.5, transparent: true, opacity: 0.42, depthWrite: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, cells.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    const cPos = new THREE.Color('#5b8def'), cNeg = new THREE.Color('#e8604c');
    for (let k = 0; k < cells.length; k++) {
      const [xm, ym, h] = cells[k];
      S.set(dx * 0.96, dy * 0.96, Math.abs(h));
      P.set(xm, ym, h / 2);
      M.compose(P, Q, S);
      inst.setMatrixAt(k, M);
      inst.setColorAt(k, h >= 0 ? cPos : cNeg);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.userData.unpickable = true;
    inst.renderOrder = 1;
    group.add(inst);
  }
  return { group, sum, fine, count: cells.length };
}

/* ================= points & vectors ================= */

export function buildPointObject({ x, y, z, color, size, label }) {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.3, clearcoat: 0.5 });
  const s = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 20), mat);
  s.position.set(x, y, z);
  group.add(s);
  if (label) {
    const sp = makeLabelSprite(label, color);
    sp.position.set(x, y, z + size * 3.2);
    const sc = size * 5;
    sp.scale.set(sc * sp.userData.aspect, sc, 1);
    group.add(sp);
  }
  return group;
}

export function makeLabelSprite(text, color) {
  const cv = document.createElement('canvas');
  const size = 46, pad = 12;
  let ctx = cv.getContext('2d');
  ctx.font = `600 ${size}px 'IBM Plex Mono', monospace`;
  cv.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  cv.height = size + pad * 2;
  ctx = cv.getContext('2d');
  ctx.font = `600 ${size}px 'IBM Plex Mono', monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, cv.width / 2, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.userData.aspect = cv.width / cv.height;
  sp.userData.unpickable = true;
  return sp;
}
