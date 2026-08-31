// src/math/latex.js — Graphite 3D expression engine: LaTeX bridge.
//
// latexToExpr(latex): converts a MathLive-produced LaTeX string into a
//   plain-text expression that src/math/parser.js accepts. Word tokens are
//   emitted with separating spaces so implicit multiplication survives
//   ("2\pi r" → "2 pi r" → 2·π·r, and adjacent letters never fuse into an
//   unintended name — "p i" stays p·i, never the constant pi).
//   Unknown LaTeX commands throw Error("Can't use LaTeX command \name here")
//   so the UI can surface them.
//
// exprToLatex(src): parses src with our parser and emits LaTeX from the AST.
//   Returns null when src does not parse (ParseError).
//
// Roundtrip guarantee: for every well-formed expression E,
// latexToExpr(exprToLatex(E)) parses and evaluates to the same values as E.
// One deliberate asymmetry serves that guarantee: cbrt(x) emits \sqrt[3]{x},
// so \sqrt[3]{A} converts back to cbrt(A) (which is defined for negative A,
// unlike (A)^(1/3)). Other indices use the general (A)^(1/(N)) form.
//
// Plain ES module, zero dependencies (besides the sibling parser).

import { parse, ParseError } from './parser.js';

// ===========================================================================
// latexToExpr — LaTeX → plain text
// ===========================================================================

// Greek commands → spelled names. theta/phi/rho/pi/tau are meaningful to the
// parser; the rest are emitted spelled-out so the parser (or compiler) can
// give a clear "unknown name" complaint instead of a crash.
const GREEK = {
  alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta',
  epsilon: 'epsilon', varepsilon: 'epsilon', zeta: 'zeta', eta: 'eta',
  theta: 'theta', vartheta: 'theta', iota: 'iota', kappa: 'kappa',
  varkappa: 'kappa', lambda: 'lambda', mu: 'mu', nu: 'nu', xi: 'xi',
  omicron: 'omicron', pi: 'pi', varpi: 'pi', rho: 'rho', varrho: 'rho',
  sigma: 'sigma', varsigma: 'sigma', tau: 'tau', upsilon: 'upsilon',
  phi: 'phi', varphi: 'phi', chi: 'chi', psi: 'psi', omega: 'omega',
  Gamma: 'Gamma', Delta: 'Delta', Theta: 'Theta', Lambda: 'Lambda',
  Xi: 'Xi', Pi: 'Pi', Sigma: 'Sigma', Upsilon: 'Upsilon', Phi: 'Phi',
  Psi: 'Psi', Omega: 'Omega',
};

// Function commands the parser understands directly (\log handled separately).
const FUNC_CMDS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh',
  'ln', 'exp',
]);

// \sin^{-1} means the inverse function, not a reciprocal.
const INVERSE = {
  sin: 'arcsin', cos: 'arccos', tan: 'arctan',
  sinh: 'asinh', cosh: 'acosh', tanh: 'atanh',
};

// MathLive constant commands.
const CONST_CMDS = { exponentialE: 'e', imaginaryI: 'i', imaginaryJ: 'j' };

// Spacing commands (single-char and word forms) — converted to token breaks.
const SPACING_CMDS = new Set([
  ',', ';', '!', ':', ' ', 'quad', 'qquad', 'enskip', 'enspace',
  'thinspace', 'medspace', 'thickspace',
  'negthinspace', 'negmedspace', 'negthickspace',
]);

const FRAC_CMDS = new Set(['frac', 'dfrac', 'tfrac', 'cfrac']);
const BAR_CMDS = new Set(['vert', 'lvert', 'rvert', 'Vert', 'lVert', 'rVert']);
// Commands that may CLOSE a '|…|' region. \lvert/\lVert are left delimiters —
// inside a bar group they open a nested one instead of closing the current one.
const CLOSE_BAR_CMDS = new Set(['vert', 'rvert', 'Vert', 'rVert']);

// Unicode the parser tokenizes itself — passed through verbatim.
const PASSTHRU_CHARS = new Set(['π', 'τ', 'θ', 'φ', 'ϕ', 'ρ']);

const isDigit = (c) => c >= '0' && c <= '9';
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ' ';

