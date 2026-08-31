// tests/audit-latex.mjs — adversarial audit of src/math/latex.js.
// Run: node tests/audit-latex.mjs   (exit 0 on pass)
//
// Probes edge cases beyond tests/test-latex.mjs: nested fractions, bare-token
// \frac arguments, bare vs braced exponents, unary minus inside \frac,
// \left| nesting (with and without parens), MathLive constant commands
// (\exponentialE, \imaginaryI), mixed unicode + commands, empty-ish inputs,
// \text with padding spaces, double superscripts, implicit multiplication of
// adjacent groups, \cdot chains, and exprToLatex precedence traps with full
// numeric roundtrip checks.

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

function close(a, b) {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

const BASE = [0.7, -1.3, 2.1, 0.45, -0.62, 1.9, 3.2, 0.15];

function scopes(vars, count = 6) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const sc = {};
    vars.forEach((v, j) => { sc[v] = BASE[(j + 2 * k) % BASE.length] + k * 0.17; });
    out.push(sc);
  }
  return out;
}

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
// 1. Nested fractions
// ---------------------------------------------------------------------------

assertLatex('\\frac{\\frac{1}{2}}{3}', '1/6');
assertLatex('\\frac{1}{\\frac{2}{3}}', '1.5');
assertLatex('\\frac{\\frac{1}{2}}{\\frac{3}{4}}', '2/3');
assertLatex('\\frac{\\frac{x}{y}}{\\frac{y}{x}}', 'x^2/y^2');
assertLatex('\\frac{x+\\frac{1}{x}}{2}', '(x + 1/x)/2');
assertLatex('\\dfrac{1}{\\tfrac{1}{x}}', 'x');

// ---------------------------------------------------------------------------
// 2. \frac shorthand — bare-token arguments
// ---------------------------------------------------------------------------

assertLatex('\\frac12', '0.5');
assertLatex('\\frac12x', 'x/2');           // (1)/(2)·x — MathLive semantics
assertLatex('\\frac1x', '1/x');
assertLatex('\\frac\\pi2', 'pi/2');
assertLatex('\\frac2\\pi', '2/pi');
assertLatex('\\frac x2', 'x/2');
assertLatex('\\frac\\theta2', 'theta/2');
assertLatex('\\frac{x}2', 'x/2');
assertLatex('\\frac2{x+1}', '2/(x + 1)');
assertLatex('\\frac\\frac12 4', '1/8');    // frac arg that is itself a frac
assertLatex('\\frac\\sqrt42', 'sqrt(4)/2'); // frac arg that is a sqrt

// ---------------------------------------------------------------------------
// 3. Exponents — bare token vs braced
// ---------------------------------------------------------------------------

assertLatex('x^2', 'x^2');
assertLatex('x^{12}', 'x^12');
assertLatex('x^25', '5x^2');                // LaTeX gives ^ one token: (x^2)·5
assertLatex('x^-2', 'x^(-2)');
assertLatex('x^{-2}', 'x^(-2)');
assertLatex('x^\\pi', 'x^pi');
assertLatex('x^\\theta', 'x^theta');
assertLatex('x^\\frac12', 'x^(1/2)');
assertLatex('x^\\sqrt4', 'x^2');
assertLatex('2^{3^{2}}', '512');            // double superscript, right-assoc
assertLatex('x^{2^{3}}', 'x^8');
assertLatex('x^{y^{z}}', 'x^(y^z)');
assertLatex('x^{y+1}y^{2}', 'x^(y + 1) y^2');
assertLatex('\\exponentialE^{x^{2}}', 'e^(x^2)');

// ---------------------------------------------------------------------------
// 4. Unary minus inside \frac (and friends)
// ---------------------------------------------------------------------------

