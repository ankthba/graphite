// tests/audit-marching-cubes.mjs — adversarial audit tests for src/geometry/implicit.js
// Run: node tests/audit-marching-cubes.mjs   (exit 0 on pass)
//
// Probes cases the author's tests missed:
//  1. inverted field (inside POSITIVE) -> normals must point inward (toward increasing f),
//     winding still consistent, area still right
//  2. level crossings EXACTLY at grid corners (t=0/t=1 degeneracy, off-by-one single emission)
//  3. single-cell grid (nx=ny=nz=1), linear field -> exact hexagon, exact area 3*sqrt(3)/4
//  4. anisotropic ellipsoid on an anisotropic grid/domain -> catches i/j/k axis transpositions
//     that symmetric sphere tests cannot see; normals vs analytic gradient
//  5. isolated NaN at a single interior grid point -> only its 8 incident cells skipped,
//     outputs finite, unit normals
//  6. level omitted vs level:0 explicit -> identical output; negative level works
//  7. constant field f === level everywhere -> empty (v<level strict), no crash
//  8. surface lying exactly on the domain boundary -> no crash, no NaN

import { marchingCubes } from '../src/geometry/implicit.js';

let checks = 0, failures = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  FAIL: ' + msg); }
}
function section(name) { console.log('- ' + name); }

function totalArea(P) {
  let area = 0;
  for (let o = 0; o < P.length; o += 9) {
    const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
    const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }
  return area;
}
function allFinite(arr) {
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
}
function normalsUnit(N, tol = 1e-3) {
  for (let o = 0; o < N.length; o += 3) {
    if (Math.abs(Math.hypot(N[o], N[o + 1], N[o + 2]) - 1) > tol) return false;
  }
  return true;
}
// Right-hand-rule face normal must agree with the summed vertex normals.
function windingConsistent(P, N) {
  for (let o = 0; o < P.length; o += 9) {
    const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
    const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (cx * cx + cy * cy + cz * cz === 0) continue; // degenerate sliver
    const nx = N[o] + N[o + 3] + N[o + 6];
    const ny = N[o + 1] + N[o + 4] + N[o + 7];
    const nz = N[o + 2] + N[o + 5] + N[o + 8];
    if (cx * nx + cy * ny + cz * nz <= 0) return false;
  }
  return true;
}

// ---------- 1. inverted field: inside is POSITIVE ----------

section('inverted sphere f = 1 - (x^2+y^2+z^2): normals must point INWARD (toward increasing f)');
{
  const f = (x, y, z) => 1 - (x * x + y * y + z * z);
  const res = marchingCubes(f, { xmin: -1.6, xmax: 1.6, ymin: -1.6, ymax: 1.6, zmin: -1.6, zmax: 1.6, nx: 40, ny: 40, nz: 40, level: 0 });
  const P = res.positions, N = res.normals;
  assert(P.length > 0 && P.length % 9 === 0, 'produced triangles');
  assert(allFinite(P) && allFinite(N), 'finite outputs');
  assert(normalsUnit(N), 'unit normals');
  let maxDot = -1, maxRadErr = 0;
  for (let o = 0; o < P.length; o += 3) {
    const r = Math.hypot(P[o], P[o + 1], P[o + 2]);
    maxRadErr = Math.max(maxRadErr, Math.abs(r - 1));
    const d = (N[o] * P[o] + N[o + 1] * P[o + 1] + N[o + 2] * P[o + 2]) / r; // dot with OUTWARD radial
    if (d > maxDot) maxDot = d;
  }
  assert(maxRadErr < 0.02, 'vertices within 0.02 of r=1 (max err ' + maxRadErr.toFixed(5) + ')');
  // grad f = -2(x,y,z): every normal must be within 3 deg of -radial => dot with +radial <= -cos(3deg)
  assert(maxDot <= -Math.cos(3 * Math.PI / 180), 'ALL normals inward, toward increasing f (max outward dot ' + maxDot.toFixed(6) + ')');
  assert(windingConsistent(P, N), 'winding CCW seen from the (inward) normal side');
  const area = totalArea(P);
  assert(Math.abs(area - 4 * Math.PI) / (4 * Math.PI) < 0.03, 'area within 3% of 4pi (got ' + area.toFixed(4) + ')');
}

// ---------- 2. level crossing exactly at grid corners ----------

