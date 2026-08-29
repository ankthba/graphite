# Module Contracts — Graphite 3D (3D graphing calculator)

All modules are plain-JS ES modules (`export` syntax), zero dependencies unless noted.
Follow these contracts EXACTLY — other modules are being written against them in parallel.

## AST node format (shared by parser/compiler/autodiff)

```js
Node :=
  { t:'num',  v:number }
| { t:'var',  name:string }                       // e.g. 'x','y','z','t','u','v','theta','phi','rho','a','a1'
| { t:'op',   op:'+'|'-'|'*'|'/'|'^', a:Node, b:Node }
| { t:'neg',  a:Node }
| { t:'call', name:string, args:Node[] }          // name is a canonical builtin name from builtins.js
```

## src/math/builtins.js

```js
export const CONSTANTS = { pi: Math.PI, tau: 2*Math.PI, e: Math.E };
// FUNCTIONS: canonical name -> { arity: number|[min,max], js: string }
// `js` is a JS expression template callable as `${js}(a,b)` in generated code,
// e.g. 'Math.sin' or a helper name like 'H.sec' (helpers live in export const HELPERS = {...}).
export const FUNCTIONS = { ... };
export const HELPERS = { sec: x=>1/Math.cos(x), ... };   // referenced as H.<name> in compiled code
```

Required functions (canonical names): sin cos tan sec csc cot asin acos atan atan2
sinh cosh tanh asinh acosh atanh sqrt cbrt exp ln log log2 abs floor ceil round sign
min max mod hypot pow.
Aliases accepted by the PARSER and normalized to canonical: arcsin→asin, arccos→acos,
arctan→atan, log10→log. `log` means log base 10, `ln` natural log.
min/max accept arity [2,8]. mod(a,b) must match the sign of b (Python-style).

## src/math/parser.js

```js
export class ParseError extends Error { constructor(message, pos) }  // pos = char index in input
export function parse(src) -> Node   // throws ParseError
```

Grammar rules:
- Operators: `+ - * / ^`, `^` is RIGHT-associative. Precedence: `+,-` < `*,/` < unary minus < `^` < postfix.
  So `-x^2` parses as `-(x^2)`; `2^3^2` = `2^(3^2)` = 512; `-2^2` = -4; `(-2)^2` = 4.
- Unary minus/plus allowed anywhere a primary can start.
- Implicit multiplication: adjacency of two primaries multiplies. `2x`, `x y`, `2(x+1)`,
  `(x+1)(x-1)`, `2sin(x)`, `x pi` all work. `xy` tokenizes as x*y (see identifier rule).
- Identifier rule (tokenizer): longest match against (function names ∪ aliases ∪ constant names
  ∪ greek words: theta, phi, rho). Anything else is split into SINGLE LETTERS, each optionally
  followed by digits (`a1`, `x2` are single variables). So `xy` → vars x,y (implicit mult);
  `asin(x)` → the function; `theta` → one var.
- Function application REQUIRES parens: `sin(x)`. `sin x` is a ParseError with a helpful message.
- `|expr|` means abs(expr). Nesting like `|x|y||` is not required to work; simple non-nested and
  one-level-nested-via-parens `|x*|y||`… keep it simple: support non-nested `|...|`; inside it
  parens can contain more `| |`.
- Unicode: `π`→pi, `τ`→tau, `θ`→theta, `φ`/`ϕ`→phi, `ρ`→rho, `·`/`×`→`*`, `−`→`-`, `÷`→`/`,
  `√`→sqrt applied to the following primary (`√x`, `√(x+1)` both work), `²`→`^2`, `³`→`^3`.
- Numbers: `2`, `2.5`, `.5`, `1e3`, `2.5e-2`.
- Empty/whitespace-only input → ParseError.
- Unknown multi-letter identifiers should error mentioning the name.

## src/math/compiler.js

