// tests/test-math.mjs — expression engine tests (parser, compiler, autodiff).
// Run: node tests/test-math.mjs   (exit code 0 on pass)

import { parse, ParseError } from '../src/math/parser.js';
import { freeVars, compile, evalNode } from '../src/math/compiler.js';
import { derivative, simplify, toString } from '../src/math/autodiff.js';
import { CONSTANTS, FUNCTIONS, HELPERS, ALIASES } from '../src/math/builtins.js';

let pass = 0;
let fail = 0;

function ok(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('FAIL: ' + msg);
  }
}

function approx(actual, expected, msg, tol = 1e-9) {
  const good =
    (Number.isNaN(expected) && Number.isNaN(actual)) ||
    Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
  ok(good, `${msg}: got ${actual}, want ${expected}`);
}

function evalStr(src, scope = {}) {
  return evalNode(parse(src), scope);
}

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function throwsParse(src, re, posCheck) {
  try {
    parse(src);
    ok(false, `parse('${src}') should have thrown`);
  } catch (e) {
    ok(e instanceof ParseError, `parse('${src}') threw ${e.constructor.name}, want ParseError (${e.message})`);
    ok(re.test(e.message), `parse('${src}') message '${e.message}' should match ${re}`);
    if (posCheck) ok(posCheck(e.pos), `parse('${src}') pos ${e.pos} not sane`);
  }
}

// ---------------------------------------------------------------------------
// builtins
// ---------------------------------------------------------------------------

approx(CONSTANTS.pi, Math.PI, 'CONSTANTS.pi');
approx(CONSTANTS.tau, 2 * Math.PI, 'CONSTANTS.tau');
approx(CONSTANTS.e, Math.E, 'CONSTANTS.e');
for (const name of 'sin cos tan sec csc cot asin acos atan atan2 sinh cosh tanh asinh acosh atanh sqrt cbrt exp ln log log2 abs floor ceil round sign min max mod hypot pow'.split(' ')) {
  ok(FUNCTIONS[name], `FUNCTIONS.${name} exists`);
}
ok(ALIASES.arcsin === 'asin' && ALIASES.log10 === 'log', 'aliases table');
approx(HELPERS.sec(0.5), 1 / Math.cos(0.5), 'HELPERS.sec');
approx(HELPERS.mod(5, 3), 2, 'mod(5,3)');
approx(HELPERS.mod(-5, 3), 1, 'mod(-5,3) — sign of b');
approx(HELPERS.mod(5, -3), -1, 'mod(5,-3) — sign of b');
approx(HELPERS.mod(-5, -3), -2, 'mod(-5,-3)');
approx(HELPERS.mod(5.5, 2), 1.5, 'mod(5.5,2)');

// ---------------------------------------------------------------------------
// parser: precedence table
// ---------------------------------------------------------------------------

approx(evalStr('1+2*3'), 7, '1+2*3');
approx(evalStr('6/3/2'), 1, '6/3/2 left-assoc');
approx(evalStr('1-2-3'), -4, '1-2-3 left-assoc');
approx(evalStr('2*3^2'), 18, '2*3^2');
approx(evalStr('8/2^2'), 2, '8/2^2');
approx(evalStr('2^3^2'), 512, '2^3^2 right-assoc = 512');
approx(evalStr('2^2^3'), 256, '2^2^3 right-assoc');
approx(evalStr('-2^2'), -4, '-2^2 = -(2^2) = -4');
approx(evalStr('(-2)^2'), 4, '(-2)^2 = 4');
approx(evalStr('-3^2'), -9, '-3^2');
approx(evalStr('2^-3'), 0.125, '2^-3');
approx(evalStr('-2*-3'), 6, '-2*-3');
approx(evalStr('2--3'), 5, '2--3');
approx(evalStr('2++3'), 5, '2++3 (unary plus)');
approx(evalStr('-x^2', { x: 3 }), -9, '-x^2 at x=3');
ok(deepEq(parse('-x^2'), { t: 'neg', a: { t: 'op', op: '^', a: { t: 'var', name: 'x' }, b: { t: 'num', v: 2 } } }),
  "-x^2 parses as neg(x^2)");