function fail(msg) { throw new Error(msg); }
function unknownCmd(name) { fail(`Can't use LaTeX command \\${name} here`); }

// Join emitted pieces, inserting a space wherever two word-ish tokens touch
// so they cannot fuse into a different token ("2","pi","r" → "2 pi r").
const WORD_END = /[A-Za-z0-9.]$/;
const WORD_START = /^[A-Za-z0-9.]/;
function joinParts(parts) {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    if (out && WORD_END.test(out) && WORD_START.test(p)) out += ' ';
    out += p;
  }
  return out;
}

// Look at the \command starting at st.i (which must be '\'), without consuming.
function peekCommand(st) {
  const { s } = st;
  const j = st.i + 1;
  if (j >= s.length) fail("Stray '\\' at the end of the LaTeX input");
  if (isLetter(s[j])) {
    let k = j;
    while (k < s.length && isLetter(s[k])) k++;
    return { name: s.slice(j, k), end: k };
  }
  return { name: s[j], end: j + 1 };
}

function skipSpacing(st) {
  const { s } = st;
  for (;;) {
    const c = s[st.i];
    if (c === undefined) return;
    if (isWs(c) || c === '~') { st.i++; continue; }
    if (c === '\\') {
      const pk = peekCommand(st);
      if (SPACING_CMDS.has(pk.name)) { st.i = pk.end; continue; }
    }
    return;
  }
}

// Numbers: digits [ '.' digits ]. No exponent — 'e' is a letter in LaTeX.
function scanNum(st) {
  const { s } = st;
  let j = st.i;
  while (j < s.length && isDigit(s[j])) j++;
  if (s[j] === '.') {
    j++;
    while (j < s.length && isDigit(s[j])) j++;
  }
  const tok = s.slice(st.i, j);
  st.i = j;
  return tok;
}

// One letter, with an optional digit subscript: a → "a", a_2 → "a2",
// a_{12} → "a12" (variable names are a letter plus digits).
function letterVar(st) {
  const { s } = st;
  const L = s[st.i++];
  if (s[st.i] !== '_') return L;
  st.i++;
  skipSpacing(st);
  const c = s[st.i];
  if (c === '{') {
    const raw = readRawGroup(st, `${L}_`).trim();
    if (!/^[0-9]+$/.test(raw)) {
      fail(`Can't use the subscript '${raw}' — only digit subscripts like ${L}_{12} are supported`);
    }
    return L + raw;
  }
  if (isDigit(c)) { st.i++; return L + c; }
  fail(`Can't use that subscript — only digit subscripts like ${L}_{1} are supported`);
}

// Raw balanced {...} contents (no conversion). Expects '{' after whitespace.
function readRawGroup(st, what) {
  const { s } = st;
  skipSpacing(st);
  if (s[st.i] !== '{') fail(`Missing '{' after \\${what}`);
  let depth = 0;
  let j = st.i;
  for (; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) fail("Missing '}' in the LaTeX input");
  const raw = s.slice(st.i + 1, j);
  st.i = j + 1;
  return raw;
}

// Converted {...} group. Expects '{' at the current position.
function readGroupConverted(st) {
  st.i++; // '{'
  const inner = convertUntil(st, '}');
  st.i++; // '}'
  return inner;
}

function closerMsg(stop) {
  switch (stop) {
    case '}': return "Missing '}' in the LaTeX input";
    case ')': return "Missing ')' in the LaTeX input";
    case ']': return "Missing ']' in the LaTeX input";
    case '|': return "Missing the closing '|' in the LaTeX input";
    case 'right': return 'Missing \\right to close a \\left';
    default: return 'Unexpected end of the LaTeX input';
  }
}

// The closer for a '|…|' region: a bare '|' or any \vert-family command.
function consumeBarClose(st) {
  skipSpacing(st);
  const c = st.s[st.i];
  if (c === '|') { st.i++; return; }
  if (c === '\\') {
    const pk = peekCommand(st);
    if (CLOSE_BAR_CMDS.has(pk.name)) { st.i = pk.end; return; }
  }
  fail("Missing the closing '|' in the LaTeX input");
}

