// tests/test-implicit.mjs — tests for src/geometry/implicit.js (marching cubes)
// Run: node tests/test-implicit.mjs   (exit 0 on pass)

import { marchingCubes, EDGE_TABLE, TRI_TABLE } from '../src/geometry/implicit.js';

let checks = 0, failures = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  FAIL: ' + msg); }
}
function section(name) { console.log('- ' + name); }

// ---------- helpers ----------

function triCount(res) { return res.positions.length / 9; }

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
    const l = Math.hypot(N[o], N[o + 1], N[o + 2]);
    if (Math.abs(l - 1) > tol) return false;
  }
  return true;
}

// Every triangle: geometric face normal (right-hand rule on emitted order) must agree
// with the vertex normals => winding is CCW seen from the normal side.
function windingConsistent(P, N) {
  for (let o = 0; o < P.length; o += 9) {
    const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
    const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const l = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (l === 0) continue; // degenerate sliver — no orientation
    const nx = N[o] + N[o + 3] + N[o + 6];
    const ny = N[o + 1] + N[o + 4] + N[o + 7];
    const nz = N[o + 2] + N[o + 5] + N[o + 8];
    if (cx * nx + cy * ny + cz * nz <= 0) return false;
  }
  return true;
}

// Deduplicate vertices (exact — shared vertices must be bitwise identical) and check
// the mesh is a closed, consistently oriented manifold. Returns Euler characteristic.
function topology(P) {
  const vid = new Map();
  const tri = [];
  let degenerate = 0;
  for (let o = 0; o < P.length; o += 3) {
    const key = P[o] + '|' + P[o + 1] + '|' + P[o + 2];
    let id = vid.get(key);
    if (id === undefined) { id = vid.size; vid.set(key, id); }
    tri.push(id);
  }
  const dir = new Map(); // directed edge a->b counts
  let faces = 0;
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    if (a === b || b === c || c === a) { degenerate++; continue; }
    faces++;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u + '>' + v;
      dir.set(k, (dir.get(k) || 0) + 1);
    }
  }
  let manifold = true;
  for (const [k, n] of dir) {
    if (n !== 1) { manifold = false; break; }
    const [u, v] = k.split('>');
    if (dir.get(v + '>' + u) !== 1) { manifold = false; break; }
  }
  const E = dir.size / 2;
  return { V: vid.size, E, F: faces, chi: vid.size - E + faces, manifold, degenerate };
}

// ---------- 1. table sanity (edge table <-> tri table cross-consistency) ----------

section('table consistency (256 cases)');
{
  assert(EDGE_TABLE.length === 256, 'EDGE_TABLE has 256 entries');
  assert(TRI_TABLE.length === 4096, 'TRI_TABLE has 256*16 entries');
  let ok = true, okSym = true, okTerm = true;
  for (let ci = 0; ci < 256; ci++) {
    let used = 0, ended = false, nv = 0;
    for (let m = 0; m < 16; m++) {
      const e = TRI_TABLE[ci * 16 + m];
      if (e === -1) { ended = true; continue; }
      if (ended || e < 0 || e > 11) { okTerm = false; }
      used |= 1 << e;
      nv++;
    }
    if (nv % 3 !== 0) okTerm = false;
    if (used !== EDGE_TABLE[ci]) { ok = false; }
    if (EDGE_TABLE[ci] !== EDGE_TABLE[255 - ci]) okSym = false;
  }
  assert(ok, 'edges used by TRI_TABLE rows match EDGE_TABLE bits for all 256 cases');
  assert(okSym, 'EDGE_TABLE[i] === EDGE_TABLE[255-i] for all i');
  assert(okTerm, 'every TRI_TABLE row is -1-terminated groups of 3 with edges in 0..11');
}

// ---------- 2. unit sphere ----------

