// src/math/compiler.js — Graphite 3D expression engine: AST → fast JS.
//
// compile(node, params) flattens the whole tree into a single JS expression
// string and builds one plain function via `new Function` — the hot path does
// zero tree-walking, zero allocation, and calls only Math.* / helper fns.
//
// Power semantics ('^' and pow): plain JS Math.pow. For x < 0 with a
// non-integer exponent the result is NaN (no real-odd-root magic here);
// cbrt is the exception and handles negatives: cbrt(-8) = -2.
// Division by zero yields ±Infinity (JS default). NaN propagates everywhere.

import { FUNCTIONS, HELPERS } from './builtins.js';

/** Sorted unique variable names appearing in the tree. */
export function freeVars(node) {
  const s = new Set();
  (function walk(n) {
    switch (n.t) {
      case 'var': s.add(n.name); return;
      case 'op': walk(n.a); walk(n.b); return;
      case 'neg': walk(n.a); return;
      case 'call': for (const a of n.args) walk(a); return;
      default: return; // 'num'
    }
  })(node);
  return [...s].sort();
}

function numLit(v) {
  if (Number.isFinite(v)) {
    // Parenthesize negatives (and -0) so they are safe in any operand slot.
    return v < 0 || Object.is(v, -0) ? `(${v === 0 ? '-0' : String(v)})` : String(v);
  }
  if (Number.isNaN(v)) return 'NaN';
  return v > 0 ? 'Infinity' : '(-Infinity)';
}

function checkArity(name, spec, n) {
  const [lo, hi] = Array.isArray(spec.arity) ? spec.arity : [spec.arity, spec.arity];
  if (n < lo || n > hi) {
    throw new Error(`Function '${name}' expects ${lo === hi ? lo : `${lo}..${hi}`} argument(s), got ${n}`);
  }
}

function gen(n, idx, params) {
  switch (n.t) {
    case 'num':
      return numLit(n.v);
    case 'var': {
      const k = idx.get(n.name);
      if (k === undefined) {
        throw new Error(
          `Cannot compile: variable '${n.name}' is not among the parameters [${params.join(', ')}]`
        );
      }
      return 'v' + k;
    }
    case 'op': {
      const a = gen(n.a, idx, params);
      const b = gen(n.b, idx, params);
      switch (n.op) {
        case '+': return `(${a}+${b})`;
        case '-': return `(${a}-${b})`;
        case '*': return `(${a}*${b})`;
        case '/': return `(${a}/${b})`;
        case '^': return `Math.pow(${a},${b})`;
        default: throw new Error(`Cannot compile: unknown operator '${n.op}'`);
      }
    }
    case 'neg':
      return `(-${gen(n.a, idx, params)})`;
    case 'call': {
      const spec = FUNCTIONS[n.name];
      if (!spec) throw new Error(`Cannot compile: unknown function '${n.name}'`);
      checkArity(n.name, spec, n.args.length);
      return `${spec.js}(${n.args.map((x) => gen(x, idx, params)).join(',')})`;
    }
    default:
      throw new Error(`Cannot compile: unknown node type '${n && n.t}'`);
  }
}

/**
 * Compile an AST into (…nums) => number. `params` gives the argument order,
 * e.g. compile(node, ['x','y']) → f(xValue, yValue). Any variable in the tree
 * that is not listed in params throws a (plain) Error at compile time.
 */
export function compile(node, params) {
  const ps = params || [];
  const idx = new Map();
  ps.forEach((p, k) => idx.set(p, k));
  const body = gen(node, idx, ps);
  const argList = ps.map((_, k) => 'v' + k).join(',');
  // Close over the helpers so calls resolve as plain identifiers — no
  // per-invocation binding or wrapper call.
  const factory = new Function('H', `"use strict";return function(${argList}){return ${body};};`);
  return factory(HELPERS);
}

// ---------------------------------------------------------------------------
// Tree-walk evaluation (the flexible-but-slower path)
// ---------------------------------------------------------------------------

// canonical name -> actual JS function, resolved once from the `js` templates.
const CALLS = Object.create(null);
for (const [name, spec] of Object.entries(FUNCTIONS)) {
  CALLS[name] = spec.js.startsWith('H.') ? HELPERS[spec.js.slice(2)] : Math[spec.js.slice(5)];
}

/** Evaluate a tree directly against a scope object {varName: value}. */
export function evalNode(node, scope) {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'var': {
      const v = scope[node.name];
      if (typeof v !== 'number') {
        throw new Error(`evalNode: variable '${node.name}' is missing from the scope`);
      }
      return v;
    }
    case 'op': {
      const a = evalNode(node.a, scope);
      const b = evalNode(node.b, scope);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '^': return Math.pow(a, b);
        default: throw new Error(`evalNode: unknown operator '${node.op}'`);
      }
    }
    case 'neg':
      return -evalNode(node.a, scope);
    case 'call': {
      const f = CALLS[node.name];
      if (!f) throw new Error(`evalNode: unknown function '${node.name}'`);
      const as = node.args;
      switch (as.length) {
        case 1: return f(evalNode(as[0], scope));
        case 2: return f(evalNode(as[0], scope), evalNode(as[1], scope));
        default: {
          const vals = new Array(as.length);
          for (let k = 0; k < as.length; k++) vals[k] = evalNode(as[k], scope);
          return f(...vals);
        }
      }
    }
    default:
      throw new Error(`evalNode: unknown node type '${node && node.t}'`);
  }
}