// A \left/\mleft…\right/\mright group; the \left/\mleft is already consumed.
function leftGroup(st) {
  const open = readDelim(st, 'left');
  const inner = convertUntil(st, 'right');
  const pk = peekCommand(st); // convertUntil stopped at \right / \mright
  st.i = pk.end;
  readDelim(st, 'right');
  // abs(...) rather than |...| so nested absolute values stay parseable
  // (the parser rejects directly nested bars like "||x|-1|" by design).
  return open === '|' ? `abs(${inner})` : `(${inner})`;
}

function readDelim(st, which) {
  const { s } = st;
  skipSpacing(st);
  const c = s[st.i];
  if (c === undefined) fail(`Missing a bracket after \\${which}`);
  if (c === '\\') {
    const pk = peekCommand(st);
    const n = pk.name;
    if (BAR_CMDS.has(n)) { st.i = pk.end; return '|'; }
    if (n === '{' || n === 'lbrace') { st.i = pk.end; return '('; }
    if (n === '}' || n === 'rbrace') { st.i = pk.end; return ')'; }
    if (n === 'langle') { st.i = pk.end; return '('; }
    if (n === 'rangle') { st.i = pk.end; return ')'; }
    unknownCmd(n);
  }
  if ('()[]|.{}'.includes(c)) {
    st.i++;
    if (c === '[' || c === '{') return '(';
    if (c === ']' || c === '}') return ')';
    return c; // '(', ')', '|', '.'
  }
  fail(`Can't use '${c}' as a \\${which} bracket`);
}

// \frac{A}{B} → (A)/(B)
function fracString(st) {
  const a = readArg(st, 'frac');
  const b = readArg(st, 'frac');
  return `(${a})/(${b})`;
}

// \sqrt{A} → sqrt(A); \sqrt[3]{A} → cbrt(A); \sqrt[N]{A} → (A)^(1/(N))
function sqrtString(st) {
  skipSpacing(st);
  if (st.s[st.i] === '[') {
    st.i++;
    const idx = convertUntil(st, ']').trim();
    st.i++; // ']'
    if (idx === '') fail('\\sqrt[] has an empty index');
    const a = readArg(st, 'sqrt');
    if (idx === '2') return `sqrt(${a})`;
    if (idx === '3') return `cbrt(${a})`; // stays defined for negative A
    return `(${a})^(1/(${idx}))`;
  }
  return `sqrt(${readArg(st, 'sqrt')})`;
}

// One LaTeX argument: a {…} group, or a single token (\frac12 → 1 over 2).
function readArg(st, what) {
  const { s } = st;
  skipSpacing(st);
  const c = s[st.i];
  if (c === undefined) fail(`\\${what} is missing an argument`);
  if (c === '{') {
    const inner = readGroupConverted(st);
    if (inner === '') fail(`\\${what} has an empty {} argument`);
    return inner;
  }
  if (isDigit(c)) { st.i++; return c; }
  if (isLetter(c)) { st.i++; return c; }
  if (PASSTHRU_CHARS.has(c)) { st.i++; return c; }
  if (c === '(') {
    st.i++;
    const inner = convertUntil(st, ')');
    st.i++;
    return `(${inner})`;
  }
  if (c === '\\') {
    const pk = peekCommand(st);
    const n = pk.name;
    st.i = pk.end;
    if (GREEK[n]) return GREEK[n];
    if (CONST_CMDS[n]) return CONST_CMDS[n];
    if (FRAC_CMDS.has(n)) return fracString(st);
    if (n === 'sqrt') return sqrtString(st);
    if (n === 'left' || n === 'mleft') return leftGroup(st);
    if (FUNC_CMDS.has(n)) return functionCall(st, n);
    if (n === 'log') return functionCall(st, resolveLogName(st));
    if (n === 'operatorname') return functionCall(st, readOperatorName(st));
    unknownCmd(n);
  }
  fail(`Can't use '${c}' as a \\${what} argument`);
}

