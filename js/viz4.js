import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PLANE_W = 50;
const PLANE_D = 22;
const MAX_H = 16;

// Inflation (year-over-year %) colour scale: deflation→blue, mild→green,
// elevated→amber, high→red. Range tuned for German CPI (~ -2% to +12%).
const YOY_MIN = -2;
const YOY_MAX = 12;

export class InflationViz {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.root = null;
    this.terrainMesh = null;
    this.wireMesh = null;
    this._names = [];
    this._years = [];
    this._items = {};
    this._nX = 0;
  }

  build(renderer) {
    const canvas = renderer.domElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);
    this.scene.fog = new THREE.FogExp2(0x0d1117, 0.006);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    this.camera.position.set(0, 30, 52);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(30, 60, 30);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x2244cc, 0.4);
    fill.position.set(-20, 20, -20);
    this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI / 2.05;
  }

  _yoyColor(yoy, out) {
    if (yoy === null) { out.setHex(0x44484f); return; }
    const t = Math.max(0, Math.min(1, (yoy - YOY_MIN) / (YOY_MAX - YOY_MIN)));
    const cLow  = new THREE.Color(0x2a6f97);
    const cMid  = new THREE.Color(0x2d8a6e);
    const cWarm = new THREE.Color(0xe8c84d);
    const cHigh = new THREE.Color(0xe63946);
    if (t < 0.33)      out.lerpColors(cLow,  cMid,  t / 0.33);
    else if (t < 0.66) out.lerpColors(cMid,  cWarm, (t - 0.33) / 0.33);
    else               out.lerpColors(cWarm, cHigh, (t - 0.66) / 0.34);
  }

  // monthly[name] is a [yearIndex][monthIndex] grid; yearIndex is year-1991.
  _val(name, year, monthIdx) {
    const grid = this._items[name].monthly;
    const yi = year - 1991;
    return grid?.[yi]?.[monthIdx] ?? null;
  }

  update(names, items, years) {
    this._names = names;
    this._years = years;
    this._items = items;

    if (this.terrainMesh) {
      this.root.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.material.dispose();
      this.terrainMesh = null;
    }
    if (this.wireMesh) {
      this.root.remove(this.wireMesh);
      this.wireMesh.geometry.dispose();
      this.wireMesh.material.dispose();
      this.wireMesh = null;
    }
    this.scene.children.filter(c => c.userData.axisLabel).forEach(c => { c.element?.remove(); this.scene.remove(c); });

    const nZ = names.length;
    const nX = years.length * 12;     // one column per month across the year range
    this._nX = nX;
    if (nZ < 1 || nX < 2 || !items[names[0]]?.monthly) return;

    const scaleX = PLANE_W / (nX - 1);
    const scaleZ = nZ > 1 ? PLANE_D / (nZ - 1) : 0;
    const halfW = PLANE_W / 2;
    const halfD = PLANE_D / 2;

    let globalMax = 0;
    names.forEach(name => years.forEach(y => {
      for (let m = 0; m < 12; m++) {
        const v = this._val(name, y, m);
        if (v && v > globalMax) globalMax = v;
      }
    }));
    if (globalMax === 0) return;

    const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_D, nX - 1, Math.max(1, nZ - 1));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const col = new THREE.Color();

    for (let zi = 0; zi < nZ; zi++) {
      const name = names[zi];
      for (let xi = 0; xi < nX; xi++) {
        const year = years[Math.floor(xi / 12)];
        const m = xi % 12;
        const v = this._val(name, year, m) ?? 0;
        // height by CPI level
        if (nZ > 1) pos.setY(zi * nX + xi, (v / globalMax) * MAX_H);
        else        pos.setY(xi, (v / globalMax) * MAX_H);
        // colour by year-over-year inflation (same month, previous year)
        const prev = this._val(name, year - 1, m);
        const yoy = (prev && prev > 0) ? ((v - prev) / prev) * 100 : null;
        this._yoyColor(yoy, col);
        colors.push(col.r, col.g, col.b);
      }
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      vertexColors: true, shininess: 20, side: THREE.DoubleSide,
    }));
    this.root.add(this.terrainMesh);

    this.wireMesh = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x30363d, transparent: true, opacity: 0.18 })
    );
    this.root.add(this.wireMesh);

    // Year labels along X (every few years)
    const yearStep = years.length > 16 ? 5 : (years.length > 8 ? 2 : 1);
    years.forEach((y, i) => {
      if (i % yearStep !== 0 && i !== years.length - 1) return;
      const el = document.createElement('div');
      el.className = 'axis-label';
      el.textContent = y;
      const lbl = new CSS2DObject(el);
      lbl.position.set((i * 12) * scaleX - halfW, 0, halfD + 1.8);
      lbl.userData.axisLabel = true;
      this.scene.add(lbl);
    });

    // Category labels along Z
    names.forEach((name, zi) => {
      const el = document.createElement('div');
      el.className = 'axis-label';
      el.style.textAlign = 'right';
      el.textContent = name.length > 22 ? name.slice(0, 20) + '…' : name;
      const lbl = new CSS2DObject(el);
      lbl.position.set(-halfW - 2, 0, nZ > 1 ? zi * scaleZ - halfD : 0);
      lbl.userData.axisLabel = true;
      this.scene.add(lbl);
    });

    this.camera.position.set(0, MAX_H * 1.7, PLANE_D * 1.6 + 12);
    this.controls.target.set(0, MAX_H * 0.25, 0);
    this.controls.update();
  }

  // ── Viewer plug-in interface ─────────────────────────────────────────────────

  getPickTargets() { return this.terrainMesh ? [this.terrainMesh] : []; }

  describe(obj, point) {
    if (!this.terrainMesh || !point) return null;
    const nZ = this._names.length;
    const nX = this._nX;
    if (nX < 2) return null;

    const local = this.terrainMesh.worldToLocal(point.clone());
    const halfW = PLANE_W / 2, halfD = PLANE_D / 2;
    const scaleX = PLANE_W / (nX - 1);
    const scaleZ = nZ > 1 ? PLANE_D / (nZ - 1) : 1;
    const xi = Math.max(0, Math.min(nX - 1, Math.round((local.x + halfW) / scaleX)));
    const zi = nZ > 1 ? Math.max(0, Math.min(nZ - 1, Math.round((local.z + halfD) / scaleZ))) : 0;

    const year = this._years[Math.floor(xi / 12)];
    const m = xi % 12;
    const name = this._names[zi];
    if (year === undefined || !name) return null;

    const v = this._val(name, year, m);
    const prev = this._val(name, year - 1, m);
    const yoy = (prev && prev > 0) ? ((v - prev) / prev) * 100 : null;
    const yoyStr = yoy === null ? 'n/a' : `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}% YoY`;
    return {
      title: name,
      sub: `${MONTHS[m]} ${year}`,
      value: v != null ? `${v.toFixed(1)} (2020=100) · ${yoyStr}` : 'no data',
    };
  }

  onHover() {}
  setVRMode() {}

  onResize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {}

  dispose() {
    this.terrainMesh?.geometry.dispose();
    this.terrainMesh?.material.dispose();
    this.wireMesh?.geometry.dispose();
    this.wireMesh?.material.dispose();
    this.scene.children.filter(c => c.userData.axisLabel).forEach(c => { c.element?.remove(); this.scene.remove(c); });
    this.controls?.dispose();
  }
}
