import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

// ──────────────────────────────────────────────────────────────────────────────
// Viewer — owns the single WebGLRenderer, the WebXR session, the shared animation
// loop, resize handling, desktop mouse picking, VR controllers + laser pointers,
// the in-VR 3D tooltip and the in-VR control panel.
//
// Each visualization ("viz") is a plug-in that exposes a known interface and is
// swapped in via setActiveViz() WITHOUT recreating the renderer — so switching
// vizzes never tears down an active VR session.
//
// Viz plug-in interface expected by the Viewer:
//   build(renderer)              one-time scene/camera/controls/content setup
//   update(...)                  rebuild data-driven content
//   frame(t, presenting)         per-frame animation (NOT camera control)
//   getPickTargets()  -> Mesh[]  meshes the pointer can hover
//   describe(obj)     -> {title, sub, value} | null   tooltip content for a mesh
//   onHover(obj|null)            optional viz-specific hover highlight
//   setVRMode(on)                toggle desktop-only decor (grids, floors…)
//   onResize(w, h)
//   dispose()
//   .scene .camera .controls .root   (root = THREE.Group holding dockable content)
// ──────────────────────────────────────────────────────────────────────────────

export class Viewer {
  constructor(canvas, domTooltip) {
    this.canvas = canvas;
    this.domTooltip = domTooltip;
    this.renderer = null;
    this.labelRenderer = null;
    this.active = null;
    this.onRequestViz = null;       // callback(n) set by main.js
    this.clock = new THREE.Clock();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-9999, -9999);
    this._tempMatrix = new THREE.Matrix4();

    // XR rig (controllers, lasers, panel, 3D tooltip) — re-parented into the
    // active viz scene whenever the viz changes.
    this.xrRig = new THREE.Group();
    this.controllers = [];
    this.panel = null;
    this.panelButtons = [];
    this.tooltip3D = null;
    this._tooltip3DText = '';

    // Emulator-compat: track whether we hid XRWebGLBinding to force the
    // XRWebGLLayer fallback path (see _createVRButton).
    this._savedBinding = null;
    this._bindingNeutralized = false;