section('plane f = z with z=0 exactly on a grid plane: single emission, exact area, +z normals');
{
  // domain [-1,1]^3, nz=4 -> grid planes at z = -1,-0.5,0,0.5,1. Surface z=0 hits corners exactly.
  const f = (x, y, z) => z;
  const res = marchingCubes(f, { xmin: -1, xmax: 1, ymin: -1, ymax: 1, zmin: -1, zmax: 1, nx: 4, ny: 4, nz: 4, level: 0 });
  const P = res.positions, N = res.normals;
  assert(P.length > 0, 'plane through grid corners still emitted');
  assert(allFinite(P) && allFinite(N), 'finite outputs (no 0/0 NaN from d===0 edges)');
  assert(normalsUnit(N), 'unit normals');
  let maxAbsZ = 0;
  for (let o = 0; o < P.length; o += 3) maxAbsZ = Math.max(maxAbsZ, Math.abs(P[o + 2]));
  assert(maxAbsZ < 1e-6, 'every vertex exactly on z=0 (max |z| ' + maxAbsZ + ')');
  const area = totalArea(P);
  assert(Math.abs(area - 4) < 1e-5, 'area exactly 2x2=4, emitted exactly once (got ' + area + ')');
  let nOk = true;
  for (let o = 0; o < N.length; o += 3) {
    if (!(N[o + 2] > 0.999 && Math.abs(N[o]) < 1e-3 && Math.abs(N[o + 1]) < 1e-3)) nOk = false;
  }
  assert(nOk, 'all normals are +z (grad f)');
  assert(windingConsistent(P, N), 'winding consistent for corner-degenerate crossings');
}

// ---------- 3. single-cell grid, exact hexagon ----------

section('single cell nx=ny=nz=1: plane x+y+z=1.5 cuts unit cube in a regular hexagon');
{
  const f = (x, y, z) => x + y + z - 1.5;
  const res = marchingCubes(f, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, zmin: 0, zmax: 1, nx: 1, ny: 1, nz: 1 });
  const P = res.positions, N = res.normals;
  assert(P.length > 0 && P.length % 9 === 0, 'single-cell grid produces triangles');
  let maxAbsF = 0;
  for (let o = 0; o < P.length; o += 3) maxAbsF = Math.max(maxAbsF, Math.abs(f(P[o], P[o + 1], P[o + 2])));
  assert(maxAbsF < 1e-5, 'linear field -> vertices exactly on the plane (max |f| ' + maxAbsF + ')');
  const area = totalArea(P);
  const hexArea = 3 * Math.sqrt(3) / 4; // regular hexagon through edge midpoints
  assert(Math.abs(area - hexArea) < 1e-4, 'hexagon area 3*sqrt(3)/4 = ' + hexArea.toFixed(6) + ' (got ' + area.toFixed(6) + ')');
  const s = 1 / Math.sqrt(3);
  let nOk = true;
  for (let o = 0; o < N.length; o += 3) {
    if (N[o] * s + N[o + 1] * s + N[o + 2] * s < 0.9999) nOk = false;
  }
  assert(nOk, 'normals equal (1,1,1)/sqrt(3)');
  assert(windingConsistent(P, N), 'winding consistent in single cell');
}

// ---------- 4. anisotropic ellipsoid on anisotropic grid (axis-mixup detector) ----------

section('ellipsoid (x/1.2)^2+(y/0.7)^2+(z/0.4)^2=1, unequal domain AND unequal nx,ny,nz');
{
  const a = 1.2, b = 0.7, c = 0.4;
  const f = (x, y, z) => (x / a) ** 2 + (y / b) ** 2 + (z / c) ** 2 - 1;
  const res = marchingCubes(f, {
    xmin: -1.5, xmax: 1.5, ymin: -0.9, ymax: 0.9, zmin: -0.55, zmax: 0.55,
    nx: 48, ny: 30, nz: 22, level: 0,
  });
  const P = res.positions, N = res.normals;
  assert(P.length > 0 && P.length % 9 === 0, 'produced triangles');
  assert(allFinite(P) && allFinite(N), 'finite outputs');
  assert(normalsUnit(N), 'unit normals');
  let maxAbsF = 0, minDot = 1;
  for (let o = 0; o < P.length; o += 3) {
    const x = P[o], y = P[o + 1], z = P[o + 2];
    maxAbsF = Math.max(maxAbsF, Math.abs(f(x, y, z)));
    // analytic gradient (exact for a quadratic, central differences are exact too)
    let gx = 2 * x / (a * a), gy = 2 * y / (b * b), gz = 2 * z / (c * c);
    const gl = Math.hypot(gx, gy, gz);
    gx /= gl; gy /= gl; gz /= gl;
    const d = N[o] * gx + N[o + 1] * gy + N[o + 2] * gz;
    if (d < minDot) minDot = d;
  }
  // an i/j or j/k transposition anywhere makes vertices land far off the ellipsoid
  assert(maxAbsF < 0.03, 'all vertices near the ellipsoid surface, |f| < 0.03 (max ' + maxAbsF.toFixed(5) + ')');
  assert(minDot > 0.999, 'normals match analytic outward gradient (min dot ' + minDot.toFixed(6) + ')');
  assert(windingConsistent(P, N), 'winding consistent on anisotropic grid');
}

// ---------- 5. isolated NaN grid point ----------

