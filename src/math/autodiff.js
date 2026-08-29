// src/math/autodiff.js — Graphite 3D expression engine: symbolic derivative,
// simplifier, and pretty-printer.
//
// derivative(node, varName): symbolic differentiation followed by simplify().
//
// Rules for the non-smooth builtins (documented choices):
//   abs'   = sign(u)·u'                (subgradient; 0 at u = 0 via sign(0)=0)
//   floor' = ceil' = round' = sign' = 0  (derivative almost everywhere)
//   min/max: chain rule on the currently-active (smooth) branch, expressed
//            with sign() weights: d min(a,b) = w·a' + (1−w)·b' where
//            w = (1 + sign(b−a))/2 — a' where a < b, b' where a > b, and the
//            average of both exactly at a tie. n-ary folds right:
//            min(a,b,c) = min(a, min(b,c)).
//   mod(a,b) = a − b·floor(a/b), so on the smooth parts
//            d mod = a' − floor(a/b)·b' (floor' contributes 0).
//   hypot' = (Σ aᵢ·aᵢ') / hypot(a₁,…)
//
// simplify() folds constants (only when the result is finite, so 1/0 or 0/0
// stay symbolic and NaN/Infinity semantics survive round-trips) and removes:
// x*1, 1*x, x*0, 0*x, x+0, 0+x, x-0, 0-x, x^1, x^0, 0/x, x/1, neg(neg(x)),
// ±1 factors, and any op/call whose operands are all numeric. It also floats
// numeric factors to the left of '*' so products print as "2x", not "x*2".
//
// toString() prints normal math notation with minimal parens — "2x + sin(3x)",
// "x^2/(y + 1)" — and is round-trip safe: parse(toString(n)) evaluates
// identically to n. Multiplication rendering rules that guarantee this:
//   · numeric right factor  → explicit '*'  ("x*2", never "x2" which is a var)
//   · numeric left  factor  → adjacency     ("2x", "2sin(x)", "2(x + 1)")
//   · everything else       → a space       ("x y", "p i" — never "pi"!)

import { FUNCTIONS } from './builtins.js';
import { evalNode } from './compiler.js';

// -------------------------- tiny node constructors -------------------------

const num = (v) => ({ t: 'num', v });
const add = (a, b) => ({ t: 'op', op: '+', a, b });
const sub = (a, b) => ({ t: 'op', op: '-', a, b });
const mul = (a, b) => ({ t: 'op', op: '*', a, b });
const div = (a, b) => ({ t: 'op', op: '/', a, b });
const pow = (a, b) => ({ t: 'op', op: '^', a, b });
const neg = (a) => ({ t: 'neg', a });
const call = (name, args) => ({ t: 'call', name, args });

const isNum = (n, v) => n.t === 'num' && n.v === v;

// -------------------------------- simplify ---------------------------------

const EMPTY_SCOPE = Object.freeze({});

function evalOp(op, a, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '^': return Math.pow(a, b);
  }
  return NaN;
}

export function simplify(node) {
  switch (node.t) {
    case 'num':
    case 'var':
      return node;
    case 'neg': {
      const a = simplify(node.a);
      if (a.t === 'num') return num(-a.v);
      if (a.t === 'neg') return a.a;
      return neg(a);
    }
    case 'op': {
      const a = simplify(node.a);
      const b = simplify(node.b);
      const op = node.op;
      if (a.t === 'num' && b.t === 'num') {
        const v = evalOp(op, a.v, b.v);
        if (Number.isFinite(v)) return num(v);
      }
      switch (op) {
        case '+':
          if (isNum(a, 0)) return b;
          if (isNum(b, 0)) return a;
          break;
        case '-':
          if (isNum(b, 0)) return a;
          if (isNum(a, 0)) return simplify(neg(b));
          break;
        case '*':
          if (isNum(a, 0) || isNum(b, 0)) return num(0);
          if (isNum(a, 1)) return b;
          if (isNum(b, 1)) return a;
          if (isNum(a, -1)) return simplify(neg(b));
          if (isNum(b, -1)) return simplify(neg(a));
          // Float numeric coefficients left: x*2 → 2*x (prints as "2x").
          if (b.t === 'num' && a.t !== 'num') return mul(b, a);
          break;
        case '/':
          if (isNum(a, 0)) return num(0);
          if (isNum(b, 1)) return a;
          break;
        case '^':
          if (isNum(b, 1)) return a;
          if (isNum(b, 0)) return num(1);
          break;
      }
      return { t: 'op', op, a, b };
    }
    case 'call': {
      const args = node.args.map(simplify);
      const out = { t: 'call', name: node.name, args };
      if (args.every((x) => x.t === 'num')) {
        const v = evalNode(out, EMPTY_SCOPE);
        if (Number.isFinite(v)) return num(v);
      }
      return out;
    }
    default:
      return node;
  }
}

