// src/math/coords.js — Graphite 3D expression engine: coordinate names.
//
// In Cartesian contexts (x, y[, z] intrinsics) the polar/cylindrical/spherical
// names are rewritten to their Cartesian definitions at the AST level, so
// equations like `rho = 2cos(phi)`, `phi = pi/4`, or `r = 3` graph directly:
//   r     = sqrt(x² + y²)
//   theta = atan2(y, x)
//   rho   = sqrt(x² + y² + z²)
//   phi   = acos(z / rho)
// A name is only substituted when every variable in its definition is an
// available intrinsic (rho/phi need z, so z = f(x, y) surfaces get r/theta
// only). Substitution happens before free-variable analysis, so these names
// never collide with sliders in Cartesian contexts.
import { parse } from './parser.js';

const DEFS = {
  r: { src: 'sqrt(x^2 + y^2)', needs: ['x', 'y'] },
  theta: { src: 'atan2(y, x)', needs: ['x', 'y'] },
  rho: { src: 'sqrt(x^2 + y^2 + z^2)', needs: ['x', 'y', 'z'] },
  phi: { src: 'acos(z / sqrt(x^2 + y^2 + z^2))', needs: ['x', 'y', 'z'] },
};

const cloneAst = (n) => {
  switch (n.t) {
    case 'num': return { t: 'num', v: n.v };
    case 'var': return { t: 'var', name: n.name };
    case 'op': return { t: 'op', op: n.op, a: cloneAst(n.a), b: cloneAst(n.b) };
    case 'neg': return { t: 'neg', a: cloneAst(n.a) };
    case 'call': return { t: 'call', name: n.name, args: n.args.map(cloneAst) };
    default: return n;
  }
};

const CACHE = {};
const defAst = (name) => cloneAst(CACHE[name] ??= parse(DEFS[name].src));

// Returns a new AST with eligible coordinate names replaced (input untouched).
export function substCoordVars(ast, intrinsics) {
  const have = new Set(intrinsics);
  const eligible = (name) => DEFS[name] && DEFS[name].needs.every((v) => have.has(v))
    && !have.has(name); // an actual intrinsic (e.g. spherical phi) always wins
  const walk = (n) => {
    switch (n.t) {
      case 'var': return eligible(n.name) ? defAst(n.name) : n;
      case 'op': return { t: 'op', op: n.op, a: walk(n.a), b: walk(n.b) };
      case 'neg': return { t: 'neg', a: walk(n.a) };
      case 'call': return { t: 'call', name: n.name, args: n.args.map(walk) };
      default: return n;
    }
  };
  return walk(ast);
}
