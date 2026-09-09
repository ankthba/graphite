// src/geometry/contours.js — marching-squares contour extraction (pure math, no three.js)
//
// export function marchingSquares(f, opts) -> Array<{ level:number, paths: Float32Array[] }>
//   f:    (x, y) => number (may return NaN)
//   opts: { xmin, xmax, ymin, ymax, nx, ny, levels:number[] }
//
// nx/ny are CELL counts per axis; f is sampled once on the (nx+1) x (ny+1) grid and
// every level reuses those samples.
//
// Implementation notes:
// - Every contour vertex lies on exactly one grid edge, so segments are stored as
//   pairs of integer edge ids. Joining therefore hashes endpoints on a grid-index
//   key (a Map keyed by edge id), which makes joining O(n) and makes shared
//   endpoints match EXACTLY (far inside the 1e-9-of-cell-size contract tolerance).
// - Each grid edge touches at most two cells and each cell emits at most one
//   segment endpoint per edge, so every endpoint has degree <= 2: open polylines
//   start at degree-1 edges; everything left over is a closed loop. Closed loops
//   repeat their first point exactly (same edge id -> identical floats).
// - Saddle cells (cases 5 and 10) are resolved by the sign of the cell-center
//   average of the corner values.
// - Undefined (NaN) samples next to defined ones get a stand-in value — f just inside the
//   domain edge, found by bisecting from the defined neighbour — that fixes only their
//   SIGN. A crossing on an edge into NaN is then root-found on the defined part of the
//   edge (falling back to the domain edge), so contours run right up to a domain boundary
//   or a pole instead of breaking into dashes one cell short of it. Cells whose corners
//   are all undefined are skipped.
// - A sample exactly equal to the level is nudged "inside" (d = 0 treated as
//   d = +TINY), keeping classification and interpolation consistent and avoiding
//   degenerate zero-length segments through grid corners.

import { bracketRoot } from './root.js';

const TINY = 1e-300;

export function marchingSquares(f, opts) {
  const { xmin, xmax, ymin, ymax, nx, ny, levels } = opts;
  if (!(nx >= 1) || !(ny >= 1)) throw new Error('marchingSquares: nx and ny must be >= 1');
  if (!Array.isArray(levels)) throw new Error('marchingSquares: opts.levels must be an array');

  const sx = nx + 1, sy = ny + 1;
  const dx = (xmax - xmin) / nx;
  const dy = (ymax - ymin) / ny;

  // Sample f once.
  const vals = new Float64Array(sx * sy);
  for (let j = 0; j < sy; j++) {
    const y = ymin + j * dy;
    const row = j * sx;
    for (let i = 0; i < sx; i++) vals[row + i] = +f(xmin + i * dx, y);
  }

  // Stand-ins for NaN samples beside defined ones (sign only; see header).
  // kind: 0 sampled, 1 NaN with stand-in, 2 NaN without a defined neighbour.
  // Neighbours are judged on the pristine samples (raw), never on stand-ins already written.
  const kind = new Uint8Array(sx * sy);
  const raw = vals.slice();
  const boundaryValue = (p0, p1) => { // f at the last defined point walking p0 -> p1
    const x0 = xmin + (p0 % sx) * dx, y0 = ymin + ((p0 / sx) | 0) * dy;
    const ex = xmin + (p1 % sx) * dx - x0, ey = ymin + ((p1 / sx) | 0) * dy - y0;
    let lo = 0, hi = 1, vlo = raw[p0];
    for (let it = 0; it < 12; it++) {
      const m = 0.5 * (lo + hi);
      const v = +f(x0 + m * ex, y0 + m * ey);
      if (v !== v) hi = m; else { lo = m; vlo = v; }
    }
    return vlo;
  };
  for (let j = 0; j < sy; j++) {
    for (let i = 0; i < sx; i++) {
      const p = j * sx + i;
      if (raw[p] === raw[p]) continue;
      let best = NaN, bestMag = -1;
      const nb = [i > 0 ? p - 1 : -1, i < sx - 1 ? p + 1 : -1, j > 0 ? p - sx : -1, j < sy - 1 ? p + sx : -1];
      for (const q of nb) {
        if (q < 0 || raw[q] !== raw[q]) continue;
        const v = boundaryValue(q, p);
        const mag = Math.abs(v);
        if (mag > bestMag) { bestMag = mag; best = v; }
      }
      if (best === best) { vals[p] = best; kind[p] = 1; } else kind[p] = 2;
    }
  }

  // Edge ids (the grid-index hash keys):
  //   horizontal edge (i,j) [(i,j)-(i+1,j)]: id = j*nx + i          (0<=i<nx, 0<=j<=ny)
  //   vertical   edge (i,j) [(i,j)-(i,j+1)]: id = numH + j*sx + i   (0<=i<=nx, 0<=j<ny)
  const numH = nx * sy;

  const out = [];
  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    out.push({
      level,
      paths: contourOneLevel(vals, kind, f, level, nx, ny, sx, xmin, ymin, dx, dy, numH),
    });
  }
  return out;
}

