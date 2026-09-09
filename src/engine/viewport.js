// Three.js viewport: renderer, camera, controls, lights, axes box, render loop.
import * as THREE from 'three';
import { LINE_RESOLUTION } from './lineres.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AnaglyphEffect } from 'three/addons/effects/AnaglyphEffect.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildAxes } from './axes.js';

export class Viewport {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // studio environment: soft image-based lighting for rich materials
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    // Math space uses z-up; three uses y-up. Everything mathematical lives in
    // `world`, rotated so math-z points up on screen.
    this.world = new THREE.Group();
    this.world.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);

    this.plotRoot = new THREE.Group();   // plotted items
    this.overlayRoot = new THREE.Group(); // inspect markers etc.
    this.world.add(this.plotRoot, this.overlayRoot);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 4000);
    this.anaglyph = null;

    this._makeControls();
    const el = this.renderer.domElement;
    el.addEventListener('wheel', (e) => this._onWheel(e), { passive: false, capture: true });
    el.addEventListener('pointerdown', () => { this._pointerDown = true; }, { capture: true });
    window.addEventListener('pointerup', () => { this._pointerDown = false; }, { capture: true });
    window.addEventListener('pointercancel', () => { this._pointerDown = false; }, { capture: true });

    // Lighting: environment (above) carries the ambience; a camera-parented
    // key keeps orbit-independent definition; a fixed sun adds a stable top light.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb9bec7, 0.35);
    this.scene.add(this.hemi);
    this.camLights = new THREE.Group();
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(2.5, 3.5, 2.5);
    const fill = new THREE.DirectionalLight(0x9fb4d8, 0.2);
    fill.position.set(-3, -1, 1.5);
    this.camLights.add(key, fill);
    this.scene.add(this.camera);
    this.camera.add(this.camLights);

    // fixed sun in math coordinates (no shadows: a projected silhouette reads as geometry)
    this.sun = new THREE.DirectionalLight(0xffffff, 0.45);
    this.world.add(this.sun, this.sun.target);

    this.bounds = { xmin: -5, xmax: 5, ymin: -5, ymax: 5, zmin: -5, zmax: 5 };
    this.axes = null;
    this.preferred2D = 'top'; // plane the 2D toggle uses; explorations override
    this.axisOptions = { grid: true, labels: true, box: true };
    this.dark = false;
    this._updateSun();
    this.rebuildAxes();
    this.resetView();

    this._raf = null;
    this._renderRequested = true;
    this._tickers = new Set();

    const ro = new ResizeObserver(() => this._resize());
    ro.observe(container);
    this._resize();
    this._loop();
  }

  get span() {
    const b = this.bounds;
    return Math.max(b.xmax - b.xmin, b.ymax - b.ymin, b.zmax - b.zmin);
  }

  center() {
    const b = this.bounds;
    return new THREE.Vector3(
      (b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2, (b.zmin + b.zmax) / 2);
  }

  // math (x,y,z) -> world position vector (before group rotation, i.e. set on
  // children of `world`, which uses math coordinates directly)
  resetView(animate = false) {
    // home while locked in 2D re-frames the plan view (keeps the 3D snapshot)
    if (this._view2d) {
      const plane = this._view2d;
      this._view2d = null;
      this.setView2D(plane);
      return;
    }
    const c = this.center().applyEuler(this.world.rotation);
    const d = this.span * 1.55;
    const pos = new THREE.Vector3(c.x + d * 0.86, c.y + d * 0.52, c.z + d * 0.86);
    if (this.camera.isOrthographicCamera) {
      this.camera.zoom = 1;
      this._orthoH = pos.distanceTo(c) * Math.tan(THREE.MathUtils.degToRad(20));
      this._resize(); // reapplies the frustum from _orthoH at the current aspect
    }
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(c);
      this.controls.update();
      this.requestRender();
      return;
    }
    // eased flight home (~450 ms)
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    const start = performance.now(), dur = 450;
    const tick = () => {
      const u = Math.min((performance.now() - start) / dur, 1);
      const e = 1 - Math.pow(1 - u, 3); // ease-out cubic
      this.camera.position.lerpVectors(p0, pos, e);
      this.controls.target.lerpVectors(t0, c, e);
      this.controls.update();
      if (u >= 1) { this.removeTicker(tick); return false; }
      return true;
    };
    this.addTicker(tick);
    this.requestRender();
  }

  setBounds(b) {
    Object.assign(this.bounds, b);
    this._updateSun();
    if (this.camera.isOrthographicCamera) {
      this._orthoH = this.camera.position.distanceTo(this.controls.target)
        * Math.tan(THREE.MathUtils.degToRad(20));
      this._resize();
    }
    this.rebuildAxes();
    this.requestRender();
  }

  _updateSun() {
    const B = this.bounds, span = this.span;
    const cx = (B.xmin + B.xmax) / 2, cy = (B.ymin + B.ymax) / 2;
    this.sun.position.set(cx + span * 0.4, cy - span * 0.3, B.zmax + span * 0.9);
    this.sun.target.position.set(cx, cy, (B.zmin + B.zmax) / 2);
  }

  _makeControls() {
    const target = this.controls ? this.controls.target.clone() : null;
    if (this.controls) this.controls.dispose();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;   // glides a little after release (per-second, see _loop)
    this.controls.rotateSpeed = 0.6;
    this.controls.panSpeed = 0.9;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 2000;
    if (target) this.controls.target.copy(target);
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => this._beginInteract());
    this.controls.update();
  }

  /* ---------- interaction smoothing ----------
   * Wheel and button zoom are eased over a few frames instead of jumping, and while the
   * user drags (or a zoom glides) the canvas renders at a reduced pixel ratio on HiDPI
   * screens, then snaps back to full resolution once everything settles. */
  _beginInteract() {
    if (this._interacting) return;
    this._interacting = true;
    const full = Math.min(window.devicePixelRatio, 2);
    if (full > 1.3) {
      this.renderer.setPixelRatio(1.3);
      if (this.anaglyph) this.anaglyph.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    this.requestRender();
  }

  _endInteract() {
    if (!this._interacting) return;
    this._interacting = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (this.anaglyph) this.anaglyph.setSize(this.container.clientWidth, this.container.clientHeight);
    this.requestRender();
  }

  _onWheel(e) {
    e.preventDefault();
    e.stopImmediatePropagation(); // OrbitControls' own (instant) dolly stays out of it
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 400;
    dy = Math.max(-240, Math.min(240, dy));
    this.zoomBy(Math.exp(dy * 0.0016));
  }

  // immediate dolly by `factor` (< 1 zooms in)
  _zoomNow(factor) {
    const cam = this.camera, t = this.controls.target;
    if (cam.isOrthographicCamera) {
      cam.zoom = Math.min(50, Math.max(0.05, cam.zoom / factor));
      cam.updateProjectionMatrix();
    } else {
      cam.position.sub(t).multiplyScalar(factor).add(t);
    }
    this.controls.update();
    this.requestRender();
  }

  // eased dolly: the remaining log-factor decays toward zero over ~0.2 s
  _zoomTick(dt) {
    const rem = this._zoomRemaining || 0;
    if (!rem) return false;
    if (Math.abs(rem) < 1e-3) { this._zoomRemaining = 0; this._zoomNow(Math.exp(rem)); return false; }
    const step = rem * (1 - Math.exp(-dt * 14));
    this._zoomRemaining = rem - step;
    this._zoomNow(Math.exp(step));
    return true;
  }

  // 'perspective' | 'orthographic'
  setProjection(kind, _internal = false) {
    // an outside projection change while locked in 2D exits 2D first so the
    // controls never end up half-configured
    if (this._view2d && !_internal) this.clearView2D();
    const ortho = kind === 'orthographic';
    // anaglyph requires a perspective camera — the two modes are exclusive
    if (ortho && this.anaglyph) this.setAnaglyph(false);
    if (ortho === !!this.camera.isOrthographicCamera) return;
    const old = this.camera;
    const target = this.controls.target.clone();
    const dist = old.position.distanceTo(target);
    const aspect = old.aspect || (this.container.clientWidth / Math.max(1, this.container.clientHeight));
    let cam;
    if (ortho) {
      const halfH = dist * Math.tan(THREE.MathUtils.degToRad(40 / 2));
      this._orthoH = halfH;
      cam = new THREE.OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, -4000, 4000);
    } else {
      cam = new THREE.PerspectiveCamera(40, aspect, 0.01, 4000);
    }
    cam.position.copy(old.position);
    cam.quaternion.copy(old.quaternion);
    old.remove(this.camLights);
    cam.add(this.camLights);
    this.scene.remove(old);
    this.scene.add(cam);
    this.camera = cam;
    this._makeControls();
    this._resize();
    this.requestRender();
  }

  // Locked plan view for 2D explorations: ortho camera straight down an axis.
  // 'top' looks down math-z at the xy-plane; 'front' looks along math-y at xz.
  // The exact 3D camera pose is snapshotted on entry and restored verbatim on
  // exit, so toggling 2D never loses where the user was.
  setView2D(plane) {
    if (this._view2d === plane) return;
    if (!this._view2d && !this._saved3d) {
      this._saved3d = {
        pos: this.camera.position.clone(),
        target: this.controls.target.clone(),
        up: this.camera.up.clone(),
        ortho: !!this.camera.isOrthographicCamera,
        zoom: this.camera.zoom,
        orthoH: this._orthoH,
      };
    }
    this.setProjection('orthographic', true);
    this._view2d = plane;
    this.rebuildAxes(); // flat 2D presentation: grid plane + in-plane axes only
    const mathEye = plane === 'front' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, 1);
    const mathUp = plane === 'front' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const c = this.center();
    const d = this.span * 1.6;
    const pos = c.clone().addScaledVector(mathEye, d).applyEuler(this.world.rotation);
    this.camera.up.copy(mathUp.applyEuler(this.world.rotation));
    this.camera.position.copy(pos);
    this.camera.zoom = 1;
    this.controls.target.copy(c.applyEuler(this.world.rotation));
    this.controls.enableRotate = false;
    this._orthoH = d * Math.tan(THREE.MathUtils.degToRad(20));
    this._resize();
    this.controls.update();
    this.requestRender();
  }

  clearView2D() {
    if (!this._view2d) return;
    this._view2d = null;
    this.rebuildAxes();
    const s = this._saved3d;
    this._saved3d = null;
    this.camera.up.copy(s ? s.up : new THREE.Vector3(0, 1, 0));
    this.setProjection(s && s.ortho ? 'orthographic' : 'perspective', true);
    if (!s) { this.resetView(true); this.onView2DCleared?.(); return; }
    this.camera.up.copy(s.up);
    this.camera.position.copy(s.pos);
    if (s.ortho) {
      this._orthoH = s.orthoH;
      this.camera.zoom = s.zoom;
      this._resize();
    }
    this._makeControls();
    this.controls.target.copy(s.target);
    this.controls.update();
    this.requestRender();
    this.onView2DCleared?.();
  }

  setAnaglyph(on) {
    if (on && this.camera.isOrthographicCamera) this.setProjection('perspective');
    if (on && !this.anaglyph) {
      this.anaglyph = new AnaglyphEffect(this.renderer);
      const w = this.container.clientWidth, h = this.container.clientHeight;
      if (w && h) this.anaglyph.setSize(w, h);
    } else if (!on && this.anaglyph) {
      this.anaglyph.dispose?.();
      this.anaglyph = null;
      this._resize();
    }
    this.requestRender();
  }

  setTheme(dark) {
    this.dark = dark;
    this.hemi.groundColor.setHex(dark ? 0x3a4048 : 0xb9bec7);
    this.hemi.intensity = dark ? 0.25 : 0.3;
    this.scene.environmentIntensity = dark ? 0.38 : 0.5;
    this.renderer.toneMappingExposure = dark ? 1.05 : 1.0;
    this.rebuildAxes();
    this.requestRender();
  }

  rebuildAxes() {
    if (this.axes) { this.world.remove(this.axes.group); this.axes.dispose(); }
    this.axes = buildAxes(this.bounds, { dark: this.dark, ...this.axisOptions, flat: this._view2d || null });
    this.world.add(this.axes.group);
    this.requestRender();
  }

  zoomBy(factor) {
    this._zoomRemaining = (this._zoomRemaining || 0) + Math.log(factor);
    this._beginInteract();
  }

  requestRender() { this._renderRequested = true; }

  // tickers: fns called every frame; return true to keep rendering (animation)
  addTicker(fn) { this._tickers.add(fn); }
  removeTicker(fn) { this._tickers.delete(fn); }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    LINE_RESOLUTION.set(w, h);
    this.scene.traverse((o) => { if (o.material && o.material.isLineMaterial) o.material.resolution = LINE_RESOLUTION; });
    if (this.camera.isOrthographicCamera) {
      const halfH = this._orthoH || this.span * 0.55;
      this.camera.left = -halfH * (w / h);
      this.camera.right = halfH * (w / h);
      this.camera.top = halfH;
      this.camera.bottom = -halfH;
    } else {
      this.camera.aspect = w / h;
    }
    this.camera.updateProjectionMatrix();
    if (this.anaglyph) this.anaglyph.setSize(w, h);
    this.requestRender();
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this._lastFrame || now)) / 1000);
    this._lastFrame = now;
    let animating = false;
    for (const t of this._tickers) if (t()) animating = true;
    const zooming = this._zoomTick(dt);
    // frame-rate independent damping: OrbitControls scales the factor by dt (60 fps reference)
    const damping = this.controls.update(dt || 1 / 60);
    if (this._interacting && !zooming && !damping && !this._pointerDown) this._endInteract();
    if (this._renderRequested || animating || damping || zooming) {
      this._renderRequested = false;
      if (this.axes) this.axes.update(this.camera, this.world);
      if (this.anaglyph && this.camera.isPerspectiveCamera) this.anaglyph.render(this.scene, this.camera);
      else this.renderer.render(this.scene, this.camera);
    }
  }

  screenshotBlob() {
    return new Promise((resolve) => {
      if (this.axes) this.axes.update(this.camera, this.world);
      if (this.anaglyph && this.camera.isPerspectiveCamera) this.anaglyph.render(this.scene, this.camera);
      else this.renderer.render(this.scene, this.camera);
      this.renderer.domElement.toBlob(resolve, 'image/png');
    });
  }

  // Ray from a screen point, expressed in math coordinates.
  mathRay(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    this.world.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(this.world.matrixWorld).invert();
    return ray.ray.clone().applyMatrix4(inv);
  }

  // Raycast into plotted meshes. Returns { object, point (math coords) } or null.
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.plotRoot.children, true);
    for (const h of hits) {
      if (!h.object.visible || h.object.userData.unpickable) continue;
      const p = this.world.worldToLocal(h.point.clone());
      return { object: h.object, point: p, faceIndex: h.faceIndex };
    }
    return null;
  }
}
