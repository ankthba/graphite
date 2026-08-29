// tests/audit-math-engine.mjs — adversarial audit of the expression engine.
// Probes: precedence traps, tokenizer longest-match edges, numerical edge
// cases (0^0, ±Infinity, -0, NaN), arity boundaries, subgradient ties,
// pathological hand-built trees through toString, deep nesting.
// Run: node tests/audit-math-engine.mjs   (exit 0 on pass)

import { parse, ParseError } from '../src/math/parser.js';
import { freeVars, compile, evalNode } from '../src/math/compiler.js';
import { derivative, simplify, toString } from '../src/math/autodiff.js';
import { CONSTANTS, FUNCTIONS, HELPERS, ALIASES } from '../src/math/builtins.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL: ' + m); } };
const approx = (got, want, m, tol = 1e-9) =>
  ok((Number.isNaN(want) && Number.isNaN(got)) ||
     Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)),
     `${m}: got ${got}, want ${want}`);
const ev = (s, sc = {}) => evalNode(parse(s), sc);

function structEq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return Object.is(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => structEq(a[k], b[k]));
}

function bad(src, re, pos) {
  try {
    parse(src);
    ok(false, `parse('${src}') should throw`);
  } catch (e) {
    ok(e instanceof ParseError, `parse('${src}') should throw ParseError, got ${e.constructor.name}: ${e.message}`);
    ok(re.test(e.message), `parse('${src}') message '${e.message}' !~ ${re}`);
    ok(typeof e.pos === 'number', `parse('${src}') pos is a number`);
    if (pos !== undefined) ok(e.pos === pos, `parse('${src}') pos ${e.pos}, want ${pos}`);
  }
}

// --------------------------- builtins registry -----------------------------
// Every FUNCTIONS entry must resolve: 'H.x' against HELPERS, 'Math.x' against Math.
for (const [name, spec] of Object.entries(FUNCTIONS)) {
  const [lo, hi] = Array.isArray(spec.arity) ? spec.arity : [spec.arity, spec.arity];
  ok(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && hi >= lo, `arity sane for ${name}`);
  if (spec.js.startsWith('H.')) ok(typeof HELPERS[spec.js.slice(2)] === 'function', `HELPERS.${spec.js.slice(2)} exists (${name})`);
  else if (spec.js.startsWith('Math.')) ok(typeof Math[spec.js.slice(5)] === 'function', `${spec.js} exists (${name})`);
  else ok(false, `FUNCTIONS.${name}.js '${spec.js}' has unknown prefix`);
}
ok(structEq(Object.keys(CONSTANTS).sort(), ['e', 'pi', 'tau']), 'CONSTANTS keys exactly pi/tau/e');
for (const [a, c] of Object.entries(ALIASES)) ok(FUNCTIONS[c], `alias ${a} -> canonical ${c} exists`);
approx(HELPERS.mod(-7.25, 2), 0.75, 'mod(-7.25,2)');
approx(HELPERS.mod(5.5, -2), -0.5, 'mod(5.5,-2) python-style');
ok(HELPERS.mod(6, 3) === 0 && HELPERS.mod(-6, 3) === 0, 'mod exact multiples -> 0');
ok(Number.isNaN(HELPERS.mod(1, 0)), 'mod(1,0) NaN');

// --------------------------- AST shape (exact) -----------------------------
ok(structEq(parse('1+2'), { t: 'op', op: '+', a: { t: 'num', v: 1 }, b: { t: 'num', v: 2 } }), 'op node shape');
ok(structEq(parse('sin(x)'), { t: 'call', name: 'sin', args: [{ t: 'var', name: 'x' }] }), 'call node shape');
ok(structEq(parse('-x'), { t: 'neg', a: { t: 'var', name: 'x' } }), 'neg node shape');
ok(structEq(parse('pi'), { t: 'num', v: Math.PI }), 'constants become num nodes');
ok(structEq(parse('|y|'), { t: 'call', name: 'abs', args: [{ t: 'var', name: 'y' }] }), '|y| -> abs call');
ok(structEq(parse('√z'), { t: 'call', name: 'sqrt', args: [{ t: 'var', name: 'z' }] }), '√z -> sqrt call');

