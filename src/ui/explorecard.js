// Floating guide card for exploration scenes: title, live readouts recomputed
// from the current slider values, a teaching note, and (for planar scenes) a
// 2D/3D view toggle that locks the camera to a plan view.
export class ExploreCard {
  constructor(el, state, viewport) {
    this.el = el;
    this.state = state;
    this.viewport = viewport;
    this.ex = null;
    this._raf = 0;
    const sched = () => {
      if (!this.ex || this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this._paintRows(); });
    };
    state.on('slider-value', sched);
    state.on('item-updated', sched);
  }

  show(ex) {
    if (this.ex) this._leave2D();
    this.ex = ex;
    this._2d = false;
    const el = this.el;
    el.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'ins-title';
    title.innerHTML = `<span class="exp-name"><span class="codicon codicon-compass"></span> ${ex.name}</span>`;
    const close = document.createElement('button');
    close.className = 'ins-close';
    close.textContent = '✕';
    close.title = 'Close the exploration guide';
    close.onclick = () => this.hide();
    title.appendChild(close);
    el.appendChild(title);

    this.tbody = document.createElement('table');
    el.appendChild(this.tbody);

    if (ex.explore.note) {
      const note = document.createElement('div');
      note.className = 'exp-note';
      note.textContent = ex.explore.note;
      el.appendChild(note);
    }

    if (ex.explore.view2d) {
      const btn = document.createElement('button');
      btn.className = 'exp-2d';
      this._paint2dBtn = () => {
        btn.innerHTML = this._2d
          ? '<span class="codicon codicon-globe"></span> Back to 3D'
          : '<span class="codicon codicon-symbol-interface"></span> View in 2D';
      };
      this._paint2dBtn();
      btn.onclick = () => {
        this._2d = !this._2d;
        if (this._2d) this.viewport.setView2D(ex.explore.view2d);
        else this.viewport.clearView2D(this.state.settings.ortho);
        this._paint2dBtn();
      };
      el.appendChild(btn);
    }

    this._paintRows();
    el.hidden = false;
  }

  _paintRows() {
    if (!this.ex) return;
    const rows = this.ex.explore.rows ? this.ex.explore.rows(this.state.sliders()) : [];
    this.tbody.innerHTML = '';
    for (const [label, value] of rows) {
      const tr = this.tbody.insertRow();
      tr.insertCell().textContent = label;
      tr.insertCell().textContent = value;
    }
  }

  _leave2D() {
    if (this._2d) this.viewport.clearView2D(this.state.settings.ortho);
    this._2d = false;
  }

  hide() {
    if (!this.ex) return;
    this._leave2D();
    this.ex = null;
    this.el.hidden = true;
  }
}