assertLatex('\\frac{-x}{2}', '-x/2');
assertLatex('\\frac{-x^2+1}{2}', '(1 - x^2)/2');
assertLatex('\\frac{x}{-2}', '-x/2');
assertLatex('\\frac{-x}{-y}', 'x/y');
assertLatex('-\\frac{1}{2}', '-0.5');
assertLatex('-\\frac{x+1}{y+1}', '-(x + 1)/(y + 1)');
assertLatex('2-\\frac{-x}{2}', '2 + x/2');

// ---------------------------------------------------------------------------
// 5. Absolute value — \left| nesting, bar families
// ---------------------------------------------------------------------------

assertLatex('\\left|x\\right|', 'abs(x)');
assertLatex('\\left|\\left|x\\right|-1\\right|', 'abs(abs(x) - 1)');   // direct nesting
assertLatex('\\left|\\left|x\\right|\\right|', 'abs(x)');
assertLatex('\\left|x-\\left(\\left|y\\right|-1\\right)\\right|', 'abs(x - (abs(y) - 1))');
assertLatex('\\left|x\\left(\\left|y\\right|+1\\right)\\right|', 'abs(x)(abs(y) + 1)');
assertLatex('\\lvert\\lvert x\\rvert-1\\rvert', 'abs(abs(x) - 1)');    // \lvert opens, never closes
assertLatex('\\left|\\frac{x}{y}\\right|', 'abs(x/y)');
assertLatex('\\frac{\\left|x\\right|}{\\left|y\\right|}', 'abs(x)/abs(y)');
assertLatex('|x||y|', 'abs(x) abs(y)');
assertLatex('\\sin\\left|x\\right|', 'sin(abs(x))');
assertLatex('2\\left|x\\right|', '2abs(x)');
assertLatex('\\left|x\\right|^2', 'x^2');
assertThrows('unclosed \\lvert throws', () => latexToExpr('\\lvert x'), /closing '\|'/);

// ---------------------------------------------------------------------------
// 6. MathLive constant commands (\exponentialE, \imaginaryI)
// ---------------------------------------------------------------------------

assertLatex('\\exponentialE', 'e');
assertLatex('\\exponentialE^{-x^2}', 'e^(-x^2)');    // what MathLive 0.110 emits for e
assertLatex('2\\exponentialE^{x}', '2e^x');
assertLatex('\\frac{\\exponentialE^x}{2}', 'e^x/2');
assertLatex('x^\\exponentialE', 'x^e');
assertLatex('\\sin\\exponentialE', 'sin(e)');
assertLatex('\\imaginaryI x', 'i x');                // i stays a plain variable
assertLatex('\\imaginaryJ y', 'j y');
ok("\\exponentialE emits 'e'", latexToExpr('\\exponentialE') === 'e',
  `got ${JSON.stringify(latexToExpr('\\exponentialE'))}`);
ok("2\\exponentialE keeps a word break", latexToExpr('2\\exponentialE') === '2 e',
  `got ${JSON.stringify(latexToExpr('2\\exponentialE'))}`);
ok("\\imaginaryI emits 'i'", latexToExpr('\\imaginaryI') === 'i',
  `got ${JSON.stringify(latexToExpr('\\imaginaryI'))}`);

// ---------------------------------------------------------------------------
// 7. Mixed unicode + commands
// ---------------------------------------------------------------------------

assertLatex('π\\theta', 'pi theta');
assertLatex('\\theta π', 'theta pi');
assertLatex('\\piπ', 'pi^2');
assertLatex('θ\\varphi+\\theta φ', '2 theta phi');
assertLatex('ρ²\\sin θ', 'rho^2 sin(theta)');
assertLatex('τ\\theta', 'tau theta');
assertLatex('2π\\frac{x}{2}', 'pi x');
assertLatex('√{x+1}', 'sqrt(x + 1)');
assertLatex('√\\frac12', 'sqrt(1/2)');
ok("'π\\theta' keeps tokens apart", parse(latexToExpr('π\\theta')) &&
  freeVars(parse(latexToExpr('π\\theta'))).join(',') === 'theta',
  `got ${JSON.stringify(latexToExpr('π\\theta'))}`);