// --------------------------- precedence traps ------------------------------
approx(ev('2^-3^2'), Math.pow(2, -9), '2^-3^2 = 2^(-(3^2))');
approx(ev('-2^-2'), -0.25, '-2^-2 = -(2^-2)');
approx(ev('2^2^0.5'), Math.pow(2, Math.SQRT2), '2^2^0.5 right-assoc');
approx(ev('x^2y', { x: 3, y: 5 }), 45, 'x^2y = (x^2)y');
approx(ev('2x^2y', { x: 2, y: 3 }), 24, '2x^2y = 2(x^2)y');
approx(ev('6/2(1+2)'), 9, '6/2(1+2) = (6/2)(1+2), adjacency same tier as /');
approx(ev('2 3'), 6, 'adjacent numbers multiply');
approx(ev('--x', { x: 7 }), 7, '--x');
approx(ev('-+-x', { x: 7 }), 7, '-+-x');
approx(ev('x -y', { x: 5, y: 2 }), 3, "'x -y' is subtraction, NOT x*(-y)");
approx(ev('2 -3'), -1, "'2 -3' is subtraction");
approx(ev('x - -y', { x: 5, y: 2 }), 7, 'x - -y');
approx(ev('x(-y)', { x: 5, y: 2 }), -10, 'x(-y) multiplies');
approx(ev('sin(x)^2', { x: 0.8 }), Math.sin(0.8) ** 2, 'sin(x)^2');
approx(ev('sin(x)²', { x: 0.8 }), Math.sin(0.8) ** 2, 'sin(x)² superscript postfix');
approx(ev('x²y', { x: 3, y: 2 }), 18, 'x²y = (x^2)y');
approx(ev('2sin(x)cos(x)', { x: 0.6 }), 2 * Math.sin(0.6) * Math.cos(0.6), '2sin(x)cos(x)');
approx(ev('√2√2'), 2, '√2√2 = 2', 1e-12);
approx(ev('√√81'), 3, 'nested √');
approx(ev('√x y', { x: 4, y: 3 }), 6, '√ binds only the next primary');
approx(ev('-√4'), -2, '-√4');
approx(ev('(2)(3)'), 6, '(2)(3)');
approx(ev('2(3)2'), 12, '2(3)2 chain adjacency');
approx(ev('sin(x)y', { x: 0.5, y: 2 }), 2 * Math.sin(0.5), 'sin(x)y adjacency');

// --------------------------- tokenizer edges -------------------------------
approx(ev('e2'), 2 * Math.E, "e2 = e*2 (e is a constant, not a letter-fallback)");
approx(ev('ee'), Math.E * Math.E, 'ee = e*e');
approx(ev('pix', { x: 2 }), 2 * Math.PI, 'pix = pi*x');
approx(ev('xpi', { x: 2 }), 2 * Math.PI, 'xpi = x*pi');
approx(ev('thetaphi', { theta: 2, phi: 3 }), 6, 'thetaphi = theta*phi');
approx(ev('xsin(x)', { x: 2 }), 2 * Math.sin(2), 'xsin(x) = x*sin(x)');
approx(ev('a10b2', { a10: 3, b2: 4 }), 12, 'a10b2 = a10*b2');
ok(structEq(parse('a10'), { t: 'var', name: 'a10' }), 'a10 one variable');
approx(ev('.5e2'), 50, '.5e2 number');
approx(ev('1e+3'), 1000, '1e+3 number');
approx(ev('atan2(1,2)'), Math.atan2(1, 2), 'atan2 not split as atan*2');
approx(ev('asinh(0.5)'), Math.asinh(0.5), 'asinh beats asin+h... (longest match)');
approx(ev('X', { X: 9 }), 9, 'uppercase var is a var');

bad('sech(x)', /unknown function 'sech'/i, 0);
bad('Sin(x)', /Unknown function 'Sin'/, 0);
bad('xy2(3)', /unknown function 'xy2'/i, 0);
bad('tanhx', /parenthes/i);          // tanh followed by var, no '('
bad('sinxcos(x)', /parenthes/i);     // sin applied without parens
bad('x_1', /unexpected character/i, 1);
bad('()', /unexpected '\)'/i, 1);
bad('sin()', /unexpected '\)'/i, 4);
bad('sin(x', /\)/, undefined);
bad('||', /unexpected '\|'/i, 1);
bad('|x+|', /unexpected '\|'/i, 3);
bad('π#', /unexpected character/i, 1);
bad('x²(', /end of input|expected/i);
try { parse(42); ok(false, 'parse(42) should throw'); }
catch (e) { ok(e instanceof ParseError, 'parse(non-string) throws ParseError'); }