section('unit sphere x^2+y^2+z^2-1, [-1.6,1.6]^3, res 40 (level defaulted)');
{
  const f = (x, y, z) => x * x + y * y + z * z - 1;
  const res = marchingCubes(f, { xmin: -1.6, xmax: 1.6, ymin: -1.6, ymax: 1.6, zmin: -1.6, zmax: 1.6, nx: 40, ny: 40, nz: 40 });
  const P = res.positions, N = res.normals;

  assert(P instanceof Float32Array && N instanceof Float32Array, 'outputs are Float32Array');
  assert(P.length > 0 && P.length % 9 === 0, 'positions.length is a positive multiple of 9 (got ' + P.length + ')');
  assert(N.length === P.length, 'normals.length === positions.length');
  assert(allFinite(P), 'no NaN/Inf in positions');
  assert(allFinite(N), 'no NaN/Inf in normals');
  assert(normalsUnit(N), 'all normals unit length (±1e-3)');

  // every vertex within 0.02 of radius 1
  let maxRadErr = 0;
  for (let o = 0; o < P.length; o += 3) {
    const r = Math.hypot(P[o], P[o + 1], P[o + 2]);
    const e = Math.abs(r - 1);
    if (e > maxRadErr) maxRadErr = e;
  }
  assert(maxRadErr < 0.02, 'every vertex within 0.02 of radius 1 (max err ' + maxRadErr.toFixed(5) + ')');

  // total area within 3% of 4*pi
  const area = totalArea(P);
  const target = 4 * Math.PI;
  assert(Math.abs(area - target) / target < 0.03,
    'area within 3% of 4pi (area ' + area.toFixed(4) + ' vs ' + target.toFixed(4) + ')');

  // every normal within 3 degrees of the (outward) radial direction
  const cos3 = Math.cos(3 * Math.PI / 180);
  let minDot = 1;
  for (let o = 0; o < P.length; o += 3) {
    const r = Math.hypot(P[o], P[o + 1], P[o + 2]);
    const d = (N[o] * P[o] + N[o + 1] * P[o + 1] + N[o + 2] * P[o + 2]) / r;
    if (d < minDot) minDot = d;
  }
  assert(minDot >= cos3, 'all normals within 3 deg of outward radial (min dot ' + minDot.toFixed(6) + ')');
  assert(minDot > 0, 'normals point toward increasing f (outward)');

  assert(windingConsistent(P, N), 'winding CCW as seen from the normal side for every triangle');

  const topo = topology(P);
  assert(topo.degenerate === 0, 'no degenerate triangles');
  assert(topo.manifold, 'mesh is a closed consistently-oriented manifold (each directed edge used once)');
  assert(topo.chi === 2, 'Euler characteristic 2 (sphere), got ' + topo.chi);
  console.log('    tris=' + triCount(res) + ' area=' + area.toFixed(4) + ' maxRadErr=' + maxRadErr.toExponential(2) + ' chi=' + topo.chi);
}

// ---------- 3. nonzero level ----------

section('nonzero level: x^2+y^2+z^2 at level 1');
{
  const f = (x, y, z) => x * x + y * y + z * z;
  const res = marchingCubes(f, { xmin: -1.5, xmax: 1.5, ymin: -1.5, ymax: 1.5, zmin: -1.5, zmax: 1.5, nx: 32, ny: 32, nz: 32, level: 1 });
  const P = res.positions;
  assert(P.length > 0, 'produced triangles');
  let maxErr = 0;
  for (let o = 0; o < P.length; o += 3) {
    const e = Math.abs(Math.hypot(P[o], P[o + 1], P[o + 2]) - 1);
    if (e > maxErr) maxErr = e;
  }
  assert(maxErr < 0.02, 'vertices within 0.02 of radius 1 at level=1 (max err ' + maxErr.toFixed(5) + ')');
}

// ---------- 4. NaN robustness ----------