function contourOneLevel(vals, kind, f, level, nx, ny, sx, xmin, ymin, dx, dy, numH) {
  // ---- 1) Generate segments as pairs of edge ids -------------------------------
  const segA = [], segB = [];

  // An edge whose endpoints are both undefined has nothing to locate a crossing against:
  // segments touching one are dropped (never draw inside the undefined region).
  const dead = (e) => {
    if (e < numH) { const i = e % nx, j = (e - i) / nx, b = j * sx + i; return kind[b] !== 0 && kind[b + 1] !== 0; }
    const ke = e - numH, i = ke % sx, j = (ke - i) / sx, b = j * sx + i;
    return kind[b] !== 0 && kind[b + sx] !== 0;
  };
  const push = (a, b) => { if (!dead(a) && !dead(b)) { segA.push(a); segB.push(b); } };

  for (let j = 0; j < ny; j++) {
    const r0 = j * sx, r1 = r0 + sx;
    for (let i = 0; i < nx; i++) {
      let v00 = vals[r0 + i], v10 = vals[r0 + i + 1];   // bottom-left, bottom-right
      let v01 = vals[r1 + i], v11 = vals[r1 + i + 1];   // top-left, top-right
      // Corners without a stand-in (NaN) borrow the value of the first usable corner;
      // a cell with no usable corner is skipped.
      if (v00 !== v00 || v10 !== v10 || v01 !== v01 || v11 !== v11) {
        const ref = v00 === v00 ? v00 : v10 === v10 ? v10 : v11 === v11 ? v11 : v01;
        if (ref !== ref) continue;
        if (v00 !== v00) v00 = ref; if (v10 !== v10) v10 = ref;
        if (v01 !== v01) v01 = ref; if (v11 !== v11) v11 = ref;
      }

      let d00 = v00 - level; if (d00 === 0) d00 = TINY;
      let d10 = v10 - level; if (d10 === 0) d10 = TINY;
      let d01 = v01 - level; if (d01 === 0) d01 = TINY;
      let d11 = v11 - level; if (d11 === 0) d11 = TINY;

      // Corner bits CCW from bottom-left: c0=(i,j) c1=(i+1,j) c2=(i+1,j+1) c3=(i,j+1)
      const code = (d00 > 0 ? 1 : 0) | (d10 > 0 ? 2 : 0) | (d11 > 0 ? 4 : 0) | (d01 > 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;

      const e0 = j * nx + i;            // bottom
      const e2 = e0 + nx;               // top
      const e3 = numH + j * sx + i;     // left
      const e1 = e3 + 1;                // right

      switch (code) {
        case 1: case 14: push(e3, e0); break; // c0 isolated
        case 2: case 13: push(e0, e1); break; // c1 isolated
        case 4: case 11: push(e1, e2); break; // c2 isolated
        case 8: case 7:  push(e2, e3); break; // c3 isolated
        case 3: case 12: push(e3, e1); break; // horizontal split
        case 6: case 9:  push(e0, e2); break; // vertical split
        case 5:  // saddle: c0 & c2 inside — resolve with cell-center average
          if (d00 + d10 + d01 + d11 > 0) { // center inside: diagonal band, isolate c1 and c3
            push(e0, e1);
            push(e2, e3);
          } else {                         // center outside: isolate c0 and c2
            push(e3, e0);
            push(e1, e2);
          }
          break;
        case 10: // saddle: c1 & c3 inside
          if (d00 + d10 + d01 + d11 > 0) { // center inside: isolate c0 and c2
            push(e3, e0);
            push(e1, e2);
          } else {                         // center outside: isolate c1 and c3
            push(e0, e1);
            push(e2, e3);
          }
          break;
      }
    }
  }

  const n = segA.length;
  if (n === 0) return [];

  // ---- 2) Join segments into polylines (hash endpoints by edge id, O(n)) -------
  const inc = new Map(); // edge id -> array of incident segment indices (length <= 2)
  for (let s = 0; s < n; s++) {
    let la = inc.get(segA[s]); if (la === undefined) inc.set(segA[s], la = []); la.push(s);
    let lb = inc.get(segB[s]); if (lb === undefined) inc.set(segB[s], lb = []); lb.push(s);
  }

  const used = new Uint8Array(n);
  const paths = [];

  const walk = (startEdge, startSeg) => {
    const edges = [startEdge];
    let cur = startEdge, seg = startSeg;
    while (seg !== -1) {
      used[seg] = 1;
      cur = (segA[seg] === cur) ? segB[seg] : segA[seg];
      edges.push(cur); // a closed loop naturally re-pushes its start edge here
      const list = inc.get(cur);
      seg = -1;
      for (let k = 0; k < list.length; k++) {
        if (!used[list[k]]) { seg = list[k]; break; }
      }
    }
    return edges;
  };

  // Open polylines start at degree-1 edges.
  for (const [edge, list] of inc) {
    if (list.length === 1 && !used[list[0]]) {
      paths.push(edgesToPath(walk(edge, list[0]), vals, kind, f, level, nx, sx, xmin, ymin, dx, dy, numH));
    }
  }
  // Remaining segments are closed loops; the walk ends back at its start edge,
  // so the first point is repeated exactly (identical coordinates).
  for (let s = 0; s < n; s++) {
    if (!used[s]) {
      paths.push(edgesToPath(walk(segA[s], s), vals, kind, f, level, nx, sx, xmin, ymin, dx, dy, numH));
    }
  }
  return paths;
}

// Convert a list of edge ids into a Float32Array polyline [x0,y0, x1,y1, ...].
// Crossings are root-found on f along the edge (a linear guess that already sits on the
// level is kept); an edge with an undefined endpoint is bisected over its defined part.
function edgesToPath(edges, vals, kind, f, level, nx, sx, xmin, ymin, dx, dy, numH) {
  const m = edges.length;
  const path = new Float32Array(2 * m);
  for (let k = 0; k < m; k++) {
    const e = edges[k];
    let base, step, i, j, horiz;
    if (e < numH) { // horizontal edge (i,j)-(i+1,j)
      i = e % nx; j = (e - i) / nx; base = j * sx + i; step = 1; horiz = true;
    } else {        // vertical edge (i,j)-(i,j+1)
      const ke = e - numH;
      i = ke % sx; j = (ke - i) / sx; base = j * sx + i; step = sx; horiz = false;
    }
    const ka = kind[base], kb = kind[base + step];
    const x0 = xmin + i * dx, y0 = ymin + j * dy;
    const ex = horiz ? dx : 0, ey = horiz ? 0 : dy;
    const g = (t) => +f(x0 + t * ex, y0 + t * ey) - level;
    let t;
    if (ka === 0 && kb === 0) {
      let d0 = vals[base] - level;        if (d0 === 0) d0 = TINY;
      let d1 = vals[base + step] - level; if (d1 === 0) d1 = TINY;
      t = d0 / (d0 - d1);
      if (!(t >= 0)) t = 0; else if (t > 1) t = 1;
      // keep the linear guess when it already sits on the level (linear fields stay exact);
      // otherwise root-find on f, which matters beside a pole where one corner is huge
      const gt = g(t);
      const scale = Math.abs(d0) + Math.abs(d1);
      if (!(gt === gt && scale < Infinity && Math.abs(gt) <= 1e-9 * scale)) {
        let lo = 0, hi = 1, glo = d0, ghi = d1;
        if (gt === gt) { if ((gt < 0) === (d0 < 0)) { lo = t; glo = gt; } else { hi = t; ghi = gt; } }
        t = bracketRoot(g, lo, hi, glo, ghi, t, gt);
      }
    } else if (ka === 0 || kb === 0) {
      // find a sign change on the defined part (walking from the defined end), then
      // root-find inside it; no crossing -> the domain edge
      const fromA = ka === 0;
      const gw = fromA ? g : (u) => g(1 - u);
      let glo = (fromA ? vals[base] : vals[base + step]) - level; if (glo === 0) glo = TINY;
      let lo = 0, hi = 1, ghi = NaN;
      for (let it = 0; it < 16 && ghi !== ghi; it++) {
        const mm = 0.5 * (lo + hi);
        const v = gw(mm);
        if (v !== v) hi = mm;
        else if ((v < 0) === (glo < 0)) { lo = mm; glo = v; }
        else { ghi = v; hi = mm; }
      }
      const u = ghi === ghi ? bracketRoot(gw, lo, hi, glo, ghi) : lo;
      t = fromA ? u : 1 - u;
    } else {
      t = 0.5; // unreachable: segments on both-undefined edges are dropped above
    }
    if (!(t >= 0)) t = 0; else if (t > 1) t = 1;
    path[2 * k] = horiz ? xmin + (i + t) * dx : xmin + i * dx;
    path[2 * k + 1] = horiz ? ymin + j * dy : ymin + (j + t) * dy;
  }
  return path;
}
