// tests/test-contours.mjs — tests for src/geometry/contours.js (marchingSquares)
// Run: node tests/test-contours.mjs   (exit code 0 on pass)

import { marchingSquares } from '../src/geometry/contours.js';

let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL: ' + msg); }
}

// ---------------------------------------------------------------------------
// 1) Circles: f = x^2 + y^2, levels [0.25, 1]
//    - vertices within 0.01 of the true circles (radii 0.5 and 1)
//    - one long joined path per level (not hundreds of 2-point segments)
//    - loops closed with first point === last point exactly
// ---------------------------------------------------------------------------
{
  const res = marchingSquares((x, y) => x * x + y * y, {
    xmin: -1.6, xmax: 1.6, ymin: -1.6, ymax: 1.6,
    nx: 128, ny: 128, levels: [0.25, 1],
  });

  check(Array.isArray(res) && res.length === 2, 'circles: result has 2 level entries');
  check(res[0].level === 0.25 && res[1].level === 1, 'circles: levels reported in input order');

  const radii = [0.5, 1];
  for (let li = 0; li < 2; li++) {
    const { paths } = res[li];
    const r = radii[li];
    check(paths.length === 1, `circles r=${r}: joined into exactly 1 path (got ${paths.length})`);
    let maxErr = 0, totalPts = 0, allF32 = true, allClosed = true;
    for (const p of paths) {
      allF32 = allF32 && (p instanceof Float32Array);
      const npts = p.length / 2;
      totalPts += npts;
      check(npts >= 2, `circles r=${r}: path has >= 2 points`);
      for (let k = 0; k < p.length; k += 2) {
        const err = Math.abs(Math.hypot(p[k], p[k + 1]) - r);
        if (err > maxErr) maxErr = err;
      }
      allClosed = allClosed && (p[0] === p[p.length - 2] && p[1] === p[p.length - 1]);
    }
    check(allF32, `circles r=${r}: paths are Float32Array`);
    check(maxErr < 0.01, `circles r=${r}: all vertices within 0.01 of circle (max err ${maxErr.toExponential(2)})`);
    check(allClosed, `circles r=${r}: loop closed exactly (first point repeated)`);
    check(totalPts > 50, `circles r=${r}: long polyline (${totalPts} points)`);
  }
}

// ---------------------------------------------------------------------------
// 2) Hyperbola: f = x*y, level [1] on [-2,2]^2
//    - exactly 2 open paths (one branch per quadrant I and III)
//    - every point satisfies |x*y - 1| < 0.02
// ---------------------------------------------------------------------------
{
  const res = marchingSquares((x, y) => x * y, {
    xmin: -2, xmax: 2, ymin: -2, ymax: 2,
    nx: 201, ny: 201, levels: [1],
  });

  check(res.length === 1 && res[0].level === 1, 'hyperbola: 1 level entry, level 1');
  const { paths } = res[0];
  check(paths.length === 2, `hyperbola: exactly 2 open paths (got ${paths.length})`);

  let maxErr = 0;
  for (const p of paths) {
    const npts = p.length / 2;
    check(npts > 20, `hyperbola: branch is a long polyline (${npts} points)`);
    const openDist = Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]);
    check(openDist > 1e-6, 'hyperbola: path is open (first point != last point)');
    for (let k = 0; k < p.length; k += 2) {
      const err = Math.abs(p[k] * p[k + 1] - 1);
      if (err > maxErr) maxErr = err;
    }
  }
  check(maxErr < 0.02, `hyperbola: all points satisfy |xy-1| < 0.02 (max err ${maxErr.toExponential(2)})`);
}

// ---------------------------------------------------------------------------
// 3) NaN robustness: f = sqrt(1 - x^2 - y^2)  (NaN outside the unit disk)
//    levels [0.5] -> circle of radius sqrt(0.75); no crash, no NaN output,
//    single closed loop, vertices within 0.01 of the true radius
// ---------------------------------------------------------------------------
{
  let res = null, threw = false;
  try {
    res = marchingSquares((x, y) => Math.sqrt(1 - x * x - y * y), {
      xmin: -1.6, xmax: 1.6, ymin: -1.6, ymax: 1.6,
      nx: 100, ny: 100, levels: [0.5],
    });
  } catch (e) {
    threw = true;
  }
  check(!threw, 'nan: marchingSquares does not throw on NaN regions');

  if (!threw) {
    const { paths } = res[0];
    check(paths.length === 1, `nan: single closed loop (got ${paths.length} paths)`);
    const rTrue = Math.sqrt(0.75);
    let maxErr = 0, anyNaN = false, allClosed = true;
    for (const p of paths) {
      for (let k = 0; k < p.length; k += 2) {
        if (!Number.isFinite(p[k]) || !Number.isFinite(p[k + 1])) anyNaN = true;
        const err = Math.abs(Math.hypot(p[k], p[k + 1]) - rTrue);
        if (err > maxErr) maxErr = err;
      }
      allClosed = allClosed && (p[0] === p[p.length - 2] && p[1] === p[p.length - 1]);
    }
    check(!anyNaN, 'nan: no NaN/Infinity coordinates emitted');
    check(allClosed, 'nan: loop closed exactly');
    check(maxErr < 0.01, `nan: vertices within 0.01 of radius sqrt(0.75) (max err ${maxErr.toExponential(2)})`);
  }
}

// ---------------------------------------------------------------------------
// 4) Joinedness stress: same circle grid — segment count equals point count
//    budget, i.e. no fragmentation into many tiny paths at any level
// ---------------------------------------------------------------------------
{
  const res = marchingSquares((x, y) => x * x + y * y, {
    xmin: -1.3, xmax: 1.7, ymin: -1.45, ymax: 1.55, // asymmetric domain, off-grid center
    nx: 97, ny: 89, levels: [0.25, 0.5, 1, 1.6], // r up to ~1.265, inside the domain
  });
  for (const { level, paths } of res) {
    check(paths.length === 1, `joinedness: level ${level} is one path (got ${paths.length})`);
    const p = paths[0];
    check(p[0] === p[p.length - 2] && p[1] === p[p.length - 1], `joinedness: level ${level} closed`);
    let maxErr = 0;
    const r = Math.sqrt(level);
    for (let k = 0; k < p.length; k += 2) {
      const err = Math.abs(Math.hypot(p[k], p[k + 1]) - r);
      if (err > maxErr) maxErr = err;
    }
    check(maxErr < 0.01, `joinedness: level ${level} vertices within 0.01 of circle (max err ${maxErr.toExponential(2)})`);
  }
}

console.log(`test-contours: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
