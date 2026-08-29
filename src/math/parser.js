// src/math/parser.js — Graphite 3D expression engine: tokenizer + Pratt parser.
//
// Produces AST nodes in the shared shape (see CONTRACTS.md):
//   { t:'num', v }  { t:'var', name }  { t:'op', op, a, b }  { t:'neg', a }
//   { t:'call', name, args }
//
// Precedence (loosest to tightest):
//   +, -            (10)
//   *, /, adjacency (20)   — implicit multiplication binds exactly like '*',
//                            left-associative. Because '^' (40) binds tighter,
//                            `xy^2` = x*(y^2) and `2x^2` = 2*(x^2), while
//                            `1/2x` = (1/2)*x (same tier as '/', left-assoc).
//   unary -/+       (30)   — so `-x^2` = -(x^2) but `-2*x` = (-2)*x
//   ^               (40)   — RIGHT-associative: 2^3^2 = 2^(3^2) = 512
//   postfix / atoms (100)
//
// Identifier rule (tokenizer): at each position, the LONGEST match against
// (function names ∪ aliases ∪ constant names ∪ greek words theta/phi/rho)
// wins; anything else is a SINGLE letter optionally followed by digits
// (`a1`, `x2` are one variable each). So `xy` → x*y, `2x` → 2*x, `x2` → one
// variable, `theta` → one variable, `pi` → the constant, `asin(x)` → the
// function. A multi-letter run that decomposes into plain single-letter vars
// but is immediately followed by '(' is treated as an unknown function call
// and raises a helpful error (`foo(x)` → "Unknown function 'foo'").
//
// Function application requires parens: `sin x` is a ParseError suggesting
// `sin(x)`.
//
// |expr| is abs(expr). Non-nested only, but parens inside may reopen bars:
// `|x*(|y|)|` works, `|x*|y||` does not (by design — see CONTRACTS.md).
//
// Unicode: π τ θ φ ϕ ρ, · × − ÷, √x / √(x+1), x² / x³.
// `√` applies to the immediately following primary, so `√x^2` = (√x)^2;
// write `√(x^2)` for the other reading.

import { CONSTANTS, FUNCTIONS, ALIASES } from './builtins.js';