// --------------------------- coefficient collection ------------------------
// Folds numeric factors through */ /neg chains so results display naturally:
// 4*2x/16 → x/2,  -1*(3x)/6 → -(x/2). Value-preserving (up to float assoc).

const isInt = (v) => Number.isFinite(v) && Math.abs(v - Math.round(v)) < 1e-12;

function prod(list) {
  if (!list.length) return num(1);
  return list.reduce((acc, n) => mul(acc, n));
}

function collect(node) {
  switch (node.t) {
    case 'num':
    case 'var':
      return node;
    case 'neg': {
      const a = collect(node.a);
      if (a.t === 'num') return num(-a.v);
      if (a.t === 'neg') return a.a;
      return neg(a);
    }
    case 'call':
      return call(node.name, node.args.map(collect));
    case 'op': {
      if (node.op === '*' || node.op === '/') {
        const numer = [], denom = [];
        let coef = 1;
        let bad = false;
        (function walk(n, top) {
          if (bad) return;
          if (n.t === 'neg') { coef = -coef; walk(n.a, top); return; }
          if (n.t === 'op' && n.op === '*') { walk(n.a, top); walk(n.b, top); return; }
          if (n.t === 'op' && n.op === '/') { walk(n.a, top); walk(n.b, !top); return; }
          const c = collect(n);
          if (c.t === 'num') {
            coef = top ? coef * c.v : coef / c.v;
            if (!Number.isFinite(coef)) bad = true;
            return;
          }
          if (c.t === 'neg') { coef = -coef; (top ? numer : denom).push(c.a); return; }
          (top ? numer : denom).push(c);
        })(node, true);
        if (bad) return { t: 'op', op: node.op, a: collect(node.a), b: collect(node.b) };
        if (coef === 0) return num(0);
        const negOut = coef < 0;
        const mag = Math.abs(coef);
        let N, D = denom.length ? prod(denom) : null;
        if (mag === 1) {
          N = prod(numer);
        } else if (!isInt(mag) && isInt(1 / mag) && numer.length) {
          // e.g. 0.5 → put 2 in the denominator: x/2
          D = D ? mul(num(Math.round(1 / mag)), D) : num(Math.round(1 / mag));
          N = prod(numer);
        } else {
          N = numer.length ? mul(num(mag), prod(numer)) : num(mag);
        }
        let out = D ? div(N, D) : N;
        if (negOut) out = neg(out);
        return out;
      }
      const a = collect(node.a);
      const b = collect(node.b);
      if (a.t === 'num' && b.t === 'num') {
        const v = evalOp(node.op, a.v, b.v);
        if (Number.isFinite(v)) return num(v);
      }
      return { t: 'op', op: node.op, a, b };
    }
    default:
      return node;
  }
}

// ------------------------------- derivative --------------------------------

export function derivative(node, varName) {
  return simplify(collect(simplify(d(simplify(node), varName))));
}

