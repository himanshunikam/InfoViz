import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class TerrainViz {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.controls = null;
    this.labelRenderer = null;
    this.animId = null;
    this.terrainMesh = null;
    this.wireMesh = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-9999, -9999);
    this._names = [];
    this._years = [];
    this._items = {};
    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
  }

  init() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);
    this.scene.fog = new THREE.FogExp2(0x0d1117, 0.006);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    this.camera.position.set(0, 28, 48);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.canvas.parentElement.appendChild(this.labelRenderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(30, 60, 30);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x2244cc, 0.4);
    fill.position.set(-20, 20, -20);
    this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this._animate();
  }

  update(names, items, years) {
    this._names = names;
    this._years = years;
    this._items = items;

    // Clear old terrain
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.material.dispose();
      this.terrainMesh = null;
    }
    if (this.wireMesh) {
      this.scene.remove(this.wireMesh);
      this.wireMesh.geometry.dispose();
      this.wireMesh.material.dispose();
      this.wireMesh = null;
    }
    this.scene.children.filter(c => c.userData.axisLabel).forEach(c => this.scene.remove(c));

    const nX = years.length;
    const nZ = names.length;

    if (nX < 2 || nZ < 2) {
      // Show a placeholder message for insufficient data
      const el = document.createElement('div');
      el.style.cssText = 'color:#8b949e;font-size:14px;padding:8px;pointer-events:none;';
      el.textContent = 'Select at least 2 items and a range of at least 2 years for the terrain view.';
      const obj = new CSS2DObject(el);
      obj.userData.axisLabel = true;
      this.scene.add(obj);
      return;
    }

    const PLANE_W = 42;
    const PLANE_D = 22;
    const scaleX = PLANE_W / (nX - 1);
    const scaleZ = PLANE_D / (nZ - 1);
    const MAX_H = 16;
    const halfW = PLANE_W / 2;
    const halfD = PLANE_D / 2;

    let globalMax = 0;
    names.forEach(name => {
      years.forEach(y => {
        const v = items[name].values[y - 1991];
        if (v && v > globalMax) globalMax = v;
      });
    });
    if (globalMax === 0) return;

    const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_D, nX - 1, nZ - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];

    // Color gradient: deep blue → teal → amber → red (low to high)
    const cLow  = new THREE.Color(0x1a3a5c);
    const cMid  = new THREE.Color(0x2d8a6e);
    const cHigh = new THREE.Color(0xe8c84d);
    const cPeak = new THREE.Color(0xe15759);

    for (let zi = 0; zi < nZ; zi++) {
      for (let xi = 0; xi < nX; xi++) {
        const vIdx = zi * nX + xi;
        const val = items[names[zi]].values[years[xi] - 1991] || 0;
        const t = val / globalMax;
        pos.setY(vIdx, t * MAX_H);

        let c = new THREE.Color();
        if (t < 0.33)      c.lerpColors(cLow,  cMid,  t / 0.33);
        else if (t < 0.66) c.lerpColors(cMid,  cHigh, (t - 0.33) / 0.33);
        else               c.lerpColors(cHigh, cPeak,  (t - 0.66) / 0.34);
        colors.push(c.r, c.g, c.b);
      }
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 25,
      side: THREE.DoubleSide,
    });
    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.terrainMesh);

    // Subtle wireframe on top
    const wireGeo = new THREE.WireframeGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x30363d, transparent: true, opacity: 0.25 });
    this.wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    this.scene.add(this.wireMesh);

    // Year axis labels (X)
    years.forEach((y, xi) => {
      if (xi % 5 !== 0 && xi !== years.length - 1) return;
      const el = document.createElement('div');
      el.className = 'axis-label';
      el.textContent = y;
      const lbl = new CSS2DObject(el);
      lbl.position.set(xi * scaleX - halfW, 0, halfD + 1.8);
      lbl.userData.axisLabel = true;
      this.scene.add(lbl);
    });

    // Item axis labels (Z)
    names.forEach((name, zi) => {
      const el = document.createElement('div');
      el.className = 'axis-label';
      el.style.textAlign = 'right';
      el.textContent = name.length > 18 ? name.slice(0, 16) + '…' : name;
      const lbl = new CSS2DObject(el);
      lbl.position.set(-halfW - 2, 0, zi * scaleZ - halfD);
      lbl.userData.axisLabel = true;
      this.scene.add(lbl);
    });

    this.camera.position.set(0, MAX_H * 1.6, PLANE_D * 1.5 + 10);
    this.controls.target.set(0, MAX_H * 0.25, 0);
    this.controls.update();
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (!this.terrainMesh) { this.tooltip.classList.add('hidden'); return; }

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.terrainMesh);

    if (hits.length) {
      const pt = hits[0].point;
      const nX = this._years.length;
      const nZ = this._names.length;
      const halfW = 21, halfD = 11;
      const scaleX = 42 / (nX - 1);
      const scaleZ = 22 / (nZ - 1);
      const xi = Math.max(0, Math.min(nX - 1, Math.round((pt.x + halfW) / scaleX)));
      const zi = Math.max(0, Math.min(nZ - 1, Math.round((pt.z + halfD) / scaleZ)));
      const year = this._years[xi];
      const name = this._names[zi];
      if (year && name) {
        const val = this._items[name].values[year - 1991];
        this.tooltip.classList.remove('hidden');
        this.tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
        this.tooltip.style.top = (e.clientY - rect.top - 36) + 'px';
        this.tooltip.innerHTML =
          `<strong>${name}</strong><br><span style="color:#8b949e">${this._items[name].category}</span><br>${year}: <strong>${val?.toLocaleString() ?? 'N/A'} LCU/t</strong>`;
      }
    } else {
      this.tooltip.classList.add('hidden');
    }
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  _animate() {
    this.animId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  destroy() {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    if (this.labelRenderer?.domElement?.parentElement) {
      this.labelRenderer.domElement.parentElement.removeChild(this.labelRenderer.domElement);
    }
    this.terrainMesh?.geometry.dispose();
    this.terrainMesh?.material.dispose();
    this.wireMesh?.geometry.dispose();
    this.wireMesh?.material.dispose();
    this.renderer.dispose();
  }
}