export class ParseError extends Error {
  constructor(message, pos) {
    super(typeof pos === 'number' ? `${message} (at position ${pos})` : message);
    this.name = 'ParseError';
    this.pos = pos;
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const BIN_BP = { '+': 10, '-': 10, '*': 20, '/': 20, '^': 40 };
const IMPLICIT_BP = 20; // adjacency == '*'
const UNARY_BP = 30;

const GREEK_LETTERS = {
  'π': { kind: 'num', v: CONSTANTS.pi },
  'τ': { kind: 'num', v: CONSTANTS.tau },
  'θ': { kind: 'var', name: 'theta' },
  'φ': { kind: 'var', name: 'phi' },
  'ϕ': { kind: 'var', name: 'phi' },
  'ρ': { kind: 'var', name: 'rho' },
};
const OP_SYNONYMS = { '·': '*', '×': '*', '−': '-', '÷': '/' };
const GREEK_WORDS = ['theta', 'phi', 'rho'];

// Longest-match table: functions ∪ aliases ∪ constants ∪ greek words,
// sorted by length descending so e.g. 'atan2' beats 'atan', 'exp' beats 'e'.
const NAME_TABLE = (() => {
  const t = [];
  for (const name of Object.keys(FUNCTIONS)) t.push({ name, kind: 'func', canon: name });
  for (const [alias, canon] of Object.entries(ALIASES)) t.push({ name: alias, kind: 'func', canon });
  for (const name of Object.keys(CONSTANTS)) t.push({ name, kind: 'const', canon: name });
  for (const name of GREEK_WORDS) t.push({ name, kind: 'var', canon: name });
  t.sort((a, b) => b.name.length - a.name.length);
  return t;
})();

const isDigit = (c) => c >= '0' && c <= '9';
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isAlnum = (c) => isDigit(c) || isLetter(c);
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ' ';

// Numbers: 2, 2.5, 2., .5, 1e3, 2.5e-2. The exponent is only consumed when
// actual digits follow ('2e' is the number 2 times the constant e).
function scanNumber(src, i) {
  let j = i;
  while (j < src.length && isDigit(src[j])) j++;
  if (src[j] === '.') {
    j++;
    while (j < src.length && isDigit(src[j])) j++;
  }
  if (src[j] === 'e' || src[j] === 'E') {
    let k = j + 1;
    if (src[k] === '+' || src[k] === '-') k++;
    if (isDigit(src[k])) {
      k++;
      while (k < src.length && isDigit(src[k])) k++;
      j = k;
    }
  }
  return j;
}

// Lex one alphanumeric run starting at a letter. Pushes one token per piece.
// Returns the index to resume the main loop at (may stop early at a digit
// following a named piece, e.g. "sin2" → func sin, then the main loop lexes 2).
function lexWord(src, i, toks) {
  const runStart = i;
  let runEnd = i;
  while (runEnd < src.length && isAlnum(src[runEnd])) runEnd++;

  let p = runStart;
  let pieces = 0;
  let lastWasFallbackVar = false;

  while (p < runEnd) {
    if (isDigit(src[p])) break; // e.g. "log23": after 'log2', hand '3' back to the main loop
    let matched = null;
    for (const entry of NAME_TABLE) {
      if (p + entry.name.length <= runEnd && src.startsWith(entry.name, p)) { matched = entry; break; }
    }
    if (matched) {
      if (matched.kind === 'func') {
        toks.push({ kind: 'func', name: matched.canon, shown: matched.name, pos: p });
      } else if (matched.kind === 'const') {
        toks.push({ kind: 'num', v: CONSTANTS[matched.canon], pos: p });
      } else {
        toks.push({ kind: 'var', name: matched.canon, pos: p });
      }
      p += matched.name.length;
      lastWasFallbackVar = false;
    } else {
      // Single letter, optionally followed by digits: x, y, a1, x2.
      let q = p + 1;
      while (q < runEnd && isDigit(src[q])) q++;
      toks.push({ kind: 'var', name: src.slice(p, q), pos: p });
      p = q;
      lastWasFallbackVar = true;
    }
    pieces++;
  }

  // Unknown-function guard: "foo(" / "xy(" would silently become f*o*o*(…);
  // that is almost certainly a typo'd or unknown function name, so say so.
  // A single variable before '(' stays implicit multiplication: x(x+1), a2(x+1).
  if (p === runEnd && src[runEnd] === '(' && pieces >= 2 && lastWasFallbackVar) {
    throw new ParseError(
      `Unknown function '${src.slice(runStart, runEnd)}' — known functions include sin, cos, tan, sqrt, exp, ln, log, abs, min, max…`,
      runStart
    );
  }
  return p;
}

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (isSpace(c)) { i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      const j = scanNumber(src, i);
      toks.push({ kind: 'num', v: parseFloat(src.slice(i, j)), pos: i });
      i = j;
      continue;
    }
    if (BIN_BP[c] !== undefined) { toks.push({ kind: 'op', ch: c, pos: i }); i++; continue; }
    const syn = OP_SYNONYMS[c];
    if (syn) { toks.push({ kind: 'op', ch: syn, pos: i }); i++; continue; }
    if (c === '(' || c === ')' || c === ',' || c === '|') { toks.push({ kind: c, pos: i }); i++; continue; }
    const g = GREEK_LETTERS[c];
    if (g) {
      toks.push(g.kind === 'num' ? { kind: 'num', v: g.v, pos: i } : { kind: 'var', name: g.name, pos: i });
      i++;
      continue;
    }
    if (c === '√') { toks.push({ kind: 'sqrt', pos: i }); i++; continue; }
    if (c === '²') { toks.push({ kind: 'op', ch: '^', pos: i }, { kind: 'num', v: 2, pos: i }); i++; continue; }
    if (c === '³') { toks.push({ kind: 'op', ch: '^', pos: i }, { kind: 'num', v: 3, pos: i }); i++; continue; }
    if (isLetter(c)) { i = lexWord(src, i, toks); continue; }
    throw new ParseError(`Unexpected character '${c}'`, i);
  }
  return toks;
}

function tokText(t) {
  switch (t.kind) {
    case 'num': return String(t.v);
    case 'var': return t.name;
    case 'func': return t.shown;
    case 'op': return t.ch;
    case 'sqrt': return '√';
    default: return t.kind; // '(' ')' ',' '|'
  }
}

// ---------------------------------------------------------------------------
// Pratt parser
// ---------------------------------------------------------------------------

class Parser {
  constructor(src) {
    this.src = src;
    this.toks = tokenize(src);
    this.i = 0;
    // Are we allowed to OPEN a '|…|' here? False while directly inside one
    // (so the next bar closes it); '(' and function-call parens reset it.
    this.absOK = true;
  }