// numbers
approx(evalStr('2'), 2, 'int');
approx(evalStr('2.5'), 2.5, 'decimal');
approx(evalStr('.5'), 0.5, 'leading dot');
approx(evalStr('1e3'), 1000, 'scientific');
approx(evalStr('2.5e-2'), 0.025, 'scientific negative exponent');
approx(evalStr('2e'), 2 * Math.E, "'2e' = 2*e (no exponent digits)");

// ---------------------------------------------------------------------------
// parser: implicit multiplication + identifier rule
// ---------------------------------------------------------------------------

ok(deepEq(parse('xy'), { t: 'op', op: '*', a: { t: 'var', name: 'x' }, b: { t: 'var', name: 'y' } }),
  'xy is x*y');
ok(deepEq(parse('x2'), { t: 'var', name: 'x2' }), "x2 is ONE variable named 'x2'");
ok(deepEq(parse('2x'), { t: 'op', op: '*', a: { t: 'num', v: 2 }, b: { t: 'var', name: 'x' } }),
  '2x is 2*x');
// Adjacency binds like '*', left-assoc; '^' binds tighter → xy^2 = x*(y^2).
ok(deepEq(parse('xy^2'), {
  t: 'op', op: '*', a: { t: 'var', name: 'x' },
  b: { t: 'op', op: '^', a: { t: 'var', name: 'y' }, b: { t: 'num', v: 2 } },
}), 'xy^2 is x*(y^2)');
approx(evalStr('xy^2', { x: 2, y: 3 }), 18, 'xy^2 value');
approx(evalStr('2x^2', { x: 3 }), 18, '2x^2 = 2*(x^2)');
approx(evalStr('1/2x', { x: 4 }), 2, '1/2x = (1/2)*x — adjacency same tier as /');
approx(evalStr('1/xy', { x: 2, y: 4 }), 2, '1/xy = (1/x)*y');
approx(evalStr('x y', { x: 3, y: 5 }), 15, 'x y (space) multiplies');
approx(evalStr('2(x+1)', { x: 4 }), 10, '2(x+1)');
approx(evalStr('(x+1)(x-1)', { x: 3 }), 8, '(x+1)(x-1)');
approx(evalStr('2sin(x)', { x: Math.PI / 2 }), 2, '2sin(x)');
approx(evalStr('x pi', { x: 2 }), 2 * Math.PI, 'x pi');
approx(evalStr('x(x+1)', { x: 3 }), 12, 'x(x+1) single var times parens');
approx(evalStr('a2(x+1)', { a2: 2, x: 1 }), 4, 'a2(x+1) single var (letter+digits) times parens');
ok(deepEq(parse('x2y3'), { t: 'op', op: '*', a: { t: 'var', name: 'x2' }, b: { t: 'var', name: 'y3' } }),
  'x2y3 is x2*y3');

// constants / greek / longest match
approx(evalStr('pi'), Math.PI, 'pi constant');
approx(evalStr('tau'), 2 * Math.PI, 'tau constant');
approx(evalStr('e'), Math.E, 'e constant');
ok(deepEq(parse('theta'), { t: 'var', name: 'theta' }), 'theta is a variable');
ok(deepEq(parse('phi'), { t: 'var', name: 'phi' }), 'phi is a variable');
ok(deepEq(parse('rho'), { t: 'var', name: 'rho' }), 'rho is a variable');
approx(evalStr('xtheta', { x: 2, theta: 3 }), 6, 'xtheta = x*theta (longest match inside run)');
approx(evalStr('ln(e)'), 1, 'ln(e)=1');
approx(evalStr('log(100)'), 2, 'log is base 10');
approx(evalStr('log2(8)'), 3, 'log2');
approx(evalStr('log10(1000)'), 3, 'log10 alias');
ok(parse('log10(x)').name === 'log', 'log10 normalizes to canonical log');
ok(parse('arcsin(x)').name === 'asin', 'arcsin normalizes to asin');
approx(evalStr('arctan(1)'), Math.PI / 4, 'arctan alias works');
approx(evalStr('exp(1)'), Math.E, "exp not split into e*x*p");

// ---------------------------------------------------------------------------
// parser: unicode
// ---------------------------------------------------------------------------