```js
export function freeVars(node) -> string[]        // sorted unique var names in the tree
export function compile(node, params) -> (...nums)=>number
// params: string[] — argument order. Uses new Function for speed; builtin calls map via
// builtins FUNCTIONS[name].js; helpers passed in as H. A var not in params -> compile error (throw Error).
export function evalNode(node, scope) -> number   // scope: {name: value}; tree-walk eval
```

`^` compiles to Math.pow BUT with real-cube-root semantics for negative bases with
odd-denominator rational exponents is NOT required — instead: `pow(x, y)` where x<0 and y
is a non-integer returns NaN (default JS). EXCEPTION: cbrt handles negatives. Document this.
Division by zero → ±Infinity (JS default). NaN propagates.

## src/math/autodiff.js

```js
export function derivative(node, varName) -> Node   // symbolic, then simplified
export function simplify(node) -> Node
export function toString(node) -> string            // minimal parens, '·'-free plain text like "2x + sin(x)"
```

Derivative rules for ALL builtins (abs' = sign, floor/ceil/round/sign' = 0, min/max/mod/hypot:
may return derivative via subgradient/chain on the smooth parts or 0 — document choice).
Simplify must fold constants and eliminate: `x*1, 1*x, x*0, 0*x, x+0, 0+x, x-0, x^1, x^0,
0/x, neg(neg(x)), num ops on two nums`. toString must round-trip through parse:
`parse(toString(n))` evaluates identically (spot-checkable numerically).

## src/geometry/implicit.js  (pure math, NO three.js imports)

```js
export function marchingCubes(f, opts) -> { positions: Float32Array, normals: Float32Array }
// f: (x,y,z) => number (may return NaN)
// opts: { xmin,xmax,ymin,ymax,zmin,zmax, nx,ny,nz, level=0 }
// Triangle soup: positions.length = 9*numTris. normals: per-vertex, unit length, computed by
// central differences of f at each output vertex (h = cell size * 0.5), oriented toward DECREASING f
// … wait: orient toward INCREASING f is the gradient; surface normal should point toward f>level side:
// use  n = normalize(grad f)  (points toward increasing f). Consistent winding: triangles CCW when
// viewed from the n side. Cells containing any NaN corner are skipped. Edge vertices are linearly
// interpolated to the level crossing. Standard 256-entry edge/tri tables.
```

## src/geometry/contours.js  (pure math, NO three.js imports)

```js
export function marchingSquares(f, opts) -> Array<{ level:number, paths: Float32Array[] }>
// f: (x,y) => number (may return NaN); opts: { xmin,xmax,ymin,ymax, nx,ny, levels:number[] }
// Each path is [x0,y0, x1,y1, ...] (a polyline, ≥2 points). Segments from adjacent cells that share
// endpoints (within 1e-9 of cell size) MUST be joined into long polylines; closed loops should
// close (first==last point). Cells with NaN corners skipped. Saddle cells: resolve via center average.
```

## Testing requirement (for module authors)

Write `tests/test-<module>.mjs`, run with `node tests/test-<module>.mjs`, exit code 0 on pass,
console.log a summary. Cover the examples given above in the grammar/derivative specs, plus:
- parser: precedence table cases, implicit mult cases, unicode, errors (positions sane)
- compiler: numeric spot checks incl. atan2/mod/min-max arity
- autodiff: d/dx of 20 assorted expressions checked NUMERICALLY against central differences
  at several sample points (tolerance 1e-5 relative), toString round-trip numeric equality
- implicit: unit sphere f=x²+y²+z²-1 on [-1.6,1.6]³ res 40 → every vertex within 0.02 of radius 1;
  total triangle area within 3% of 4π; every normal within 3° of radial direction; a NaN-region f
  (sqrt of negative) does not crash or emit NaN positions
- contours: f=x²+y² levels [0.25,1] → vertices within 0.01 of the true circles, loops closed;
  paths joined (few long paths, not hundreds of 2-point segments)
