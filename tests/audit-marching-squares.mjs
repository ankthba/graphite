// tests/audit-marching-squares.mjs — adversarial audit tests for src/geometry/contours.js
// Run: node tests/audit-marching-squares.mjs   (exit code 0 on pass)
//
// Probes cases the author's tests missed:
//  - degenerate/empty inputs (empty levels, level outside data range, duplicate levels)
//  - minimal 1x1 grid with exact expected coordinates
//  - full 16-case marching-squares table brute force (topology vs sign-change edges)
//  - saddle disambiguation (codes 5 and 10, center inside vs outside)
//  - contour passing EXACTLY through grid corners (diagonal line) — join contract
//  - contour lying EXACTLY on a grid line (samples equal to level)
//  - NaN half-plane producing an open truncated contour
//  - Infinity samples (pole inside domain) — no NaN coordinates
//  - multiple disjoint components at one level

import { marchingSquares } from '../src/geometry/contours.js';

let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL: ' + msg); }
}
const closeTo = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// 1) Degenerate / empty inputs
// ---------------------------------------------------------------------------
{
  const opts = { xmin: -1, xmax: 1, ymin: -1, ymax: 1, nx: 8, ny: 8 };

  const empty = marchingSquares((x, y) => x * x + y * y, { ...opts, levels: [] });
  check(Array.isArray(empty) && empty.length === 0, 'empty levels array -> []');

  const off = marchingSquares((x, y) => x * x + y * y, { ...opts, levels: [5, -3] });
  check(off.length === 2, 'out-of-range levels: 2 entries');
  check(off[0].level === 5 && off[1].level === -3, 'out-of-range levels echoed in order');
  check(Array.isArray(off[0].paths) && off[0].paths.length === 0, 'level above data range -> paths []');
  check(Array.isArray(off[1].paths) && off[1].paths.length === 0, 'level below data range -> paths []');

  const dup = marchingSquares((x, y) => x * x + y * y, { ...opts, levels: [0.25, 0.25] });
  check(dup.length === 2 && dup[0].paths.length === dup[1].paths.length,
    'duplicate levels produce identical path counts');
  if (dup[0].paths.length === dup[1].paths.length && dup[0].paths.length > 0) {
    let same = true;
    for (let p = 0; p < dup[0].paths.length; p++) {
      const a = dup[0].paths[p], b = dup[1].paths[p];
      if (a.length !== b.length) { same = false; break; }
      for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { same = false; break; }
    }
    check(same, 'duplicate levels produce identical coordinates');
  }

  let threwLevels = false;
  try { marchingSquares((x, y) => x, { ...opts, levels: 0.5 }); } catch (e) { threwLevels = true; }
  check(threwLevels, 'non-array levels throws');

  let threwNx = false;
  try { marchingSquares((x, y) => x, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, nx: 0, ny: 4, levels: [0] }); }
  catch (e) { threwNx = true; }
  check(threwNx, 'nx = 0 throws');
}

// ---------------------------------------------------------------------------
// 2) Minimal 1x1 grid, linear f: exact interpolated endpoints
//    f = x + y - 0.5 on [0,1]^2, level 0 -> segment (0,0.5)-(0.5,0)
// ---------------------------------------------------------------------------
{
  const res = marchingSquares((x, y) => x + y - 0.5, {
    xmin: 0, xmax: 1, ymin: 0, ymax: 1, nx: 1, ny: 1, levels: [0],
  });
  check(res.length === 1 && res[0].paths.length === 1, '1x1 grid: exactly one path');
  const p = res[0].paths[0];
  check(p instanceof Float32Array && p.length === 4, '1x1 grid: path is Float32Array of 2 points');
  if (p.length === 4) {
    const pts = [[p[0], p[1]], [p[2], p[3]]].sort((a, b) => a[0] - b[0]);
    check(pts[0][0] === 0 && pts[0][1] === Math.fround(0.5) &&
          pts[1][0] === Math.fround(0.5) && pts[1][1] === 0,
      `1x1 grid: exact endpoints (0,0.5)/(0.5,0), got (${p[0]},${p[1]})-(${p[2]},${p[3]})`);
  }
}