// After ^: a braced group → ^(…); a single digit → ^2; otherwise one token,
// parenthesized. LaTeX gives ^ a single token, so ^25 means (^2)·5.
function readSup(st) {
  const { s } = st;
  skipSpacing(st);
  const c = s[st.i];
  if (c === undefined) fail("Missing an exponent after '^'");
  if (c === '{') {
    const g = readGroupConverted(st);
    if (g === '') fail("Empty exponent '^{}' in the LaTeX input");
    return `^(${g})`;
  }
  if (isDigit(c)) { st.i++; return `^${c}`; }
  let neg = false;
  while (s[st.i] === '+' || s[st.i] === '-' || s[st.i] === '−') {
    if (s[st.i] !== '+') neg = !neg;
    st.i++;
    skipSpacing(st);
  }
  let tok;
  const c2 = s[st.i];
  if (c2 === undefined) fail("Missing an exponent after '^'");
  if (isDigit(c2) || (c2 === '.' && isDigit(s[st.i + 1]))) tok = scanNum(st);
  else if (isLetter(c2)) tok = letterVar(st);
  else if (PASSTHRU_CHARS.has(c2)) { st.i++; tok = c2; }
  else if (c2 === '{') tok = readGroupConverted(st);
  else if (c2 === '(') { st.i++; tok = `(${convertUntil(st, ')')})`; st.i++; }
  else if (c2 === '\\') {
    const pk = peekCommand(st);
    const n = pk.name;
    st.i = pk.end;
    if (GREEK[n]) tok = GREEK[n];
    else if (CONST_CMDS[n]) tok = CONST_CMDS[n];
    else if (FRAC_CMDS.has(n)) tok = fracString(st);
    else if (n === 'sqrt') tok = sqrtString(st);
    else unknownCmd(n);
  } else fail(`Can't use '${c2}' as an exponent`);
  return `^(${neg ? '-' : ''}${tok})`;
}

// \log[_base] → log / log2 / ln
function resolveLogName(st) {
  const { s } = st;
  skipSpacing(st);
  if (s[st.i] !== '_') return 'log';
  st.i++;
  skipSpacing(st);
  const c = s[st.i];
  let base;
  if (c === '{') base = readRawGroup(st, 'log_').trim();
  else if (isDigit(c) || isLetter(c)) { st.i++; base = c; }
  else fail('Missing a base after \\log_');
  if (base === '10') return 'log';
  if (base === '2') return 'log2';
  if (base === 'e') return 'ln';
  fail(`Can't use log base '${base}' — only \\log (base 10), \\log_2, and \\ln are supported`);
}

function readOperatorName(st) {
  const raw = readRawGroup(st, 'operatorname').trim();
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(raw)) fail(`Can't use \\operatorname{${raw}} here`);
  return raw;
}

// A function application. MathLive writes \sin\left(x\right); we also accept
// \sin x by wrapping the immediately following primary in parens, and
// \sin^2(x) / \sin^{-1}(x) styles.
function functionCall(st, name) {
  skipSpacing(st);
  let sup = '';
  if (st.s[st.i] === '^') {
    st.i++;
    sup = readSup(st);
    if (sup === '^(-1)' && INVERSE[name]) { name = INVERSE[name]; sup = ''; }
  }
  const arg = functionArg(st);
  return name + arg + sup;
}

function functionArg(st) {
  const { s } = st;
  skipSpacing(st);
  const c = s[st.i];
  if (c === undefined) return '';
  if (c === '(') {
    st.i++;
    const inner = convertUntil(st, ')');
    st.i++;
    return `(${inner})`;
  }
  if (c === '{') return `(${readGroupConverted(st)})`;
  if (c === '[') {
    st.i++;
    const inner = convertUntil(st, ']');
    st.i++;
    return `(${inner})`;
  }
  if (c === '\\') {
    const pk = peekCommand(st);
    const n = pk.name;
    if (n === 'left' || n === 'mleft') {
      st.i = pk.end;
      const g = leftGroup(st);
      return g[0] === '(' ? g : `(${g})`; // \sin\left|x\right| → sin((abs(x)))
    }
    if (GREEK[n] || CONST_CMDS[n] || FRAC_CMDS.has(n) || n === 'sqrt' ||
        FUNC_CMDS.has(n) || n === 'log' || n === 'operatorname' ||
        n === 'text' || n === 'mathrm') {
      return `(${convertPrimary(st)})`;
    }
    return ''; // let the main loop (and the parser's messages) handle it
  }
  if (isDigit(c) || (c === '.' && isDigit(s[st.i + 1])) || isLetter(c) ||
      PASSTHRU_CHARS.has(c) || c === '|' || c === '√' ||
      c === '-' || c === '+' || c === '−') {
    return `(${convertPrimary(st)})`;
  }
  return '';
}