// arity boundaries: exactly-min ok, min-1 and max+1 rejected
approx(ev('min(1,2)'), 1, 'min arity 2 (lower bound)');
approx(ev('max(8,7,6,5,4,3,2,1)'), 8, 'max arity 8 (upper bound)');
approx(ev('hypot(1,2,2,4,2,2,1,1)'), Math.hypot(1, 2, 2, 4, 2, 2, 1, 1), 'hypot arity 8');
bad('hypot(1)', /between 2 and 8/, 0);
bad('hypot(1,1,1,1,1,1,1,1,1)', /between 2 and 8/, 0);
bad('max(1)', /between 2 and 8/, 0);
bad('pow(2)', /2 argument/, 0);
bad('pow(1,2,3)', /2 argument/, 0);
bad('abs(1,2)', /1 argument/, 0);

// deep nesting doesn't blow the stack at sane depths
{
  const deep = '('.repeat(200) + 'x' + ')'.repeat(200);
  approx(ev(deep, { x: 5 }), 5, '200-deep parens');
}

// --------------------------- numeric edge cases ----------------------------
ok(ev('0^0') === 1, '0^0 = 1 (JS Math.pow)');
ok(ev('0^-1') === Infinity, '0^-1 = Infinity');
approx(ev('(-x)^3', { x: 2 }), -8, 'negative base, integer exponent');
ok(ev('-1/0') === -Infinity, '-1/0 = -Infinity');
ok(ev('1/(-0)') === -Infinity, '1/(-0) = -Infinity (evalNode)');
ok(compile(parse('1/(-0)'), [])() === -Infinity, '1/(-0) = -Infinity (compiled)');
ok(Number.isNaN(ev('min(x, 1)', { x: NaN })), 'NaN through min');
ok(Number.isNaN(ev('mod(x, 0)', { x: 3 })), 'mod(x,0) NaN');
ok(ev('atanh(1)') === Infinity, 'atanh(1) = Infinity');
ok(Number.isNaN(ev('ln(-1)')), 'ln(-1) NaN');
ok(Number.isNaN(ev('√-4')), '√-4 NaN');

// compile ≡ evalNode on a gnarly all-helpers expression, incl. weird points
{
  const src = 'sec(x)csc(x+3)cot(x+3) + mod(x^2, -1.7) + hypot(x, 2x, 3) + min(x, x^3, 9)max(x, -x) + atan2(x, x^2) + cbrt(x^5)';
  const n = parse(src);
  const f = compile(n, ['x']);
  for (const x of [0.3, 1.7, -2.4, 1e-8, 1e8]) {
    const a = f(x), b = evalNode(n, { x });
    ok((Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)),
       `compile≡evalNode gnarly @ ${x}: ${a} vs ${b}`);
  }
}

// freeVars: sorted, deduped, constants excluded
ok(structEq(freeVars(parse('b a b a1 B pi')), ['B', 'a', 'a1', 'b']), 'freeVars sort/dedupe/const-free');
ok(structEq(freeVars(parse('sin(theta) + |rho|')), ['rho', 'theta']), 'freeVars through call and abs');

// compile: zero-arg function, param order with unused param
ok(compile(parse('2+2'), [])() === 4, 'zero-arg compile');
approx(compile(parse('z'), ['x', 'y', 'z'])(1, 2, 3), 3, 'param order, unused params');
try {
  compile(parse('x + w'), ['x', 'y']);
  ok(false, 'compile missing var should throw');
} catch (e) {
  ok(!(e instanceof ParseError) && /'w'/.test(e.message), 'compile error plain, names var');
}