function d(n, x) {
  switch (n.t) {
    case 'num':
      return num(0);
    case 'var':
      return num(n.name === x ? 1 : 0);
    case 'neg':
      return neg(d(n.a, x));
    case 'op': {
      const { a, b } = n;
      switch (n.op) {
        case '+': return add(d(a, x), d(b, x));
        case '-': return sub(d(a, x), d(b, x));
        case '*': return add(mul(d(a, x), b), mul(a, d(b, x)));
        case '/': return div(sub(mul(d(a, x), b), mul(a, d(b, x))), pow(b, num(2)));
        case '^': return dPow(a, b, x);
      }
      throw new Error(`derivative: unknown operator '${n.op}'`);
    }
    case 'call':
      return dCall(n, x);
    default:
      throw new Error(`derivative: unknown node type '${n && n.t}'`);
  }
}

function dPow(a, b, x) {
  if (b.t === 'num') {
    // d(u^c) = c·u^(c−1)·u'
    return mul(mul(num(b.v), pow(a, num(b.v - 1))), d(a, x));
  }
  if (a.t === 'num') {
    // d(c^v) = c^v·ln(c)·v'
    return mul(mul(pow(a, b), num(Math.log(a.v))), d(b, x));
  }
  // d(u^v) = u^v·(v'·ln(u) + v·u'/u)
  return mul(pow(a, b), add(mul(d(b, x), call('ln', [a])), div(mul(b, d(a, x)), a)));
}

function dMinMax(args, x, which) {
  // Fold right: min(a,b,c) = min(a, min(b,c)); differentiate the active branch.
  const [a, ...rest] = args;
  const b = rest.length === 1 ? rest[0] : call(which, rest);
  const diff = which === 'min' ? sub(b, a) : sub(a, b); // positive where `a` is active
  const w = div(add(num(1), call('sign', [diff])), num(2));
  return add(mul(w, d(a, x)), mul(sub(num(1), w), d(b, x)));
}

function dCall(n, x) {
  const A = n.args;
  const u = A[0];
  const du = () => d(u, x);
  switch (n.name) {
    case 'sin': return mul(call('cos', [u]), du());
    case 'cos': return neg(mul(call('sin', [u]), du()));
    case 'tan': return div(du(), pow(call('cos', [u]), num(2)));
    case 'sec': return mul(mul(call('sec', [u]), call('tan', [u])), du());
    case 'csc': return neg(mul(mul(call('csc', [u]), call('cot', [u])), du()));
    case 'cot': return neg(div(du(), pow(call('sin', [u]), num(2))));
    case 'asin': return div(du(), call('sqrt', [sub(num(1), pow(u, num(2)))]));
    case 'acos': return neg(div(du(), call('sqrt', [sub(num(1), pow(u, num(2)))])));
    case 'atan': return div(du(), add(num(1), pow(u, num(2))));
    case 'atan2': {
      const [y0, x0] = A; // atan2(y, x)
      return div(sub(mul(d(y0, x), x0), mul(d(x0, x), y0)), add(pow(x0, num(2)), pow(y0, num(2))));
    }
    case 'sinh': return mul(call('cosh', [u]), du());
    case 'cosh': return mul(call('sinh', [u]), du());
    case 'tanh': return div(du(), pow(call('cosh', [u]), num(2)));
    case 'asinh': return div(du(), call('sqrt', [add(pow(u, num(2)), num(1))]));
    case 'acosh': return div(du(), call('sqrt', [sub(pow(u, num(2)), num(1))]));
    case 'atanh': return div(du(), sub(num(1), pow(u, num(2))));
    case 'sqrt': return div(du(), mul(num(2), call('sqrt', [u])));
    case 'cbrt': return div(du(), mul(num(3), pow(call('cbrt', [u]), num(2))));
    case 'exp': return mul(call('exp', [u]), du());
    case 'ln': return div(du(), u);
    case 'log': return div(du(), mul(u, num(Math.LN10)));
    case 'log2': return div(du(), mul(u, num(Math.LN2)));
    case 'abs': return mul(call('sign', [u]), du());
    case 'floor':
    case 'ceil':
    case 'round':
    case 'sign':
      return num(0);
    case 'min': return dMinMax(A, x, 'min');
    case 'max': return dMinMax(A, x, 'max');
    case 'mod': {
      const [a, b] = A;
      return sub(d(a, x), mul(call('floor', [div(a, b)]), d(b, x)));
    }
    case 'hypot': {
      let s = null;
      for (const ai of A) {
        const term = mul(ai, d(ai, x));
        s = s ? add(s, term) : term;
      }
      return div(s, call('hypot', A));
    }
    case 'pow': return dPow(A[0], A[1], x);
    default:
      throw new Error(`derivative: no rule for function '${n.name}'`);
  }
}