// ---------------------------------------------------------------------------
// 3) Full case-table brute force: all 16 corner sign patterns on a 1x1 cell.
//    With corner values +-1, every crossing is an edge midpoint. Verify:
//    - path count (0 / 1 / 2-for-saddle)
//    - the set of edges used == the set of sign-change edges, each used once
// ---------------------------------------------------------------------------
{
  const EPS = 1e-9;
  const edgeOf = (x, y) => {
    if (closeTo(y, 0, EPS)) return 'B';
    if (closeTo(x, 1, EPS)) return 'R';
    if (closeTo(y, 1, EPS)) return 'T';
    if (closeTo(x, 0, EPS)) return 'L';
    return '?';
  };
  for (let code = 0; code < 16; code++) {
    // corner order: c0=(0,0) bit1, c1=(1,0) bit2, c2=(1,1) bit4, c3=(0,1) bit8
    const c0 = (code & 1) ? 1 : -1;
    const c1 = (code & 2) ? 1 : -1;
    const c2 = (code & 4) ? 1 : -1;
    const c3 = (code & 8) ? 1 : -1;
    const f = (x, y) => {
      const right = x > 0.5, top = y > 0.5;
      return top ? (right ? c2 : c3) : (right ? c1 : c0);
    };
    const res = marchingSquares(f, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, nx: 1, ny: 1, levels: [0] });
    const paths = res[0].paths;

    const isSaddle = code === 5 || code === 10;
    const nBits = ((code & 1) !== 0) + ((code & 2) !== 0) + ((code & 4) !== 0) + ((code & 8) !== 0);
    const expPaths = (code === 0 || code === 15) ? 0 : (isSaddle ? 2 : 1);
    check(paths.length === expPaths, `case ${code}: ${expPaths} path(s) expected, got ${paths.length}`);

    // Expected sign-change edges
    const expEdges = [];
    if (c0 * c1 < 0) expEdges.push('B');
    if (c1 * c2 < 0) expEdges.push('R');
    if (c2 * c3 < 0) expEdges.push('T');
    if (c3 * c0 < 0) expEdges.push('L');
    expEdges.sort();

    const gotEdges = [];
    let allMid = true, all2pt = true;
    for (const p of paths) {
      if (p.length !== 4) all2pt = false;
      for (let k = 0; k < p.length; k += 2) {
        gotEdges.push(edgeOf(p[k], p[k + 1]));
        // +-1 corner values -> crossing at the midpoint of the edge
        const onMid = (closeTo(p[k], 0.5, 1e-6) && (closeTo(p[k + 1], 0, EPS) || closeTo(p[k + 1], 1, EPS))) ||
                      (closeTo(p[k + 1], 0.5, 1e-6) && (closeTo(p[k], 0, EPS) || closeTo(p[k], 1, EPS)));
        if (!onMid) allMid = false;
      }
    }
    gotEdges.sort();
    check(gotEdges.join('') === expEdges.join(''),
      `case ${code}: edges used [${gotEdges}] == sign-change edges [${expEdges}]`);
    check(allMid, `case ${code}: all crossings at edge midpoints`);
    check(all2pt, `case ${code}: every path has exactly 2 points`);
    void nBits;
  }
}

// ---------------------------------------------------------------------------
// 4) Saddle disambiguation via center average (codes 5 and 10)
//    code 5: c0,c2 inside. center>0 -> isolate c1 (B-R) and c3 (T-L)
//                            center<0 -> isolate c0 (L-B) and c2 (R-T)
//    code 10: c1,c3 inside. center>0 -> isolate c0 (L-B) and c2 (R-T)
//                            center<0 -> isolate c1 (B-R) and c3 (T-L)
// ---------------------------------------------------------------------------
{
  const edgeOf = (x, y) => {
    if (closeTo(y, 0, 1e-9)) return 'B';
    if (closeTo(x, 1, 1e-9)) return 'R';
    if (closeTo(y, 1, 1e-9)) return 'T';
    if (closeTo(x, 0, 1e-9)) return 'L';
    return '?';
  };
  const pathPairs = (paths) =>
    paths.map(p => [edgeOf(p[0], p[1]), edgeOf(p[2], p[3])].sort().join('')).sort().join(',');

  const runCell = (c0, c1, c2, c3) => {
    const f = (x, y) => {
      const right = x > 0.5, top = y > 0.5;
      return top ? (right ? c2 : c3) : (right ? c1 : c0);
    };
    return marchingSquares(f, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, nx: 1, ny: 1, levels: [0] })[0].paths;
  };

  // code 5, center clearly positive (3 - 1 - 1 + 3 = 4 > 0): band connects c0..c2
  let paths = runCell(3, -1, 3, -1);
  check(paths.length === 2 && pathPairs(paths) === 'BR,LT',
    `saddle code 5, center>0: isolates c1 (B-R) and c3 (T-L), got ${pathPairs(paths)}`);

  // code 5, center clearly negative (1 - 3 + 1 - 3 = -4 < 0): c0 and c2 isolated
  paths = runCell(1, -3, 1, -3);
  check(paths.length === 2 && pathPairs(paths) === 'BL,RT',
    `saddle code 5, center<0: isolates c0 (L-B) and c2 (R-T), got ${pathPairs(paths)}`);

  // code 10, center positive (-1 + 3 - 1 + 3 = 4 > 0): band connects c1..c3
  paths = runCell(-1, 3, -1, 3);
  check(paths.length === 2 && pathPairs(paths) === 'BL,RT',
    `saddle code 10, center>0: isolates c0 (L-B) and c2 (R-T), got ${pathPairs(paths)}`);

  // code 10, center negative (-3 + 1 - 3 + 1 = -4 < 0): c1 and c3 isolated
  paths = runCell(-3, 1, -3, 1);
  check(paths.length === 2 && pathPairs(paths) === 'BR,LT',
    `saddle code 10, center<0: isolates c1 (B-R) and c3 (T-L), got ${pathPairs(paths)}`);
}

