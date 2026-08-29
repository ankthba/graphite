// Library of Calc III scenes. Entries: { head } section markers or examples.
import { resetColorCycle } from './colormaps.js';

export const EXAMPLES = [
  { head: 'Quadric surfaces' },
  {
    name: 'Elliptic paraboloid',
    sub: 'z = x²/4 + y²/4',
    build(s) {
      s.addItem('surface', { expr: 'x^2/4 + y^2/4', cmap: 'viridis', res: 100, contours: true, contourCount: 10 });
    },
  },
  {
    name: 'Hyperbolic paraboloid',
    sub: 'z = x²/8 − y²/8 · the saddle',
    build(s) {
      s.addItem('surface', { expr: 'x^2/8 - y^2/8', cmap: 'coolwarm', res: 100, contours: true, contourCount: 12 });
    },
  },
  {
    name: 'Hyperboloid of one sheet',
    sub: 'x²/4 + y²/4 − z²/9 = 1',
    build(s) {
      s.addItem('implicit', { expr: 'x^2/4 + y^2/4 - z^2/9', level: '1', res: 60, cmap: 'cool' });
    },
  },
  {
    name: 'Hyperboloid of two sheets',
    sub: 'z²/4 − x²/4 − y²/4 = 1',
    build(s) {
      s.addItem('implicit', { expr: 'z^2/4 - x^2/4 - y^2/4', level: '1', res: 60, cmap: 'sunset' });
    },
  },
  {
    name: 'Cone',
    sub: 'x² + y² − z² = 0',
    build(s) {
      s.addItem('implicit', { expr: 'x^2 + y^2 - z^2', level: '0', res: 60, cmap: 'plasma' });
    },
  },
  {
    name: 'Ellipsoid',
    sub: 'x²/16 + y²/9 + z²/4 = 1',
    build(s) {
      s.addItem('implicit', { expr: 'x^2/16 + y^2/9 + z^2/4', level: '1', res: 60, cmap: 'viridis' });
    },
  },

  { head: 'Partial derivatives & tangent planes' },
  {
    name: 'Tangent plane explorer',
    sub: 'turn on Inspect, then click the surface',
    build(s) {
      s.addItem('surface', { expr: '4 - (x^2 + y^2)/4', cmap: 'viridis', res: 100, contours: true, contourCount: 10 });
    },
  },
  {
    name: 'Cross sections',
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
    sub: 'z = (x³ − 3xy²)/10 · degenerate critical point',
    build(s) {
      s.addItem('surface', { expr: '(x^3 - 3x y^2)/10', cmap: 'magma', res: 100, contours: true, contourCount: 10 });
    },
  },
  {
    name: 'Traveling wave',
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
    sub: 'F = ⟨−y, x, 0⟩ · curl points along +z',
    build(s) {
      s.addItem('field', { ep: '-y', eq: 'x', er: '0', density: 8, cmap: 'turbo' });
    },
  },
  {
    name: 'Radial field',
    sub: 'F = ⟨x, y, z⟩ · constant divergence 3',
    build(s) {
      s.addItem('field', { ep: 'x', eq: 'y', er: 'z', density: 7, cmap: 'cool' });
    },
  },
  {
    name: 'Flow line of a field',
    sub: 'F = ⟨−y, x, 0.3⟩ · the helix satisfies r′(t) = F(r)',
    build(s) {
      s.addItem('field', { ep: '-y', eq: 'x', er: '0.3', density: 7, cmap: 'turbo', opacity: 0.85 });
      s.addItem('curve', {
        ex: '3cos(t)', ey: '3sin(t)', ez: '0.3t - 4',
        tMin: '0', tMax: '30', samples: 600, thick: 1.2,
      });
    },
  },

  { head: 'Other coordinate systems' },
  {
    name: 'Cylindrical wave',
    sub: 'z = 3sin(3r)/(1 + r/2)',
    build(s) {
      s.addItem('cylindrical', { expr: '3sin(3r)/(1 + r/2)', aMin: '0', aMax: '5', bMin: '0', bMax: '2pi', cmap: 'cool', res: 120 });
    },
  },
  {
    name: 'Spherical harmonic',
    sub: 'ρ = 3 + 0.8 sin(kθ) sin(3φ)',
    build(s) {
      s.addItem('spherical', { expr: '3 + 0.8sin(k theta)sin(3phi)', cmap: 'sunset', res: 130 });
      s.addItem('slider', { name: 'k', value: 5, min: 0, max: 12, step: 1 });
    },
  },
  {
    name: 'Surface of revolution',
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