    this._origRootTransform = new WeakMap();  // restore docking per viz

    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
  }

  init() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;   // ── WebXR ON ──

    // CSS2D label layer (desktop only; not composited into the headset)
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    const ld = this.labelRenderer.domElement;
    ld.style.position = 'absolute';
    ld.style.top = '0';
    ld.style.left = '0';
    ld.style.pointerEvents = 'none';
    this.canvas.parentElement.appendChild(ld);

    // Floor-relative reference space → content sits at a natural standing height.
    this.renderer.xr.setReferenceSpaceType('local-floor');

    this._createVRButton();
    this._buildXRRig();

    this.renderer.xr.addEventListener('sessionstart', () => this._onSessionStart());
    this.renderer.xr.addEventListener('sessionend',   () => this._onSessionEnd());

    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('mousemove', this._onMouseMove);

    // Unified loop — works for both desktop and VR. Required for WebXR.
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ── WebXR "Enter VR" button ──────────────────────────────────────────────────
  // Custom button (instead of three's VRButton) so we can work around emulators /
  // polyfills that leave a native XRWebGLBinding in place while polyfilling the
  // session. three uses XRWebGLBinding whenever it exists; if constructing one with
  // the actual session throws, we hide it so three falls back to XRWebGLLayer —
  // the path the emulator supports. Real headsets keep the optimal layers path.
  _createVRButton() {
    const btn = document.createElement('button');
    btn.className = 'vr-button';
    Object.assign(btn.style, {
      position: 'absolute', bottom: '18px', left: '50%', transform: 'translateX(-50%)',
      padding: '10px 18px', border: '1px solid #58a6ff', borderRadius: '8px',
      background: 'rgba(13,17,23,0.7)', color: '#e6edf3',
      font: '500 13px system-ui, sans-serif', cursor: 'pointer', zIndex: '20',
    });
    this.canvas.parentElement.appendChild(btn);

    if (!('xr' in navigator)) {
      btn.textContent = 'WEBXR NOT AVAILABLE';
      btn.disabled = true;
      return;
    }

    let currentSession = null;

    const onSessionEnded = () => {
      currentSession?.removeEventListener('end', onSessionEnded);
      currentSession = null;
      btn.textContent = 'ENTER VR';
    };

    const startSession = async () => {
      try {
        const session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
        });

        const gl = this.renderer.getContext();
        try { await gl.makeXRCompatible(); } catch { /* three retries internally */ }

        this._bindingNeutralized = false;
        if (typeof XRWebGLBinding !== 'undefined') {
          try {
            // Probe: does the native binding accept THIS session?
            new XRWebGLBinding(session, gl);
          } catch {
            // No (emulator/polyfill) → hide it for the session's lifetime.
            this._savedBinding = window.XRWebGLBinding;
            window.XRWebGLBinding = undefined;
            this._bindingNeutralized = true;
          }
        }

        await this.renderer.xr.setSession(session);
        currentSession = session;
        session.addEventListener('end', onSessionEnded);
        btn.textContent = 'EXIT VR';
      } catch (err) {
        console.error('Failed to start VR session:', err);
        btn.textContent = 'VR FAILED — see console';
      }
    };

    btn.textContent = 'CHECKING VR…';
    btn.disabled = true;
    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      btn.textContent = supported ? 'ENTER VR' : 'VR NOT SUPPORTED';
      btn.disabled = !supported;
    }).catch(() => { btn.textContent = 'VR NOT SUPPORTED'; btn.disabled = true; });

    btn.addEventListener('click', () => {
      if (currentSession) currentSession.end();
      else startSession();
    });
  }

  // ── Viz lifecycle ──────────────────────────────────────────────────────────

  setActiveViz(viz) {
    // Drop any stale CSS2D label DOM nodes from the previous viz.
    const ld = this.labelRenderer.domElement;
    while (ld.firstChild) ld.removeChild(ld.firstChild);

    // Move the XR rig into the new scene so controllers/panel/tooltip render.
    if (this.xrRig.parent) this.xrRig.parent.remove(this.xrRig);
    this.active = viz;
    if (viz) {
      viz.scene.add(this.xrRig);
      const presenting = this.renderer.xr.isPresenting;
      viz.setVRMode(presenting);
      if (presenting) this._dock(viz);
    }
  }

  // Re-fit the docked hologram after content changes (viz switch, item/year edits).
  refitVR() {
    if (this.renderer.xr.isPresenting && this.active) this._dock(this.active);
  }

  // ── Render loop ──────────────────────────────────────────────────────────────

  _frame() {
    const viz = this.active;
    if (!viz) return;
    const presenting = this.renderer.xr.isPresenting;
    const t = this.clock.getElapsedTime();

    viz.frame(t, presenting);

    if (presenting) {
      this._updateXRInput(viz);
    } else if (viz.controls) {
      viz.controls.update();
    }

    this.renderer.render(viz.scene, viz.camera);

    // CSS2D labels only make sense on the flat screen.
    if (!presenting) this.labelRenderer.render(viz.scene, viz.camera);
  }

  // ── Desktop mouse picking ────────────────────────────────────────────────────

  _onMouseMove(e) {
    if (this.renderer.xr.isPresenting) return;
    const viz = this.active;
    if (!viz) return;

    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, viz.camera);
    const hits = this.raycaster.intersectObjects(viz.getPickTargets(), false);
    const obj = hits.length ? hits[0].object : null;

    if (viz.onHover) viz.onHover(obj);

    const info = obj ? viz.describe(obj, hits[0].point) : null;
    if (info) {
      this.domTooltip.classList.remove('hidden');
      this.domTooltip.style.left = (e.clientX - rect.left + 14) + 'px';
      this.domTooltip.style.top = (e.clientY - rect.top - 36) + 'px';
      this.domTooltip.innerHTML =
        `<strong>${info.title}</strong><br>` +
        `<span style="color:#8b949e">${info.sub}</span><br>${info.value}`;
    } else {
      this.domTooltip.classList.add('hidden');
    }
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    if (this.active) this.active.onResize(w, h);
  }

  // ── WebXR rig: controllers, lasers, tooltip, control panel ───────────────────

  _buildXRRig() {
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1),
    ]);

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({
        color: 0x58a6ff, transparent: true, opacity: 0.8,
      }));
      laser.name = 'laser';
      laser.scale.z = 5;
      controller.add(laser);

      // small pointer dot at the laser tip
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x58a6ff })
      );
      dot.position.z = -5;
      dot.name = 'dot';
      controller.add(dot);

      controller.addEventListener('selectstart', () => this._onXRSelect(controller));
      controller.userData.hoveredButton = null;

      this.xrRig.add(controller);
      this.controllers.push(controller);
    }

    // 3D tooltip — a sprite that floats near whatever a laser is pointing at.
    this.tooltip3D = new THREE.Sprite(new THREE.SpriteMaterial({
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.tooltip3D.visible = false;
    this.tooltip3D.renderOrder = 999;
    this.xrRig.add(this.tooltip3D);

    // In-VR control panel: buttons to switch visualization without removing headset.
    this.panel = new THREE.Group();
    this.panel.position.set(-0.62, 1.25, -0.55);
    this.panel.rotation.y = 0.5;
    this.panel.visible = false;
    const labels = [['Bars', 1], ['Terrain', 2], ['Bubbles', 3]];
    labels.forEach(([label, n], idx) => {
      const btn = this._makePanelButton(label);
      btn.position.y = (1 - idx) * 0.16;
      btn.userData.vizIndex = n;
      this.panel.add(btn);
      this.panelButtons.push(btn.children[0]); // the pickable plane
      btn.children[0].userData.vizIndex = n;
    });
    this.xrRig.add(this.panel);
  }

  _makePanelButton(label) {
    const group = new THREE.Group();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.13),
      new THREE.MeshBasicMaterial({ color: 0x21262d, transparent: true, opacity: 0.92 })
    );
    plane.userData.isPanelButton = true;
    plane.userData.baseColor = 0x21262d;
    group.add(plane);

    const text = this._makeTextSprite(label, { fontSize: 44, color: '#e6edf3' });
    text.position.z = 0.002;
    text.scale.multiplyScalar(0.13);
    group.add(text);
    return group;
  }

  // Canvas-texture text sprite (used for VR-only UI: panel labels + 3D tooltip).
  _makeTextSprite(text, opts = {}) {
    const lines = Array.isArray(text) ? text : [text];
    const { fontSize = 40, color = '#e6edf3', bg = null, pad = 16 } = opts;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = `${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.font = font;
    const widths = lines.map(l => ctx.measureText(l).width);
    const w = Math.ceil(Math.max(...widths)) + pad * 2;
    const lineH = fontSize * 1.3;
    const h = Math.ceil(lineH * lines.length) + pad * 2;
    canvas.width = w;
    canvas.height = h;

    ctx.font = font;
    ctx.textBaseline = 'middle';
    if (bg) {
      ctx.fillStyle = bg;
      const r = 16;
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r);
      ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r); ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = color;
    lines.forEach((l, i) => ctx.fillText(l, pad, pad + lineH * (i + 0.5)));

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
    }));
    sprite.scale.set(w / h, 1, 1);   // caller multiplies to taste
    return sprite;
  }

  _setTooltip3D(info) {
    const text = info ? `${info.title}|${info.sub}|${info.value}` : '';
    if (text === this._tooltip3DText) return;
    this._tooltip3DText = text;
    if (!info) { this.tooltip3D.visible = false; return; }
    if (this.tooltip3D.material.map) this.tooltip3D.material.map.dispose();
    const spr = this._makeTextSprite(
      [info.title, info.sub, String(info.value)],
      { fontSize: 38, color: '#e6edf3', bg: 'rgba(13,17,23,0.92)' }
    );
    this.tooltip3D.material.map = spr.material.map;
    this.tooltip3D.material.needsUpdate = true;
    const aspect = spr.scale.x / spr.scale.y;
    this.tooltip3D.scale.set(0.22 * aspect, 0.22, 1);
    spr.material.dispose();
  }

  // ── WebXR per-frame input ────────────────────────────────────────────────────

  _updateXRInput(viz) {
    const targets = viz.getPickTargets();
    let tooltipInfo = null;
    let tooltipPoint = null;

    // reset panel button highlight
    this.panelButtons.forEach(p => p.material.color.setHex(p.userData.baseColor));

    for (const controller of this.controllers) {
      controller.userData.hoveredButton = null;
      this._tempMatrix.identity().extractRotation(controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tempMatrix);

      // Panel buttons take priority for the pointer.
      const panelHits = this.panel.visible
        ? this.raycaster.intersectObjects(this.panelButtons, false) : [];
      const dataHits = this.raycaster.intersectObjects(targets, false);

      const laser = controller.getObjectByName('laser');
      const dot = controller.getObjectByName('dot');

      let hitDist = 5;
      if (panelHits.length) {
        const btn = panelHits[0].object;
        btn.material.color.setHex(0x388bfd);
        controller.userData.hoveredButton = btn.userData.vizIndex;
        hitDist = panelHits[0].distance;
      } else if (dataHits.length) {
        const info = viz.describe(dataHits[0].object, dataHits[0].point);
        if (info) { tooltipInfo = info; tooltipPoint = dataHits[0].point; }
        hitDist = dataHits[0].distance;
      }
      if (laser) laser.scale.z = hitDist;
      if (dot) dot.position.z = -hitDist;
    }

    this._setTooltip3D(tooltipInfo);
    if (tooltipInfo && tooltipPoint) {
      this.tooltip3D.visible = true;
      this.tooltip3D.position.copy(tooltipPoint);
      this.tooltip3D.position.y += 0.12;
    } else {
      this.tooltip3D.visible = false;
    }
  }

  _onXRSelect(controller) {
    const n = controller.userData.hoveredButton;
    if (n && this.onRequestViz) this.onRequestViz(n);
  }

  // ── Session start / end: dock content as a tabletop hologram ──────────────────

  _onSessionStart() {
    this.domTooltip.classList.add('hidden');
    this.panel.visible = true;
    if (this.active) {
      this.active.setVRMode(true);
      this._dock(this.active);
    }
  }

  _onSessionEnd() {
    // Restore XRWebGLBinding if we hid it for emulator compatibility.
    if (this._bindingNeutralized) {
      window.XRWebGLBinding = this._savedBinding;
      this._bindingNeutralized = false;
    }
    this.panel.visible = false;
    this.tooltip3D.visible = false;
    this._tooltip3DText = '';
    if (this.active) {
      this.active.setVRMode(false);
      this._undock(this.active);
    }
  }

  // Scale + position a viz's content group so it sits ~0.8 m wide, floating like a
  // tabletop hologram ~0.8 m in front of the user at ~1.2 m height.
  _dock(viz) {
    const root = viz.root;
    if (!root) return;
    if (!this._origRootTransform.has(viz)) {
      this._origRootTransform.set(viz, {
        p: root.position.clone(), s: root.scale.clone(),
      });
    }
    root.scale.set(1, 1, 1);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z, size.y * 0.6) || 1;
    const s = 0.8 / maxDim;

    root.scale.setScalar(s);
    root.position.set(
      -center.x * s,
      1.2 - center.y * s,
      -0.8 - center.z * s,
    );
  }

  _undock(viz) {
    const orig = this._origRootTransform.get(viz);
    if (orig && viz.root) {
      viz.root.position.copy(orig.p);
      viz.root.scale.copy(orig.s);
    }
  }
}
