// tests/test-latex.mjs — tests for src/math/latex.js (LaTeX bridge).
// Run: node tests/test-latex.mjs   (exit 0 on pass)

import { parse } from '../src/math/parser.js';
import { evalNode, freeVars } from '../src/math/compiler.js';
import { latexToExpr, exprToLatex } from '../src/math/latex.js';

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, cond, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    failures.push(detail ? `${label} — ${detail}` : label);
  }
}

// ---------------------------------------------------------------------------
// numeric comparison helpers
// ---------------------------------------------------------------------------

function close(a, b) {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === b) return true; // covers same-signed Infinity
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

const BASE = [0.7, -1.3, 2.1, 0.45, -0.62, 1.9, 3.2, 0.15];

function scopes(vars, count = 5) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const sc = {};
    vars.forEach((v, j) => { sc[v] = BASE[(j + 2 * k) % BASE.length] + k * 0.13; });
    out.push(sc);
  }
  return out;
}

// Both expressions must parse and agree numerically at several sample points.
function assertEquiv(label, exprA, exprB) {
  let na, nb;
  try {
    na = parse(exprA);
    nb = parse(exprB);
  } catch (e) {
    ok(label, false, `parse failed: ${e.message} (A=${JSON.stringify(exprA)})`);
    return;
  }
  const vars = [...new Set([...freeVars(na), ...freeVars(nb)])].sort();
  for (const sc of scopes(vars)) {
    const va = evalNode(na, sc);
    const vb = evalNode(nb, sc);
    if (!close(va, vb)) {
      ok(label, false, `at ${JSON.stringify(sc)}: ${va} vs ${vb} (A=${JSON.stringify(exprA)})`);
      return;
    }
  }
  ok(label, true);
}

function assertLatex(latex, plainEquiv) {
  const label = `latexToExpr ${JSON.stringify(latex)}`;
  let out;
  try {
    out = latexToExpr(latex);
  } catch (e) {
    ok(label, false, `threw: ${e.message}`);
    return;
  }
  assertEquiv(`${label} → ${JSON.stringify(out)}`, out, plainEquiv);
}

function assertRoundtrip(expr) {
  const label = `roundtrip ${JSON.stringify(expr)}`;
  const latex = exprToLatex(expr);
  if (latex === null) {
    ok(label, false, 'exprToLatex returned null');
    return;
  }
  let back;
  try {
    back = latexToExpr(latex);
  } catch (e) {
    ok(label, false, `latexToExpr threw on ${JSON.stringify(latex)}: ${e.message}`);
    return;
  }
  assertEquiv(`${label} via ${JSON.stringify(latex)} → ${JSON.stringify(back)}`, expr, back);
}

