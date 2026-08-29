import './style.css';
import { AppState } from './state.js';
import { Viewport } from './engine/viewport.js';
import { PlotManager } from './plots/manager.js';
import { Panel } from './ui/panel.js';
import { Inspector } from './analysis/inspect.js';
import { EXAMPLES, DEFAULT_EXAMPLE, loadExample } from './examples.js';

const $ = (id) => document.getElementById(id);

const state = new AppState();

/* ---------- theme (before first paint of the viewport) ---------- */
function applyTheme() {
  if (state.settings.dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

/* ---------- share-link encoding ---------- */
function encodeShare() {
  const bytes = new TextEncoder().encode(JSON.stringify(state.toJSON()));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeShare(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ---------- load: share link > saved scene > intro example ---------- */
let loaded = false;
const shareMatch = /[#&]g=([A-Za-z0-9_-]+)/.exec(location.hash);
if (shareMatch) {
  try {
    loaded = state.loadJSON(decodeShare(shareMatch[1]));
    // viewing someone's link must not clobber this user's saved scene;
    // the first edit they make adopts it (state.touch re-enables saving)
    if (loaded) state.persist = false;
  } catch { /* bad link */ }
}
if (!loaded) {
  try {
    const raw = localStorage.getItem('graphite3d.v2');
    if (raw) loaded = state.loadJSON(JSON.parse(raw));
  } catch { /* fresh start */ }
}
applyTheme();

const viewport = new Viewport($('viewport'));
viewport.axisOptions = {
  grid: state.settings.grid, labels: state.settings.labels, box: state.settings.box,
};
viewport.setTheme(state.settings.dark);
viewport.setBounds(state.settings.bounds);
if (state.settings.ortho) viewport.setProjection('orthographic');
if (state.settings.anaglyph) viewport.setAnaglyph(true);
// the two view modes are mutually exclusive — mirror what the viewport kept
state.settings.ortho = !!viewport.camera.isOrthographicCamera;
state.settings.anaglyph = !!viewport.anaglyph;
const manager = new PlotManager(viewport, state);
const panel = new Panel(state, manager, {
  items: $('items'), addBtn: $('btn-add'), addMenu: $('add-menu'),
});
const inspector = new Inspector(viewport, state, manager, {
  card: $('inspect-card'), btn: $('btn-inspect'),
});

if (loaded && state.items.length) {
  panel.renderAll();
  state.rebuildAll();
} else {
  loadExample(state, DEFAULT_EXAMPLE);
}

/* ---------- examples menu ---------- */
{
  const menu = $('examples-menu');
  for (const ex of EXAMPLES) {
    if (ex.head) {
      const h = document.createElement('div');
      h.className = 'menu-head';
      h.textContent = ex.head;
      menu.appendChild(h);
      continue;
    }
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.innerHTML = `<span class="mi-text"><span class="mi-title">${ex.name}</span><span class="mi-sub">${ex.sub}</span></span>`;
    b.onclick = () => {
      menu.setAttribute('hidden', '');
      inspector.clear();
      loadExample(state, ex);
      viewport.resetView();
    };
    menu.appendChild(b);
  }
  const sep = document.createElement('div');
  sep.className = 'menu-sep';
  menu.appendChild(sep);
  const clearB = document.createElement('button');
  clearB.className = 'menu-item';
  clearB.innerHTML = `<span class="mi-text"><span class="mi-title">Clear graph</span><span class="mi-sub">remove everything</span></span>`;
  clearB.onclick = () => { menu.setAttribute('hidden', ''); inspector.clear(); state.clearAll(); };
  menu.appendChild(clearB);
  $('btn-examples').onclick = (e) => { e.stopPropagation(); menu.toggleAttribute('hidden'); };
}

/* ---------- top bar ---------- */
$('btn-theme').onclick = () => {
  state.settings.dark = !state.settings.dark;
  applyTheme();
  viewport.setTheme(state.settings.dark);
  state.rebuildAll(); // wireframe overlays & contour tints are theme-dependent
  state.save();
};

$('btn-shot').onclick = async () => {
  const blob = await viewport.screenshotBlob();
  if (!blob) return;
  // composite over the theme background so the PNG isn't transparent
  const img = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(cv.width * 0.3, cv.height * 0.2, 0, cv.width * 0.5, cv.height * 0.5, cv.width * 0.85);
  if (state.settings.dark) { grad.addColorStop(0, '#10141d'); grad.addColorStop(1, '#070a10'); }
  else { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#e9edf5'); }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0);
  cv.toBlob((out) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(out);
    a.download = 'graphite-3d.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Screenshot saved');
  }, 'image/png');
};

/* ---------- settings popover ---------- */
{
  const pop = $('settings-pop');
  function render() {
    const b = state.settings.bounds;
    pop.innerHTML = `
      <h3>Graph window</h3>
      <div class="set-grid">
        <span></span><span class="menu-head" style="padding:0;text-align:center">min</span><span class="menu-head" style="padding:0;text-align:center">max</span>
        ${['x', 'y', 'z'].map((ax) => `
          <span class="axl">${ax}</span>
          <input class="mini-input" data-b="${ax}min" value="${b[ax + 'min']}">
          <input class="mini-input" data-b="${ax}max" value="${b[ax + 'max']}">`).join('')}
      </div>
      <div class="set-rows">
        <label class="check-row"><input type="checkbox" data-s="grid" ${state.settings.grid ? 'checked' : ''}> Grid walls</label>
        <label class="check-row"><input type="checkbox" data-s="labels" ${state.settings.labels ? 'checked' : ''}> Axes & tick labels</label>
        <label class="check-row"><input type="checkbox" data-s="box" ${state.settings.box ? 'checked' : ''}> Bounding box</label>
        <label class="check-row"><input type="checkbox" data-s="ortho" ${state.settings.ortho ? 'checked' : ''}> Orthographic projection</label>
        <label class="check-row"><input type="checkbox" data-s="anaglyph" ${state.settings.anaglyph ? 'checked' : ''}> Anaglyph 3D (red-cyan glasses)</label>
        <button class="btn" data-apply style="justify-content:center">Apply</button>
        <button class="btn" data-share style="justify-content:center;background:var(--panel);color:var(--text-dim);border:1px solid var(--border-strong)">Copy share link</button>
      </div>`;
    pop.querySelector('[data-apply]').onclick = apply;
    pop.querySelector('[data-share]').onclick = async () => {
      const url = `${location.origin}${location.pathname}#g=${encodeShare()}`;
      try {
        await navigator.clipboard.writeText(url);
        toast('Share link copied');
      } catch {
        window.prompt('Copy this link:', url);
      }
      pop.hidden = true;
    };
    pop.querySelectorAll('.mini-input').forEach((inp) => {
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
    });
  }
  function apply() {
    const b = { ...state.settings.bounds };
    for (const inp of pop.querySelectorAll('[data-b]')) {
      const v = state.evalConst(inp.value, NaN);
      if (Number.isFinite(v)) b[inp.dataset.b] = v;
    }
    if (b.xmax <= b.xmin || b.ymax <= b.ymin || b.zmax <= b.zmin) { toast('min must be < max'); return; }
    for (const c of pop.querySelectorAll('[data-s]')) state.settings[c.dataset.s] = c.checked;
    state.settings.bounds = b;
    viewport.axisOptions = { grid: state.settings.grid, labels: state.settings.labels, box: state.settings.box };
    viewport.setBounds(b);
    viewport.setProjection(state.settings.ortho ? 'orthographic' : 'perspective');
    viewport.setAnaglyph(state.settings.anaglyph);
    // the setters enforce ortho/anaglyph exclusivity — keep settings truthful
    state.settings.ortho = !!viewport.camera.isOrthographicCamera;
    state.settings.anaglyph = !!viewport.anaglyph;
    state.rebuildAll();
    state.save();
    pop.hidden = true;
  }
  $('btn-settings').onclick = (e) => {
    e.stopPropagation();
    if (pop.hidden) render();
    pop.hidden = !pop.hidden;
  };
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !$('btn-settings').contains(e.target)) pop.hidden = true;
  });
}

/* ---------- HUD ---------- */
$('btn-inspect').addEventListener('click', () => {
  if (inspector.active) toast('Inspect on — click a surface, level surface, or vector field');
});
$('btn-home').onclick = () => viewport.resetView(true);
$('btn-zoom-in').onclick = () => viewport.zoomBy(0.78);
$('btn-zoom-out').onclick = () => viewport.zoomBy(1.28);

/* ---------- animation ticker: sliders & curve frames ---------- */
let lastT = performance.now();
viewport.addTicker(() => {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  let animating = false;
  for (const it of state.items) {
    if (it.type === 'slider' && it.playing) {
      animating = true;
      const range = it.max - it.min;
      if (range > 0) {
        const rate = (range / 6) * (it.speed || 1); // full sweep ≈ 6 s at 1×
        if (it.loop === 'loop') it.runtime._dir = 1; // loop always sweeps upward
        it.runtime._dir ??= 1;
        let v = it.value + rate * dt * it.runtime._dir;
        if (it.loop === 'loop') {
          if (v > it.max) v = it.min + (v - it.max);
        } else {
          if (v > it.max) { v = it.max - (v - it.max); it.runtime._dir = -1; }
          else if (v < it.min) { v = it.min + (it.min - v); it.runtime._dir = 1; }
        }
        state.setSliderValue(it.id, Math.max(it.min, Math.min(it.max, v)));
      }
    }
    if (it.type === 'curve' && it.frame && it.framePlay) {
      animating = true;
      it.frameT = (it.frameT + dt * 0.08) % 1;
      manager.updateFrame(it);
    }
  }
  return animating;
});

/* ---------- toast ---------- */
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- keyboard ---------- */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'r') viewport.resetView(true);
  if (e.key === 'i') inspector.toggle();
});
