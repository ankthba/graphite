import './style.css';
import '@vscode/codicons/dist/codicon.css';
import { AppState } from './state.js';
import { Viewport } from './engine/viewport.js';
import { PlotManager } from './plots/manager.js';
import { Panel } from './ui/panel.js';
import { Inspector } from './analysis/inspect.js';
import { ExploreCard } from './ui/explorecard.js';
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

/* ---------- scene tabs (workspaces) ---------- */
const SCENES_KEY = 'graphite3d.scenes';
let sceneSeq = 1;
const newSceneId = () => `sc${sceneSeq++}.${Math.random().toString(36).slice(2, 7)}`;

function loadScenesStore() {
  try {
    const s = JSON.parse(localStorage.getItem(SCENES_KEY));
    if (s && s.scenes && Array.isArray(s.order) && s.order.length) {
      sceneSeq = s.order.length + 1;
      return s;
    }
  } catch { /* fresh */ }
  // migrate the old single-scene key
  let data = null;
  try { data = JSON.parse(localStorage.getItem('graphite3d.v2')); } catch { /* none */ }
  const id = newSceneId();
  return { order: [id], active: id, scenes: { [id]: { name: 'Scene 1', data } } };
}
const scenesStore = loadScenesStore();
let storeSaveFailed = false;
function saveScenesStore() {
  try {
    localStorage.setItem(SCENES_KEY, JSON.stringify(scenesStore));
    storeSaveFailed = false;
  } catch {
    if (!storeSaveFailed) {
      storeSaveFailed = true;
      toast('Browser storage is full — changes are NOT being saved');
    }
  }
}
state.persistFn = (json) => {
  const sc = scenesStore.scenes[scenesStore.active];
  if (sc) { sc.data = json; saveScenesStore(); }
};

const blankScene = (dark) => ({
  v: 1,
  settings: {
    bounds: { xmin: -5, xmax: 5, ymin: -5, ymax: 5, zmin: -5, zmax: 5 },
    dark, grid: true, labels: true, box: true, ortho: false, anaglyph: false,
  },
  items: [],
});