section('single NaN grid point inside the surface region: local hole only, finite outputs');
{
  // sphere grid [-1.6,1.6]^3 res 20 -> grid points at multiples of 0.16; poison exactly one
  // on-surface-adjacent grid point (0.96, 0.16, 0.16).
  const px = 0.96, py = 0.16, pz = 0.16, eps = 1e-9;
  const f = (x, y, z) => {
    if (Math.abs(x - px) < eps && Math.abs(y - py) < eps && Math.abs(z - pz) < eps) return NaN;
    return x * x + y * y + z * z - 1;
  };
  let res, threw = false;
  try {
    res = marchingCubes(f, { xmin: -1.6, xmax: 1.6, ymin: -1.6, ymax: 1.6, zmin: -1.6, zmax: 1.6, nx: 20, ny: 20, nz: 20 });
  } catch (e) { threw = true; console.error('  threw: ' + e.message); }
  assert(!threw, 'does not crash on isolated NaN grid point');
  if (!threw) {
    assert(res.positions.length > 0, 'surface still extracted elsewhere');
    assert(allFinite(res.positions), 'no NaN in positions');
    assert(allFinite(res.normals), 'no NaN in normals (gradient near the hole falls back cleanly)');
    assert(normalsUnit(res.normals), 'normals still unit length');
    // clean-field reference: poisoning ONE grid point may only remove tris from its 8 incident cells
    const clean = marchingCubes((x, y, z) => x * x + y * y + z * z - 1,
      { xmin: -1.6, xmax: 1.6, ymin: -1.6, ymax: 1.6, zmin: -1.6, zmax: 1.6, nx: 20, ny: 20, nz: 20 });
    const lost = (clean.positions.length - res.positions.length) / 9;
    assert(lost >= 1, 'the NaN cell region was actually skipped (lost ' + lost + ' tris)');
    assert(lost <= 8 * 5, 'only the 8 incident cells skipped, not more (lost ' + lost + ' tris)');
  }
}

// ---------- 6. level default identity + negative level ----------

section('level omitted === level 0 explicit; negative level');
{
  const f = (x, y, z) => x * x + y * y + z * z - 1;
  const box = { xmin: -1.3, xmax: 1.3, ymin: -1.3, ymax: 1.3, zmin: -1.3, zmax: 1.3, nx: 12, ny: 12, nz: 12 };
  const r1 = marchingCubes(f, { ...box });
  const r2 = marchingCubes(f, { ...box, level: 0 });
  assert(r1.positions.length === r2.positions.length, 'same triangle count with level omitted vs 0');
  let same = r1.positions.length === r2.positions.length;
  if (same) for (let i = 0; i < r1.positions.length; i++) {
    if (r1.positions[i] !== r2.positions[i] || r1.normals[i] !== r2.normals[i]) { same = false; break; }
  }
  assert(same, 'bitwise-identical output with level omitted vs level:0');

  // f - at level -0.75 is the sphere of radius 0.5
  const g = (x, y, z) => x * x + y * y + z * z - 1;
  const r3 = marchingCubes(g, { ...box, nx: 26, ny: 26, nz: 26, level: -0.75 });
  assert(r3.positions.length > 0, 'negative level produces triangles');
  let maxErr = 0;
  for (let o = 0; o < r3.positions.length; o += 3) {
    maxErr = Math.max(maxErr, Math.abs(Math.hypot(r3.positions[o], r3.positions[o + 1], r3.positions[o + 2]) - 0.5));
  }
  assert(maxErr < 0.02, 'negative level -0.75 gives sphere r=0.5 (max err ' + maxErr.toFixed(5) + ')');
}

// ---------- 7. constant field equal to level ----------

section('f === level everywhere (all corners exactly at level)');
{
  const res = marchingCubes(() => 0.5, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, zmin: 0, zmax: 1, nx: 3, ny: 3, nz: 3, level: 0.5 });
  assert(res.positions.length === 0 && res.normals.length === 0, 'constant field at level -> empty output (strict v<level), no crash');
}

// ---------- 8. surface exactly on the domain boundary ----------

section('surface exactly on the domain boundary face');
{
  // f = x on [0,1]: the whole zero set lies on the xmin face; all corner values >= 0.
  const res = marchingCubes((x) => x, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, zmin: 0, zmax: 1, nx: 4, ny: 4, nz: 4, level: 0 });
  assert(allFinite(res.positions) && allFinite(res.normals), 'no NaN when surface touches the boundary');
  assert(res.positions.length % 9 === 0, 'well-formed output');
  // shifted slightly inside, it must appear with area ~1
  const res2 = marchingCubes((x) => x - 0.375, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, zmin: 0, zmax: 1, nx: 4, ny: 4, nz: 4, level: 0 });
  const area2 = totalArea(res2.positions);
  assert(Math.abs(area2 - 1) < 1e-5, 'interior plane area exactly 1 (got ' + area2 + ')');
}

// ---------- summary ----------

console.log('');
console.log(failures === 0
  ? `audit-marching-cubes: PASS (${checks} checks)`
  : `audit-marching-cubes: FAIL (${failures}/${checks} checks failed)`);
process.exit(failures === 0 ? 0 : 1);
