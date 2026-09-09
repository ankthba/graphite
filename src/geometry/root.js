// src/geometry/root.js — 1-D bracketed root finding shared by the isosurface/contour extractors.

/**
 * Root of g on [a, b] given g(a) = ga and g(b) = gb of opposite sign (either may be ±Infinity).
 * Illinois-style false position with bisection safeguards. Returns the sample with the
 * smallest |g| seen (the seed sample included), so a smooth g converges superlinearly, a
 * linear g is exact after one step, and a jump (step function) reports its midpoint exactly. NaN samples inside the
 * bracket are treated as lying on b's side.
 */
export function bracketRoot(g, a, b, ga, gb, seed = NaN, seedG = NaN, tol = 1e-7, maxIter = 40) {
  // seed/seedG: a sample already taken (e.g. the linear guess) that competes as the answer
  let best = 0.5 * (a + b), bestMag = Infinity, side = 0;
  if (seed === seed && seedG === seedG) { best = seed; bestMag = Math.abs(seedG); }
  for (let it = 0; it < maxIter && b - a > tol; it++) {
    let c = (ga > -Infinity && ga < Infinity && gb > -Infinity && gb < Infinity && ga !== gb)
      ? (a * gb - b * ga) / (gb - ga) : 0.5 * (a + b);
    if (!(c > a && c < b)) c = 0.5 * (a + b);
    const gc = g(c);
    if (gc !== gc) { b = c; side = 0; continue; }
    const mag = Math.abs(gc);
    if (mag < bestMag) { bestMag = mag; best = c; if (mag === 0) break; }
    if ((gc < 0) === (ga < 0)) { a = c; ga = gc; if (side === -1) gb *= 0.5; side = -1; }
    else { b = c; gb = gc; if (side === 1) ga *= 0.5; side = 1; }
  }
  return best;
}
