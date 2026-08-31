// Expression panel: Desmos-style item rows, add menu, color popovers, slider chips.
import { PALETTE, COLORMAP_NAMES, colormapCSS } from '../colormaps.js';
import { makeMathField, makeEquationField, makeMathPreview, previewLatex } from './mathinput.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const debounce = (fn, ms) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

const TYPE_LABEL = {
  cartesian: 'Surface',
  cylindrical: 'Surface · cylindrical',
  spherical: 'Surface · spherical',
  parametric: 'Parametric surface',
  curve: 'Space curve',
  implicit: 'Implicit surface',
  field: 'Vector field',
  point: 'Point',
  vector: 'Vector',
  slider: 'Slider',
};

const DOMAIN_LABELS = {
  cartesian: ['x', 'y'], cylindrical: ['r', 'θ'], spherical: ['θ', 'φ'], parametric: ['u', 'v'],
};

const ADD_MENU = [
  ['head', 'Surfaces'],
  { kind: 'surface', icon: 'z', title: 'Function surface', sub: 'z = f(x, y)' },
  { kind: 'implicit', icon: '=', title: 'Implicit surface', sub: 'x² + y² + z² = 9  ·  quadrics' },
  { kind: 'parametric', icon: 'uv', title: 'Parametric surface', sub: 'x(u,v), y(u,v), z(u,v)' },
  { kind: 'cylindrical', icon: 'rθ', title: 'Cylindrical coordinates', sub: 'z = f(r, θ)' },
  { kind: 'spherical', icon: 'ρ', title: 'Spherical coordinates', sub: 'ρ = f(θ, φ)' },
  ['head', 'Curves & vectors'],
  { kind: 'curve', icon: 'r(t)', title: 'Space curve', sub: '⟨x(t), y(t), z(t)⟩' },
  { kind: 'field', icon: 'F⃗', title: 'Vector field', sub: '⟨P, Q, R⟩' },
  { kind: 'point', icon: '·', title: 'Point', sub: '(x, y, z)' },
  { kind: 'vector', icon: '→', title: 'Vector', sub: 'components + tail point' },
  ['head', 'Controls'],
  { kind: 'slider', icon: 'a', title: 'Slider', sub: 'animatable parameter' },
];

const EYE_ON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 5.8A10 10 0 0 1 22 12a16 16 0 0 1-3.2 3.5M6.6 6.6A15 15 0 0 0 2 12s3.5 6.5 10 6.5c1.4 0 2.7-.3 3.9-.8"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