// One primary: optional signs, one atom, optional ^exponents.
function convertPrimary(st) {
  const { s } = st;
  skipSpacing(st);
  let neg = false;
  for (;;) {
    const c = s[st.i];
    if (c === '+') { st.i++; }
    else if (c === '-' || c === '−') { neg = !neg; st.i++; }
    else break;
    skipSpacing(st);
  }
  const c = s[st.i];
  if (c === undefined) fail('Unexpected end of the LaTeX input — expected a value');
  let atom;
  if (isDigit(c) || (c === '.' && isDigit(s[st.i + 1]))) atom = scanNum(st);
  else if (isLetter(c)) atom = letterVar(st);
  else if (PASSTHRU_CHARS.has(c)) { st.i++; atom = c; }
  else if (c === '(') { st.i++; atom = `(${convertUntil(st, ')')})`; st.i++; }
  else if (c === '{') { st.i++; atom = `(${convertUntil(st, '}')})`; st.i++; }
  else if (c === '[') { st.i++; atom = `(${convertUntil(st, ']')})`; st.i++; }
  else if (c === '|') {
    st.i++;
    const inner = convertUntil(st, '|');
    consumeBarClose(st);
    atom = `abs(${inner})`;
  } else if (c === '√') {
    st.i++;
    atom = `sqrt(${convertPrimary(st)})`;
  } else if (c === '\\') {
    const pk = peekCommand(st);
    const n = pk.name;
    st.i = pk.end;
    if (n === 'left' || n === 'mleft') atom = leftGroup(st);
    else if (GREEK[n]) atom = GREEK[n];
    else if (CONST_CMDS[n]) atom = CONST_CMDS[n];
    else if (FRAC_CMDS.has(n)) atom = fracString(st);
    else if (n === 'sqrt') atom = sqrtString(st);
    else if (FUNC_CMDS.has(n)) atom = functionCall(st, n);
    else if (n === 'log') atom = functionCall(st, resolveLogName(st));
    else if (n === 'operatorname') atom = functionCall(st, readOperatorName(st));
    else if (n === 'text' || n === 'mathrm') atom = readRawGroup(st, n).trim();
    else unknownCmd(n);
  } else {
    fail(`Can't use '${c}' here — expected a value`);
  }
  for (;;) {
    const c2 = s[st.i];
    if (c2 === '^') { st.i++; atom += readSup(st); }
    else if (c2 === '²') { st.i++; atom += '^2'; }
    else if (c2 === '³') { st.i++; atom += '^3'; }
    else break;
  }
  return neg ? `-${atom}` : atom;
}

