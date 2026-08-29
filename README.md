# Graphite · 3D Graphing Calculator

A fast, beautiful 3D graphing calculator in the browser — CalcPlot3D's feature set with a
Desmos-quality interface. Built with [three.js](https://threejs.org) and Vite; the math engine
(expression parser, compiler, symbolic differentiation, marching cubes/squares) is dependency-free.

The graph renders in a graph-paper room: filled camera-aware walls with major/minor grids,
image-based studio lighting, soft floor shadows, crisp haloed tick labels, and an eased
camera flight home. The UI is a numbered Desmos-style expression list (Figtree + IBM Plex
Mono, one green accent, light & dark themes).

## Run it

```bash
npm install
npm run dev      # dev server
npm run build    # single-file production build in dist/index.html
node tests/run-all.mjs   # math-engine test suite
```

## Features

**Plot types**
- Function surfaces `z = f(x, y)` with adjustable domain and resolution
- Cylindrical `z = f(r, θ)` and spherical `ρ = f(θ, φ)` surfaces
- Parametric surfaces `x(u,v), y(u,v), z(u,v)`
- Space curves `x(t), y(t), z(t)` rendered as smooth tubes
- Implicit surfaces `F(x, y, z) = k` (marching cubes)
- 3D vector fields `⟨P, Q, R⟩` with magnitude-colored arrows
- Points, vectors, and labels

**Calculus tools**
- **Inspect mode** — click any function surface for the tangent plane, ∂f/∂x, ∂f/∂y
  (numeric *and* symbolic), gradient vector, normal, trace curves, directional derivative
  with an angle control, the second-derivative test (critical-point classification), and a
  quadratic (Taylor) approximation patch; click an implicit surface for ∇F + its tangent
  plane; click a vector field for F, div, curl, and the **flow line** through that point
- Movable **cross-section trace planes** (x = c, y = c, z = c) with the intersection curve
- **Riemann boxes** visualizing ∬ f dA with the midpoint sum and a fine estimate
- Domain restriction (plot only where g ≤ 0 — e.g. a disk instead of a square)
- Level curves (contours) on the surface, optionally projected to the floor as a topo map
- Moving TNB (Frenet) frame on space curves with velocity/acceleration vectors, the
  osculating circle, curvature κ, radius R = 1/κ, speed, and arc length — animatable
- Orthographic projection and red-cyan **anaglyph 3D** view modes, shareable scene links

**Interaction**
- Type math naturally: `sin(x)cos(y)`, `2pi`, `e^-x`, `√(x²+y²)`, `|x|`, `θ`, `ρ` all parse
- Use any new letter in an expression → one click turns it into an **animatable slider**
- Domain fields accept expressions (`-2pi`, `pi/2`)
- Colormaps (viridis, plasma, turbo, …) or solid colors, opacity, wireframe
- Dark/light theme, PNG export, example gallery, autosaved scenes
- Keyboard: `r` reset view, `i` inspect mode

## Architecture

```
src/
  math/       parser → AST → compiled JS + symbolic differentiation (no deps)
  geometry/   marching cubes & marching squares (no deps, tested)
  engine/     three.js viewport, camera-aware axes/grid walls
  plots/      per-type geometry builders + incremental rebuild manager
  ui/         expression panel, sliders, color pickers
  analysis/   click-to-inspect calculus overlays
```