// ---------------------------------------------------------------------------
// 8. Empty-ish inputs
// ---------------------------------------------------------------------------

ok("latexToExpr('') → ''", latexToExpr('') === '', `got ${JSON.stringify(latexToExpr(''))}`);
ok("latexToExpr('  ') → ''", latexToExpr('  ') === '', `got ${JSON.stringify(latexToExpr('  '))}`);
ok("latexToExpr('\\\\,\\\\;') → ''", latexToExpr('\\,\\;') === '',
  `got ${JSON.stringify(latexToExpr('\\,\\;'))}`);
ok("lone \\placeholder{} → ''", latexToExpr('\\placeholder{}') === '',
  `got ${JSON.stringify(latexToExpr('\\placeholder{}'))}`);
ok("two placeholders → ''", latexToExpr('\\placeholder{}\\placeholder{}') === '',
  `got ${JSON.stringify(latexToExpr('\\placeholder{}\\placeholder{}'))}`);
assertLatex('\\placeholder{}x+\\placeholder{}1', 'x + 1');
// a \frac whose argument is only a placeholder is incomplete input → error
assertThrows('\\frac of bare placeholder throws',
  () => latexToExpr('\\frac{\\placeholder{}}{2}'), /empty \{\} argument/);

// ---------------------------------------------------------------------------
// 9. \text / \mathrm with spaces
// ---------------------------------------------------------------------------

assertLatex('\\text{mod}(x,2)', 'mod(x, 2)');
assertLatex('\\text{ mod }(x,2)', 'mod(x, 2)');
assertLatex('\\mathrm{ atan2 }\\left(y,x\\right)', 'atan2(y, x)');
assertLatex('\\text{floor}\\left(x\\right)', 'floor(x)');
assertLatex('2\\text{ }x', '2x'); // \text{ } is pure padding

// ---------------------------------------------------------------------------
// 10. Implicit multiplication of adjacent groups, \cdot chains
// ---------------------------------------------------------------------------

assertLatex('\\left(x+1\\right)\\left(x-1\\right)', 'x^2 - 1');
assertLatex('(x+1)(x-1)', 'x^2 - 1');
assertLatex('{x+1}{x-1}', 'x^2 - 1');
assertLatex('\\left(x+1\\right)2', '2(x + 1)');
assertLatex('\\frac{1}{2}\\frac{1}{3}', '1/6');
assertLatex('\\sqrt{x^2}\\sqrt{y^2}', 'abs(x) abs(y)');
assertLatex('2\\cdot3\\cdot4', '24');
assertLatex('x\\cdot y\\cdot z', 'x y z');
assertLatex('2\\cdot\\frac{1}{2}\\cdot x', 'x');
assertLatex('-2\\cdot-3', '6');
assertLatex('x\\times y\\div z', 'x y/z');

// ---------------------------------------------------------------------------
// 11. exprToLatex precedence traps (exact emission where it matters)
// ---------------------------------------------------------------------------