// -------------------------------- toString ---------------------------------

// Printing precedence tiers (match the parser):
//   + -   → 10;  * / → 20;  neg (and negative literals) → 30;  ^ → 40;
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

function fmtNum(v) {
  if (Number.isNaN(v)) return '(0/0)';
  if (v === Infinity) return '(1/0)';
  if (v === -Infinity) return '(-1/0)';
  if (Object.is(v, -0)) return '0';
  if (v === Math.E) return 'e';           // named constants re-tokenize to the
  if (v === Math.PI) return 'pi';         // same values, and read like math
  if (v === 2 * Math.PI) return 'tau';
  return String(v); // String() output ("1000", "2.5e-7", "1e+30") re-tokenizes fine
}

export function toString(node) {
  return str(node);
}

function str(n) {
  switch (n.t) {
    case 'num': return fmtNum(n.v);
    case 'var': return n.name;
    case 'neg': {
      const s = str(n.a);
      // Only +/- operands need parens: -(x + y); "-x^2" re-parses as -(x^2). ✓
      return prec(n.a) < 20 ? `-(${s})` : `-${s}`;
    }
    case 'call': return `${n.name}(${n.args.map(str).join(', ')})`;
    case 'op': return strOp(n);
    default: return String(n);
  }
}

function strOp(n) {
  const { op, a, b } = n;
  const pa = prec(a);
  const pb = prec(b);
  switch (op) {
    case '+': {
      if (b.t === 'neg') {
        const rs = prec(b.a) <= 10 ? `(${str(b.a)})` : str(b.a);
        return `${str(a)} - ${rs}`; // a + (-c) → "a - c"
      }
      if (b.t === 'num' && b.v < 0) return `${str(a)} - ${fmtNum(-b.v)}`;
      return `${str(a)} + ${str(b)}`;
    }
    case '-': {
      if (b.t === 'num' && b.v < 0) return `${str(a)} + ${fmtNum(-b.v)}`;
      const rs = pb <= 10 ? `(${str(b)})` : str(b); // a - (b + c), a - (b - c)
      return `${str(a)} - ${rs}`;
    }
    case '*': {
      const ls = pa < 20 ? `(${str(a)})` : str(a);
      const rs = pb < 20 ? `(${str(b)})` : str(b);
      const c0 = rs[0];
      let sep;
      if ((c0 >= '0' && c0 <= '9') || c0 === '.' || c0 === '-') sep = '*';
      else if (a.t === 'num' && !/[a-z]$/i.test(ls)) sep = ''; // "2x", "2sin(x)", "2(x + 1)" — but "pi cos(x)"
      else sep = ' '; // "x y", "x sin(x)" — a space keeps "p i" from becoming "pi"
      return ls + sep + rs;
    }
    case '/': {
      const ls = pa < 20 ? `(${str(a)})` : str(a);
      const rs = pb <= 20 ? `(${str(b)})` : str(b); // x/(y + 1), x/(y z), x/(a/b)
      return `${ls}/${rs}`;
    }
    case '^': {
      const ls = pa <= 40 ? `(${str(a)})` : str(a); // (x^2)^3, (-2)^2, (2x)^3
      const rs = pb < 40 ? `(${str(b)})` : str(b); // right-assoc: 2^3^2 needs none
      return `${ls}^${rs}`;
    }
    default:
      return `${str(a)}${op}${str(b)}`;
  }
}