approx(evalStr('π'), Math.PI, 'π');
approx(evalStr('τ/2'), Math.PI, 'τ');
ok(deepEq(parse('θ'), { t: 'var', name: 'theta' }), 'θ → theta');
ok(deepEq(parse('φ'), { t: 'var', name: 'phi' }), 'φ → phi');
ok(deepEq(parse('ϕ'), { t: 'var', name: 'phi' }), 'ϕ → phi');
ok(deepEq(parse('ρ'), { t: 'var', name: 'rho' }), 'ρ → rho');
approx(evalStr('2·3'), 6, '· multiply');
approx(evalStr('2×3'), 6, '× multiply');
approx(evalStr('7−2'), 5, '− minus');
approx(evalStr('8÷2'), 4, '÷ divide');
approx(evalStr('√9'), 3, '√9');
approx(evalStr('√(x+1)', { x: 3 }), 2, '√(x+1)');
approx(evalStr('√2x', { x: 3 }), Math.sqrt(2) * 3, '√ binds to the following primary');
approx(evalStr('x²', { x: 5 }), 25, 'x²');
approx(evalStr('x³', { x: 2 }), 8, 'x³');
approx(evalStr('(x+1)²', { x: 2 }), 9, '(x+1)²');
approx(evalStr('√(x²+y²)', { x: 3, y: 4 }), 5, '√(x²+y²)');

// |abs|
approx(evalStr('|x|', { x: -3 }), 3, '|x|');
approx(evalStr('|x-5|+1', { x: 2 }), 4, '|x-5|+1');
approx(evalStr('|x|*|y|', { x: -2, y: -3 }), 6, '|x|*|y|');
approx(evalStr('|x||y|', { x: -2, y: -3 }), 6, '|x||y| adjacency');
approx(evalStr('|x*(|y|)|', { x: -2, y: -3 }), 6, 'bars nested via parens');
approx(evalStr('2|x|', { x: -3 }), 6, '2|x| adjacency');

// ---------------------------------------------------------------------------
// parser: errors (message + sane position)
// ---------------------------------------------------------------------------

throwsParse('', /empty/i, (p) => p === 0);
throwsParse('   ', /empty/i, (p) => p === 0);
throwsParse('sin x', /parenthes/i, (p) => p === 4);
throwsParse('sin', /parenthes/i, (p) => p === 3);
throwsParse('foo(x)', /foo/, (p) => p === 0);
throwsParse('xy(3)', /unknown function 'xy'/i, (p) => p === 0);
throwsParse('2+', /end of input|expected/i, (p) => p === 2);
throwsParse('(x+1', /never closed|\)/, (p) => p === 4);
throwsParse('x)', /unexpected '\)'/i, (p) => p === 1);
throwsParse('#', /unexpected character/i, (p) => p === 0);
throwsParse('2 @ 3', /unexpected character/i, (p) => p === 2);
throwsParse('sin(x,y)', /expects 1 argument/, (p) => p === 0);
throwsParse('atan2(1)', /expects 2 arguments/, (p) => p === 0);
throwsParse('min(1)', /between 2 and 8/, (p) => p === 0);
throwsParse('min(1,2,3,4,5,6,7,8,9)', /between 2 and 8/, (p) => p === 0);
throwsParse('|x', /closing '\|'/, (p) => p === 2);
throwsParse('2*', /end of input|expected/i, (p) => p === 2);
approx(evalStr('min(1,2,3,4,5,6,7,8)'), 1, 'min at max arity 8');

// ---------------------------------------------------------------------------
// compiler
// ---------------------------------------------------------------------------

ok(deepEq(freeVars(parse('y x + sin(theta)z + x2')), ['theta', 'x', 'x2', 'y', 'z']),
  'freeVars sorted unique');
ok(deepEq(freeVars(parse('2+2')), []), 'freeVars of constant expr');

