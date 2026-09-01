// Library of Calc III scenes. Entries: { head } section markers or examples.
// Exploration entries additionally carry `explore`: { note, rows(sliders),
// view2d? } — rendered as a live readout card by ui/explorecard.js.
import { resetColorCycle } from './colormaps.js';

const f2 = (x) => {
  const v = Math.round(x * 100) / 100;
  return String(v === 0 ? 0 : v);
};
const vec3 = (x, y, z) => `⟨${f2(x)}, ${f2(y)}, ${f2(z)}⟩`;
const degf = (r) => `${f2((r * 180) / Math.PI)}°`;

export const EXAMPLES = [
  { head: 'Quadric surfaces' },
  {
    name: 'Elliptic paraboloid',
    tab: 'Paraboloid',
    sub: 'z = x²/4 + y²/4',
    build(s) {
      s.addItem('surface', { expr: 'x^2/4 + y^2/4', cmap: 'viridis', res: 100, contours: true, contourCount: 10 });
    },
  },
  {
    name: 'Hyperbolic paraboloid',
    tab: 'Saddle',
    sub: 'z = x²/8 − y²/8 · the saddle',
    build(s) {
      s.addItem('surface', { expr: 'x^2/8 - y^2/8', cmap: 'coolwarm', res: 100, contours: true, contourCount: 12 });
    },
  },
  {
    name: 'Hyperboloid of one sheet',
    tab: 'Hyperboloid I',
    sub: 'x²/4 + y²/4 − z²/9 = 1',
    build(s) {
      s.addItem('implicit', { expr: 'x^2/4 + y^2/4 - z^2/9', level: '1', res: 60, cmap: 'cool' });
    },
  },
  {
    name: 'Hyperboloid of two sheets',
    tab: 'Hyperboloid II',
    sub: 'z²/4 − x²/4 − y²/4 = 1',
    build(s) {
      s.addItem('implicit', { expr: 'z^2/4 - x^2/4 - y^2/4', level: '1', res: 60, cmap: 'sunset' });
    },
  },
  {
    name: 'Cone',
    tab: 'Cone',
    sub: 'x² + y² − z² = 0',
    build(s) {
      s.addItem('implicit', { expr: 'x^2 + y^2 - z^2', level: '0', res: 60, cmap: 'plasma' });
    },
  },
  {
    name: 'Ellipsoid',
    tab: 'Ellipsoid',
    sub: 'x²/16 + y²/9 + z²/4 = 1',
    build(s) {
      s.addItem('implicit', { expr: 'x^2/16 + y^2/9 + z^2/4', level: '1', res: 60, cmap: 'viridis' });
    },
  },

  { head: 'Partial derivatives & tangent planes' },
  {
    name: 'Tangent plane explorer',
    tab: 'Tangent plane',
    sub: 'turn on Inspect, then click the surface',
    build(s) {
      s.addItem('surface', { expr: '4 - (x^2 + y^2)/4', cmap: 'viridis', res: 100, contours: true, contourCount: 10 });
    },
  },
  {
    name: 'Cross sections',
    tab: 'Cross sections',
    sub: 'movable trace plane y = c through a saddle',
    build(s) {
      s.addItem('surface', {
        expr: '(x^2 - y^2)/6', cmap: 'coolwarm', res: 100,
        section: 'y', sectionVal: 1,
      });
    },
  },
  {
    name: 'Level curves — sombrero',
    tab: 'Sombrero',
    sub: 'z = 4sin(r)/r with contours',
    build(s) {
      s.addItem('surface', {
        expr: '4sin(sqrt(x^2 + y^2)) / sqrt(x^2 + y^2)',
        cmap: 'plasma', res: 130, contours: true, contourCount: 14, contourFloor: false,
      });
    },
  },
  {
    name: 'Monkey saddle',
    tab: 'Monkey saddle',
    sub: 'z = (x³ − 3xy²)/10 · degenerate critical point',
    build(s) {
      s.addItem('surface', { expr: '(x^3 - 3x y^2)/10', cmap: 'magma', res: 100, contours: true, contourCount: 10 });
    },
  },
  {
    name: 'Traveling wave',
    tab: 'Wave',
    sub: 'animated with a slider',
    build(s) {
      s.addItem('surface', {
        expr: '3sin(sqrt(x^2 + y^2) - a) / (1 + 0.15(x^2 + y^2)) + 1.2cos(a/2)',
        cmap: 'viridis', res: 120,
      });
      s.addItem('slider', { name: 'a', value: 0, min: 0, max: 6.283, playing: true, speed: 0.8, loop: 'loop' });
    },
  },

  {
    name: 'Riemann boxes',
    tab: 'Riemann boxes',
    sub: 'midpoint boxes for ∬ f dA over the disk r ≤ 4',
    build(s) {
      s.addItem('surface', {
        expr: '3 - (x^2 + y^2)/8', aMin: '-4', aMax: '4', bMin: '-4', bMax: '4',
        cmap: 'viridis', res: 80, opacity: 0.45, riemann: true, riemannN: 10,
        restrict: 'x^2 + y^2 - 16',
      });
    },
  },
  {
    name: 'Restricted domain',
    tab: 'Disk domain',
    sub: 'paraboloid kept only where x² + y² ≤ 16',
    build(s) {
      s.addItem('surface', {
        expr: '4 - (x^2 + y^2)/4', cmap: 'magma', res: 130,
        restrict: 'x^2 + y^2 - 16',
      });
    },
  },

  { head: 'Space curves' },
  {
    name: 'Helix with TNB frame',
    tab: 'Helix',
    sub: 'moving frame, r′, r″, osculating circle',
    build(s) {
      s.addItem('curve', {
        ex: '3cos(t)', ey: '3sin(t)', ez: 't/2',
        tMin: '-4pi', tMax: '4pi', samples: 500, thick: 1.4,
        frame: true, framePlay: true, frameT: 0, showVA: true, showOsc: true,
      });
    },
  },
  {
    name: 'Trefoil knot',
    tab: 'Trefoil',
    sub: 'a closed space curve',
    build(s) {
      s.addItem('curve', {
        ex: '1.5(sin(t) + 2sin(2t))', ey: '1.5(cos(t) - 2cos(2t))', ez: '-1.5sin(3t)',
        tMin: '0', tMax: '2pi', samples: 600, thick: 1.6,
        frame: true, framePlay: false, frameT: 0.1,
      });
    },
  },

  { head: 'Vector fields' },
  {
    name: 'Rotational field',
    tab: 'Curl field',
    sub: 'F = ⟨−y, x, 0⟩ · curl points along +z',
    build(s) {
      s.addItem('field', { ep: '-y', eq: 'x', er: '0', density: 8, cmap: 'turbo' });
    },
  },
  {
    name: 'Radial field',
    tab: 'Radial field',
    sub: 'F = ⟨x, y, z⟩ · constant divergence 3',
    build(s) {
      s.addItem('field', { ep: 'x', eq: 'y', er: 'z', density: 7, cmap: 'cool' });
    },
  },
  {
    name: 'Flow line of a field',
    tab: 'Flow line',
    sub: 'F = ⟨−y, x, 0.3⟩ · the helix satisfies r′(t) = F(r)',
    build(s) {
      s.addItem('field', { ep: '-y', eq: 'x', er: '0.3', density: 7, cmap: 'turbo', opacity: 0.85 });
      s.addItem('curve', {
        ex: '3cos(t)', ey: '3sin(t)', ez: '0.3t - 4',
        tMin: '0', tMax: '30', samples: 600, thick: 1.2,
      });
    },
  },

  { head: 'Explorations' },
  {
    name: 'Dot product & projection',
    tab: 'Dot product',
    sub: 'drag u, v — proj_v(u) and the orthogonal part',
    explore: {
      view2d: 'top',
      note: 'u·v > 0 means θ is acute, 0 means perpendicular, < 0 obtuse. Green is proj_v(u); purple is the leftover part — always ⟂ v.',
      rows(S) {
        const [u1, u2, u3, v1, v2, v3] = ['u1', 'u2', 'u3', 'v1', 'v2', 'v3'].map((k) => S[k] ?? 0);
        const d = u1 * v1 + u2 * v2 + u3 * v3;
        const mu = Math.hypot(u1, u2, u3), mv = Math.hypot(v1, v2, v3);
        const th = mu && mv ? Math.acos(Math.min(1, Math.max(-1, d / (mu * mv)))) : NaN;
        return [
          ['u · v', f2(d)],
          ['|u|, |v|', `${f2(mu)}, ${f2(mv)}`],
          ['angle θ', Number.isNaN(th) ? '—' : degf(th)],
          ['comp_v u = u·v/|v|', mv ? f2(d / mv) : '—'],
        ];
      },
    },
    build(s) {
      for (const [n, v] of [['u1', 3], ['u2', 1], ['u3', 0], ['v1', 2], ['v2', 3], ['v3', 0]]) {
        s.addItem('slider', { name: n, value: v, min: -4, max: 4, step: 0.1 });
      }
      const dot = '(u1 v1 + u2 v2 + u3 v3)/(v1^2 + v2^2 + v3^2)';
      s.addItem('vector', { ex: 'u1', ey: 'u2', ez: 'u3', color: '#e15759' });
      s.addItem('vector', { ex: 'v1', ey: 'v2', ez: 'v3', color: '#4e79a7' });
      s.addItem('vector', {
        ex: `${dot} v1`, ey: `${dot} v2`, ez: `${dot} v3`, color: '#59a14f',
      });
      s.addItem('vector', {
        ox: `${dot} v1`, oy: `${dot} v2`, oz: `${dot} v3`,
        ex: `u1 - ${dot} v1`, ey: `u2 - ${dot} v2`, ez: `u3 - ${dot} v3`, color: '#b07aa1',
      });
    },
  },
  {
    name: 'Cross product',
    tab: 'Cross product',
    sub: 'u×v ⟂ both — parallelogram area = |u×v|',
    explore: {
      view2d: 'top',
      note: 'The green vector u×v is perpendicular to the yellow parallelogram spanned by u and v, and its length equals the area.',
      rows(S) {
        const [a1, a2, a3, b1, b2, b3] = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map((k) => S[k] ?? 0);
        const w = [a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1];
        const mw = Math.hypot(...w);
        const d = a1 * b1 + a2 * b2 + a3 * b3;
        return [
          ['u × v', vec3(...w)],
          ['|u × v| = area', f2(mw)],
          ['angle θ', mw || d ? degf(Math.atan2(mw, d)) : '—'],
          ['(u×v) · u', f2(w[0] * a1 + w[1] * a2 + w[2] * a3)],
        ];
      },
    },
    build(s) {
      for (const [n, v] of [['a1', 3], ['a2', 1], ['a3', 0], ['b1', 1], ['b2', 2], ['b3', 0]]) {
        s.addItem('slider', { name: n, value: v, min: -4, max: 4, step: 0.1 });
      }
      s.addItem('vector', { ex: 'a1', ey: 'a2', ez: 'a3', color: '#e15759' });
      s.addItem('vector', { ex: 'b1', ey: 'b2', ez: 'b3', color: '#4e79a7' });
      s.addItem('vector', {
        ex: 'a2 b3 - a3 b2', ey: 'a3 b1 - a1 b3', ez: 'a1 b2 - a2 b1', color: '#59a14f',
      });
      s.addItem('parametric', {
        ex: 'u a1 + v b1', ey: 'u a2 + v b2', ez: 'u a3 + v b3',
        aMin: '0', aMax: '1', bMin: '0', bMax: '1',
        res: 24, cmap: '', color: '#edc948', opacity: 0.45, clip: false,
      });
    },
  },
  {
    name: 'Two planes intersect',
    tab: 'Two planes',
    sub: 'x + y + z = 2 and x − y + 2z = 1 meet in a line',
    explore: {
      note: 'The planes are not parallel (n₁ × n₂ ≠ 0), so they must meet in a line — its direction is n₁ × n₂.',
      rows: () => [
        ['n₁', '⟨1, 1, 1⟩'],
        ['n₂', '⟨1, −1, 2⟩'],
        ['n₁ × n₂ (line dir)', '⟨3, −1, −2⟩'],
        ['angle between planes', '61.9°'],
      ],
    },
    build(s) {
      s.addItem('parametric', {
        ex: 'u', ey: 'v', ez: '2 - u - v',
        aMin: '-4', aMax: '4', bMin: '-4', bMax: '4',
        res: 30, cmap: '', color: '#4e79a7', opacity: 0.5, clip: true,
      });
      s.addItem('parametric', {
        ex: 'u', ey: 'v', ez: '(1 - u + v)/2',
        aMin: '-4', aMax: '4', bMin: '-4', bMax: '4',
        res: 30, cmap: '', color: '#76b7b2', opacity: 0.5, clip: true,
      });
      s.addItem('curve', {
        ex: '3 - 3t', ey: 't', ez: '2t - 1',
        tMin: '-0.66', tMax: '2.66', samples: 60, thick: 1.3, color: '#e15759',
      });
    },
  },
  {
    name: 'Lagrange multipliers',
    tab: 'Lagrange',
    sub: 'slide s along x²+y²=8 — at the extremes ∇f ∥ ∇g',
    explore: {
      view2d: 'top',
      note: 'The two λ estimates agree exactly at the constrained extremes (s = π/4, 3π/4, …) — there ∇f is parallel to ∇g.',
      rows(S) {
        const s0 = S.s ?? 0;
        const x = 2 * Math.SQRT2 * Math.cos(s0), y = 2 * Math.SQRT2 * Math.sin(s0);
        return [
          ['f(P) = xy/4', f2((x * y) / 4)],
          ['λ from fₓ = λgₓ', Math.abs(x) < 0.02 ? '—' : f2(y / (8 * x))],
          ['λ from f_y = λg_y', Math.abs(y) < 0.02 ? '—' : f2(x / (8 * y))],
        ];
      },
    },
    build(s) {
      s.addItem('surface', {
        expr: 'x y/4', aMin: '-4.5', aMax: '4.5', bMin: '-4.5', bMax: '4.5',
        cmap: 'coolwarm', res: 110, opacity: 0.85, contours: true, contourCount: 12,
      });
      s.addItem('curve', {
        ex: '2sqrt(2)cos(t)', ey: '2sqrt(2)sin(t)', ez: '-4.97',
        tMin: '0', tMax: '2pi', samples: 240, thick: 0.8, color: '#9c755f',
      });
      s.addItem('curve', {
        ex: '2sqrt(2)cos(t)', ey: '2sqrt(2)sin(t)', ez: 'sin(2t)',
        tMin: '0', tMax: '2pi', samples: 300, thick: 1.1, color: '#59a14f',
      });
      s.addItem('slider', { name: 's', value: 0.3, min: 0, max: 6.283, step: 0.01 });
      s.addItem('point', {
        ex: '2sqrt(2)cos(s)', ey: '2sqrt(2)sin(s)', ez: 'sin(2s)', label: 'P',
      });
      s.addItem('vector', {
        ox: '2sqrt(2)cos(s)', oy: '2sqrt(2)sin(s)', oz: '-4.97',
        ex: 'sqrt(2)sin(s)', ey: 'sqrt(2)cos(s)', ez: '0', color: '#f28e2b',
      });
      s.addItem('vector', {
        ox: '2sqrt(2)cos(s)', oy: '2sqrt(2)sin(s)', oz: '-4.97',
        ex: '2sqrt(2)cos(s)', ey: '2sqrt(2)sin(s)', ez: '0', color: '#76b7b2',
      });
    },
  },
  {
    name: 'Line meets plane',
    tab: 'Line & plane',
    sub: 'r(t) = ⟨t, 2t−1, t+1⟩ pierces x + y + z = 3 at P',
    explore: {
      note: 'Substitute r(t) into the plane equation: t + (2t − 1) + (t + 1) = 3 gives 4t = 3, so the line hits at t = 0.75.',
      rows: () => [
        ['n (plane)', '⟨1, 1, 1⟩'],
        ['v (line dir)', '⟨1, 2, 1⟩'],
        ['n · v', '4 ≠ 0 → one hit'],
        ['P = r(0.75)', '(0.75, 0.5, 1.75)'],
      ],
    },
    build(s) {
      s.addItem('parametric', {
        ex: 'u', ey: 'v', ez: '3 - u - v',
        aMin: '-4', aMax: '4', bMin: '-4', bMax: '4',
        res: 30, cmap: '', color: '#76b7b2', opacity: 0.5, clip: true,
      });
      s.addItem('curve', {
        ex: 't', ey: '2t - 1', ez: 't + 1',
        tMin: '-2.5', tMax: '2.5', samples: 120, thick: 1.2, color: '#e15759',
      });
      s.addItem('point', { ex: '0.75', ey: '0.5', ez: '1.75', label: 'P', color: '#edc948' });
    },
  },
  {
    name: 'Velocity & acceleration',
    tab: 'Velocity',
    sub: 'projectile r(t) = ⟨t, t, 4t − t²⟩ with v and a',
    explore: {
      note: 'Acceleration is the constant ⟨0, 0, −2⟩ — gravity. Watch v tip forward over the arc; speed is smallest at the apex T = 2.',
      rows(S) {
        const T = S.T ?? 0;
        return [
          ['r(T)', vec3(T, T, 4 * T - T * T)],
          ['v = r′(T)', vec3(1, 1, 4 - 2 * T)],
          ['speed |v|', f2(Math.hypot(1, 1, 4 - 2 * T))],
          ['a = r″', '⟨0, 0, −2⟩'],
        ];
      },
    },
    build(s) {
      s.addItem('curve', {
        ex: 't', ey: 't', ez: '4t - t^2',
        tMin: '0', tMax: '4', samples: 200, thick: 1.3, showProj: true,
      });
      s.addItem('slider', { name: 'T', value: 0.5, min: 0, max: 4, step: 0.01, playing: true, speed: 0.6 });
      s.addItem('point', { ex: 'T', ey: 'T', ez: '4T - T^2', label: 'P', size: 1.1 });
      s.addItem('vector', { ox: 'T', oy: 'T', oz: '4T - T^2', ex: '1', ey: '1', ez: '4 - 2T', color: '#59a14f' });
      s.addItem('vector', { ox: 'T', oy: 'T', oz: '4T - T^2', ex: '0', ey: '0', ez: '-2', color: '#f28e2b' });
    },
  },
  {
    name: 'Domain of f(x, y)',
    tab: 'Domain',
    sub: 'f = √(y − x²) lives only where y ≥ x²',
    explore: {
      view2d: 'top',
      note: 'Outside the red parabola the square root is imaginary, so the surface simply is not there. The 2D view shows the domain region.',
      rows: () => [
        ['f(x, y)', '√(y − x²)'],
        ['domain', 'y ≥ x²'],
        ['boundary', 'y = x² (red)'],
      ],
    },
    build(s) {
      s.addItem('surface', { expr: 'sqrt(y - x^2)', cmap: 'viridis', res: 120 });
      s.addItem('curve', {
        ex: 't', ey: 't^2', ez: '-4.97',
        tMin: '-2.23', tMax: '2.23', samples: 120, thick: 1.1, color: '#e15759',
      });
    },
  },
  {
    name: 'Transformations',
    tab: 'Transform',
    sub: 'z = a·sin(x − h) cos(y − k) + c',
    explore: {
      note: 'a stretches the surface vertically, h and k slide it in x and y, c lifts it. The gray wireframe ghost is the original sin(x)cos(y).',
      rows: (S) => [
        ['a (stretch)', f2(S.a ?? 1)],
        ['h, k (shift)', `${f2(S.h ?? 0)}, ${f2(S.k ?? 0)}`],
        ['c (lift)', f2(S.c ?? 0)],
      ],
    },
    build(s) {
      s.addItem('slider', { name: 'a', value: 1, min: -3, max: 3, step: 0.05 });
      s.addItem('slider', { name: 'h', value: 0, min: -3, max: 3, step: 0.05 });
      s.addItem('slider', { name: 'k', value: 0, min: -3, max: 3, step: 0.05 });
      s.addItem('slider', { name: 'c', value: 0, min: -3, max: 3, step: 0.05 });
      s.addItem('surface', {
        expr: 'sin(x)cos(y)', cmap: '', color: '#bab0ac', opacity: 0.25, res: 48, wire: true,
      });
      s.addItem('surface', { expr: 'a*sin(x - h)cos(y - k) + c', cmap: 'coolwarm', res: 100 });
    },
  },
  {
    name: 'Cycloid',
    tab: 'Cycloid',
    sub: 'a point on a rolling wheel traces a cycloid',
    explore: {
      view2d: 'front',
      note: 'The wheel rolls without slipping, so the distance rolled always equals the arc in contact. One full arch has length 8r = 8.',
      rows(S) {
        const s0 = S.s ?? 0;
        return [
          ['wheel angle s', f2(s0)],
          ['P', `(${f2(s0 - Math.sin(s0) - 3)}, ${f2(1 - Math.cos(s0))})`],
          ['distance rolled', f2(s0)],
          ['arch length', '8r = 8'],
        ];
      },
    },
    build(s) {
      s.addItem('curve', {
        ex: 't - sin(t) - 3', ey: '0', ez: '1 - cos(t)',
        tMin: '0', tMax: '2pi', samples: 240, thick: 1.1, color: '#4e79a7',
      });
      s.addItem('slider', { name: 's', value: 0.6, min: 0, max: 6.283, step: 0.01, playing: true, speed: 0.8 });
      s.addItem('curve', {
        ex: 's - 3 + sin(t)', ey: '0', ez: '1 + cos(t)',
        tMin: '0', tMax: '2pi', samples: 90, thick: 0.8, color: '#9c755f',
      });
      s.addItem('vector', { ox: 's - 3', oy: '0', oz: '1', ex: '-sin(s)', ey: '0', ez: '-cos(s)', color: '#e15759' });
      s.addItem('point', { ex: 's - sin(s) - 3', ey: '0', ez: '1 - cos(s)', label: 'P', color: '#e15759' });
    },
  },
  {
    name: 'Synchronized curves',
    tab: 'Synced curves',
    sub: 'same speed, half the radius — twice around',
    explore: {
      view2d: 'top',
      note: 'Both runners move at speed 3, but the inner circle is half as long — the inner runner finishes two laps per outer lap.',
      rows(S) {
        const s0 = S.s ?? 0;
        return [
          ['P₁ (outer)', vec3(3 * Math.cos(s0), 3 * Math.sin(s0), 0)],
          ['P₂ (inner)', vec3(1.5 * Math.cos(2 * s0), 1.5 * Math.sin(2 * s0), 0)],
          ['|v₁|, |v₂|', '3, 3'],
          ['periods', '2π and π'],
        ];
      },
    },
    build(s) {
      s.addItem('curve', { ex: '3cos(t)', ey: '3sin(t)', ez: '0', tMin: '0', tMax: '2pi', samples: 160, thick: 1, color: '#4e79a7' });
      s.addItem('curve', { ex: '1.5cos(2t)', ey: '1.5sin(2t)', ez: '0', tMin: '0', tMax: 'pi', samples: 160, thick: 1, color: '#f28e2b' });
      s.addItem('slider', { name: 's', value: 0, min: 0, max: 6.283, step: 0.01, playing: true, speed: 0.7 });
      s.addItem('point', { ex: '3cos(s)', ey: '3sin(s)', ez: '0', label: 'P1', color: '#4e79a7' });
      s.addItem('point', { ex: '1.5cos(2s)', ey: '1.5sin(2s)', ez: '0', label: 'P2', color: '#f28e2b' });
      s.addItem('vector', { ox: '3cos(s)', oy: '3sin(s)', oz: '0', ex: '-3sin(s)', ey: '3cos(s)', ez: '0', color: '#4e79a7' });
      s.addItem('vector', { ox: '1.5cos(2s)', oy: '1.5sin(2s)', oz: '0', ex: '-3sin(2s)', ey: '3cos(2s)', ez: '0', color: '#f28e2b' });
    },
  },
  {
    name: 'Curve shadows',
    tab: 'Shadows',
    sub: 'a helix projected onto the three coordinate planes',
    explore: {
      note: 'Projecting deletes one coordinate: the floor shadow is the circle x² + y² = 9, and both wall shadows are sinusoids.',
      rows: () => [
        ['curve', '⟨3cos t, 3sin t, t/2⟩'],
        ['floor (xy)', 'circle, r = 3'],
        ['walls (xz, yz)', 'sine waves'],
      ],
    },
    build(s) {
      s.addItem('curve', {
        ex: '3cos(t)', ey: '3sin(t)', ez: 't/2',
        tMin: '-4pi', tMax: '4pi', samples: 500, thick: 1.4, showProj: true,
      });
    },
  },
  {
    name: 'Line integral fence',
    tab: 'Fence',
    sub: 'fence under f along C — its area is ∫ f ds',
    explore: {
      note: 'The fence stands on the path C and reaches up to the surface z = f(x, y). Its area is the scalar line integral ∫_C f ds.',
      rows() {
        let L = 0, I = 0;
        const n = 2000;
        for (let i = 0; i < n; i++) {
          const t = -4 + (8 * (i + 0.5)) / n;
          const ds = Math.hypot(1, Math.cos(t / 2)) * (8 / n);
          L += ds;
          I += (4 - (t * t + 4 * Math.sin(t / 2) ** 2) / 6) * ds;
        }
        return [
          ['path length ∫ ds', f2(L)],
          ['fence area ∫_C f ds', f2(I)],
          ['fence height', 'f(x, y) over the path'],
        ];
      },
    },
    build(s) {
      s.addItem('surface', {
        expr: '4 - (x^2 + y^2)/6', cmap: 'viridis', res: 90, opacity: 0.3,
      });
      s.addItem('parametric', {
        ex: 'u', ey: '2sin(u/2)', ez: 'v(4 - (u^2 + 4sin(u/2)^2)/6)',
        aMin: '-4', aMax: '4', bMin: '0', bMax: '1',
        res: 70, cmap: '', color: '#f28e2b', opacity: 0.85, clip: false,
      });
      s.addItem('curve', {
        ex: 't', ey: '2sin(t/2)', ez: '-4.97',
        tMin: '-4', tMax: '4', samples: 160, thick: 0.9, color: '#9c755f',
      });
    },
  },
  {
    name: 'Flux through a cylinder',
    tab: 'Flux',
    sub: 'radial field through the wall x² + y² = 4',
    explore: {
      view2d: 'top',
      note: 'On the wall the outward normal is ⟨x, y, 0⟩/2, so F·n = (x² + y²)/4 = 1 everywhere — the flux is just the wall area.',
      rows: () => [
        ['F', '⟨x/2, y/2, 0⟩'],
        ['F · n on the wall', '1'],
        ['wall area', '2π·2·6 = 24π'],
        ['flux ∬ F·n dS', '24π ≈ 75.4'],
      ],
    },
    build(s) {
      s.addItem('field', { ep: 'x/2', eq: 'y/2', er: '0', density: 6, scale: 1, cmap: 'turbo' });
      s.addItem('parametric', {
        ex: '2cos(u)', ey: '2sin(u)', ez: 'v',
        aMin: '0', aMax: '2pi', bMin: '-3', bMax: '3',
        res: 48, cmap: '', color: '#76b7b2', opacity: 0.45, clip: false,
      });
    },
  },
  {
    name: 'Volume of revolution',
    tab: 'Revolution',
    sub: 'sweep y = x²/8 + 1 around the x-axis',
    explore: {
      note: 'Drag w to sweep the red profile curve around the x-axis. Disk method: V = π ∫ r(x)² dx with r = x²/8 + 1.',
      rows(S) {
        const w = S.w ?? 0;
        return [
          ['swept angle w', `${f2(w)} rad (${f2((w / (2 * Math.PI)) * 100)}%)`],
          ['radius r(x)', 'x²/8 + 1'],
          ['V = π ∫ r² dx', '≈ 78.75'],
        ];
      },
    },
    build(s) {
      s.addItem('slider', { name: 'w', value: 4.5, min: 0.05, max: 6.283, step: 0.01 });
      s.addItem('curve', {
        ex: 't', ey: '0', ez: 't^2/8 + 1',
        tMin: '-4', tMax: '4', samples: 120, thick: 1.2, color: '#e15759',
      });
      s.addItem('parametric', {
        ex: 'u', ey: '(u^2/8 + 1)sin(v)', ez: '(u^2/8 + 1)cos(v)',
        aMin: '-4', aMax: '4', bMin: '0', bMax: 'w',
        res: 80, cmap: 'viridis', opacity: 0.9, clip: false,
      });
    },
  },
  {
    name: 'Double Ferris wheel',
    tab: 'Ferris wheel',
    sub: 'a seat on a wheel spinning on a spinning arm',
    explore: {
      view2d: 'front',
      note: 'The blue arm turns once while the orange wheel spins five times — the seat P traces the looping curve.',
      rows(S) {
        const s0 = S.s ?? 0;
        const px = 2.5 * Math.cos(s0) + 1.2 * Math.cos(5 * s0);
        const pz = 2.5 * Math.sin(s0) + 1.2 * Math.sin(5 * s0);
        const vx = -2.5 * Math.sin(s0) - 6 * Math.sin(5 * s0);
        const vz = 2.5 * Math.cos(s0) + 6 * Math.cos(5 * s0);
        return [
          ['seat P', `(${f2(px)}, ${f2(pz)})`],
          ['arm angle', f2(s0)],
          ['wheel angle', f2(5 * s0)],
          ['speed |v|', f2(Math.hypot(vx, vz))],
        ];
      },
    },
    build(s) {
      s.addItem('curve', {
        ex: '2.5cos(t) + 1.2cos(5t)', ey: '0', ez: '2.5sin(t) + 1.2sin(5t)',
        tMin: '0', tMax: '2pi', samples: 500, thick: 1, color: '#bab0ac',
      });
      s.addItem('slider', { name: 's', value: 0, min: 0, max: 6.283, step: 0.01, playing: true, speed: 0.5 });
      s.addItem('vector', { ex: '2.5cos(s)', ey: '0', ez: '2.5sin(s)', color: '#4e79a7' });
      s.addItem('vector', {
        ox: '2.5cos(s)', oy: '0', oz: '2.5sin(s)',
        ex: '1.2cos(5s)', ey: '0', ez: '1.2sin(5s)', color: '#f28e2b',
      });
      s.addItem('point', {
        ex: '2.5cos(s) + 1.2cos(5s)', ey: '0', ez: '2.5sin(s) + 1.2sin(5s)', label: 'P', color: '#e15759',
      });
    },
  },

  { head: 'Other coordinate systems' },
  {
    name: 'Cylindrical wave',
    tab: 'Ripple',
    sub: 'z = 3sin(3r)/(1 + r/2)',
    build(s) {
      s.addItem('cylindrical', { expr: '3sin(3r)/(1 + r/2)', aMin: '0', aMax: '5', bMin: '0', bMax: '2pi', cmap: 'cool', res: 120 });
    },
  },
  {
    name: 'Spherical harmonic',
    tab: 'Harmonic',
    sub: 'ρ = 3 + 0.8 sin(kθ) sin(3φ)',
    build(s) {
      s.addItem('spherical', { expr: '3 + 0.8sin(k theta)sin(3phi)', cmap: 'sunset', res: 130 });
      s.addItem('slider', { name: 'k', value: 5, min: 0, max: 12, step: 1 });
    },
  },
  {
    name: 'Surface of revolution',
    tab: "Gabriel's horn",
    sub: "Gabriel's horn: z = 2/r revolved about the z-axis",
    build(s) {
      s.addItem('cylindrical', {
        expr: '2/r - 3', aMin: '0.25', aMax: '5', bMin: '0', bMax: '2pi',
        cmap: 'cool', res: 120,
      });
    },
  },

  { head: 'Showpieces' },
  {
    name: 'Torus',
    tab: 'Torus',
    sub: 'parametric surface',
    build(s) {
      s.addItem('parametric', {
        ex: '(3 + cos(v))cos(u)', ey: '(3 + cos(v))sin(u)', ez: 'sin(v)',
        aMin: '0', aMax: '2pi', bMin: '0', bMax: '2pi', cmap: 'cool', res: 110,
      });
    },
  },
  {
    name: 'Gyroid',
    tab: 'Gyroid',
    sub: 'cos x sin y + cos y sin z + cos z sin x = 0',
    build(s) {
      s.addItem('implicit', {
        expr: 'cos(x)sin(y) + cos(y)sin(z) + cos(z)sin(x)', level: '0',
        res: 60, cmap: 'turbo',
      });
    },
  },
  {
    name: 'Wave interference',
    tab: 'Interference',
    sub: 'two sources, animated',
    build(s) {
      s.addItem('surface', {
        expr: '1.5sin(3sqrt((x-2)^2 + y^2) - w) + 1.5sin(3sqrt((x+2)^2 + y^2) - w)',
        cmap: 'coolwarm', res: 140,
      });
      s.addItem('slider', { name: 'w', value: 0, min: 0, max: 6.283, playing: true, speed: 1.4, loop: 'loop' });
    },
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES.find((e) => e.name === 'Level curves — sombrero');

export function loadExample(state, ex) {
  state.clearAll();
  resetColorCycle();
  ex.build(state);
  state.rebuildAll();
  state.save();
}