function assertThrows(label, fn, re) {
  try {
    fn();
    ok(label, false, 'did not throw');
  } catch (e) {
    ok(label, re.test(e.message), `message was: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. latexToExpr — MathLive-style inputs
// ---------------------------------------------------------------------------

assertLatex(
  '\\frac{3\\sin\\left(\\sqrt{x^2+y^2}\\right)}{1+0.15\\left(x^2+y^2\\right)}',
  '3sin(sqrt(x^2 + y^2)) / (1 + 0.15(x^2 + y^2))'
);
assertLatex('k\\,\\sin\\left(x\\right)\\cos\\left(y\\right)', 'k sin(x) cos(y)');
assertLatex('\\theta+\\varphi', 'theta + phi');
assertLatex('e^{-x^2}', 'e^(-x^2)');
assertLatex('\\sqrt[3]{x}', 'cbrt(x)'); // sampled at negative x too
assertLatex('\\sqrt[4]{x}', 'x^(1/4)');
assertLatex('\\sqrt[n]{x}', 'x^(1/n)');
assertLatex('\\left|x-y\\right|', 'abs(x - y)');
assertLatex('a_{1}x^{2}', 'a1 x^2');
assertLatex('a_2+a_{12}', 'a2 + a12');
assertLatex('2\\pi r', '2 pi r');
assertLatex('\\frac{1}{2}', '0.5');
assertLatex('\\frac12', '1/2');
assertLatex('\\frac\\pi2', 'pi/2');
assertLatex('\\frac{x+1}{x-1}', '(x + 1)/(x - 1)');
assertLatex('\\sqrt{x^2+y^2}', 'sqrt(x^2 + y^2)');
assertLatex('\\sqrt x', 'sqrt(x)');
assertLatex('x^2y^3', 'x^2 y^3');
assertLatex('x^{y+1}', 'x^(y + 1)');
assertLatex('2^{3^{2}}', '512');

// function application styles
assertLatex('\\sin\\left(x\\right)', 'sin(x)');
assertLatex('\\sin x', 'sin(x)');
assertLatex('\\sin{x}', 'sin(x)');
assertLatex('\\sin -x', 'sin(-x)');
assertLatex('\\sin\\cos x', 'sin(cos(x))');
assertLatex('\\cos\\theta', 'cos(theta)');
assertLatex('\\tan\\left(x\\right)+\\sec\\left(x\\right)+\\csc\\left(y\\right)+\\cot\\left(y\\right)',
  'tan(x) + sec(x) + csc(y) + cot(y)');
assertLatex('\\arcsin\\left(x/4\\right)+\\arccos\\left(x/4\\right)+\\arctan\\left(x\\right)',
  'arcsin(x/4) + arccos(x/4) + arctan(x)');
assertLatex('\\sinh\\left(x\\right)\\cosh\\left(y\\right)-\\tanh\\left(x y\\right)',
  'sinh(x) cosh(y) - tanh(x*y)');
assertLatex('\\ln\\left(x^2+1\\right)', 'ln(x^2 + 1)');
assertLatex('\\exp\\left(-x^2\\right)', 'exp(-x^2)');
assertLatex('\\log\\left(x^2+1\\right)', 'log(x^2 + 1)');
assertLatex('\\log_{10}\\left(x^2+1\\right)', 'log(x^2 + 1)');
assertLatex('\\log_{2}\\left(x^2+1\\right)', 'log2(x^2 + 1)');
assertLatex('\\log_2\\left(x^2+1\\right)', 'log2(x^2 + 1)');
assertLatex('\\sin^{-1}\\left(x/4\\right)', 'asin(x/4)');
assertLatex('\\sin^2\\left(x\\right)', 'sin(x)^2');
assertLatex('\\operatorname{atan2}\\left(y,x\\right)', 'atan2(y, x)');
assertLatex('\\operatorname{mod}\\left(x,3\\right)', 'mod(x, 3)');
assertLatex('\\operatorname{min}\\left(x,y,1\\right)+\\operatorname{max}\\left(x,y\\right)',
  'min(x, y, 1) + max(x, y)');
assertLatex('\\operatorname{floor}\\left(x\\right)+\\operatorname{sign}\\left(y\\right)',
  'floor(x) + sign(y)');

// operators, brackets, spacing
assertLatex('x\\cdot y', 'x*y');
assertLatex('x\\times y', 'x*y');
assertLatex('x\\div y', 'x/y');
assertLatex('\\left[x+1\\right]\\left(x-1\\right)', '(x + 1)(x - 1)');
assertLatex('\\lvert x\\rvert', 'abs(x)');
assertLatex('\\lvert x-2\\rvert+\\left|y\\right|', 'abs(x - 2) + abs(y)');
assertLatex('|x-y|', 'abs(x - y)');
assertLatex('\\sin\\mleft(x\\mright)', 'sin(x)');
assertLatex('x\\quad y\\qquad z', 'x y z');
assertLatex('x~y', 'x y');
assertLatex('x\\;y\\!z', 'x y z');
assertLatex('{x+1}{x-1}', '(x + 1)(x - 1)');
assertLatex('\\text{mod}(x,2)', 'mod(x, 2)');
assertLatex('\\mathrm{atan2}\\left(y,x\\right)', 'atan2(y, x)');
assertLatex('x+\\placeholder{}1', 'x + 1');
assertLatex('\\placeholder{y}x^2', 'x^2');

// unicode passthrough
assertLatex('θ+φ', 'theta + phi');
assertLatex('2π', '2pi');
assertLatex('τ/2', 'pi');
assertLatex('ρ²', 'rho^2');

// exact string checks
ok("latexToExpr('\\\\alpha') spells greek", latexToExpr('\\alpha') === 'alpha',
  `got ${JSON.stringify(latexToExpr('\\alpha'))}`);
ok("latexToExpr('\\\\placeholder{}') is empty", latexToExpr('\\placeholder{}') === '',
  `got ${JSON.stringify(latexToExpr('\\placeholder{}'))}`);
ok("latexToExpr('2\\\\pi r') keeps word breaks", latexToExpr('2\\pi r') === '2 pi r',
  `got ${JSON.stringify(latexToExpr('2\\pi r'))}`);
ok("latexToExpr('a_{12}') → a12", latexToExpr('a_{12}') === 'a12',
  `got ${JSON.stringify(latexToExpr('a_{12}'))}`);

// ---------------------------------------------------------------------------
// 2. latexToExpr — errors
// ---------------------------------------------------------------------------

assertThrows('\\int throws', () => latexToExpr('\\int_0^1 x'), /Can't use LaTeX command \\int/);
assertThrows('\\infty throws', () => latexToExpr('x+\\infty'), /\\infty.*infinity/);
assertThrows('\\sum throws', () => latexToExpr('\\sum x'), /Can't use LaTeX command \\sum/);
assertThrows('\\% throws', () => latexToExpr('50\\%'), /Can't use LaTeX command \\%/);
assertThrows('\\lim throws', () => latexToExpr('\\lim x'), /Can't use LaTeX command \\lim/);
assertThrows('∞ char throws', () => latexToExpr('x+∞'), /infinity/);
assertThrows('\\log_{7} throws', () => latexToExpr('\\log_{7}(x)'), /log base '7'/);
assertThrows('letter subscript throws', () => latexToExpr('x_{ab}'), /subscript/i);
assertThrows('stray subscript throws', () => latexToExpr('(x)_2'), /'_'/);
assertThrows("unmatched '}' throws", () => latexToExpr('x}'), /Unmatched '}'/);
assertThrows('missing \\right throws', () => latexToExpr('\\left(x'), /\\right/);
assertThrows('non-string input throws', () => latexToExpr(42), /string/);

// ---------------------------------------------------------------------------
// 3. exprToLatex — emission checks
// ---------------------------------------------------------------------------

function eq(label, got, want) {
  ok(label, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

eq('frac emission', exprToLatex('x^2/4 + y^2/4'), '\\frac{x^{2}}{4} + \\frac{y^{2}}{4}');
eq('greek vars', exprToLatex('theta + phi + rho'), '\\theta + \\phi + \\rho');
eq('subscript var', exprToLatex('a1'), 'a_{1}');
eq('cdot before digit', exprToLatex('2*3'), '2 \\cdot 3');
eq('thin-space juxtaposition', exprToLatex('2x'), '2\\,x');
eq('var times var', exprToLatex('x y'), 'x\\,y');
eq('sqrt call', exprToLatex('sqrt(x + 1)'), '\\sqrt{x + 1}');
eq('cbrt call', exprToLatex('cbrt(x)'), '\\sqrt[3]{x}');
eq('abs call', exprToLatex('|x - y|'), '\\left|x - y\\right|');
eq('log2 call', exprToLatex('log2(x)'), '\\log_{2}\\left(x\\right)');
eq('named trig', exprToLatex('sin(x)'), '\\sin\\left(x\\right)');
eq('arcsin emission', exprToLatex('asin(x)'), '\\arcsin\\left(x\\right)');
eq('operatorname call', exprToLatex('min(x, y)'), '\\operatorname{min}\\left(x, y\\right)');
eq('atan2 call', exprToLatex('atan2(y, x)'), '\\operatorname{atan2}\\left(y, x\\right)');
eq('pi constant', exprToLatex('pi'), '\\pi');
eq('tau constant', exprToLatex('tau'), '\\tau');
eq('e constant', exprToLatex('e'), 'e');
eq('power base parens', exprToLatex('(x+1)^2'), '\\left(x + 1\\right)^{2}');
eq('right-assoc power', exprToLatex('2^3^2'), '2^{3^{2}}');
eq('neg parens', exprToLatex('-(x + y)'), '-\\left(x + y\\right)');
eq('neg power', exprToLatex('-x^2'), '-x^{2}');

// ParseError → null
eq('null on trailing op', exprToLatex('x +'), null);
eq('null on empty', exprToLatex(''), null);
eq('null on unknown function', exprToLatex('foo(x)'), null);
eq('null on garbage', exprToLatex(')('), null);

// ---------------------------------------------------------------------------
// 4. numeric roundtrips (expressions from src/examples.js + extras)
// ---------------------------------------------------------------------------

const ROUNDTRIP = [
  // from the app's example library
  'x^2/4 + y^2/4',
  'x^2/8 - y^2/8',
  'x^2/4 + y^2/4 - z^2/9',
  'z^2/4 - x^2/4 - y^2/4',
  'x^2 + y^2 - z^2',
  'x^2/16 + y^2/9 + z^2/4',
  '4 - (x^2 + y^2)/4',
  '(x^2 - y^2)/6',
  '4sin(sqrt(x^2 + y^2)) / sqrt(x^2 + y^2)',
  '(x^3 - 3x y^2)/10',
  '3sin(sqrt(x^2 + y^2) - a) / (1 + 0.15(x^2 + y^2)) + 1.2cos(a/2)',
  '3 - (x^2 + y^2)/8',
  '1.5(sin(t) + 2sin(2t))',
  '-1.5sin(3t)',
  '3cos(t)',
  't/2',
  '0.3t - 4',
  '3 + 0.8sin(k theta)sin(3phi)',
  '2/r - 3',
  '3sin(3r)/(1 + r/2)',
  '(3 + cos(v))cos(u)',
  'cos(x)sin(y) + cos(y)sin(z) + cos(z)sin(x)',
  '1.5sin(3sqrt((x-2)^2 + y^2) - w) + 1.5sin(3sqrt((x+2)^2 + y^2) - w)',
  'x^2 + y^2 - 16',
  '2pi r',
  // constructed coverage
  'e^(-x^2 - y^2)',
  'cbrt(x)',
  'cbrt(x - 5)',
  'atan2(y, x)',
  'mod(x, 3)',
  'hypot(x, y)',
  'min(x, y) + max(x, y, 2)',
  'sign(x)floor(y) + ceil(x) + round(y)',
  'asinh(x) + acosh(x^2 + 1) + atanh(x/4)',
  'arcsin(x/4) + arccos(x/4) + arctan(x)',
  'sec(x) csc(x + 4) cot(x + 4)',
  'log(x^2 + 1) + log2(x^2 + 1) + ln(x^2 + 1)',
  'pow(x^2 + 1, 0.3)',
  '2^3^2',
  '-x^2',
  '(-2)^2 x',
  'x^(1/3)',
  '|x| + |x - y|',
  'a1 x^2 + b2 y',
  'tau theta + pi phi',
  '0.0000001x^2',
  'x*2',
  '1/2x',
  'x/(y + 1)',
  'e',
];

for (const expr of ROUNDTRIP) assertRoundtrip(expr);

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

console.log(`test-latex: ${pass} passed, ${fail} failed`);
if (fail) {
  for (const f of failures) console.log(`  FAIL: ${f}`);
  process.exit(1);
}
process.exit(0);
