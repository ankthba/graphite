// src/math/builtins.js — Graphite 3D expression engine: builtin registry.
//
// Shared by parser.js (name recognition), compiler.js (code generation and
// tree-walk evaluation) and autodiff.js (derivative rules / constant folding).
// Plain ES module, zero dependencies.

// Named constants recognized by the parser. `π` and `pi` both map to
// CONSTANTS.pi, `τ`/`tau` to CONSTANTS.tau, `e` to CONSTANTS.e. The parser
// substitutes their numeric value directly (they become {t:'num'} nodes).
export const CONSTANTS = { pi: Math.PI, tau: 2 * Math.PI, e: Math.E };

// FUNCTIONS: canonical name -> { arity, js }
//   arity : a number, or [min, max] for variadic functions.
//   js    : a JS expression template; generated code calls `${js}(a, b, …)`.
//           'Math.*' resolves against the global Math object; 'H.*' resolves
//           against HELPERS below (passed into compiled functions as `H`).
//
// Notes on semantics:
//   log  = base-10 logarithm (Math.log10); ln = natural log (Math.log).
//   pow  = plain JS Math.pow: pow(x, y) with x < 0 and non-integer y is NaN.
//          The one escape hatch for real odd roots of negatives is cbrt,
//          which handles negative inputs (cbrt(-8) = -2).
//   mod  = Python-style modulo: result carries the sign of b (see HELPERS.mod).
export const FUNCTIONS = {
  sin:   { arity: 1, js: 'Math.sin' },
  cos:   { arity: 1, js: 'Math.cos' },
  tan:   { arity: 1, js: 'Math.tan' },
  sec:   { arity: 1, js: 'H.sec' },
  csc:   { arity: 1, js: 'H.csc' },
  cot:   { arity: 1, js: 'H.cot' },
  asin:  { arity: 1, js: 'Math.asin' },
  acos:  { arity: 1, js: 'Math.acos' },
  atan:  { arity: 1, js: 'Math.atan' },
  atan2: { arity: 2, js: 'Math.atan2' },
  sinh:  { arity: 1, js: 'Math.sinh' },
  cosh:  { arity: 1, js: 'Math.cosh' },
  tanh:  { arity: 1, js: 'Math.tanh' },
  asinh: { arity: 1, js: 'Math.asinh' },
  acosh: { arity: 1, js: 'Math.acosh' },
  atanh: { arity: 1, js: 'Math.atanh' },
  sqrt:  { arity: 1, js: 'Math.sqrt' },
  cbrt:  { arity: 1, js: 'Math.cbrt' },
  exp:   { arity: 1, js: 'Math.exp' },
  ln:    { arity: 1, js: 'Math.log' },    // natural log
  log:   { arity: 1, js: 'Math.log10' },  // base-10 log (alias: log10)
  log2:  { arity: 1, js: 'Math.log2' },
  abs:   { arity: 1, js: 'Math.abs' },
  floor: { arity: 1, js: 'Math.floor' },
  ceil:  { arity: 1, js: 'Math.ceil' },
  round: { arity: 1, js: 'Math.round' },
  sign:  { arity: 1, js: 'Math.sign' },
  min:   { arity: [2, 8], js: 'Math.min' },
  max:   { arity: [2, 8], js: 'Math.max' },
  mod:   { arity: 2, js: 'H.mod' },
  hypot: { arity: [2, 8], js: 'Math.hypot' },
  pow:   { arity: 2, js: 'Math.pow' },
};

// Spelling aliases accepted by the parser and normalized to canonical names.
// (The AST only ever contains canonical names.)
export const ALIASES = {
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  log10: 'log',
};

// Helper implementations referenced as H.<name> in compiled code.
export const HELPERS = {
  sec: (x) => 1 / Math.cos(x),
  csc: (x) => 1 / Math.sin(x),
  cot: (x) => Math.cos(x) / Math.sin(x),
  // Python-style modulo: result matches the sign of b.
  //   mod(5, 3) = 2, mod(-5, 3) = 1, mod(5, -3) = -1, mod(-5, -3) = -2.
  // ((a % b) + b) % b is exact for finite inputs (no floor round-off) and the
  // trailing % b folds any -0 into +0 on exact multiples.
  mod: (a, b) => ((a % b) + b) % b,
};
