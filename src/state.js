// Central app state: items, sliders, settings, compile helpers, persistence.
import { parse } from './math/parser.js';
import { compile, freeVars, evalNode } from './math/compiler.js';
import { CONSTANTS, FUNCTIONS } from './math/builtins.js';
import { nextColor } from './colormaps.js';

let nextId = 1;
const uid = () => `it${nextId++}`;

export const TYPE_DEFAULTS = {
  surface: () => ({
    type: 'surface', mode: 'cartesian', expr: 'sin(x)cos(y)',
    aMin: '-5', aMax: '5', bMin: '-5', bMax: '5',
    res: 96, cmap: 'viridis', color: nextColor(), opacity: 1, wire: false,
    contours: false, contourCount: 12, contourFloor: false, clip: true,
    restrict: '', section: 'none', sectionVal: 0, riemann: false, riemannN: 8,
  }),
  cylindrical: () => ({
    type: 'surface', mode: 'cylindrical', expr: 'r sin(3theta)/2 + 1',
    aMin: '0', aMax: '4', bMin: '0', bMax: '2pi',
    res: 96, cmap: 'plasma', color: nextColor(), opacity: 1, wire: false,
    contours: false, contourCount: 12, contourFloor: false, clip: true,
    restrict: '', section: 'none', sectionVal: 0, riemann: false, riemannN: 8,
  }),
  spherical: () => ({
    type: 'surface', mode: 'spherical', expr: '3 + 0.6sin(4theta)sin(3phi)',
    aMin: '0', aMax: '2pi', bMin: '0', bMax: 'pi',
    res: 110, cmap: 'sunset', color: nextColor(), opacity: 1, wire: false,
    contours: false, contourCount: 12, contourFloor: false, clip: false,
    restrict: '', section: 'none', sectionVal: 0, riemann: false, riemannN: 8,
  }),
  parametric: () => ({
    type: 'parametric', ex: '(3 + cos(v))cos(u)', ey: '(3 + cos(v))sin(u)', ez: 'sin(v)',
    aMin: '0', aMax: '2pi', bMin: '0', bMax: '2pi',
    res: 90, cmap: 'cool', color: nextColor(), opacity: 1, wire: false, clip: false,
  }),
  curve: () => ({
    type: 'curve', ex: '4cos(t)', ey: '4sin(t)', ez: 't/3',
    tMin: '-4pi', tMax: '4pi', samples: 500, thick: 1,
    color: nextColor(), frame: false, frameT: 0.25, framePlay: false,
    showVA: false, showOsc: false,
  }),
  implicit: () => ({
    type: 'implicit', expr: 'x^2 + y^2 + z^2', level: '9', res: 48,
    cmap: '', color: nextColor(), opacity: 1, wire: false,
  }),
  field: () => ({
    type: 'field', ep: '-y', eq: 'x', er: 'z/2',
    density: 7, scale: 1, normalize: false, cmap: 'turbo', opacity: 1,
  }),
  point: () => ({
    type: 'point', ex: '1', ey: '2', ez: '2', label: '', size: 1, color: nextColor(),
  }),
  vector: () => ({
    type: 'vector', ex: '2', ey: '2', ez: '3', ox: '0', oy: '0', oz: '0', color: nextColor(),
  }),
  slider: () => ({
    type: 'slider', name: '', value: 1, min: -5, max: 5, step: 0.01,
    playing: false, speed: 1, loop: 'pingpong', color: nextColor(),
  }),
};

const SLIDER_NAME_POOL = ['a', 'b', 'c', 'd', 'k', 'm', 'n', 'p', 'q', 's', 'w', 'a1', 'b1', 'c1'];

export class AppState {
  constructor() {
    this.items = [];
    this.epoch = 0; // bumped on every scene load; stale debounced edits check it
    // false while viewing a shared scene the user hasn't touched — protects
    // their own saved scene from being silently overwritten
    this.persist = true;
    this.settings = {
      bounds: { xmin: -5, xmax: 5, ymin: -5, ymax: 5, zmin: -5, zmax: 5 },
      dark: false, grid: true, labels: true, box: true,
      ortho: false, anaglyph: false,
    };
    this._subs = {};
  }

  on(evt, fn) { (this._subs[evt] ||= []).push(fn); }
  emit(evt, ...args) { for (const fn of this._subs[evt] || []) fn(...args); }

  /* ---------- items ---------- */
  addItem(kind, overrides = {}) {
    this.touch();
    const props = { ...(TYPE_DEFAULTS[kind] || TYPE_DEFAULTS.surface)(), ...overrides };
    const item = { id: uid(), visible: true, runtime: {}, ...props };
    if (item.type === 'slider' && !item.name) item.name = this.freeSliderName();
    this.items.push(item);
    this.emit('items-changed');
    if (item.type === 'slider') this.rebuildAll();
    else this.emit('item-geometry', item);
    this.save();
    return item;
  }

  removeItem(id) {
    this.touch();
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [item] = this.items.splice(i, 1);
    this.emit('item-removed', item);
    this.emit('items-changed');
    // slider removal can orphan expressions → recompile everything
    if (item.type === 'slider') this.rebuildAll();
    this.save();
  }