section('NaN region: sqrt(x) + y^2 + z^2 - 0.5 (NaN for x<0)');
{
  const f = (x, y, z) => Math.sqrt(x) + y * y + z * z - 0.5;
  let res;
  let threw = false;
  try {
    res = marchingCubes(f, { xmin: -1, xmax: 1, ymin: -1, ymax: 1, zmin: -1, zmax: 1, nx: 24, ny: 24, nz: 24, level: 0 });
  } catch (err) {
    threw = true;
    console.error('  threw: ' + err.message);
  }
  assert(!threw, 'does not crash on NaN field values');
  if (!threw) {
    assert(res.positions.length > 0, 'still extracts the surface in the valid region');
    assert(res.positions.length % 9 === 0, 'positions multiple of 9');
    assert(res.normals.length === res.positions.length, 'normals length matches');
    assert(allFinite(res.positions), 'no NaN/Inf in positions despite NaN field region');
    assert(allFinite(res.normals), 'no NaN/Inf in normals despite NaN field region (fallback normals)');
    assert(normalsUnit(res.normals), 'fallback normals still unit length');
    // no vertex may lie strictly inside the NaN region (cells with NaN corners skipped)
    let minX = Infinity;
    for (let o = 0; o < res.positions.length; o += 3) minX = Math.min(minX, res.positions[o]);
    const dx = 2 / 24;
    assert(minX >= -dx - 1e-9, 'no vertex deeper than one cell into the NaN region (minX ' + minX.toFixed(4) + ')');
  }
}

// ---------- 5. torus ----------

section('torus (sqrt(x^2+y^2)-1)^2 + z^2 - 0.16 (R=1, r=0.4)');
{
  const f = (x, y, z) => {
    const q = Math.sqrt(x * x + y * y) - 1;
    return q * q + z * z - 0.16;
  };
  const res = marchingCubes(f, { xmin: -1.6, xmax: 1.6, ymin: -1.6, ymax: 1.6, zmin: -0.8, zmax: 0.8, nx: 64, ny: 64, nz: 32 });
  const P = res.positions, N = res.normals;

  assert(P.length > 0 && P.length % 9 === 0, 'produced triangles');
  assert(allFinite(P) && allFinite(N), 'finite outputs');
  assert(normalsUnit(N), 'unit normals');

  // area within 5% of 4*pi^2*R*r = 15.791...
  const area = totalArea(P);
  const target = 4 * Math.PI * Math.PI * 1 * 0.4; // ~15.79
  assert(Math.abs(area - target) / target < 0.05,
    'torus area within 5% of ' + target.toFixed(2) + ' (got ' + area.toFixed(4) + ')');

  // all vertices satisfy |f| < 0.05
  let maxAbsF = 0;
  for (let o = 0; o < P.length; o += 3) {
    const v = Math.abs(f(P[o], P[o + 1], P[o + 2]));
    if (v > maxAbsF) maxAbsF = v;
  }
  assert(maxAbsF < 0.05, 'all vertices satisfy |f| < 0.05 (max ' + maxAbsF.toFixed(5) + ')');

  assert(windingConsistent(P, N), 'torus winding consistent with normals');

  // genus sanity: closed orientable manifold with Euler characteristic 0
  const topo = topology(P);
  assert(topo.degenerate === 0, 'no degenerate triangles');
  assert(topo.manifold, 'torus mesh is a closed consistently-oriented manifold');
  assert(topo.chi === 0, 'Euler characteristic 0 => genus 1 (got ' + topo.chi + ')');
  console.log('    tris=' + triCount(res) + ' area=' + area.toFixed(4) + ' maxAbsF=' + maxAbsF.toExponential(2) + ' chi=' + topo.chi);
}

// ---------- 6. empty cases ----------

section('empty outputs');
{
  const res1 = marchingCubes(() => 1, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, zmin: 0, zmax: 1, nx: 4, ny: 4, nz: 4 });
  assert(res1.positions instanceof Float32Array && res1.positions.length === 0, 'all-positive field -> empty positions');
  assert(res1.normals.length === 0, 'all-positive field -> empty normals');
  const res2 = marchingCubes(() => -1, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, zmin: 0, zmax: 1, nx: 4, ny: 4, nz: 4 });
  assert(res2.positions.length === 0, 'all-negative field -> empty positions');
  const res3 = marchingCubes(() => NaN, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, zmin: 0, zmax: 1, nx: 4, ny: 4, nz: 4 });
  assert(res3.positions.length === 0 && res3.normals.length === 0, 'all-NaN field -> empty outputs, no crash');
}

// ---------- summary ----------

console.log('');
console.log(failures === 0
  ? `test-implicit: PASS (${checks} checks)`
  : `test-implicit: FAIL (${failures}/${checks} checks failed)`);
process.exit(failures === 0 ? 0 : 1);