/* ---------- load: share link (as its own tab) > active scene ---------- */
let loaded = false;
const shareMatch = /[#&]g=([A-Za-z0-9_-]+)/.exec(location.hash);
if (shareMatch) {
  try {
    const data = decodeShare(shareMatch[1]);
    if (state.loadJSON(data)) {
      // a shared graph opens in its own tab, so nothing of yours is overwritten
      const id = newSceneId();
      scenesStore.order.push(id);
      scenesStore.scenes[id] = { name: 'Shared scene', data };
      scenesStore.active = id;
      saveScenesStore();
      loaded = true;
      // one-shot import: drop the fragment so reloads don't duplicate the tab
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch { /* bad link */ }
}
if (!loaded) {
  const d = scenesStore.scenes[scenesStore.active]?.data;
  if (d) loaded = state.loadJSON(d);
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
  card: $('inspect-card'), btn: $('btn-inspect'), status: $('sb-inspect'),
});
const exploreCard = new ExploreCard($('explore-card'), state, viewport);

if (loaded) {
  // an intentionally empty scene stays empty — only first-ever boot gets the demo
  panel.renderAll();
  state.rebuildAll();
} else {
  loadExample(state, DEFAULT_EXAMPLE);
}

/* ---------- sidebar views: Expressions / Library / Explorations ---------- */
function showView(name) {
  $('expr-view').hidden = name !== 'expr';
  $('library-view').hidden = name !== 'library';
  $('explore-view').hidden = name !== 'explore';
  $('act-expr').classList.toggle('active', name === 'expr');
  $('btn-examples').classList.toggle('active', name === 'library');
  $('btn-explore').classList.toggle('active', name === 'explore');
}
$('act-expr').onclick = () => showView('expr');
$('btn-examples').onclick = () => {
  showView($('library-view').hidden ? 'library' : 'expr');
};
$('btn-explore').onclick = () => {
  showView($('explore-view').hidden ? 'explore' : 'expr');
};

/* ---------- library & explorations views ---------- */
{
  const libItem = (ex) => {
    const b = document.createElement('button');
    b.className = 'lib-item';
    b.innerHTML = `<span class="lib-name">${ex.name}</span><span class="lib-sub">${ex.sub}</span>`;
    b.onclick = () => {
      inspector.clear();
      exploreCard.hide();
      loadExample(state, ex);
      viewport.resetView();
      if (ex.explore) exploreCard.show(ex);
      showView('expr');
      // library scenes take the example's name (until the user edits it away)
      const sc = scenesStore.scenes[scenesStore.active];
      if (sc && !sc.named) {
        sc.name = ex.tab || (ex.name.length > 22 ? ex.name.slice(0, 21) + '…' : ex.name);
        sc.hint = ex.sub || ex.name;
        const plots = state.items.filter((i) => i.type !== 'slider');
        const first = plots[0];
        const base = String(first ? (first.expr ?? first.ex ?? first.ep ?? '') : '')
          .replace(/\s+/g, ' ').trim();
        // snapshot must match autoNameActive's key so the curated name sticks
        sc.autoKey = first ? `v2:${first.type}:${base}:${first.level ?? ''}:${plots.length}` : '';
        saveScenesStore();
        renderTabs();
      }
    };
    return b;
  };

  const list = $('library-list');
  const clearB = document.createElement('button');
  clearB.className = 'lib-item';
  clearB.innerHTML = `<span class="lib-name">Clear graph</span><span class="lib-sub">remove everything</span>`;
  clearB.onclick = () => { inspector.clear(); exploreCard.hide(); state.clearAll(); showView('expr'); };
  list.appendChild(clearB);
  // the Explorations section renders in its own sidebar view
  let inExplore = false;
  for (const ex of EXAMPLES) {
    if (ex.head) {
      inExplore = ex.head === 'Explorations';
      if (inExplore) continue;
      const h = document.createElement('div');
      h.className = 'lib-head';
      h.textContent = ex.head;
      list.appendChild(h);
      continue;
    }
    (inExplore ? $('explore-list') : list).appendChild(libItem(ex));
  }
}

/* ---------- status bar ---------- */
function updateStatus() {
  const n = state.items.length;
  const plots = state.items.filter((i) => i.type !== 'slider').length;
  const sliders = n - plots;
  $('sb-count').textContent =
    `${plots} plot${plots === 1 ? '' : 's'}${sliders ? ` · ${sliders} slider${sliders === 1 ? '' : 's'}` : ''}`;
  const b = state.settings.bounds;
  $('sb-bounds').textContent =
    `x ${b.xmin}..${b.xmax}  y ${b.ymin}..${b.ymax}  z ${b.zmin}..${b.zmax}`;
  updateProblems();
}
// honest health indicator: counts expressions that currently fail to plot
function updateProblems() {
  let problems = 0;
  for (const it of state.items) {
    const r = it.runtime || {};
    if (Object.keys(r.errors || {}).length || (r.unknown || []).length) problems++;
  }
  const el = $('sb-status');
  if (problems) {
    el.textContent = `⚠ ${problems} problem${problems === 1 ? '' : 's'}`;
    el.classList.add('sb-warn');
  } else {
    el.textContent = '✓ Ready';
    el.classList.remove('sb-warn');
  }
}
state.on('items-changed', updateStatus);
state.on('runtime-updated', updateProblems);
updateStatus();

/* ---------- scene tab strip ---------- */
function applySceneToApp(data, keepDark) {
  inspector.clear();
  exploreCard.hide();
  // purge the outgoing scene's meshes through the normal disposal path
  for (const it of [...state.items]) state.emit('item-removed', it);
  panel.openId = null;
  panel.openAdv.clear();
  state.loadJSON(data);
  if (keepDark !== undefined) state.settings.dark = keepDark;
  applyTheme();
  viewport.setTheme(state.settings.dark);
  viewport.axisOptions = {
    grid: state.settings.grid, labels: state.settings.labels, box: state.settings.box,
  };
  viewport.setBounds(state.settings.bounds);
  viewport.setProjection(state.settings.ortho ? 'orthographic' : 'perspective');
  viewport.setAnaglyph(!!state.settings.anaglyph);
  state.settings.ortho = !!viewport.camera.isOrthographicCamera;
  state.settings.anaglyph = !!viewport.anaglyph;
  panel.renderAll();
  state.rebuildAll();
  updateStatus();
  viewport.resetView();
}

function switchScene(id) {
  if (id === scenesStore.active || !scenesStore.scenes[id]) return;
  scenesStore.scenes[scenesStore.active].data = state.toJSON();
  scenesStore.active = id;
  saveScenesStore();
  const dark = state.settings.dark;
  applySceneToApp(scenesStore.scenes[id].data ?? blankScene(dark), dark);
  renderTabs();
}

function addScene() {
  scenesStore.scenes[scenesStore.active].data = state.toJSON();
  const id = newSceneId();
  let n = scenesStore.order.length + 1;
  const names = new Set(Object.values(scenesStore.scenes).map((s) => s.name));
  while (names.has(`Scene ${n}`)) n++;
  scenesStore.scenes[id] = { name: `Scene ${n}`, data: blankScene(state.settings.dark) };
  scenesStore.order.push(id);
  scenesStore.active = id;
  saveScenesStore();
  applySceneToApp(scenesStore.scenes[id].data, state.settings.dark);
  renderTabs();
}

function closeScene(id) {
  const i = scenesStore.order.indexOf(id);
  if (i < 0) return;
  const sc = scenesStore.scenes[id];
  const n = (id === scenesStore.active ? state.items : sc?.data?.items || []).length;
  if (n && !window.confirm(`Close "${sc.name}"? Its ${n} expression${n === 1 ? '' : 's'} will be deleted.`)) {
    return;
  }
  scenesStore.order.splice(i, 1);
  delete scenesStore.scenes[id];
  if (!scenesStore.order.length) {
    const nid = newSceneId();
    scenesStore.order = [nid];
    scenesStore.scenes[nid] = { name: 'Scene 1', data: blankScene(state.settings.dark) };
  }
  if (scenesStore.active === id) {
    scenesStore.active = scenesStore.order[Math.max(0, i - 1)];
    applySceneToApp(
      scenesStore.scenes[scenesStore.active].data ?? blankScene(state.settings.dark),
      state.settings.dark);
  }
  saveScenesStore();
  renderTabs();
}

function renderTabs() {
  const tabs = $('tabs');
  tabs.innerHTML = '';
  for (const id of scenesStore.order) {
    const sc = scenesStore.scenes[id];
    const t = document.createElement('div');
    t.className = 'tab' + (id === scenesStore.active ? ' active' : '');
    t.innerHTML = `<span class="codicon codicon-graph"></span><span class="tab-name"></span>`;
    // the icon takes the scene's primary item color — tabs identify by color
    const items = id === scenesStore.active ? state.items : (sc.data?.items || []);
    const firstPlot = items.find((i) => i.type !== 'slider');
    if (firstPlot?.color) t.querySelector('.codicon-graph').style.color = firstPlot.color;
    const nameEl = t.querySelector('.tab-name');
    nameEl.textContent = sc.name;
    t.title = `${sc.name}${sc.hint ? ` — ${sc.hint}` : ''} — double-click to rename`;
    t.onclick = () => switchScene(id);
    // inline rename, VS Code style
    t.ondblclick = () => {
      const inp = document.createElement('input');
      inp.className = 'tab-rename';
      inp.value = sc.name;
      inp.onclick = (e) => e.stopPropagation();
      const commit = () => {
        const v = inp.value.trim().slice(0, 40);
        if (v) { sc.name = v; sc.named = true; saveScenesStore(); }
        renderTabs();
      };
      inp.onblur = commit;
      inp.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') inp.blur();
        else if (e.key === 'Escape') { inp.onblur = null; renderTabs(); }
      };
      nameEl.replaceWith(inp);
      inp.focus();
      inp.select();
    };
    if (scenesStore.order.length > 1) {
      const x = document.createElement('button');
      x.className = 'tab-close';
      x.title = 'Close scene';
      x.innerHTML = '<span class="codicon codicon-close"></span>';
      x.onclick = (e) => { e.stopPropagation(); closeScene(id); };
      t.appendChild(x);
    }
    tabs.appendChild(t);
  }
}
$('tab-add').onclick = addScene;
renderTabs();

/* ---------- smart tab names ----------
   Tabs auto-name from their content: prettified math for a single plot
   ("4sin(√(x²+y²))/…"), "expr +N" for multi-plot scenes, and library
   scenes keep the example's curated name. A manual rename sticks. */
const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function prettyExpr(s) {
  return String(s)
    .replace(/\s+/g, '')
    .replace(/sqrt\(/g, '√(')
    .replace(/cbrt\(/g, '∛(')
    .replace(/\btheta\b/g, 'θ')
    .replace(/\bphi\b/g, 'φ')
    .replace(/\brho\b/g, 'ρ')
    .replace(/\btau\b/g, 'τ')
    .replace(/\bpi\b/g, 'π')
    .replace(/\^\((\d)\)/g, (m, d) => SUPS[d])
    .replace(/\^(\d)(?!\d)/g, (m, d) => SUPS[d])
    .replace(/\*/g, '·');
}
function clip(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
const TAB_TYPE_NAMES = {
  cartesian: 'Surface', cylindrical: 'Cylindrical', spherical: 'Spherical',
  parametric: 'Param. surface', curve: 'Curve', implicit: 'Level surface',
  field: 'Field', point: 'Points', vector: 'Vectors',
};
function autoNameActive() {
  const sc = scenesStore.scenes[scenesStore.active];
  if (!sc || sc.named) return;
  const plots = state.items.filter((i) => i.type !== 'slider');
  const first = plots[0];
  const base = String(first ? (first.expr ?? first.ex ?? first.ep ?? '') : '')
    .replace(/\s+/g, ' ').trim();
  const key = first ? `v2:${first.type}:${base}:${first.level ?? ''}:${plots.length}` : '';
  if (sc.autoKey === key) return; // the content driving the name is unchanged
  sc.autoKey = key;
  if (!first || !base) return;
  // at-a-glance name: a short human label; the math lives in the tooltip
  let name;
  const pretty = prettyExpr(base);
  if (first.type === 'implicit') {
    const eq = `${pretty} = ${prettyExpr(String(first.level ?? '0'))}`;
    name = eq.length <= 14 ? eq : TAB_TYPE_NAMES.implicit; // tiny equations may speak for themselves
  } else if (first.type === 'surface') {
    name = pretty.length <= 14 ? pretty : TAB_TYPE_NAMES[first.mode] || 'Surface';
  } else {
    name = TAB_TYPE_NAMES[first.type] || 'Scene';
  }
  if (plots.length > 1) name = `${name} +${plots.length - 1}`;
  sc.name = name;
  sc.hint = pretty; // full math shown on hover
  saveScenesStore();
  renderTabs();
}
state.on('items-changed', autoNameActive);
state.on('item-updated', autoNameActive);
autoNameActive();

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
    updateStatus();
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
  if (inspector.active) {
    toast('Inspect on — full analysis on z = f(x,y) surfaces; ∇F on level surfaces; div/curl on fields');
  }
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
    if (it.type === 'slider' && it.playing && !it.runtime._scrub) {
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
  if (e.target.closest?.('input, textarea, math-field, [contenteditable]')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'r') viewport.resetView(true);
  if (e.key === 'i') inspector.toggle();
});