// The main conversion loop. `stop` is 'end', '}', ')', ']', '|', or 'right';
// the stopping token is left unconsumed for the caller (except 'end').
function convertUntil(st, stop) {
  const { s } = st;
  const parts = [];
  for (;;) {
    if (st.i >= s.length) {
      if (stop === 'end') break;
      fail(closerMsg(stop));
    }
    const c = s[st.i];
    if (isWs(c) || c === '~') { st.i++; continue; }
    if (c === '}') { if (stop === '}') break; fail("Unmatched '}' in the LaTeX input"); }
    if (c === ')') { if (stop === ')') break; fail("Unmatched ')' in the LaTeX input"); }
    if (c === ']') { if (stop === ']') break; fail("Unmatched ']' in the LaTeX input"); }
    if (c === '|') {
      if (stop === '|') break;
      st.i++;
      const inner = convertUntil(st, '|');
      consumeBarClose(st);
      parts.push(`abs(${inner})`);
      continue;
    }
    if (c === '\\') {
      const pk = peekCommand(st);
      if (stop === 'right' && (pk.name === 'right' || pk.name === 'mright')) break;
      if (stop === '|' && CLOSE_BAR_CMDS.has(pk.name)) break;
      st.i = pk.end;
      const piece = dispatchCommand(st, pk.name);
      if (piece) parts.push(piece);
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(s[st.i + 1]))) { parts.push(scanNum(st)); continue; }
    if (isLetter(c)) { parts.push(letterVar(st)); continue; }
    if (c === '(') { st.i++; parts.push(`(${convertUntil(st, ')')})`); st.i++; continue; }
    if (c === '{') {
      st.i++;
      const inner = convertUntil(st, '}');
      st.i++;
      if (inner) parts.push(`(${inner})`);
      continue;
    }
    if (c === '[') { st.i++; parts.push(`(${convertUntil(st, ']')})`); st.i++; continue; }
    if (c === '^') { st.i++; parts.push(readSup(st)); continue; }
    if (c === '_') fail("Can't use '_' here — subscripts only work on variables (like a_{1}) and \\log");
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === ',') { st.i++; parts.push(c); continue; }
    if (c === '−') { st.i++; parts.push('-'); continue; }
    if (c === '·' || c === '×') { st.i++; parts.push('*'); continue; }
    if (c === '÷') { st.i++; parts.push('/'); continue; }
    if (c === '²') { st.i++; parts.push('^2'); continue; }
    if (c === '³') { st.i++; parts.push('^3'); continue; }
    if (c === '√') { st.i++; parts.push(`sqrt(${convertPrimary(st)})`); continue; }
    if (PASSTHRU_CHARS.has(c)) { st.i++; parts.push(c); continue; }
    if (c === '∞') fail("Can't use ∞ here — infinity is not supported");
    fail(`Can't use '${c}' here`);
  }
  return joinParts(parts);
}

// One \command in expression position (already consumed). Returns the emitted
// plain-text piece, or '' for pure spacing.
function dispatchCommand(st, name) {
  if (SPACING_CMDS.has(name)) return '';
  if (name === 'left' || name === 'mleft') return leftGroup(st);
  if (name === 'right' || name === 'mright') fail('Unmatched \\right in the LaTeX input');
  if (BAR_CMDS.has(name)) {
    const inner = convertUntil(st, '|');
    consumeBarClose(st);
    return `abs(${inner})`;
  }
  if (name === 'cdot' || name === 'times') return '*';
  if (name === 'div') return '/';
  if (FRAC_CMDS.has(name)) return fracString(st);
  if (name === 'sqrt') return sqrtString(st);
  if (GREEK[name]) return GREEK[name];
  if (CONST_CMDS[name]) return CONST_CMDS[name];
  if (FUNC_CMDS.has(name)) return functionCall(st, name);
  if (name === 'log') return functionCall(st, resolveLogName(st));
  if (name === 'operatorname') return functionCall(st, readOperatorName(st));
  if (name === 'text' || name === 'mathrm') return readRawGroup(st, name).trim();
  if (name === 'placeholder') {
    skipSpacing(st);
    if (st.s[st.i] === '{') readRawGroup(st, 'placeholder');
    return '';
  }
  if (name === 'infty') fail("Can't use LaTeX command \\infty here — infinity is not supported");
  unknownCmd(name);
  return ''; // unreachable
}

export function latexToExpr(latex) {
  if (typeof latex !== 'string') throw new Error('LaTeX input must be a string');
  const st = { s: latex, i: 0 };
  return convertUntil(st, 'end');
}

// ===========================================================================
// exprToLatex — plain text → LaTeX
// ===========================================================================

// Printing precedence tiers (mirrors autodiff.js / the parser):
//   + -  → 10;  * /  → 20;  neg and negative literals → 30;  ^ → 40;
//   atoms → 100.
function prec(n) {
  switch (n.t) {
    case 'num': return n.v < 0 || Object.is(n.v, -0) ? 30 : 100;
    case 'var':
    case 'call': return 100;
    case 'neg': return 30;
    case 'op': return n.op === '^' ? 40 : n.op === '*' || n.op === '/' ? 20 : 10;
    default: return 100;
  }
}

const VAR_TEX = {
  theta: '\\theta', phi: '\\phi', rho: '\\rho', tau: '\\tau', pi: '\\pi',
};

const CALL_TEX = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan',
  sec: '\\sec', csc: '\\csc', cot: '\\cot',
  asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  ln: '\\ln', log: '\\log', exp: '\\exp',
};

const lp = (s) => `\\left(${s}\\right)`;