// ---------------------------------------------------------------------------
// 5) Contour passing EXACTLY through grid corners: f = x + y, level 0,
//    integer-aligned grid. Endpoints from different cells coincide exactly,
//    so per contract they MUST be joined: expect ONE open path spanning
//    (-2,2) .. (2,-2), every point on the line.
// ---------------------------------------------------------------------------
{
  const res = marchingSquares((x, y) => x + y, {
    xmin: -2, xmax: 2, ymin: -2, ymax: 2, nx: 4, ny: 4, levels: [0],
  });
  const paths = res[0].paths;
  check(paths.length === 1, `diagonal-through-corners: joined into 1 path (got ${paths.length})`);
  let maxErr = 0;
  for (const p of paths) {
    for (let k = 0; k < p.length; k += 2) {
      const err = Math.abs(p[k] + p[k + 1]);
      if (err > maxErr) maxErr = err;
    }
  }
  check(maxErr < 1e-6, `diagonal-through-corners: all points on x+y=0 (max err ${maxErr.toExponential(2)})`);
  if (paths.length === 1) {
    const p = paths[0];
    const ends = [[p[0], p[1]], [p[p.length - 2], p[p.length - 1]]]
      .sort((a, b) => a[0] - b[0]);
    check(closeTo(ends[0][0], -2, 1e-6) && closeTo(ends[0][1], 2, 1e-6) &&
          closeTo(ends[1][0], 2, 1e-6) && closeTo(ends[1][1], -2, 1e-6),
      `diagonal-through-corners: spans (-2,2)..(2,-2), got (${ends[0]})..(${ends[1]})`);
  }
}

// ---------------------------------------------------------------------------
// 6) Contour lying EXACTLY on a grid sample line: f = y, level 0, even ny so a
//    whole sample row equals the level. Expect one open path along y = 0
//    spanning x in [-1, 1], no fragmentation, no NaN.
// ---------------------------------------------------------------------------
{
  const res = marchingSquares((x, y) => y, {
    xmin: -1, xmax: 1, ymin: -1, ymax: 1, nx: 8, ny: 8, levels: [0],
  });
  const paths = res[0].paths;
  check(paths.length === 1, `grid-line contour: 1 joined path (got ${paths.length})`);
  let maxAbsY = 0, minX = Infinity, maxX = -Infinity, anyBad = false;
  for (const p of paths) {
    for (let k = 0; k < p.length; k += 2) {
      if (!Number.isFinite(p[k]) || !Number.isFinite(p[k + 1])) anyBad = true;
      maxAbsY = Math.max(maxAbsY, Math.abs(p[k + 1]));
      minX = Math.min(minX, p[k]); maxX = Math.max(maxX, p[k]);
    }
  }
  check(!anyBad, 'grid-line contour: no NaN/Infinity coordinates');
  check(maxAbsY < 1e-6, `grid-line contour: all points on y=0 (max |y| ${maxAbsY.toExponential(2)})`);
  check(closeTo(minX, -1, 1e-6) && closeTo(maxX, 1, 1e-6),
    `grid-line contour: spans x in [-1,1] (got [${minX},${maxX}])`);
}