approx(compile(parse('x^2+3x'), ['x'])(2), 10, 'compile x^2+3x');
approx(compile(parse('x^2+y'), ['x', 'y'])(3, 4), 13, 'compile arg order');
approx(compile(parse('y-x'), ['x', 'y'])(1, 10), 9, 'compile arg order 2');
approx(compile(parse('atan2(y, x)'), ['x', 'y'])(1, 1), Math.PI / 4, 'compile atan2');
approx(compile(parse('mod(-5, 3)'), [])(), 1, 'compile mod python-style');
approx(compile(parse('mod(5, -3)'), [])(), -1, 'compile mod sign of b');
approx(compile(parse('min(x, y, 0)'), ['x', 'y'])(3, -2), -2, 'compile min arity 3');
approx(compile(parse('max(1, 2, 3, 4, 5, 6, 7, 8)'), [])(), 8, 'compile max arity 8');
approx(compile(parse('hypot(3, 4)'), [])(), 5, 'compile hypot');
approx(compile(parse('hypot(1, 2, 2)'), [])(), 3, 'compile hypot arity 3');
approx(compile(parse('pow(2, 10)'), [])(), 1024, 'compile pow');
approx(compile(parse('sec(x)'), ['x'])(0.5), 1 / Math.cos(0.5), 'compile helper sec');
approx(compile(parse('2^3^2'), [])(), 512, 'compile right-assoc ^');
ok(Number.isNaN(compile(parse('(-8)^(1/3)'), [])()), 'neg base, fractional exponent → NaN (documented)');
approx(compile(parse('cbrt(-8)'), [])(), -2, 'cbrt handles negatives');
ok(compile(parse('1/0'), [])() === Infinity, 'division by zero → Infinity');
ok(Number.isNaN(compile(parse('0/0'), [])()), '0/0 → NaN');
ok(Number.isNaN(compile(parse('sqrt(-1)+5'), [])()), 'NaN propagates');

try {
  compile(parse('x+q'), ['x']);
  ok(false, 'compile with missing param should throw');
} catch (e) {
  ok(e instanceof Error && !(e instanceof ParseError), 'compile error is plain Error');
  ok(/'q'/.test(e.message), `compile error mentions q: ${e.message}`);
}

// compiled output should be a plain fast function
const fxy = compile(parse('sin(x)cos(y) + x^2'), ['x', 'y']);
approx(fxy(0.3, 0.7), Math.sin(0.3) * Math.cos(0.7) + 0.09, 'compiled composite');

// evalNode
approx(evalNode(parse('2x+y'), { x: 1, y: 3 }), 5, 'evalNode basic');
try {
  evalNode(parse('q'), {});
  ok(false, 'evalNode missing var should throw');
} catch (e) {
  ok(/'q'/.test(e.message), 'evalNode error mentions var');
}

// compile and evalNode agree
for (const src of ['x^2 - 3x + sin(x)', 'mod(x, 3) + |x|', 'min(x, 2)max(x, 0)', 'sec(x)+csc(x)+cot(x)']) {
  const n = parse(src);
  const f = compile(n, ['x']);
  for (const x of [0.7, 1.9, -1.3]) {
    approx(f(x), evalNode(n, { x }), `compile≡evalNode ${src} @ ${x}`, 1e-12);
  }
}

// ---------------------------------------------------------------------------
// autodiff: simplify identities
// ---------------------------------------------------------------------------

const X = { t: 'var', name: 'x' };
ok(deepEq(simplify(parse('x*1')), X), 'x*1 → x');
ok(deepEq(simplify(parse('1*x')), X), '1*x → x');
ok(deepEq(simplify(parse('x*0')), { t: 'num', v: 0 }), 'x*0 → 0');
ok(deepEq(simplify(parse('0*x')), { t: 'num', v: 0 }), '0*x → 0');
ok(deepEq(simplify(parse('x+0')), X), 'x+0 → x');
ok(deepEq(simplify(parse('0+x')), X), '0+x → x');
ok(deepEq(simplify(parse('x-0')), X), 'x-0 → x');
ok(deepEq(simplify(parse('x^1')), X), 'x^1 → x');
ok(deepEq(simplify(parse('x^0')), { t: 'num', v: 1 }), 'x^0 → 1');
ok(deepEq(simplify(parse('0/x')), { t: 'num', v: 0 }), '0/x → 0');
ok(deepEq(simplify(parse('--x')), X), 'neg(neg(x)) → x');
ok(deepEq(simplify(parse('2*3+4')), { t: 'num', v: 10 }), 'constant folding');
ok(deepEq(simplify(parse('0-x')), { t: 'neg', a: X }), '0-x → -x');
ok(deepEq(simplify(parse('sin(0)')), { t: 'num', v: 0 }), 'constant call folding');
ok(simplify(parse('1/0')).t === 'op', 'non-finite results stay symbolic');

// ---------------------------------------------------------------------------
// autodiff: toString exact spot checks
// ---------------------------------------------------------------------------

