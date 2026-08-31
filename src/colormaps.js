// Colormaps sampled from the canonical sources (matplotlib listed data,
// Google's turbo, Moreland-style Lab-interpolated coolwarm) at 32 stops.
// Curve/point palette is based on the Tableau 10 standard.

function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

const STOPS = {
  viridis: ['#440154','#470d60','#48186a','#482475','#472e7c','#453882','#424186','#3e4c8a','#3a548c','#365d8d','#32658e','#2e6d8e','#2b758e','#287d8e','#25848e','#228c8d','#1f948c','#1e9c89','#20a386','#25ab82','#2eb37c','#3aba76','#48c16e','#58c765','#69cd5b','#7fd34e','#93d741','#a8db34','#bddf26','#d5e21a','#eae51a','#fde725'],
  plasma: ['#0d0887','#220690','#310597','#41049d','#4e02a2','#5b01a5','#6700a8','#7501a8','#8104a7','#8d0ba5','#9814a0','#a21d9a','#ad2793','#b6308b','#bf3984','#c7427c','#cf4c74','#d6556d','#dd5e66','#e3685f','#e97257','#ef7c51','#f3874a','#f79143','#fa9c3c','#fca934','#fdb52e','#fdc229','#fcce25','#f9dd25','#f5eb27','#f0f921'],
  magma: ['#000004','#030312','#0a0822','#140e36','#1e1149','#2a115c','#38106c','#471078','#54137d','#601880','#6d1d81','#792282','#882781','#942c80','#a1307e','#ae347b','#bd3977','#ca3e72','#d6456c','#e24d66','#ec5860','#f3655c','#f8745c','#fb835f','#fd9266','#fea36f','#feb27a','#fec185','#fecf92','#fde0a1','#fceeb0','#fcfdbf'],
  inferno: ['#000004','#040312','#0b0724','#160b39','#230c4c','#310a5c','#3e0966','#4d0d6c','#5a116e','#67166e','#741a6e','#801f6c','#8f2469','#9b2964','#a82e5f','#b43359','#c13a50','#cc4248','#d74b3f','#e05536','#e9612b','#ef6e21','#f57b17','#f8890c','#fb9706','#fca80d','#fbb81d','#f9c72f','#f6d746','#f2e865','#f3f586','#fcffa4'],
  turbo: ['#30123b','#392a73','#4040a2','#4559cb','#476ee6','#4682f8','#4196ff','#33adf7','#25c0e7','#1ad2d2','#18e0bd','#22ebaa','#3cf58e','#59fb73','#79fe59','#96fe44','#affa37','#c3f134','#d7e535','#e7d739','#f5c53a','#fcb336','#fe9e2f','#fc8725','#f76f1a','#ed5510','#e2430a','#d43305','#c32503','#ac1701','#950d01','#7a0403'],
  cividis: ['#00224e','#00285b','#002e6a','#083370','#1c396f','#293f6e','#33446d','#3d4a6c','#45506c','#4d556c','#555b6d','#5c616e','#646770','#6b6d72','#727274','#787877','#807f78','#888578','#908b78','#979177','#a09875','#a89e73','#b0a571','#b9ab6d','#c1b26a','#cbb965','#d3c05f','#dcc859','#e5cf52','#efd748','#f8df3c','#fee838'],
  coolwarm: ['#3b4cc0','#4a54c2','#585dc4','#6666c7','#716fc9','#7b78cb','#8580cc','#908bcf','#9a94d0','#a39dd2','#aca6d4','#b5afd5','#bebad7','#c7c4d9','#cfcdda','#d8d7dc','#ddd6d5','#ddcbc9','#ddbfbc','#dcb4b0','#dba7a2','#d99c96','#d7918a','#d5857f','#d27a73','#ce6c67','#cb605c','#c75451','#c34646','#be363a','#b92430','#b40426'],
  cool: ['#00ffff','#08f7ff','#10efff','#19e6ff','#21deff','#29d6ff','#31ceff','#3ac5ff','#42bdff','#4ab5ff','#52adff','#5aa5ff','#639cff','#6b94ff','#738cff','#7b84ff','#847bff','#8c73ff','#946bff','#9c63ff','#a55aff','#ad52ff','#b54aff','#bd42ff','#c53aff','#ce31ff','#d629ff','#de21ff','#e619ff','#ef10ff','#f708ff','#ff00ff'],
};

// legacy keys from older saved scenes
const ALIASES = { sunset: 'inferno' };

export const DISPLAY_NAMES = {
  viridis: 'Viridis', plasma: 'Plasma', magma: 'Magma', inferno: 'Inferno',
  turbo: 'Turbo', cividis: 'Cividis', coolwarm: 'Cool–warm', cool: 'Cool',
};

const cache = {};
export function colormap(name) {
  name = ALIASES[name] || name;
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

// CSS gradient preview for the picker UI (16 sampled stops keep it smooth)
export function colormapCSS(name) {
  name = ALIASES[name] || name;
  const s = STOPS[name] || STOPS.viridis;
  const picked = [];
  for (let i = 0; i < 16; i++) picked.push(s[Math.round((i / 15) * (s.length - 1))]);
  return `linear-gradient(90deg, ${picked.join(',')})`;
}

// Item accent colors — Tableau 10, then softened variants for longer scenes
export const PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#86b8e0', '#ffbe7d', '#ff9d9a', '#a5d8d3', '#8cd17d',
  '#f1ce63', '#d4a6c8', '#fabfd2', '#d7b5a6', '#d3cec9',
];
let pi = 0;
export function nextColor() { return PALETTE[pi++ % 10]; }
export function resetColorCycle() { pi = 0; }