function texNum(v) {
  if (Number.isNaN(v)) return '\\frac{0}{0}';
  if (v === Infinity) return '\\frac{1}{0}';
  if (v === -Infinity) return '-\\frac{1}{0}';
  if (Object.is(v, -0)) return '0';
  if (v < 0) return `-${texNum(-v)}`;
  if (v === Math.E) return 'e'; // named constants survive the roundtrip
  if (v === Math.PI) return '\\pi';
  if (v === 2 * Math.PI) return '\\tau';
  const s = String(v);
  const ei = s.indexOf('e');
  if (ei !== -1) {
    // "2.5e-7" would re-read as 2.5·e − 7; emit mantissa · 10^{exp} instead.
    const mant = s.slice(0, ei);
    const expo = String(Number(s.slice(ei + 1)));
    return `${mant}\\cdot 10^{${expo}}`;
  }
  return s;
}

function texVar(name) {
  if (VAR_TEX[name]) return VAR_TEX[name];
  const m = /^([A-Za-z])([0-9]+)$/.exec(name);
  if (m) return `${m[1]}_{${m[2]}}`;
  return name;
}

function texCall(n) {
  const A = n.args.map(tex);
  switch (n.name) {
    case 'sqrt': return `\\sqrt{${A[0]}}`;
    case 'cbrt': return `\\sqrt[3]{${A[0]}}`;
    case 'abs': return `\\left|${A[0]}\\right|`;
    case 'log2': return `\\log_{2}${lp(A[0])}`;
    default: {
      const cmd = CALL_TEX[n.name];
      if (cmd) return `${cmd}${lp(A.join(', '))}`;
      return `\\operatorname{${n.name}}${lp(A.join(', '))}`;
    }
  }
}

function texOp(n) {
  const { op, a, b } = n;
  switch (op) {
    case '+': {
      if (b.t === 'neg') {
        const inner = tex(b.a);
        const rs = prec(b.a) <= 10 ? lp(inner) : inner;
        return `${tex(a)} - ${rs}`; // a + (-c) → "a - c"
      }
      if (b.t === 'num' && b.v < 0) return `${tex(a)} - ${texNum(-b.v)}`;
      return `${tex(a)} + ${tex(b)}`;
    }
    case '-': {
      if (b.t === 'num' && b.v < 0) return `${tex(a)} + ${texNum(-b.v)}`;
      const rs = prec(b) <= 10 ? lp(tex(b)) : tex(b);
      return `${tex(a)} - ${rs}`;
    }
    case '*': {
      const ls = prec(a) < 20 ? lp(tex(a)) : tex(a);
      const rs = prec(b) < 20 ? lp(tex(b)) : tex(b);
      // Juxtaposition with a thin space — except an explicit \cdot when the
      // right factor starts with a digit or sign, so "2·3" can't fuse to "23"
      // and "x·(−2)" can't re-read as "x − 2".
      const c0 = rs[0];
      const sep = (c0 >= '0' && c0 <= '9') || c0 === '.' || c0 === '-' ? ' \\cdot ' : '\\,';
      return ls + sep + rs;
    }
    case '/':
      return `\\frac{${tex(a)}}{${tex(b)}}`;
    case '^': {
      // Parenthesize low-precedence bases, and numeric bases whose emission
      // is itself a product (mantissa \cdot 10^{k}).
      const needParens = prec(a) <= 40 || (a.t === 'num' && texNum(a.v).includes('\\cdot'));
      const ls = needParens ? lp(tex(a)) : tex(a);
      return `${ls}^{${tex(b)}}`;
    }
    default:
      return `${tex(a)}${op}${tex(b)}`;
  }
}

function tex(n) {
  switch (n.t) {
    case 'num': return texNum(n.v);
    case 'var': return texVar(n.name);
    case 'neg': {
      const s = tex(n.a);
      return prec(n.a) < 20 ? `-${lp(s)}` : `-${s}`;
    }
    case 'call': return texCall(n);
    case 'op': return texOp(n);
    default: return String(n);
  }
}

export function exprToLatex(src) {
  let node;
  try {
    node = parse(src);
  } catch (err) {
    if (err instanceof ParseError) return null;
    throw err;
  }
  return tex(node);
}
