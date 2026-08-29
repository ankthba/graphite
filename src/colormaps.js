// Color utilities + scientific colormaps (sampled stops, lerped in sRGB).

function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

const STOPS = {
  viridis: ['#440154','#472c7a','#3b518b','#2c718e','#21918c','#28ae80','#5ec962','#addc30','#fde725'],
  plasma:  ['#0d0887','#5601a4','#8f0da4','#b83289','#db5c68','#f48849','#febd2a','#f0f921'],
  magma:   ['#000004','#1c1044','#4f127b','#812581','#b5367a','#e55064','#fb8861','#fec287','#fcfdbf'],
  turbo:   ['#30123b','#4145ab','#4675ed','#39a2fc','#1bcfd4','#24eca6','#61fc6c','#a4fc3b','#d1e834','#f3c63a','#fe9b2d','#f36315','#d93806','#b11901','#7a0402'],
  cool:    ['#2b1e8e','#3f5bd6','#4f9df0','#63d3e4','#8ff0d2','#d9fbe8'],
  sunset:  ['#355070','#6d597a','#b56576','#e56b6f','#eaac8b','#ffd97d'],
  coolwarm:['#3b4cc0','#6f91f2','#a9c5fc','#dddddd','#f6b69b','#e6745b','#b40426'],
};

const cache = {};
export function colormap(name) {
  if (cache[name]) return cache[name];
  const stops = (STOPS[name] || STOPS.viridis).map(hex2rgb);
  const fn = (t, out) => {
    t = t < 0 ? 0 : t > 1 ? 1 : (Number.isFinite(t) ? t : 0);
    const x = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const f = x - i, a = stops[i], b = stops[i + 1];
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + (b[2] - a[2]) * f;
    return out;
  };
  cache[name] = fn;
  return fn;
}

export const COLORMAP_NAMES = Object.keys(STOPS);

// CSS gradient preview for the picker UI
export function colormapCSS(name) {
  return `linear-gradient(90deg, ${(STOPS[name] || STOPS.viridis).join(',')})`;
}

// Item accent colors (for curves, points, fields, solid surfaces)
export const PALETTE = [
  '#5b8def', '#e8604c', '#3fbf7f', '#b06ae0', '#f2a03d',
  '#38bdd4', '#ee5f9a', '#9fce3a', '#8b7cf6', '#e0b432',
  '#4fc1e9', '#fc6e51', '#48cfad', '#ec87c0', '#a0d468',
  '#f5d76e', '#c86b85', '#7bc8a4', '#7986cb', '#90a4ae',
];
let pi = 0;
export function nextColor() { return PALETTE[pi++ % 10]; }
export function resetColorCycle() { pi = 0; }