ok(toString(parse('2x+sin(3x)')) === '2x + sin(3x)', `toString 2x+sin(3x): '${toString(parse('2x+sin(3x)'))}'`);
ok(toString(parse('x^2/(y+1)')) === 'x^2/(y + 1)', `toString x^2/(y+1): '${toString(parse('x^2/(y+1)'))}'`);
ok(toString(derivative(parse('x^2'), 'x')) === '2x', `d/dx x^2: '${toString(derivative(parse('x^2'), 'x'))}'`);
ok(toString(derivative(parse('sin(x)'), 'x')) === 'cos(x)', 'd/dx sin(x)');
ok(toString(derivative(parse('pi'), 'x')) === '0', 'd/dx pi = 0');
ok(toString(derivative(parse('y'), 'x')) === '0', 'd/dx y = 0');
ok(toString(parse('2^3^2')) === '2^3^2', 'toString keeps right-assoc ^ flat');
ok(toString(parse('(2^3)^2')) === '(2^3)^2', 'toString parenthesizes left-assoc ^');
ok(toString(parse('(-2)^2')) === '(-2)^2', 'toString (-2)^2');
approx(evalStr(toString(parse('-x^2')), { x: 3 }), -9, 'toString -x^2 round trip');

// ---------------------------------------------------------------------------
// autodiff: derivatives vs central differences (tolerance 1e-5 relative)
// ---------------------------------------------------------------------------

function checkDeriv(src, pts, extra = {}) {
  const node = parse(src);
  const dn = derivative(node, 'x');
  const h = 1e-5;
  for (const p of pts) {
    const s1 = { ...extra, x: p + h };
    const s0 = { ...extra, x: p - h };
    const numd = (evalNode(node, s1) - evalNode(node, s0)) / (2 * h);
    const sym = evalNode(dn, { ...extra, x: p });
    ok(Number.isFinite(sym) && Math.abs(sym - numd) <= 1e-5 * Math.max(1, Math.abs(numd)),
      `d/dx[${src}] at x=${p}: sym=${sym}, central-diff=${numd}`);
  }
  // toString round-trip of both the expression and its derivative
  for (const n of [node, dn]) {
    const n2 = parse(toString(n));
    for (const p of pts) {
      const sc = { ...extra, x: p };
      const v1 = evalNode(n, sc);
      const v2 = evalNode(n2, sc);
      ok((Number.isNaN(v1) && Number.isNaN(v2)) || Math.abs(v1 - v2) <= 1e-12 * Math.max(1, Math.abs(v1)),
        `toString round-trip of '${toString(n)}' at x=${p}: ${v1} vs ${v2}`);
    }
  }
}

const derivCases = [
  ['x^3 + 2x', [0.5, -1.3, 2.1]],
  ['sin(3x)', [0.3, 1.1, -2]],
  ['cos(x^2)', [0.4, 1.2]],
  ['tan(x/3)', [0.5, -0.8]],
  ['sec(x)', [0.3, 1.0]],
  ['csc(x)', [0.7, 1.3]],
  ['cot(x)', [0.6, 1.1]],
  ['asin(x/2)', [0.3, -0.9]],
  ['acos(x/2)', [0.5, -0.4]],
  ['atan(x^2)', [0.5, 1.5]],
  ['atan2(x, 1 + x^2)', [0.5, 1.2]],
  ['sinh(x)cosh(x)', [0.4, -0.9]],
  ['tanh(x^2)', [0.5, 1.1]],
  ['asinh(2x)', [0.4, -1.2]],
  ['acosh(x + 2)', [0.5, 1.5]],
  ['atanh(x/3)', [0.5, -1.1]],
  ['sqrt(x^2 + 1)', [0.7, -1.4]],
  ['cbrt(x)', [0.8, 2.5, -1.5]],
  ['exp(-x^2)', [0.5, -1.1]],
  ['ln(x^2 + 1)', [0.6, -1.3]],
  ['log(x + 10)', [0.5, 3]],
  ['log2(x + 5)', [0.5, 2]],
  ['x^x', [0.5, 1.5]],
  ['2^x', [0.7, -1.2]],
  ['|x^3|', [1.2, -1.1]],
  ['min(x^2, 3x)', [0.5, 4]],
  ['max(sin(x), cos(x))', [0.2, 1.2]],
  ['min(x^2, 3x, 10)', [0.5, 4]],
  ['mod(x^2, 3)', [1.2, 0.7]],
  ['mod(5, x)', [2.2, 3.7]],
  ['hypot(x, 3)', [1, -2]],
  ['hypot(x, 2x, 3)', [0.8, -1.5]],
  ['pow(x, 3)', [0.9, -1.2]],
  ['1/x', [0.5, 2, -1.3]],
  ['x/(x + 2)', [0.5, 1.7]],
  ['sin(x)^2 + cos(x)^2', [0.3, 1.9]],
  ['floor(3.5) + sign(2)x', [0.5, 1.5]],
];
for (const [src, pts] of derivCases) checkDeriv(src, pts);
checkDeriv('x y + y^2', [0.5, 1.5], { y: 1.7 }); // partial: d/dx = y