  peek() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }

  endPos() { return this.src.length; }

  expect(kind, msg) {
    const t = this.peek();
    if (!t || t.kind !== kind) throw new ParseError(msg, t ? t.pos : this.endPos());
    return this.next();
  }

  parseExpr(minBP) {
    let left = this.parsePrefix();
    for (;;) {
      const t = this.peek();
      if (!t) break;
      if (t.kind === 'op' && BIN_BP[t.ch] !== undefined) {
        const bp = BIN_BP[t.ch];
        if (bp < minBP) break;
        this.next();
        // '^' is right-associative (recurse at the same bp); the rest left.
        const right = this.parseExpr(t.ch === '^' ? bp : bp + 1);
        left = { t: 'op', op: t.ch, a: left, b: right };
        continue;
      }
      if (this.startsPrimary(t)) {
        // Implicit multiplication: same precedence as '*', left-associative.
        if (IMPLICIT_BP < minBP) break;
        const right = this.parseExpr(IMPLICIT_BP + 1);
        left = { t: 'op', op: '*', a: left, b: right };
        continue;
      }
      break;
    }
    return left;
  }

  startsPrimary(t) {
    switch (t.kind) {
      case 'num':
      case 'var':
      case 'func':
      case 'sqrt':
      case '(':
        return true;
      case '|':
        return this.absOK; // inside |…| a bar CLOSES, it doesn't start a factor
      default:
        return false;
    }
  }

  parsePrefix() {
    const t = this.peek();
    if (t && t.kind === 'op' && (t.ch === '-' || t.ch === '+')) {
      this.next();
      // Unary minus binds tighter than '*' but looser than '^': -x^2 = -(x^2).
      const operand = this.parseExpr(UNARY_BP);
      return t.ch === '-' ? { t: 'neg', a: operand } : operand;
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.next();
    if (!t) {
      throw new ParseError(
        'Unexpected end of input — expected a number, variable, function, or parenthesized expression',
        this.endPos()
      );
    }
    switch (t.kind) {
      case 'num': return { t: 'num', v: t.v };
      case 'var': return { t: 'var', name: t.name };
      case 'func': return this.parseCall(t);
      case '(': {
        const saved = this.absOK;
        this.absOK = true;
        const inner = this.parseExpr(0);
        this.expect(')', `Missing ')' — the '(' at position ${t.pos} is never closed`);
        this.absOK = saved;
        return inner;
      }
      case '|': {
        if (!this.absOK) {
          throw new ParseError("Unexpected '|' — expected a value inside the absolute-value bars", t.pos);
        }
        this.absOK = false;
        const inner = this.parseExpr(0);
        this.expect('|', `Missing closing '|' for the '|' at position ${t.pos}`);
        this.absOK = true;
        return { t: 'call', name: 'abs', args: [inner] };
      }
      case 'sqrt': {
        // √ applies to the immediately following primary: √x, √(x+1), √2x = (√2)x.
        let negate = false;
        let n = this.peek();
        while (n && n.kind === 'op' && (n.ch === '-' || n.ch === '+')) {
          if (n.ch === '-') negate = !negate;
          this.next();
          n = this.peek();
        }
        const arg = this.parsePrimary();
        return { t: 'call', name: 'sqrt', args: [negate ? { t: 'neg', a: arg } : arg] };
      }
      default:
        throw new ParseError(`Unexpected '${tokText(t)}' — expected a value`, t.pos);
    }
  }

  parseCall(ft) {
    const open = this.peek();
    if (!open || open.kind !== '(') {
      throw new ParseError(
        `Function '${ft.shown}' needs parentheses around its argument — write ${ft.shown}(x) instead of ${ft.shown} x`,
        open ? open.pos : this.endPos()
      );
    }
    this.next(); // consume '('
    const saved = this.absOK;
    this.absOK = true;
    const args = [this.parseExpr(0)];
    while (this.peek() && this.peek().kind === ',') {
      this.next();
      args.push(this.parseExpr(0));
    }
    this.expect(')', `Missing ')' to close the call to ${ft.shown}( starting at position ${ft.pos}`);
    this.absOK = saved;

    const spec = FUNCTIONS[ft.name];
    const [lo, hi] = Array.isArray(spec.arity) ? spec.arity : [spec.arity, spec.arity];
    if (args.length < lo || args.length > hi) {
      const want = lo === hi ? `${lo} argument${lo === 1 ? '' : 's'}` : `between ${lo} and ${hi} arguments`;
      throw new ParseError(`${ft.shown} expects ${want}, got ${args.length}`, ft.pos);
    }
    return { t: 'call', name: ft.name, args };
  }
}

export function parse(src) {
  if (typeof src !== 'string') throw new ParseError('Expression must be a string', 0);
  const p = new Parser(src);
  if (p.toks.length === 0) throw new ParseError('Empty expression — nothing to parse', 0);
  const node = p.parseExpr(0);
  const t = p.peek();
  if (t) throw new ParseError(`Unexpected '${tokText(t)}'`, t.pos);
  return node;
}