function eq(label, got, want) {
  ok(label, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

eq('-x^2 stays -(x^2)', exprToLatex('-x^2'), '-x^{2}');
eq('(-x)^2 keeps parens', exprToLatex('(-x)^2'), '\\left(-x\\right)^{2}');
eq('2^3^2 right-assoc', exprToLatex('2^3^2'), '2^{3^{2}}');
eq('(2^3)^2 keeps parens', exprToLatex('(2^3)^2'), '\\left(2^{3}\\right)^{2}');
eq('(x+1)/(y+1) frac', exprToLatex('(x+1)/(y+1)'), '\\frac{x + 1}{y + 1}');
eq('x/(y z) frac', exprToLatex('x/(y z)'), '\\frac{x}{y\\,z}');
eq('-(x+y) parens', exprToLatex('-(x + y)'), '-\\left(x + y\\right)');
eq('-(x y) drops parens', exprToLatex('-(x y)'), '-x\\,y');
eq('x-(y+z) parens', exprToLatex('x - (y + z)'), 'x - \\left(y + z\\right)');
eq('x-(y-z) parens', exprToLatex('x - (y - z)'), 'x - \\left(y - z\\right)');
eq('(x/y)^z parens', exprToLatex('(x/y)^z'), '\\left(\\frac{x}{y}\\right)^{z}');
eq('(x+1)y parens', exprToLatex('(x + 1)y'), '\\left(x + 1\\right)\\,y');
eq('cdot before digit', exprToLatex('x*2'), 'x \\cdot 2');
eq('cdot before neg', exprToLatex('x*(-2)'), 'x \\cdot -2');
eq('abs of abs', exprToLatex('abs(abs(x) - 1)'), '\\left|\\left|x\\right| - 1\\right|');

// ---------------------------------------------------------------------------
// 12. Numeric roundtrip traps
// ---------------------------------------------------------------------------

const ROUNDTRIP = [
  '-x^2',
  '(-x)^2',
  '-(-x)',
  '2^3^2',
  '(2^3)^2',
  'x^-2 + 1',
  '(x+1)/(y+1)',
  'x/(y z)',
  'x/y/z',
  'x/(y/z)',
  '-(x+y)',
  '-(x y)',
  'x - (y - z)',
  'x - (y + z)',
  'x - -y',
  'x*(-2)',
  '(x/y)^z',
  'x^(y z)',
  'x^(y/z)',
  '(x+1)(x-1)(x+2)',
  'abs(abs(x) - 1)',
  '|x - (|y - 1|)|',         // bars nested via parens — the form the parser accepts
  'abs(x abs(y))',
  'sin(abs(x))',
  'abs(sin(x))^2',
  'e^(-x^2)',
  '2e^x',
  '1/2x',
  '2/3/4',
  '0.5^x',
  '(1/3)^x',
  '1e-7 x^2',
  '2.5e3 + x',
  'sqrt(x^2 + 1)^3',
  'cbrt(-x^2 - 1)',
  'x^(1/3) + x^(1/5)',
  'min(x, y, -1) max(x, -y)',
  'mod(-x, 3)',
  'log2(x^2 + 2)^2',
  'a1^2 + b12',
  'pi^e + e^pi',
  'tau/(2pi)',
  '-theta phi',
];

for (const expr of ROUNDTRIP) assertRoundtrip(expr);

// ---------------------------------------------------------------------------
// 13. Errors still error
// ---------------------------------------------------------------------------

assertThrows('\\frac with no args', () => latexToExpr('\\frac'), /missing an argument/);
assertThrows('\\frac{} empty arg', () => latexToExpr('\\frac{}{2}'), /empty \{\} argument/);
assertThrows('x^{} empty exponent', () => latexToExpr('x^{}'), /Empty exponent/);
assertThrows('x^ at end', () => latexToExpr('x^'), /Missing an exponent/);
assertThrows('unknown \\foo', () => latexToExpr('\\foo'), /Can't use LaTeX command \\foo/);
assertThrows('\\left( unclosed', () => latexToExpr('\\left(x+1'), /\\right/);
assertThrows('\\right alone', () => latexToExpr('x\\right)'), /Unmatched \\right/);
assertThrows('trailing backslash', () => latexToExpr('x\\'), /Stray '\\'/);
assertThrows('\\sqrt[] empty index', () => latexToExpr('\\sqrt[]{x}'), /empty index/);
assertThrows('\\operatorname{} empty', () => latexToExpr('\\operatorname{}(x)'), /operatorname/);

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

console.log(`audit-latex: ${pass} passed, ${fail} failed`);
if (fail) {
  for (const f of failures) console.log(`  FAIL: ${f}`);
  process.exit(1);
}
process.exit(0);
