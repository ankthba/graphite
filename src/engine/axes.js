// Axes: filled back walls with major/minor graph-paper grid, origin axes with
// arrows, crisp haloed tick labels. All in math coordinates (z up handled by
// the parent group rotation). update() shows only the walls behind the scene.
import * as THREE from 'three';

function niceStep(range, target = 8) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  const step = r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10;
  return step * mag;
}

function fmtTick(v, step) {
  if (Math.abs(v) < step * 1e-6) return '0';
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(Math.min(dec, 6)).replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m));
}

// Crisp label sprite: rendered at 2× with a soft halo so text stays readable
// over surfaces and grid lines.
function textSprite(text, { color, halo, size = 44, weight = 500, italic = false }) {
  const S = 2; // supersample
  const fs = size * S;
  const pad = 14 * S;
  const cv = document.createElement('canvas');
  let ctx = cv.getContext('2d');
  const font = `${italic ? 'italic ' : ''}${weight} ${fs}px 'IBM Plex Mono', monospace`;
  ctx.font = font;
  cv.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  cv.height = fs + pad * 2;
  ctx = cv.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = halo;
  ctx.lineWidth = fs * 0.22;
  ctx.strokeText(text, cv.width / 2, cv.height / 2 + fs * 0.04);
  ctx.fillStyle = color;
  ctx.fillText(text, cv.width / 2, cv.height / 2 + fs * 0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.userData.aspect = cv.width / cv.height;
  sp.userData.unpickable = true;
  return sp;
}

export function buildAxes(bounds, opts) {
  const { xmin, xmax, ymin, ymax, zmin, zmax } = bounds;
  const dark = opts.dark;
  const group = new THREE.Group();
  const disposables = [];
  const span = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);

  const cWall = dark ? 0x242424 : 0xf5f5f5;
  const cGridMajor = dark ? 0x3c3c3c : 0xd9d9d9;
  const cGridMinor = dark ? 0x2e2e2e : 0xeaeaea;
  const cBox = dark ? 0x4d4d4d : 0xc6c6c6;
  const cAxis = { x: 0xd0453a, y: 0x1e8e57, z: 0x2f6bdb };
  const cLabel = dark ? '#9d9d9d' : '#8e8e8e';
  const cAxisLabel = dark ? '#cccccc' : '#3b3b3b';
  const halo = dark ? '#1e1e1e' : '#fafafa';

  const track = (o) => { disposables.push(o); return o; };

  // ---- flat 2D mode: one graph-paper plane + in-plane axes, nothing 3D ----
  // 'top' presents the xy-plane (camera locked above), 'front' the xz-plane
  // (camera locked at -y). Everything sits behind the plotted content.
  if (opts.flat) {
    const isTop = opts.flat === 'top';
    const sx2 = niceStep(xmax - xmin), sv2 = isTop ? niceStep(ymax - ymin) : niceStep(zmax - zmin);
    const uMin = xmin, uMax = xmax;
    const vMin = isTop ? ymin : zmin, vMax = isTop ? ymax : zmax;
    const eps2 = span * 0.002;
    // depth farthest from the camera, stepping toward it per layer
    const wBack = isTop ? zmin : ymax;
    const toCam = isTop ? 1 : -1;
    const place = isTop ? (u, v, w) => [u, v, w] : (u, v, w) => [u, w, v];

    // paper
    const fillGeo = track(new THREE.PlaneGeometry(uMax - uMin, vMax - vMin));
    const fill = new THREE.Mesh(fillGeo, track(new THREE.MeshBasicMaterial({
      color: cWall, side: THREE.DoubleSide, transparent: true, opacity: dark ? 0.85 : 0.8,
      depthWrite: false,
    })));
    fill.position.set(...place((uMin + uMax) / 2, (vMin + vMax) / 2, wBack));
    if (!isTop) {
      const M = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
      fill.quaternion.setFromRotationMatrix(M);
    }
    fill.userData.unpickable = true;
    fill.renderOrder = -3;
    group.add(fill);

    // grid
    const wGrid = wBack + toCam * eps2;
    const placeLine = (u, v) => place(u, v, wGrid);
    if (opts.grid !== false) {
      const minor = wallLines(uMin, uMax, vMin, vMax, sx2 / 5, sv2 / 5, placeLine,
        cGridMinor, dark ? 0.45 : 0.55);
      minor.renderOrder = -2;
      const major = wallLines(uMin, uMax, vMin, vMax, sx2, sv2, placeLine,
        cGridMajor, dark ? 0.8 : 0.95);
      major.renderOrder = -1;
      group.add(minor, major);
    }

    if (opts.labels !== false) {
      const clamp2 = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      const u0 = clamp2(0, uMin, uMax), v0 = clamp2(0, vMin, vMax);
      const wAxis = wBack + toCam * eps2 * 2;
      const axisR = span * 0.0026;
      const vName = isTop ? 'y' : 'z';
      const vColor = isTop ? cAxis.y : cAxis.z;
      const addFlatAxis = (along, color, lo, hi) => {
        const geo = track(new THREE.CylinderGeometry(axisR, axisR, hi - lo, 8));
        const mat = track(new THREE.MeshBasicMaterial({ color }));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.unpickable = true;
        const mid = (lo + hi) / 2;
        const pos = along === 'u' ? place(mid, v0, wAxis) : place(u0, mid, wAxis);
        mesh.position.set(...pos);
        // cylinder axis is local Y: lay it along the in-plane direction
        if (along === 'u') mesh.rotation.z = -Math.PI / 2;
        else if (!isTop) mesh.rotation.x = Math.PI / 2; // v = math z
        group.add(mesh);
        const cg = track(new THREE.ConeGeometry(axisR * 4, axisR * 14, 16));
        const cone = new THREE.Mesh(cg, mat);
        cone.userData.unpickable = true;
        cone.position.set(...(along === 'u' ? place(hi, v0, wAxis) : place(u0, hi, wAxis)));
        if (along === 'u') cone.rotation.z = -Math.PI / 2;
        else if (!isTop) cone.rotation.x = Math.PI / 2;
        group.add(cone);
        const lab = textSprite(along === 'u' ? 'x' : vName,
          { color: cAxisLabel, halo, size: 50, weight: 600, italic: true });
        const off = span * 0.03;
        lab.position.set(...(along === 'u' ? place(hi + off, v0, wAxis) : place(u0, hi + off, wAxis)));
        const s = span * 0.036;
        lab.scale.set(s * lab.userData.aspect, s, 1);
        track(lab.material.map); track(lab.material);
        group.add(lab);
      };
      addFlatAxis('u', cAxis.x, uMin, uMax);
      addFlatAxis('v', vColor, vMin, vMax);

      const off = span * 0.024;
      const tickDefs2 = [
        [sx2, uMin, uMax, (t) => place(t, v0 - off, wAxis), (t) => place(t, v0, wAxis), cAxis.x],
        [sv2, vMin, vMax, (t) => place(u0 - off, t, wAxis), (t) => place(u0, t, wAxis), vColor],
      ];
      for (const [step, lo, hi, labelAt, dotAt, dotColor] of tickDefs2) {
        for (let t = Math.ceil(lo / step) * step; t <= hi - step * 0.4; t += step) {
          if (Math.abs(t) < step * 1e-6) continue;
          const sp = textSprite(fmtTick(t, step), { color: cLabel, halo, size: 34 });
          sp.position.set(...labelAt(t));
          const s = span * 0.021;
          sp.scale.set(s * sp.userData.aspect, s, 1);
          track(sp.material.map); track(sp.material);
          group.add(sp);
          const tg = track(new THREE.SphereGeometry(axisR * 1.3, 6, 6));
          const tm = new THREE.Mesh(tg, track(new THREE.MeshBasicMaterial({ color: dotColor })));
          tm.position.set(...dotAt(t));
          tm.userData.unpickable = true;
          group.add(tm);
        }
      }
    }

    return {
      group,
      update() {},
      dispose() { for (const d of disposables) d.dispose && d.dispose(); },
    };
  }

  // ---- bounding box edges ----
  if (opts.box !== false) {
    const boxGeo = track(new THREE.BufferGeometry());
    const corners = [];
    const xs = [xmin, xmax], ys = [ymin, ymax], zs = [zmin, zmax];
    for (const z of zs) for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
      const q = [[xs[0], ys[0]], [xs[1], ys[0]], [xs[0], ys[1]], [xs[1], ys[1]]];
      corners.push(q[a][0], q[a][1], z, q[b][0], q[b][1], z);
    }
    for (const x of xs) for (const y of ys) corners.push(x, y, zmin, x, y, zmax);
    boxGeo.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
    const boxMat = track(new THREE.LineBasicMaterial({ color: cBox, transparent: true, opacity: 0.6 }));
    group.add(new THREE.LineSegments(boxGeo, boxMat));
  }

  // ---- walls: filled pane + minor + major grid, only the back ones shown ----
  const walls = [];
  const sx = niceStep(xmax - xmin), sy = niceStep(ymax - ymin), sz = niceStep(zmax - zmin);
  const eps = span * 0.001;

  // lines perpendicular ticks across a wall; place(u,v) -> [x,y,z]
  function wallLines(uMin, uMax, vMin, vMax, uStep, vStep, place, color, opacity) {
    const pts = [];
    for (let u = Math.ceil(uMin / uStep) * uStep; u <= uMax + 1e-9; u += uStep) {
      pts.push(...place(u, vMin), ...place(u, vMax));
    }
    for (let v = Math.ceil(vMin / vStep) * vStep; v <= vMax + 1e-9; v += vStep) {
      pts.push(...place(uMin, v), ...place(uMax, v));
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = track(new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    const lines = new THREE.LineSegments(g, m);
    lines.userData.unpickable = true;
    return lines;
  }

  function makeWall(axis, side, uMin, uMax, vMin, vMax, uStep, vStep, placeAt) {
    const wallGroup = new THREE.Group();
    const wallCoord = side > 0
      ? (axis === 'x' ? xmax : axis === 'y' ? ymax : zmax)
      : (axis === 'x' ? xmin : axis === 'y' ? ymin : zmin);
    // filled pane at the exact face
    const w = uMax - uMin, h = vMax - vMin;
    const fillGeo = track(new THREE.PlaneGeometry(w, h));
    const fill = new THREE.Mesh(fillGeo, track(new THREE.MeshBasicMaterial({
      color: cWall, side: THREE.DoubleSide, transparent: true, opacity: dark ? 0.85 : 0.8,
      depthWrite: false,
    })));
    // orient pane: placeAt maps (u,v) with wall coordinate w0
    const mid = placeAt((uMin + uMax) / 2, (vMin + vMax) / 2, wallCoord);
    fill.position.set(...mid);
    // orient the pane so its local X spans u and local Y spans v (exact bases)
    const M = new THREE.Matrix4();
    if (axis === 'x') {
      M.makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
      fill.quaternion.setFromRotationMatrix(M);
    } else if (axis === 'y') {
      M.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
      fill.quaternion.setFromRotationMatrix(M);
    }
    fill.userData.unpickable = true;
    fill.renderOrder = -3;
    wallGroup.add(fill);
    // grid lines nudged just inside the pane
    const inward = -side * eps;
    const w0 = wallCoord + inward;
    const placeLine = (u, v) => placeAt(u, v, w0);
    if (opts.grid !== false) {
      const minor = wallLines(uMin, uMax, vMin, vMax, uStep / 5, vStep / 5, placeLine,
        cGridMinor, dark ? 0.45 : 0.55);
      minor.renderOrder = -2;
      const major = wallLines(uMin, uMax, vMin, vMax, uStep, vStep, placeLine,
        cGridMajor, dark ? 0.8 : 0.95);
      major.renderOrder = -1;
      wallGroup.add(minor, major);
    }
    walls.push({ mesh: wallGroup, axis, side });
    group.add(wallGroup);
  }

  // pane orientation note: fill plane spans (u,v) in its local XY.
  // z-walls: u=x, v=y ; y-walls: u=x, v=z ; x-walls: u=z(local x after rotY), handled below
  for (const side of [-1, 1]) {
    makeWall('z', side, xmin, xmax, ymin, ymax, sx, sy, (u, v, w0) => [u, v, w0]);
    makeWall('y', side, xmin, xmax, zmin, zmax, sx, sz, (u, v, w0) => [u, w0, v]);
    makeWall('x', side, ymin, ymax, zmin, zmax, sy, sz, (u, v, w0) => [w0, u, v]);
  }

  // ---- axes with cone tips + labels + ticks ----
  // When the origin is outside the window, the axis lines run along the
  // nearest in-window anchor instead of vanishing entirely.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const x0 = clamp(0, xmin, xmax), y0 = clamp(0, ymin, ymax), z0 = clamp(0, zmin, zmax);
  const axisR = span * 0.0026;

  function axisLine(dir, color, lo, hi) {
    const len = hi - lo;
    const geo = track(new THREE.CylinderGeometry(axisR, axisR, len, 8));
    const mat = track(new THREE.MeshBasicMaterial({ color }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.unpickable = true;
    const mid = (lo + hi) / 2;
    if (dir === 'x') { mesh.rotation.z = -Math.PI / 2; mesh.position.set(mid, y0, z0); }
    if (dir === 'y') { mesh.position.set(x0, mid, z0); }
    if (dir === 'z') { mesh.rotation.x = Math.PI / 2; mesh.position.set(x0, y0, mid); }
    group.add(mesh);
    const cg = track(new THREE.ConeGeometry(axisR * 4, axisR * 14, 16));
    const cone = new THREE.Mesh(cg, mat);
    cone.userData.unpickable = true;
    if (dir === 'x') { cone.rotation.z = -Math.PI / 2; cone.position.set(hi, y0, z0); }
    if (dir === 'y') { cone.position.set(x0, hi, z0); }
    if (dir === 'z') { cone.rotation.x = Math.PI / 2; cone.position.set(x0, y0, hi); }
    group.add(cone);
    const lab = textSprite(dir, { color: cAxisLabel, halo, size: 50, weight: 600, italic: true });
    const off = span * 0.045;
    lab.position.set(
      dir === 'x' ? hi + off : x0,
      dir === 'y' ? hi + off : y0,
      dir === 'z' ? hi + off : z0);
    const s = span * 0.036;
    lab.scale.set(s * lab.userData.aspect, s, 1);
    track(lab.material.map); track(lab.material);
    group.add(lab);
  }

  if (opts.labels !== false) {
    axisLine('x', cAxis.x, xmin, xmax);
    axisLine('y', cAxis.y, ymin, ymax);
    axisLine('z', cAxis.z, zmin, zmax);

    const tickDefs = [
      ['x', sx, xmin, xmax, (v) => [v, y0, z0]],
      ['y', sy, ymin, ymax, (v) => [x0, v, z0]],
      ['z', sz, zmin, zmax, (v) => [x0, y0, v]],
    ];
    for (const [ax, step, lo, hi, place] of tickDefs) {
      const off = span * 0.02;
      for (let v = Math.ceil(lo / step) * step; v <= hi - step * 0.4; v += step) {
        if (Math.abs(v) < step * 1e-6) continue;
        const sp = textSprite(fmtTick(v, step), { color: cLabel, halo, size: 34 });
        const [px, py, pz] = place(v);
        sp.position.set(px + (ax !== 'x' ? off : 0), py + (ax === 'x' ? -off : 0), pz + (ax === 'z' ? 0 : -off * 0.45));
        const s = span * 0.021;
        sp.scale.set(s * sp.userData.aspect, s, 1);
        track(sp.material.map); track(sp.material);
        group.add(sp);
        // tick mark: small bar across the axis
        const tg = track(new THREE.SphereGeometry(axisR * 1.3, 6, 6));
        const tm = new THREE.Mesh(tg, track(new THREE.MeshBasicMaterial({ color: cAxis[ax] })));
        tm.position.set(px, py, pz);
        tm.userData.unpickable = true;
        group.add(tm);
      }
    }
  }

  const camLocal = new THREE.Vector3();
  function update(camera, worldGroup) {
    camLocal.copy(camera.position);
    worldGroup.worldToLocal(camLocal);
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2, cz = (zmin + zmax) / 2;
    for (const w of walls) {
      const d = w.axis === 'x' ? camLocal.x - cx : w.axis === 'y' ? camLocal.y - cy : camLocal.z - cz;
      w.mesh.visible = (w.side > 0) !== (d > 0);
    }
  }

  function dispose() {
    for (const d of disposables) d.dispose && d.dispose();
  }

  return { group, update, dispose };
}
