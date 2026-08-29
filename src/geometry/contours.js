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
// - Cells with any NaN corner are skipped.
// - A sample exactly equal to the level is nudged "inside" (d = 0 treated as
//   d = +TINY), keeping classification and interpolation consistent and avoiding
//   degenerate zero-length segments through grid corners.

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
    for (let i = 0; i < sx; i++) vals[row + i] = f(xmin + i * dx, y);
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
      paths: contourOneLevel(vals, level, nx, ny, sx, xmin, ymin, dx, dy, numH),
    });
  }
  return out;
}

function contourOneLevel(vals, level, nx, ny, sx, xmin, ymin, dx, dy, numH) {
  // ---- 1) Generate segments as pairs of edge ids -------------------------------
  const segA = [], segB = [];

  for (let j = 0; j < ny; j++) {
    const r0 = j * sx, r1 = r0 + sx;
    for (let i = 0; i < nx; i++) {
      const v00 = vals[r0 + i], v10 = vals[r0 + i + 1];   // bottom-left, bottom-right
      const v01 = vals[r1 + i], v11 = vals[r1 + i + 1];   // top-left, top-right
      // Skip cells with any NaN corner (NaN !== NaN).
      if (v00 !== v00 || v10 !== v10 || v01 !== v01 || v11 !== v11) continue;

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
        case 1: case 14: segA.push(e3); segB.push(e0); break; // c0 isolated
        case 2: case 13: segA.push(e0); segB.push(e1); break; // c1 isolated
        case 4: case 11: segA.push(e1); segB.push(e2); break; // c2 isolated
        case 8: case 7:  segA.push(e2); segB.push(e3); break; // c3 isolated
        case 3: case 12: segA.push(e3); segB.push(e1); break; // horizontal split
        case 6: case 9:  segA.push(e0); segB.push(e2); break; // vertical split
        case 5:  // saddle: c0 & c2 inside — resolve with cell-center average
          if (d00 + d10 + d01 + d11 > 0) { // center inside: diagonal band, isolate c1 and c3
            segA.push(e0); segB.push(e1);
            segA.push(e2); segB.push(e3);
          } else {                         // center outside: isolate c0 and c2
            segA.push(e3); segB.push(e0);
            segA.push(e1); segB.push(e2);
          }
          break;
        case 10: // saddle: c1 & c3 inside
          if (d00 + d10 + d01 + d11 > 0) { // center inside: isolate c0 and c2
            segA.push(e3); segB.push(e0);
            segA.push(e1); segB.push(e2);
          } else {                         // center outside: isolate c1 and c3
            segA.push(e0); segB.push(e1);
            segA.push(e2); segB.push(e3);
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
      paths.push(edgesToPath(walk(edge, list[0]), vals, level, nx, sx, xmin, ymin, dx, dy, numH));
    }
  }
  // Remaining segments are closed loops; the walk ends back at its start edge,
  // so the first point is repeated exactly (identical coordinates).
  for (let s = 0; s < n; s++) {
    if (!used[s]) {
      paths.push(edgesToPath(walk(segA[s], s), vals, level, nx, sx, xmin, ymin, dx, dy, numH));
    }
  }
  return paths;
}

// Convert a list of edge ids into a Float32Array polyline [x0,y0, x1,y1, ...].
// The crossing point on each edge is linearly interpolated from the corner values.
function edgesToPath(edges, vals, level, nx, sx, xmin, ymin, dx, dy, numH) {
  const m = edges.length;
  const path = new Float32Array(2 * m);
  for (let k = 0; k < m; k++) {
    const e = edges[k];
    let x, y;
    if (e < numH) { // horizontal edge (i,j)-(i+1,j)
      const i = e % nx, j = (e - i) / nx;
      const base = j * sx + i;
      let d0 = vals[base] - level;     if (d0 === 0) d0 = TINY;
      let d1 = vals[base + 1] - level; if (d1 === 0) d1 = TINY;
      let t = d0 / (d0 - d1);
      if (!(t >= 0)) t = 0; else if (t > 1) t = 1;
      x = xmin + (i + t) * dx;
      y = ymin + j * dy;
    } else {        // vertical edge (i,j)-(i,j+1)
      const ke = e - numH;
      const i = ke % sx, j = (ke - i) / sx;
      const base = j * sx + i;
      let d0 = vals[base] - level;      if (d0 === 0) d0 = TINY;
      let d1 = vals[base + sx] - level; if (d1 === 0) d1 = TINY;
      let t = d0 / (d0 - d1);
      if (!(t >= 0)) t = 0; else if (t > 1) t = 1;
      x = xmin + i * dx;
      y = ymin + (j + t) * dy;
    }
    path[2 * k] = x;
    path[2 * k + 1] = y;
  }
  return path;
}