// ---------------------------------------------------------------------------
// 7) NaN half-plane: f = NaN for y > 0, else x^2 + y^2. Level 0.25 ->
//    open semicircle (radius 0.5, y <= 0). No crash, no NaN coords,
//    single open path with ends near (+-0.5, ~0).
// ---------------------------------------------------------------------------
{
  let res = null, threw = false;
  try {
    res = marchingSquares((x, y) => (y > 0 ? NaN : x * x + y * y), {
      xmin: -1, xmax: 1, ymin: -1, ymax: 1, nx: 100, ny: 100, levels: [0.25],
    });
  } catch (e) { threw = true; }
  check(!threw, 'nan half-plane: no throw');
  if (!threw) {
    const paths = res[0].paths;
    check(paths.length === 1, `nan half-plane: single truncated path (got ${paths.length})`);
    let maxErr = 0, anyBad = false, maxY = -Infinity;
    for (const p of paths) {
      for (let k = 0; k < p.length; k += 2) {
        if (!Number.isFinite(p[k]) || !Number.isFinite(p[k + 1])) anyBad = true;
        maxErr = Math.max(maxErr, Math.abs(Math.hypot(p[k], p[k + 1]) - 0.5));
        maxY = Math.max(maxY, p[k + 1]);
      }
    }
    check(!anyBad, 'nan half-plane: no NaN/Infinity coordinates');
    check(maxErr < 0.01, `nan half-plane: on the r=0.5 circle (max err ${maxErr.toExponential(2)})`);
    check(maxY <= 0 + 1e-9, `nan half-plane: contour confined to y<=0 (max y ${maxY})`);
    if (paths.length === 1) {
      const p = paths[0];
      const open = p[0] !== p[p.length - 2] || p[1] !== p[p.length - 1];
      check(open, 'nan half-plane: path is open (truncated by NaN region)');
      const endsOK = [[p[0], p[1]], [p[p.length - 2], p[p.length - 1]]].every(
        ([x, y]) => Math.abs(y) < 0.03 && closeTo(Math.abs(x), 0.5, 0.03));
      check(endsOK, 'nan half-plane: endpoints near (+-0.5, 0)');
    }
  }
}

// ---------------------------------------------------------------------------
// 8) Infinity sample inside the domain: f = 1/(x^2+y^2), pole AT a grid
//    sample (0,0). Level 4 -> circle radius 0.5. No NaN coords, closed loop.
// ---------------------------------------------------------------------------
{
  let res = null, threw = false;
  try {
    res = marchingSquares((x, y) => 1 / (x * x + y * y), {
      xmin: -1, xmax: 1, ymin: -1, ymax: 1, nx: 200, ny: 200, levels: [4],
    });
  } catch (e) { threw = true; }
  check(!threw, 'infinity pole: no throw');
  if (!threw) {
    const paths = res[0].paths;
    check(paths.length === 1, `infinity pole: single loop (got ${paths.length})`);
    let maxErr = 0, anyBad = false, allClosed = true;
    for (const p of paths) {
      for (let k = 0; k < p.length; k += 2) {
        if (!Number.isFinite(p[k]) || !Number.isFinite(p[k + 1])) anyBad = true;
        maxErr = Math.max(maxErr, Math.abs(Math.hypot(p[k], p[k + 1]) - 0.5));
      }
      allClosed = allClosed && p[0] === p[p.length - 2] && p[1] === p[p.length - 1];
    }
    check(!anyBad, 'infinity pole: no NaN/Infinity coordinates');
    check(allClosed, 'infinity pole: loop closed exactly');
    check(maxErr < 0.01, `infinity pole: on the r=0.5 circle (max err ${maxErr.toExponential(2)})`);
  }
}

// ---------------------------------------------------------------------------
// 9) Two disjoint components at one level: f = min of two shifted paraboloids.
//    Level 0.25 -> two circles of radius 0.5 centered at (+-0.8, 0).
// ---------------------------------------------------------------------------
{
  const res = marchingSquares(
    (x, y) => Math.min((x - 0.8) ** 2 + y * y, (x + 0.8) ** 2 + y * y), {
      xmin: -2, xmax: 2, ymin: -2, ymax: 2, nx: 160, ny: 160, levels: [0.25],
    });
  const paths = res[0].paths;
  check(paths.length === 2, `two blobs: exactly 2 closed loops (got ${paths.length})`);
  let maxErr = 0, allClosed = true;
  for (const p of paths) {
    for (let k = 0; k < p.length; k += 2) {
      const e1 = Math.abs(Math.hypot(p[k] - 0.8, p[k + 1]) - 0.5);
      const e2 = Math.abs(Math.hypot(p[k] + 0.8, p[k + 1]) - 0.5);
      maxErr = Math.max(maxErr, Math.min(e1, e2));
    }
    allClosed = allClosed && p[0] === p[p.length - 2] && p[1] === p[p.length - 1];
  }
  check(allClosed, 'two blobs: both loops closed exactly');
  check(maxErr < 0.01, `two blobs: on one of the circles (max err ${maxErr.toExponential(2)})`);
}

console.log(`audit-marching-squares: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
