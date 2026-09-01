// Library of Calc III scenes. Entries: { head } section markers or examples.
import { resetColorCycle } from './colormaps.js';

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
    build(s) {
      for (const [n, v] of [['u1', 3], ['u2', 1], ['u3', 2], ['v1', 2], ['v2', 3], ['v3', 0]]) {
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
    build(s) {
      for (const [n, v] of [['a1', 3], ['a2', 0], ['a3', 1], ['b1', 1], ['b2', 2], ['b3', 0]]) {
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
    name: 'Lagrange multipliers',
    tab: 'Lagrange',
    sub: 'slide s along x²+y²=8 — at the extremes ∇f ∥ ∇g',
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
    name: 'Curve shadows',
    tab: 'Shadows',
    sub: 'a helix projected onto the three coordinate planes',
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
    name: 'Projectile motion',
    tab: 'Projectile',
    sub: 'watch v and a evolve along the flight',
    build(s) {
      s.addItem('curve', {
        ex: 't', ey: 't', ez: '4t - t^2',
        tMin: '0', tMax: '4', samples: 200, thick: 1.3,
        frame: true, framePlay: true, frameT: 0, showVA: true, showProj: true,
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