// --------------------------- autodiff --------------------------------------
function dcheck(src, pts, extra = {}) {
  const n = parse(src);
  const dn = derivative(n, 'x');
  const h = 1e-5;
  for (const p of pts) {
    const numd = (evalNode(n, { ...extra, x: p + h }) - evalNode(n, { ...extra, x: p - h })) / (2 * h);
    const sym = evalNode(dn, { ...extra, x: p });
    ok(Number.isFinite(sym) && Math.abs(sym - numd) <= 1e-5 * Math.max(1, Math.abs(numd)),
       `d/dx[${src}] @ ${p}: sym=${sym} vs num=${numd}`);
  }
  // printed derivative must re-parse to the same values
  const dn2 = parse(toString(dn));
  for (const p of pts) {
    const v1 = evalNode(dn, { ...extra, x: p }), v2 = evalNode(dn2, { ...extra, x: p });
    ok(Math.abs(v1 - v2) <= 1e-12 * Math.max(1, Math.abs(v1)), `deriv print round-trip '${toString(dn)}' @ ${p}`);
  }
}
dcheck('exp(x)sin(x)', [0.4, -1.7]);
dcheck('x^(2/3)', [0.5, 2.5]);
dcheck('atan2(3, x)', [0.8, -1.4]);
dcheck('mod(x, -2)', [0.3, -0.7]);          // negative modulus, smooth region
dcheck('mod(2x+1, x)', [3, 2.6]);           // x in BOTH mod slots
dcheck('hypot(x, x^2)', [0.9, -1.8]);
dcheck('abs(sin(x))', [0.5, -2.5]);
dcheck('cbrt(x^2)', [-1, 1.5]);             // negative x through cbrt chain
dcheck('min(min(x, 2x), 5)', [0.7, -0.4]);  // nested min, negative branch flip
dcheck('sec(x)tan(x)', [0.4, -0.9]);
dcheck('x^x^x', [1.3, 0.8]);                // right-assoc tower, generic dPow
dcheck('sqrt(hypot(x, 3))', [1.1, -2.2]);

// derivative wrt a var not present is exactly the zero node
ok(toString(derivative(parse('sin(x)cos(x) + x^2'), 'q')) === '0', 'd/dq -> 0');
ok(structEq(derivative(parse('x'), 'x'), { t: 'num', v: 1 }), 'd/dx x = 1 node');

// tie point: min subgradient = average of branch slopes = central difference
{
  const dn = derivative(parse('min(x^2, x)'), 'x');
  approx(evalNode(dn, { x: 1 }), 1.5, 'min tie at x=1: (2+1)/2 via sign(0)=0');
}

// simplify: does not fold non-finite, does fold through calls
ok(simplify(parse('atanh(1)')).t === 'call', 'atanh(1)=Inf stays symbolic');
ok(simplify(parse('sqrt(-1)')).t === 'call', 'sqrt(-1)=NaN stays symbolic');
ok(structEq(simplify(parse('ln(e)')), { t: 'num', v: 1 }), 'ln(e) folds to 1');
ok(structEq(simplify(parse('x/1')), { t: 'var', name: 'x' }), 'x/1 -> x');
ok(structEq(simplify(parse('-1x')), { t: 'neg', a: { t: 'var', name: 'x' } }), '-1*x -> -x');

// --------------------------- toString: hostile trees -----------------------
const V = (name) => ({ t: 'var', name });
const N = (v) => ({ t: 'num', v });
const OP = (op, a, b) => ({ t: 'op', op, a, b });
const NEG = (a) => ({ t: 'neg', a });
const CALL = (name, ...args) => ({ t: 'call', name, args });