  get(id) { return this.items.find((x) => x.id === id); }

  patch(id, patch, { geometry = true } = {}) {
    this.touch();
    const item = this.get(id);
    if (!item) return;
    Object.assign(item, patch);
    if (geometry) this.emit('item-geometry', item);
    this.emit('item-updated', item, patch);
    this.save();
  }

  rebuildAll() {
    for (const it of this.items) if (it.type !== 'slider') this.emit('item-geometry', it);
  }

  /* ---------- sliders ---------- */
  sliders() {
    const m = {};
    for (const it of this.items) if (it.type === 'slider' && it.name) m[it.name] = it.value;
    return m;
  }

  sliderItem(name) {
    return this.items.find((x) => x.type === 'slider' && x.name === name);
  }

  freeSliderName() {
    const used = new Set(this.items.filter((x) => x.type === 'slider').map((x) => x.name));
    return SLIDER_NAME_POOL.find((n) => !used.has(n)) || `s${this.items.length}`;
  }

  setSliderValue(id, value, { fromUI = false } = {}) {
    if (fromUI) this.touch(); // animation ticks alone don't adopt a shared scene
    const item = this.get(id);
    if (!item) return;
    item.value = value;
    this.emit('slider-value', item, fromUI);
    this.saveSoon();
  }

  /* ---------- expression compiling ---------- */
  // Returns { ast, raw, used, unknown, error }.
  // raw takes (...intrinsics, ...usedSliderValues).
  compileExpr(src, intrinsics) {
    try {
      const ast = parse(src);
      const vars = freeVars(ast);
      const sliders = this.sliders();
      const used = [], unknown = [];
      for (const v of vars) {
        if (intrinsics.includes(v)) continue;
        else if (v in sliders) used.push(v);
        else unknown.push(v);
      }
      if (unknown.length) return { ast, used, unknown, error: null, raw: null };
      const raw = compile(ast, [...intrinsics, ...used]);
      return { ast, raw, used, unknown: [], error: null };
    } catch (e) {
      return { ast: null, raw: null, used: [], unknown: [], error: e.message, errorPos: e.pos };
    }
  }

  // Bind current slider values: returns fn of just the intrinsics (or null).
  bind(compiled, nIntr) {
    if (!compiled || !compiled.raw) return null;
    const sliders = this.sliders();
    const vals = compiled.used.map((n) => sliders[n] ?? 0);
    const f = compiled.raw;
    if (vals.length === 0) return f;
    const [s0, s1, s2] = vals;
    if (nIntr === 0) {
      if (vals.length === 1) return () => f(s0);
      if (vals.length === 2) return () => f(s0, s1);
      return () => f(...vals);
    }
    if (nIntr === 1) {
      if (vals.length === 1) return (a) => f(a, s0);
      if (vals.length === 2) return (a) => f(a, s0, s1);
      return (a) => f(a, ...vals);
    }
    if (nIntr === 2) {
      if (vals.length === 1) return (a, b) => f(a, b, s0);
      if (vals.length === 2) return (a, b) => f(a, b, s0, s1);
      return (a, b) => f(a, b, ...vals);
    }
    if (vals.length === 1) return (a, b, c) => f(a, b, c, s0);
    if (vals.length === 2) return (a, b, c) => f(a, b, c, s0, s1);
    return (a, b, c) => f(a, b, c, ...vals);
  }

  // Evaluate a constant-ish expression (domain bounds etc.); sliders allowed.
  evalConst(src, fallback = 0) {
    try {
      const ast = parse(String(src));
      const scope = { ...CONSTANTS, ...this.sliders() };
      const v = evalNode(ast, scope);
      return Number.isFinite(v) ? v : fallback;
    } catch { return fallback; }
  }

  /* ---------- persistence ---------- */
  toJSON() {
    return {
      v: 1,
      // deep-copied: scene tabs must never alias the live settings object
      settings: structuredClone(this.settings),
      items: this.items.map(({ runtime, ...rest }) => rest),
    };
  }

  loadJSON(data) {
    try {
      this.epoch = (this.epoch || 0) + 1; // invalidates debounced edits from the old scene
      this.items = (data.items || []).map((it) => ({ ...it, runtime: {} }));
      Object.assign(this.settings, data.settings || {});
      this.settings.bounds = { ...this.settings.bounds };
      let maxN = 0;
      for (const it of this.items) {
        const m = /^it(\d+)$/.exec(it.id || '');
        if (m) maxN = Math.max(maxN, +m[1]);
      }
      nextId = maxN + 1;
      return true;
    } catch { return false; }
  }

  // any user-initiated edit adopts the current scene as the user's own
  touch() {
    this.persist = true;
  }

  save() {
    if (!this.persist) return;
    try {
      // main.js routes persistence into the active scene tab
      if (this.persistFn) this.persistFn(this.toJSON());
      else localStorage.setItem('graphite3d.v2', JSON.stringify(this.toJSON()));
    } catch {}
  }

  saveSoon() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.save(), 400);
  }

  clearAll() {
    for (const it of [...this.items]) this.emit('item-removed', it);
    this.items = [];
    this.emit('items-changed');
    this.save();
  }
}

export function isFunctionName(name) { return name in FUNCTIONS; }