export class Panel {
  constructor(state, manager, els) {
    this.state = state;
    this.manager = manager;
    this.els = els;
    this.cards = new Map();
    this.openAdv = new Set();
    this.openId = null;

    state.on('items-changed', () => this.renderAll());
    state.on('runtime-updated', (item) => this.updateRuntime(item));
    state.on('slider-value', (item, fromUI) => { if (!fromUI) this.syncSlider(item); });
    state.on('frame-updated', (item, info) => this.syncFrame(item, info));

    this.buildAddMenu();
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.closest && t.closest('input, textarea, math-field, [contenteditable]')) return;
      e.preventDefault();
      this.openPalette();
    });
    document.addEventListener('pointerdown', (e) => {
      for (const pop of document.querySelectorAll('.color-pop')) {
        if (!pop.contains(e.target)) pop.remove();
      }
      for (const menu of document.querySelectorAll('.menu:not([hidden])')) {
        const anchor = menu.classList.contains('quickpick')
          ? document.getElementById('btn-add')
          : menu.parentElement;
        if (!menu.contains(e.target) && !(anchor && anchor.contains(e.target))) {
          menu.setAttribute('hidden', '');
        }
      }
    });
    this.renderAll();
  }

  // Command palette (Notion "/" menu): searchable list of block types.
  buildAddMenu() {
    const menu = this.els.addMenu;
    menu.innerHTML = '';
    const search = document.createElement('input');
    search.className = 'palette-search';
    search.placeholder = 'Search for a type…';
    search.spellcheck = false;
    menu.appendChild(search);
    const rows = [];
    for (const entry of ADD_MENU) {
      if (Array.isArray(entry)) {
        const h = document.createElement('div');
        h.className = 'menu-head'; h.textContent = entry[1];
        menu.appendChild(h);
        rows.push({ el: h, head: true });
        continue;
      }
      const b = document.createElement('button');
      b.className = 'menu-item';
      b.innerHTML = `<span class="mi-icon">${entry.icon}</span>
        <span class="mi-text"><span class="mi-title">${entry.title}</span><span class="mi-sub">${entry.sub}</span></span>`;
      b.onclick = () => {
        menu.setAttribute('hidden', '');
        const item = this.state.addItem(entry.kind);
        this.openId = item.id;
        this.renderAll();
        requestAnimationFrame(() => {
          const row = this.cards.get(item.id);
          row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          row?.querySelector('.nrow-editor .expr-input')?.focus();
        });
      };
      menu.appendChild(b);
      rows.push({ el: b, head: false, text: `${entry.title} ${entry.sub}`.toLowerCase() });
    }
    const applyFilter = () => {
      const q = search.value.trim().toLowerCase();
      let lastHead = null;
      for (const r of rows) {
        if (r.head) { r.el.style.display = q ? 'none' : ''; lastHead = r.el; continue; }
        const show = !q || r.text.includes(q);
        r.el.style.display = show ? '' : 'none';
      }
    };
    search.oninput = applyFilter;
    search.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const first = rows.find((r) => !r.head && r.el.style.display !== 'none');
        first?.el.click();
      } else if (e.key === 'Escape') {
        menu.setAttribute('hidden', '');
      }
    };
    this._paletteSearch = search;
    this._paletteFilter = applyFilter;
    this.els.addBtn.onclick = (e) => {
      e.stopPropagation();
      if (menu.hasAttribute('hidden')) this.openPalette();
      else menu.setAttribute('hidden', '');
    };
  }

  openPalette() {
    const menu = this.els.addMenu;
    this._paletteSearch.value = '';
    this._paletteFilter();
    menu.removeAttribute('hidden');
    requestAnimationFrame(() => this._paletteSearch.focus());
  }

  renderAll() {
    const root = this.els.items;
    root.innerHTML = '';
    this.cards.clear();
    if (!this.state.items.length) {
      const d = document.createElement('div');
      d.className = 'empty-hint';
      d.innerHTML = `<div class="eh-title">Empty graph</div>
        Add a surface, curve, or field below — or open the <b>Library</b> for
        ready-made Calc III scenes.
        <br><br>Type math naturally: <code>sin(x)cos(y)</code>, <code>phi</code> → φ,
        <code>sqrt</code> → √. Press <code>/</code> to add.`;
      root.appendChild(d);
    }
    for (const item of this.state.items) {
      const row = this.buildCard(item);
      this.cards.set(item.id, row);
      root.appendChild(row);
      this.updateRuntime(item);
    }
    // Notion-style trailing "new block" row
    const add = document.createElement('button');
    add.className = 'nrow-add';
    add.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> New expression <span class="nrow-add-hint">/</span>`;
    add.onclick = (e) => { e.stopPropagation(); this.openPalette(); };
    root.appendChild(add);
  }

  /* ================= row construction ================= */

  // Compact one-line row; clicking expands it into an editor card below.
  buildCard(item) {
    const row = document.createElement('div');
    const open = this.openId === item.id;
    row.className = 'nrow' + (open ? ' open' : '') + (item.visible ? '' : ' hidden-item');
    row.style.setProperty('--item-color', item.color || 'var(--accent)');
    row.dataset.id = item.id;

    const head = document.createElement('div');
    head.className = 'nrow-head';
    head.onclick = (e) => {
      if (e.target.closest('button, input, .color-pop, math-field')) return;
      this.toggleOpen(item.id);
    };
    row.appendChild(head);

    if (item.type !== 'slider') {
      const tw = document.createElement('span');
      tw.className = 'twisty' + (open ? ' open' : '');
      tw.innerHTML = CHEV;
      head.appendChild(tw);
    }

    const dot = document.createElement('button');
    dot.className = 'swatch-dot';
    dot.title = 'Color';
    dot.style.background = item.cmap ? colormapCSS(item.cmap) : (item.color || '#888');
    dot.onclick = (e) => { e.stopPropagation(); this.openColorPop(item, row, dot, row); };
    head.appendChild(dot);

    if (item.type === 'slider') this.sliderHead(item, head);
    else if (open) {
      const kind = document.createElement('span');
      kind.className = 'nrow-title';
      kind.textContent = TYPE_LABEL[item.type === 'surface' ? item.mode : item.type] || item.type;
      head.appendChild(kind);
      const sp = document.createElement('span');
      sp.style.flex = '1';
      head.appendChild(sp);
    } else {
      const prev = this.previewFor(item);
      head.appendChild(prev);
      row._preview = prev;
      const kind = document.createElement('span');
      kind.className = 'nrow-kind';
      kind.textContent = TYPE_LABEL[item.type === 'surface' ? item.mode : item.type] || item.type;
      head.appendChild(kind);
    }

    const badge = document.createElement('span');
    badge.className = 'nrow-err';
    badge.style.display = 'none';
    head.appendChild(badge);

    const actions = document.createElement('span');
    actions.className = 'nrow-actions';
    if (item.type !== 'slider') {
      const eye = document.createElement('button');
      eye.className = 'chip-btn'; eye.title = 'Show / hide';
      eye.innerHTML = item.visible ? EYE_ON : EYE_OFF;
      eye.onclick = (e) => {
        e.stopPropagation();
        this.state.patch(item.id, { visible: !item.visible });
        eye.innerHTML = item.visible ? EYE_ON : EYE_OFF;
        row.classList.toggle('hidden-item', !item.visible);
      };
      actions.appendChild(eye);
    }
    const del = document.createElement('button');
    del.className = 'chip-btn danger'; del.title = 'Delete';
    del.innerHTML = TRASH;
    del.onclick = (e) => { e.stopPropagation(); this.state.removeItem(item.id); };
    actions.appendChild(del);
    head.appendChild(actions);

    if (open) {
      const editor = document.createElement('div');
      editor.className = 'nrow-editor';
      row.appendChild(editor);
      if (item.type === 'surface') this.bodySurface(item, editor);
      else if (item.type === 'parametric') this.bodyParametric(item, editor);
      else if (item.type === 'curve') this.bodyCurve(item, editor);
      else if (item.type === 'implicit') this.bodyImplicit(item, editor);
      else if (item.type === 'field') this.bodyField(item, editor);
      else if (item.type === 'point') this.bodyPoint(item, editor);
      else if (item.type === 'vector') this.bodyVector(item, editor);
      else if (item.type === 'slider') this.bodySlider(item, editor, row);
    }
    return row;
  }

  toggleOpen(id) {
    this.openId = this.openId === id ? null : id;
    this.renderAll();
  }

  // typeset one-line summary for a collapsed row
  previewFor(item) {
    const L = (e) => previewLatex(e) ?? String(e ?? '');
    let latex = '';
    if (item.type === 'surface') latex = L(item.expr);
    else if (item.type === 'implicit') {
      latex = String(item.expr ?? '').trim() ? `${L(item.expr)} = ${L(item.level ?? '0')}` : '';
    }
    else if (item.type === 'curve' || item.type === 'parametric' || item.type === 'vector') {
      latex = `\\left\\langle ${L(item.ex)},\\, ${L(item.ey)},\\, ${L(item.ez)} \\right\\rangle`;
    } else if (item.type === 'field') {
      latex = `\\left\\langle ${L(item.ep)},\\, ${L(item.eq)},\\, ${L(item.er)} \\right\\rangle`;
    } else if (item.type === 'point') {
      latex = `\\left( ${L(item.ex)},\\, ${L(item.ey)},\\, ${L(item.ez)} \\right)`;
    }
    if (!latex.trim()) {
      const d = document.createElement('span');
      d.className = 'nrow-preview nrow-empty';
      d.textContent = 'Empty';
      return d;
    }
    return makeMathPreview(latex);
  }

  // compact slider row: draggable without expanding
  sliderHead(item, head) {
    const name = document.createElement('span');
    name.className = 'srow-name';
    name.textContent = item.name;
    const eq = document.createElement('span');
    eq.className = 'slider-eq'; eq.textContent = '=';
    const val = document.createElement('input');
    val.className = 'slider-val';
    val.value = fmtNum(item.value);
    val.onclick = (e) => e.stopPropagation();
    val.onchange = () => {
      const v = parseFloat(val.value);
      if (Number.isFinite(v)) { this.state.setSliderValue(item.id, v, { fromUI: true }); track.value = v; }
      val.value = fmtNum(this.state.get(item.id).value);
    };
    const track = document.createElement('input');
    track.type = 'range'; track.className = 'slider-track';
    track.min = item.min; track.max = item.max; track.step = item.step;
    track.value = item.value;
    track.onclick = (e) => e.stopPropagation();
    track.oninput = () => {
      this.state.setSliderValue(item.id, +track.value, { fromUI: true });
      val.value = fmtNum(+track.value);
    };
    const play = document.createElement('button');
    play.className = 'play-btn';
    play.innerHTML = item.playing ? PAUSE : PLAY;
    play.title = 'Animate';
    play.onclick = (e) => {
      e.stopPropagation();
      this.state.patch(item.id, { playing: !item.playing }, { geometry: false });
      play.innerHTML = item.playing ? PAUSE : PLAY;
    };
    head.append(name, eq, val, track, play);
  }

  // Rendered math field (MathLive): type naturally — "phi" becomes φ, "sqrt"
  // a radical, "/" a fraction — or use the in-field symbol keypad.
  exprRow(item, prop, label, body, placeholder = '') {
    const row = document.createElement('div');
    row.className = 'expr-row';
    const lab = document.createElement('span');
    lab.className = 'expr-label'; lab.innerHTML = label;
    const err = document.createElement('div');
    err.className = 'err-msg'; err.dataset.errFor = prop; err.style.display = 'none';
    const apply = debounce((expr) => this.state.patch(item.id, { [prop]: expr }), 200);
    const mf = makeMathField(item[prop] ?? '', {
      placeholder,
      onExpr: (expr) => {
        err.style.display = 'none';
        mf.classList.remove('err');
        apply(expr);
      },
      onBadLatex: (msg) => {
        err.textContent = msg;
        err.style.display = '';
        mf.classList.add('err');
      },
    });
    mf.dataset.prop = prop;
    row.appendChild(lab); row.appendChild(mf);
    body.appendChild(row);
    body.appendChild(err);
    return mf;
  }

  chipsRow(body) {
    const d = document.createElement('div');
    d.className = 'slider-chips';
    body.appendChild(d);
    return d;
  }

  // “x ∈ [ −5 , 5 ]   y ∈ [ −5 , 5 ]”
  domainRows(item, body, labels, props = [['aMin', 'aMax'], ['bMin', 'bMax']]) {
    const wrap = document.createElement('div');
    wrap.className = 'dom-pair';
    labels.forEach((lab, i) => {
      const [pMin, pMax] = props[i];
      const r = document.createElement('div');
      r.className = 'dom-row';
      const mk = (prop) => {
        const inp = document.createElement('input');
        inp.className = 'mini-input'; inp.value = item[prop]; inp.spellcheck = false;
        inp.oninput = debounce(() => {
          inp.classList.toggle('err', !Number.isFinite(this.state.evalConst(inp.value, NaN)));
          this.state.patch(item.id, { [prop]: inp.value });
        }, 300);
        return inp;
      };
      r.append(Object.assign(document.createElement('span'), { className: 'dvar', textContent: lab }),
        document.createTextNode(' ∈ ['), mk(pMin), document.createTextNode(','), mk(pMax), document.createTextNode(']'));
      wrap.appendChild(r);
    });
    body.appendChild(wrap);
  }

  advSection(item, body, build) {
    const tog = document.createElement('button');
    tog.className = 'adv-toggle';
    tog.innerHTML = `${CHEV} options`;
    const sec = document.createElement('div');
    sec.className = 'adv-body';
    sec.style.display = 'none';
    const open = this.openAdv.has(item.id);
    if (open) { sec.style.display = ''; tog.classList.add('open'); }
    tog.onclick = () => {
      const vis = sec.style.display !== 'none';
      sec.style.display = vis ? 'none' : '';
      tog.classList.toggle('open', !vis);
      vis ? this.openAdv.delete(item.id) : this.openAdv.add(item.id);
    };
    body.appendChild(tog);
    body.appendChild(sec);
    build(sec);
  }

  rangeRow(sec, label, value, min, max, step, fmt, onchange) {
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.innerHTML = `<label>${label}</label>`;
    const r = document.createElement('input');
    r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
    const val = document.createElement('span');
    val.className = 'val'; val.textContent = fmt(value);
    r.oninput = debounce(() => { val.textContent = fmt(+r.value); onchange(+r.value); }, 120);
    row.appendChild(r); row.appendChild(val);
    sec.appendChild(row);
  }

  checkRow(sec, label, checked, onchange) {
    const lab = document.createElement('label');
    lab.className = 'check-row';
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = checked;
    c.onchange = () => onchange(c.checked);
    lab.appendChild(c);
    lab.appendChild(document.createTextNode(label));
    sec.appendChild(lab);
    return c;
  }

  /* ================= per-type bodies ================= */

  bodySurface(item, body) {
    const labels = {
      cartesian: 'f(x,y) =', cylindrical: 'f(r,θ) =', spherical: 'ρ(θ,φ) =',
    };
    this.exprRow(item, 'expr', labels[item.mode], body, 'sin(x)cos(y)');
    this.chipsRow(body);

    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [mode, lab] of [['cartesian', 'z = f(x,y)'], ['cylindrical', 'z = f(r,θ)'], ['spherical', 'ρ = f(θ,φ)']]) {
      const b = document.createElement('button');
      b.textContent = lab;
      b.classList.toggle('sel', item.mode === mode);
      b.onclick = () => {
        if (item.mode === mode) return;
        const dom = mode === 'cartesian' ? { aMin: '-5', aMax: '5', bMin: '-5', bMax: '5' }
          : mode === 'cylindrical' ? { aMin: '0', aMax: '4', bMin: '0', bMax: '2pi' }
            : { aMin: '0', aMax: '2pi', bMin: '0', bMax: 'pi' };
        this.state.patch(item.id, { mode, ...dom });
        this.rerenderCard(item);
      };
      seg.appendChild(b);
    }
    body.appendChild(seg);
    this.domainRows(item, body, DOMAIN_LABELS[item.mode]);

    this.advSection(item, body, (sec) => {
      this.rangeRow(sec, 'Detail', item.res, 24, 220, 4, (v) => `${v}²`, (v) => this.state.patch(item.id, { res: v }));
      this.rangeRow(sec, 'Opacity', item.opacity, 0.1, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => this.state.patch(item.id, { opacity: v }));
      this.checkRow(sec, 'Wireframe mesh', item.wire, (v) => this.state.patch(item.id, { wire: v }));
      if (item.mode === 'cartesian') {
        this.checkRow(sec, 'Level curves drawn on the surface', item.contours, (v) => { this.state.patch(item.id, { contours: v }); this.rerenderCard(this.state.get(item.id)); });
        if (item.contours) {
          this.checkRow(sec, 'Also project them onto the floor (topo map)', item.contourFloor, (v) => this.state.patch(item.id, { contourFloor: v }));
          this.rangeRow(sec, 'Levels', item.contourCount, 4, 30, 1, (v) => `${v}`, (v) => this.state.patch(item.id, { contourCount: v }));
        }
        this.sectionControl(item, sec);
        this.riemannControl(item, sec);
      }
      this.restrictField(item, sec);
      this.checkRow(sec, 'Clip to z-window', item.clip, (v) => this.state.patch(item.id, { clip: v }));
    });
  }

  // domain restriction: keep the part of the surface where g ≤ 0
  restrictField(item, sec) {
    const labels = { cartesian: 'g(x,y)', cylindrical: 'g(r,θ)', spherical: 'g(θ,φ)' };
    const head = document.createElement('div');
    head.className = 'note';
    head.textContent = `Restrict domain — plot only where ${labels[item.mode] || 'g'} ≤ 0`;
    sec.appendChild(head);
    const row = document.createElement('div');
    row.className = 'expr-row';
    row.innerHTML = `<span class="expr-label">${labels[item.mode] || 'g'} =</span>`;
    const err = document.createElement('div');
    err.className = 'err-msg'; err.dataset.errFor = 'restrict'; err.style.display = 'none';
    const applyRestrict = debounce((expr) => this.state.patch(item.id, { restrict: expr }), 250);
    const mfr = makeMathField(item.restrict || '', {
      placeholder: item.mode === 'cartesian' ? 'x^2 + y^2 - 16' : 'empty for none',
      onExpr: (expr) => { err.style.display = 'none'; mfr.classList.remove('err'); applyRestrict(expr); },
      onBadLatex: (msg) => { err.textContent = msg; err.style.display = ''; mfr.classList.add('err'); },
    });
    mfr.dataset.prop = 'restrict';
    row.appendChild(mfr);
    sec.appendChild(row);
    sec.appendChild(err);
  }

  // movable cross-section trace plane (x = c, y = c, z = c)
  sectionControl(item, sec) {
    const segRow = document.createElement('div');
    segRow.className = 'opt-row';
    segRow.innerHTML = '<label>Cross section</label>';
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.borderBottom = 'none';
    const rangeFor = (axis) => {
      const B = this.state.settings.bounds; // read live — the window can change
      if (axis === 'x') return [this.state.evalConst(item.aMin, -5), this.state.evalConst(item.aMax, 5)];
      if (axis === 'y') return [this.state.evalConst(item.bMin, -5), this.state.evalConst(item.bMax, 5)];
      return [B.zmin, B.zmax];
    };
    for (const [mode, lab] of [['none', 'off'], ['x', 'x = c'], ['y', 'y = c'], ['z', 'z = c']]) {
      const b = document.createElement('button');
      b.textContent = lab;
      b.classList.toggle('sel', (item.section || 'none') === mode);
      b.onclick = () => {
        const patch = { section: mode };
        if (mode !== 'none') {
          const [lo, hi] = rangeFor(mode);
          patch.sectionVal = (lo + hi) / 2;
        }
        this.state.patch(item.id, patch);
        this.rerenderCard(this.state.get(item.id));
      };
      seg.appendChild(b);
    }
    segRow.appendChild(seg);
    sec.appendChild(segRow);

    if (item.section && item.section !== 'none') {
      const [lo, hi] = rangeFor(item.section);
      const row = document.createElement('div');
      row.className = 'opt-row';
      row.innerHTML = `<label>${item.section} = c</label>`;
      const r = document.createElement('input');
      r.type = 'range'; r.min = lo; r.max = hi; r.step = (hi - lo) / 200 || 0.05;
      r.value = Math.min(hi, Math.max(lo, item.sectionVal ?? (lo + hi) / 2));
      const val = document.createElement('span');
      val.className = 'val'; val.textContent = fmtNum(+r.value);
      r.oninput = () => {
        val.textContent = fmtNum(+r.value);
        this.state.patch(item.id, { sectionVal: +r.value });
      };
      row.appendChild(r); row.appendChild(val);
      sec.appendChild(row);
    }
  }

  // Riemann sum boxes + live ∬ readout
  riemannControl(item, sec) {
    this.checkRow(sec, 'Riemann boxes for ∬ f dA (midpoint)', item.riemann, (v) => {
      this.state.patch(item.id, { riemann: v });
      this.rerenderCard(this.state.get(item.id));
    });
    if (item.riemann) {
      this.rangeRow(sec, 'Grid', item.riemannN, 2, 40, 1, (v) => `${v}×${v}`, (v) => this.state.patch(item.id, { riemannN: v }));
      const info = document.createElement('div');
      info.className = 'note';
      info.style.fontFamily = 'var(--font-math)';
      info.dataset.riemann = '1';
      sec.appendChild(info);
    }
  }

  bodyParametric(item, body) {
    this.exprRow(item, 'ex', 'x(u,v) =', body);
    this.exprRow(item, 'ey', 'y(u,v) =', body);
    this.exprRow(item, 'ez', 'z(u,v) =', body);
    this.chipsRow(body);
    this.domainRows(item, body, DOMAIN_LABELS.parametric);
    this.advSection(item, body, (sec) => {
      this.rangeRow(sec, 'Detail', item.res, 24, 220, 4, (v) => `${v}²`, (v) => this.state.patch(item.id, { res: v }));
      this.rangeRow(sec, 'Opacity', item.opacity, 0.1, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => this.state.patch(item.id, { opacity: v }));
      this.checkRow(sec, 'Wireframe mesh', item.wire, (v) => this.state.patch(item.id, { wire: v }));
      this.checkRow(sec, 'Clip to z-window', item.clip, (v) => this.state.patch(item.id, { clip: v }));
    });
  }

  bodyCurve(item, body) {
    this.exprRow(item, 'ex', 'x(t) =', body);
    this.exprRow(item, 'ey', 'y(t) =', body);
    this.exprRow(item, 'ez', 'z(t) =', body);
    this.chipsRow(body);
    this.domainRows(item, body, ['t'], [['tMin', 'tMax']]);

    this.advSection(item, body, (sec) => {
      this.rangeRow(sec, 'Samples', item.samples, 60, 2000, 20, (v) => `${v}`, (v) => this.state.patch(item.id, { samples: v }));
      this.rangeRow(sec, 'Thickness', item.thick, 0.3, 3, 0.1, (v) => `${v.toFixed(1)}×`, (v) => this.state.patch(item.id, { thick: v }));
      this.checkRow(sec, 'TNB frame + curvature κ', item.frame, (v) => { this.state.patch(item.id, { frame: v }); this.rerenderCard(this.state.get(item.id)); });
      if (item.frame) {
        this.checkRow(sec, 'Velocity r′ & acceleration r″ vectors', item.showVA, (v) => this.state.patch(item.id, { showVA: v }));
        this.checkRow(sec, 'Osculating circle (radius 1/κ)', item.showOsc, (v) => this.state.patch(item.id, { showOsc: v }));
        const row = document.createElement('div');
        row.className = 'opt-row';
        row.innerHTML = '<label>position t</label>';
        const play = document.createElement('button');
        play.className = 'play-btn';
        play.style.width = '22px'; play.style.height = '22px';
        play.innerHTML = item.framePlay ? PAUSE : PLAY;
        play.onclick = () => {
          this.state.patch(item.id, { framePlay: !item.framePlay }, { geometry: false });
          play.innerHTML = item.framePlay ? PAUSE : PLAY;
        };
        const r = document.createElement('input');
        r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.001; r.value = item.frameT;
        r.dataset.frameSlider = '1';
        r.oninput = () => {
          this.state.patch(item.id, { frameT: +r.value }, { geometry: false });
          this.manager.updateFrame(item);
        };
        row.appendChild(play); row.appendChild(r);
        sec.appendChild(row);
        const info = document.createElement('div');
        info.className = 'note';
        info.dataset.frameInfo = '1';
        info.style.fontFamily = 'var(--font-math)';
        sec.appendChild(info);
        queueMicrotask(() => this.manager.updateFrame(item));
      }
    });
  }

  // Implicit surfaces read as a whole equation, Desmos-style:
  // "x² + y² + z² = 9" in a single field (no '=' means "= 0").
  bodyImplicit(item, body) {
    const row = document.createElement('div');
    row.className = 'expr-row';
    const err = document.createElement('div');
    err.className = 'err-msg'; err.dataset.errFor = 'expr'; err.style.display = 'none';
    const apply = debounce((L, R) => this.state.patch(item.id, { expr: L, level: R }), 220);
    const mf = makeEquationField(item.expr, item.level, {
      placeholder: 'x^2 + y^2 + z^2 = 9',
      onEquation: (L, R) => {
        err.style.display = 'none';
        mf.classList.remove('err');
        apply(L, R);
      },
      onBadLatex: (msg) => {
        err.textContent = msg;
        err.style.display = '';
        mf.classList.add('err');
      },
    });
    mf.dataset.prop = 'expr';
    row.appendChild(mf);
    body.appendChild(row);
    body.appendChild(err);
    this.chipsRow(body);
    this.advSection(item, body, (sec) => {
      this.rangeRow(sec, 'Detail', item.res, 20, 90, 2, (v) => `${v}³`, (v) => this.state.patch(item.id, { res: v }));
      this.rangeRow(sec, 'Opacity', item.opacity, 0.1, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => this.state.patch(item.id, { opacity: v }));
    });
  }

  bodyField(item, body) {
    this.exprRow(item, 'ep', 'P(x,y,z) =', body);
    this.exprRow(item, 'eq', 'Q(x,y,z) =', body);
    this.exprRow(item, 'er', 'R(x,y,z) =', body);
    this.chipsRow(body);
    this.advSection(item, body, (sec) => {
      this.rangeRow(sec, 'Density', item.density, 3, 14, 1, (v) => `${v}³`, (v) => this.state.patch(item.id, { density: v }));
      this.rangeRow(sec, 'Length', item.scale, 0.2, 3, 0.1, (v) => `${v.toFixed(1)}×`, (v) => this.state.patch(item.id, { scale: v }));
      this.checkRow(sec, 'Equal arrow lengths', item.normalize, (v) => this.state.patch(item.id, { normalize: v }));
    });
  }

  bodyPoint(item, body) {
    this.exprRow(item, 'ex', 'x =', body);
    this.exprRow(item, 'ey', 'y =', body);
    this.exprRow(item, 'ez', 'z =', body);
    this.chipsRow(body);
    const row = document.createElement('div');
    row.className = 'expr-row';
    row.innerHTML = '<span class="expr-label">label</span>';
    const inp = document.createElement('input');
    inp.className = 'expr-input'; inp.value = item.label || '';
    inp.placeholder = 'optional';
    inp.oninput = debounce(() => this.state.patch(item.id, { label: inp.value }), 300);
    row.appendChild(inp);
    body.appendChild(row);
  }

  bodyVector(item, body) {
    this.exprRow(item, 'ex', 'v₁ =', body);
    this.exprRow(item, 'ey', 'v₂ =', body);
    this.exprRow(item, 'ez', 'v₃ =', body);
    this.chipsRow(body);
    const wrap = document.createElement('div');
    wrap.className = 'dom-pair';
    const r = document.createElement('div');
    r.className = 'dom-row';
    r.appendChild(Object.assign(document.createElement('span'), { textContent: 'tail (' }));
    for (const [i, prop] of [['x', 'ox'], ['y', 'oy'], ['z', 'oz']].entries()) {
      if (i) r.appendChild(document.createTextNode(','));
      const inp = document.createElement('input');
      inp.className = 'mini-input'; inp.style.width = '42px';
      inp.value = item[prop[1]];
      inp.oninput = debounce(() => this.state.patch(item.id, { [prop[1]]: inp.value }), 300);
      r.appendChild(inp);
    }
    r.appendChild(document.createTextNode(')'));
    wrap.appendChild(r);
    body.appendChild(wrap);
  }

  // Slider editor: the interactive track lives in the compact head; the
  // editor holds the definition (name, range, animation behavior).
  bodySlider(item, body, row) {
    const rowName = document.createElement('div');
    rowName.className = 'opt-row';
    rowName.innerHTML = '<label>name</label>';
    const name = document.createElement('input');
    name.className = 'mini-input';
    name.style.width = '64px';
    name.style.fontStyle = 'italic';
    name.value = item.name;
    name.onchange = () => {
      const v = name.value.trim();
      // 'e' is Euler's constant to the parser — a slider named e would be dead
      if (/^[a-z](\d+)?$/i.test(v) && v !== 'e' && !this.state.sliderItem(v)) {
        this.state.patch(item.id, { name: v }, { geometry: false });
        this.state.rebuildAll();
        row.querySelector('.srow-name').textContent = v;
      } else name.value = item.name;
    };
    rowName.appendChild(name);
    body.appendChild(rowName);

    const rr = document.createElement('div');
    rr.className = 'slider-range-row';
    const mk = (label, prop) => {
      const sp = document.createElement('span'); sp.textContent = label;
      const inp = document.createElement('input');
      inp.className = 'mini-input'; inp.value = item[prop];
      inp.onchange = () => {
        const v = parseFloat(inp.value);
        if (Number.isFinite(v)) {
          this.state.patch(item.id, { [prop]: v }, { geometry: false });
          const it = this.state.get(item.id);
          const track = row.querySelector('.slider-track');
          if (track) { track.min = it.min; track.max = it.max; track.step = it.step; }
        } else inp.value = item[prop];
      };
      rr.appendChild(sp); rr.appendChild(inp);
    };
    mk('min', 'min'); mk('max', 'max'); mk('step', 'step');
    body.appendChild(rr);

    this.rangeRow(body, 'Speed', item.speed, 0.1, 4, 0.1, (v) => `${v.toFixed(1)}×`, (v) => this.state.patch(item.id, { speed: v }, { geometry: false }));
    const segRow = document.createElement('div');
    segRow.className = 'opt-row';
    segRow.innerHTML = '<label>Repeat</label>';
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [mode, lab] of [['pingpong', 'back & forth'], ['loop', 'loop']]) {
      const b = document.createElement('button');
      b.textContent = lab;
      b.classList.toggle('sel', item.loop === mode);
      b.onclick = () => {
        this.state.patch(item.id, { loop: mode }, { geometry: false });
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
      };
      seg.appendChild(b);
    }
    segRow.appendChild(seg);
    body.appendChild(segRow);
  }

  /* ================= live updates ================= */

  rerenderCard(itemOrId) {
    const item = typeof itemOrId === 'string' ? this.state.get(itemOrId) : itemOrId;
    if (!item) return;
    const old = this.cards.get(item.id);
    if (!old) return;
    const fresh = this.buildCard(item);
    old.replaceWith(fresh);
    this.cards.set(item.id, fresh);
    this.updateRuntime(item);
  }

  updateRuntime(item) {
    const card = this.cards.get(item.id);
    if (!card) return;
    const errors = item.runtime?.errors || {};
    const hasIssue = Object.keys(errors).length > 0 || (item.runtime?.unknown || []).length > 0;

    // collapsed rows: red badge instead of inline messages, live math preview
    const badge = card.querySelector('.nrow-err');
    if (badge) {
      const open = this.openId === item.id;
      badge.style.display = (!open && hasIssue) ? '' : 'none';
      badge.title = Object.values(errors)[0]
        || ((item.runtime?.unknown || []).length ? `Unknown: ${item.runtime.unknown.join(', ')}` : '');
    }
    if (card._preview && this.openId !== item.id) {
      const fresh = this.previewFor(item);
      card._preview.replaceWith(fresh);
      card._preview = fresh;
    }

    for (const errDiv of card.querySelectorAll('[data-err-for]')) {
      const prop = errDiv.dataset.errFor;
      const msg = errors[prop];
      errDiv.style.display = msg ? '' : 'none';
      errDiv.textContent = msg || '';
      const inp = card.querySelector(`[data-prop="${prop}"]`);
      if (inp) inp.classList.toggle('err', !!msg);
    }
    const editor = card.querySelector('.nrow-editor');
    if (errors._build && editor) {
      let d = card.querySelector('[data-err-build]');
      if (!d) {
        d = document.createElement('div');
        d.className = 'err-msg'; d.dataset.errBuild = '1';
        editor.appendChild(d);
      }
      d.textContent = `Could not plot: ${errors._build}`;
    } else card.querySelector('[data-err-build]')?.remove();

    const ri = card.querySelector('[data-riemann]');
    if (ri) {
      if (item.runtime?.riemann) {
        const { sum, fine, n } = item.runtime.riemann;
        ri.textContent = `${n}×${n} sum ≈ ${fmtNum(sum)}    (fine estimate ${fmtNum(fine)})`;
      } else {
        ri.textContent = '—'; // hidden item or compile error: no current sum
      }
    }

    const chips = card.querySelector('.slider-chips');
    if (chips) {
      chips.innerHTML = '';
      for (const name of item.runtime?.unknown || []) {
        const b = document.createElement('button');
        b.className = 'mk-slider';
        b.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> slider <span class="var-name">${esc(name)}</span>`;
        b.onclick = () => {
          this.state.addItem('slider', { name, value: 1 });
        };
        chips.appendChild(b);
      }
    }
  }

  syncSlider(item) {
    const card = this.cards.get(item.id);
    if (!card) return;
    const track = card.querySelector('.slider-track');
    const val = card.querySelector('.slider-val');
    if (track) track.value = item.value;
    if (val && document.activeElement !== val) val.value = fmtNum(item.value);
  }

  syncFrame(item, info) {
    const card = this.cards.get(item.id);
    if (!card) return;
    const r = card.querySelector('[data-frame-slider]');
    if (r && document.activeElement !== r) r.value = item.frameT;
    const d = card.querySelector('[data-frame-info]');
    if (d) {
      d.textContent = `t = ${fmtNum(info.t)}    κ = ${fmtNum(info.kappa)}    |r′| = ${fmtNum(info.speed)}`
        + (Number.isFinite(info.R) ? `    R = ${fmtNum(info.R)}` : '')
        + (Number.isFinite(info.arcLength) ? `    L = ${fmtNum(info.arcLength)}` : '');
    }
  }

  openColorPop(item, rail, dot, row) {
    document.querySelectorAll('.color-pop').forEach((p) => p.remove());
    const pop = document.createElement('div');
    pop.className = 'color-pop';
    const sw = document.createElement('div');
    sw.className = 'swatches';
    for (const c of PALETTE.slice(0, 14)) {
      const b = document.createElement('button');
      b.className = 'swatch' + (!item.cmap && item.color === c ? ' sel' : '');
      b.style.background = c;
      b.onclick = () => {
        this.state.patch(item.id, { color: c, ...(hasCmap(item) ? { cmap: '' } : {}) });
        row.style.setProperty('--item-color', c);
        dot.style.background = c;
        pop.remove();
      };
      sw.appendChild(b);
    }
    pop.appendChild(sw);
    if (hasCmap(item)) {
      const list = document.createElement('div');
      list.className = 'cmap-list';
      for (const name of COLORMAP_NAMES) {
        const rowEl = document.createElement('div');
        rowEl.className = 'cmap-row' + (item.cmap === name ? ' sel' : '');
        rowEl.innerHTML = `<span style="width:52px">${name}</span>`;
        const bar = document.createElement('span');
        bar.className = 'cmap-bar';
        bar.style.background = colormapCSS(name);
        rowEl.appendChild(bar);
        rowEl.onclick = () => {
          this.state.patch(item.id, { cmap: name });
          dot.style.background = colormapCSS(name);
          pop.remove();
        };
        list.appendChild(rowEl);
      }
      pop.appendChild(list);
    }
    rail.appendChild(pop);
  }
}

function hasCmap(item) {
  return item.type === 'surface' || item.type === 'parametric' || item.type === 'implicit' || item.type === 'field';
}

function fmtNum(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(2);
  return String(Math.round(v * 1000) / 1000);
}