function rt(node, scopes, label) {
  const s = toString(node);
  let n2;
  try { n2 = parse(s); }
  catch (e) { ok(false, `${label}: '${s}' does not re-parse: ${e.message}`); return; }
  for (const sc of scopes) {
    const v1 = evalNode(node, sc), v2 = evalNode(n2, sc);
    ok(v1 === v2 || (Number.isNaN(v1) && Number.isNaN(v2)) ||
       Math.abs(v1 - v2) <= 1e-12 * Math.max(1, Math.abs(v1)),
       `${label}: '${s}' evals ${v2}, want ${v1} @ ${JSON.stringify(sc)}`);
  }
}
const S1 = [{ x: 1.7, y: -0.6, z: 2.3, p: 3, i: 5 }, { x: -2.2, y: 3.1, z: 0.4, p: 1, i: 1 }];
rt(OP('*', CALL('sin', V('x')), N(2)), S1, 'sin(x)*2 numeric right factor');
rt(OP('*', N(-2), V('x')), S1, '(-2)*x');
rt(OP('*', V('y'), OP('*', N(-2), V('x'))), S1, 'y*((-2)*x)');
rt(OP('*', N(2), OP('*', V('x'), V('y'))), S1, '2*(x*y)');
rt(OP('*', N(3), OP('^', N(2), V('x'))), S1, '3*(2^x) digits must not merge');
rt(OP('*', V('x'), OP('^', N(2), V('y'))), S1, 'x*(2^y)');
rt(OP('*', V('p'), V('i')), S1, 'p*i must not print pi');
rt(OP('*', V('x'), V('x2')), [{ x: 3, x2: 5 }], 'x*x2 must not merge into xx2? (space)');
rt(OP('-', V('x'), NEG(V('y'))), S1, 'x - (-y)');
rt(OP('-', V('x'), OP('-', V('y'), V('z'))), S1, 'x-(y-z) parens');
rt(OP('+', V('x'), N(-2)), S1, 'x + (-2)');
rt(OP('-', V('x'), N(-2)), S1, 'x - (-2)');
rt(OP('+', N(-3), V('x')), S1, '(-3) + x');
rt(OP('^', NEG(V('x')), N(2)), S1, '(-x)^2 base parens');
rt(OP('^', N(2), NEG(V('x'))), S1, '2^(-x) exponent parens');
rt(OP('^', OP('^', V('x'), N(2)), N(3)), [{ x: 1.3 }], '(x^2)^3 left-assoc parens');
rt(OP('^', V('x'), OP('^', V('y'), N(2))), [{ x: 1.2, y: 1.4 }], 'x^(y^2) flat');
rt(OP('/', OP('/', V('x'), V('y')), V('z')), S1, '(x/y)/z flat');
rt(OP('/', V('x'), OP('/', V('y'), V('z'))), S1, 'x/(y/z) parens');
rt(OP('/', NEG(V('x')), V('y')), S1, '(-x)/y');
rt(NEG(OP('*', V('x'), V('y'))), S1, '-(x*y)');
rt(NEG(NEG(V('x'))), S1, 'neg(neg(x)) unsimplified');
rt(NEG(OP('+', V('x'), V('y'))), S1, '-(x+y)');
rt(OP('^', OP('*', N(2), V('x')), N(3)), S1, '(2x)^3');
rt(CALL('atan2', V('y'), V('x')), S1, 'atan2 two args');
rt(CALL('min', V('x'), V('y'), N(3), N(-1)), S1, 'min 4 args');
rt(N(NaN), [{}], 'NaN literal');
rt(N(Infinity), [{}], 'Infinity literal');
rt(N(-Infinity), [{}], '-Infinity literal');
rt(N(1e21), [{}], '1e+21 literal re-tokenizes');
rt(N(2.5e-7), [{}], '2.5e-7 literal re-tokenizes');
rt(OP('*', V('x'), N(1e21)), S1, 'x*1e+21');

// toString exact spot checks the author missed
ok(toString(parse('x/(y/z)')) === 'x/(y/z)', `x/(y/z): '${toString(parse('x/(y/z)'))}'`);
ok(toString(OP('*', N(-2), V('x'))) !== '-2x' || Math.abs(ev(toString(OP('*', N(-2), V('x'))), { x: 3 }) + 6) < 1e-12,
   '(-2)*x prints to something worth -6');

// derivative + simplify + print + re-derive numerically, composite pipeline
{
  const n = parse('sin(2x)exp(-x^2)');
  const d1 = derivative(n, 'x');
  const printed = toString(d1);
  const n2 = parse(printed);
  const h = 1e-5;
  for (const x of [0.35, -1.2]) {
    const numd = (evalNode(n, { x: x + h }) - evalNode(n, { x: x - h })) / (2 * h);
    approx(evalNode(n2, { x }), numd, `pipeline d/dx sin(2x)exp(-x^2) @ ${x} via '${printed}'`, 1e-5);
  }
}

console.log(`audit-math-engine: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