// ---------------------------------------------------------------------------
// toString round-trip: numeric identity on assorted expressions
// ---------------------------------------------------------------------------

function checkRoundTrip(src, scopes) {
  const n = parse(src);
  const s = toString(n);
  let n2;
  try {
    n2 = parse(s);
  } catch (e) {
    ok(false, `toString of '${src}' → '${s}' does not re-parse: ${e.message}`);
    return;
  }
  for (const sc of scopes) {
    const v1 = evalNode(n, sc);
    const v2 = evalNode(n2, sc);
    ok((Number.isNaN(v1) && Number.isNaN(v2)) || Math.abs(v1 - v2) <= 1e-12 * Math.max(1, Math.abs(v1)),
      `round-trip '${src}' → '${s}': ${v1} vs ${v2} with ${JSON.stringify(sc)}`);
  }
}

const rtCases = [
  ['-x^2 + 3x y - |x|/(y + 2)', [{ x: 1.5, y: 0.3 }, { x: -2, y: 1 }]],
  ['2^3^2', [{}]],
  ['sin(x)cos(y)', [{ x: 0.4, y: 1.1 }]],
  ['√(x² + y²)', [{ x: 3, y: 4 }]],
  ['min(x, y, 3) + max(x, y)', [{ x: 1, y: 5 }, { x: -2, y: 0 }]],
  ['mod(x, 3) + atan2(y, x)', [{ x: 2.2, y: 1.3 }]],
  ['theta^2 + 2theta', [{ theta: 1.3 }]],
  ['x^-2', [{ x: 1.7 }]],
  ['(x + 1)(x - 1)', [{ x: 2.5 }]],
  ['1/2x', [{ x: 4 }]],
  ['e^x + pi x', [{ x: 1.1 }]],
  ['cbrt(x)csc(y)sec(x)cot(y)', [{ x: 0.7, y: 0.9 }]],
  ['hypot(x, y, 2)', [{ x: 1, y: 2 }]],
  ['asinh(x) + acosh(y + 2) + atanh(x/2)', [{ x: 0.5, y: 0.4 }]],
  ['floor(x) + ceil(y) + round(x y) + sign(x)', [{ x: 2.3, y: 1.2 }]],
  ['p i', [{ p: 3, i: 5 }]], // must NOT print as 'pi'
  ['x2 y3', [{ x2: 2, y3: 7 }]],
  ['-(x + y)^2', [{ x: 1, y: 2 }]],
  ['(2x)^3', [{ x: 1.5 }]],
  ['x/(y z)', [{ x: 12, y: 2, z: 3 }]],
];
for (const [src, scopes] of rtCases) checkRoundTrip(src, scopes);

// products with numeric right factors must not merge into variable names
const trick = simplify(parse('x*2')); // floats the 2 left → 2*x
approx(evalNode(parse(toString(trick)), { x: 7 }), 14, 'x*2 simplify/print round trip');
const rawRight = { t: 'op', op: '*', a: X, b: { t: 'num', v: 2 } }; // unsimplified x*2
ok(toString(rawRight) !== 'x2', `toString(x*2) must not merge: '${toString(rawRight)}'`);
approx(evalNode(parse(toString(rawRight)), { x: 7 }), 14, 'unsimplified x*2 prints round-trip safe');

// derivative of composite, printed then re-differentiated numerically
const dd = derivative(parse('2x + sin(3x)'), 'x');
approx(evalNode(dd, { x: 0.5 }), 2 + 3 * Math.cos(1.5), 'd/dx (2x + sin(3x))');
ok(/3cos\(3x\)/.test(toString(dd)), `pretty derivative print: '${toString(dd)}'`);

// ---------------------------------------------------------------------------

console.log(`test-math: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
