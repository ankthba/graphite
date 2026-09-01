// Coordinate-name substitution: r/theta/rho/phi in Cartesian contexts.
import { parse } from '../src/math/parser.js';
import { compile, freeVars } from '../src/math/compiler.js';
import { substCoordVars } from '../src/math/coords.js';

let passed = 0, failed = 0;
const ok = (cond, msg) => {
  if (cond) passed++;
  else { failed++; console.error(`  ✗ ${msg}`); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const evalIn = (src, intrinsics, args) => {
  const ast = substCoordVars(parse(src), intrinsics);
  return compile(ast, intrinsics)(...args);
};

// r and theta from x, y
ok(near(evalIn('r', ['x', 'y'], [3, 4]), 5), 'r(3,4) = 5');
ok(near(evalIn('theta', ['x', 'y'], [1, 1]), Math.PI / 4), 'theta(1,1) = pi/4');
ok(near(evalIn('theta', ['x', 'y'], [-1, 0]), Math.PI), 'theta(-1,0) = pi');
ok(near(evalIn('sin(3r)/(1 + r^2)', ['x', 'y'], [0.6, 0.8]),
  Math.sin(3) / 2), 'sombrero via r at r=1');

// rho and phi need z
ok(near(evalIn('rho', ['x', 'y', 'z'], [1, 2, 2]), 3), 'rho(1,2,2) = 3');
ok(near(evalIn('phi', ['x', 'y', 'z'], [0, 0, 1]), 0), 'phi on +z axis = 0');
ok(near(evalIn('phi', ['x', 'y', 'z'], [1, 0, 0]), Math.PI / 2), 'phi in xy-plane = pi/2');
ok(near(evalIn('phi', ['x', 'y', 'z'], [0, 0, -2]), Math.PI), 'phi on -z axis = pi');

// rho = 2cos(phi) is the sphere x²+y²+z² = 2z: F = rho - 2cos(phi)
ok(near(evalIn('rho - 2cos(phi)', ['x', 'y', 'z'], [0, 0, 2]), 0), 'rho=2cos(phi) passes (0,0,2)');
ok(near(evalIn('rho - 2cos(phi)', ['x', 'y', 'z'], [1, 0, 1]), 0), 'rho=2cos(phi) passes (1,0,1)');

// without z available, rho/phi stay free variables (no partial substitution)
ok(freeVars(substCoordVars(parse('rho'), ['x', 'y'])).includes('rho'),
  'rho untouched in a z=f(x,y) context');
ok(freeVars(substCoordVars(parse('phi'), ['x', 'y'])).includes('phi'),
  'phi untouched in a z=f(x,y) context');

// a real intrinsic named phi/theta (spherical mode) is never substituted
ok(freeVars(substCoordVars(parse('sin(4theta)sin(3phi)'), ['theta', 'phi']))
  .join(',') === 'phi,theta', 'spherical intrinsics win over substitution');

// substitution recurses through every node type and leaves input untouched
const src = '-(phi) + abs(rho) * atan2(theta, r)';
const ast = parse(src);
const out = substCoordVars(ast, ['x', 'y', 'z']);
ok(freeVars(out).join(',') === 'x,y,z', 'nested substitution reaches all vars');
ok(freeVars(ast).join(',') === 'phi,r,rho,theta', 'original AST is not mutated');

// substituted trees compile independently (no shared-node aliasing surprises)
const f1 = compile(substCoordVars(parse('phi + phi'), ['x', 'y', 'z']), ['x', 'y', 'z']);
ok(near(f1(1, 0, 0), Math.PI), 'repeated substitution of the same name');

console.log(`test-coords: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
