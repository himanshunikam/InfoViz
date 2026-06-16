import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Crisis period definitions
const CRISIS_DEFS = {
  eur: {
    label: 'EUR Transition',
    subLabel: '2001–2002',
    years: new Set([2001, 2002]),
    startYear: 2000,   // baseline year for % change calc
    endYear: 2002,
    barColor: 0xf4a261,
    emissiveBase: new THREE.Color(0x7a3010),
    overlayColor: 0xf4a261,
    edgeColor: 0xf4a261,
    lightColor: 0xf4a261,
    cssColor: '#f4a261',
    pulseFreq: 3.2,
    pulseAmp: 0.055,
    dimOpacity: 0.18,
  },
  covid: {
    label: 'COVID-19',
    subLabel: '2020–2022',
    years: new Set([2020, 2021, 2022]),
    startYear: 2019,
    endYear: 2022,
    barColor: 0xe63946,
    emissiveBase: new THREE.Color(0x6b0000),
    overlayColor: 0xe63946,
    edgeColor: 0xe63946,
    lightColor: 0xff3333,
    cssColor: '#e63946',
    pulseFreq: 1.8,
    pulseAmp: 0.085,
    dimOpacity: 0.15,
  },
};

export class BarMatrixViz {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.root = null;          // dockable content (bars + crisis overlays)
    this.grid = null;
    this.floor = null;
    this.barMeshes = [];
    this.sharedGeo = null;

    // Crisis state
    this.crisisPeriod = null;
    this.crisisBars = [];
    this.normalBars = [];
    this.crisisOverlayMesh = null;
    this.crisisEdgesMesh = null;
    this.crisisLabelObj = null;
    this.crisisPointLight = null;

    this._currentYears = [];
    this._currentNames = [];
    this._currentItems = {};
    this._layout = null;
  }

  build(renderer) {
    const canvas = renderer.domElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);
    this.scene.fog = new THREE.FogExp2(0x0d1117, 0.008);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    this.camera.position.set(20, 22, 36);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(25, 45, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.far = 200;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4488ff, 0.25);
    fill.position.set(-20, 10, -15);
    this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 200;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    this.grid = new THREE.GridHelper(300, 60, 0x30363d, 0x21262d);
    this.scene.add(this.grid);

    const floorGeo = new THREE.PlaneGeometry(300, 300);
    floorGeo.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(floorGeo, new THREE.ShadowMaterial({ opacity: 0.2 }));
    this.floor.receiveShadow = true;
    this.floor.position.y = -0.01;
    this.scene.add(this.floor);

    this.sharedGeo = new THREE.BoxGeometry(1, 1, 1);
  }

  update(names, items, years) {
    this._clearCrisisVisuals();

    this.barMeshes.forEach(m => { m.material.dispose(); this.root.remove(m); });
    this.barMeshes = [];
    this.scene.children.filter(c => c.userData.axisLabel).forEach(c => { c.element?.remove(); this.scene.remove(c); });

    this._currentNames = names;
    this._currentItems = items;
    this._currentYears = years;

    if (!names.length || !years.length) return;

    const nItems = names.length;
    const nYears = years.length;
    const barW = 0.75;
    const step = barW + 0.15;

    let globalMax = 0;
    names.forEach(name => {
      years.forEach(y => {
        const v = items[name].values[y - 1991];
        if (v && v > globalMax) globalMax = v;
      });
    });
    if (globalMax === 0) return;

    const MAX_H = 16;
    this._layout = { step, nItems, nYears, barW, MAX_H, globalMax };

    names.forEach((name, ni) => {
      const color = new THREE.Color(items[name].color);
      years.forEach((y, yi) => {
        const val = items[name].values[y - 1991] || 0;
        const h = Math.max(0.05, (val / globalMax) * MAX_H);
        const mat = new THREE.MeshPhongMaterial({
          color,
          emissive: new THREE.Color(0x000000),
          shininess: 50,
          transparent: true,
          opacity: 0.88,
        });
        const mesh = new THREE.Mesh(this.sharedGeo, mat);
        mesh.scale.set(barW, h, barW);
        mesh.position.set(
          yi * step - (nYears * step) / 2 + step / 2,
          h / 2,
          ni * step - (nItems * step) / 2 + step / 2
        );
        mesh.castShadow = true;
        mesh.userData = { name, year: y, value: val, category: items[name].category, baseH: h };
        this.root.add(mesh);
        this.barMeshes.push(mesh);
      });

      const el = document.createElement('div');
      el.className = 'axis-label';
      el.textContent = name.length > 20 ? name.slice(0, 18) + '…' : name;
      const lbl = new CSS2DObject(el);
      lbl.position.set(-(nYears * step) / 2 - 1.8, 0.1, ni * step - (nItems * step) / 2 + step / 2);
      lbl.userData.axisLabel = true;
      this.scene.add(lbl);
    });

    years.forEach((y, yi) => {
      if (yi % 5 !== 0 && yi !== years.length - 1) return;
      const el = document.createElement('div');
      el.className = 'axis-label';
      el.textContent = y;
      const lbl = new CSS2DObject(el);
      lbl.position.set(yi * step - (nYears * step) / 2 + step / 2, 0.1, (nItems * step) / 2 + 1.8);
      lbl.userData.axisLabel = true;
      this.scene.add(lbl);
    });

    const spanX = nYears * step;
    const spanZ = nItems * step;
    this.camera.position.set(spanX * 0.3, MAX_H * 1.3, spanZ * 1.1 + 10);
    this.controls.target.set(0, MAX_H * 0.2, 0);
    this.controls.update();

    this._applyCrisisVisuals();
  }

  setCrisisPeriod(period) {
    this.crisisPeriod = period || null;
    this._applyCrisisVisuals();
  }

  // ── Crisis helpers ─────────────────────────────────────────────────────────────

  _clearCrisisVisuals() {
    this.barMeshes.forEach(m => {
      const origColor = this._currentItems[m.userData.name]?.color;
      if (origColor) m.material.color.set(origColor);
      m.material.emissive.set(0x000000);
      m.material.opacity = 0.88;
      const h = m.userData.baseH;
      if (h) { m.scale.y = h; m.position.y = h / 2; }
    });
    this.crisisBars = [];
    this.normalBars = [];

    if (this.crisisOverlayMesh) {
      this.root.remove(this.crisisOverlayMesh);
      this.crisisOverlayMesh.geometry.dispose();
      this.crisisOverlayMesh.material.dispose();
      this.crisisOverlayMesh = null;
    }
    if (this.crisisEdgesMesh) {
      this.root.remove(this.crisisEdgesMesh);
      this.crisisEdgesMesh.geometry.dispose();
      this.crisisEdgesMesh.material.dispose();
      this.crisisEdgesMesh = null;
    }
    if (this.crisisLabelObj) {
      this.crisisLabelObj.element?.remove();
      this.scene.remove(this.crisisLabelObj);
      this.crisisLabelObj = null;
    }
    if (this.crisisPointLight) {
      this.root.remove(this.crisisPointLight);
      this.crisisPointLight = null;
    }
  }

  _applyCrisisVisuals() {
    this._clearCrisisVisuals();
    if (!this.crisisPeriod || !this._layout || !this.barMeshes.length) return;

    const def = CRISIS_DEFS[this.crisisPeriod];
    if (!def) return;

    const { step, nItems, nYears, barW, MAX_H } = this._layout;
    const years = this._currentYears;
    const names = this._currentNames;
    const items = this._currentItems;

    let minYi = Infinity, maxYi = -Infinity;

    this.barMeshes.forEach(m => {
      if (def.years.has(m.userData.year)) {
        m.material.color.set(def.barColor);
        m.material.emissive.copy(def.emissiveBase);
        m.material.opacity = 0.96;
        this.crisisBars.push(m);
        const yi = years.indexOf(m.userData.year);
        if (yi !== -1) { minYi = Math.min(minYi, yi); maxYi = Math.max(maxYi, yi); }
      } else {
        m.material.opacity = def.dimOpacity;
        this.normalBars.push(m);
      }
    });

    if (minYi === Infinity) return;

    const xStart = minYi * step - (nYears * step) / 2 + step / 2 - barW / 2 - 0.5;
    const xEnd   = maxYi * step - (nYears * step) / 2 + step / 2 + barW / 2 + 0.5;
    const zStart = -(nItems * step) / 2 - 0.6;
    const zEnd   =  (nItems * step) / 2 + 0.6;
    const cx     = (xStart + xEnd) / 2;
    const cz     = (zStart + zEnd) / 2;
    const boxW   = xEnd - xStart;
    const boxD   = zEnd - zStart;
    const boxH   = MAX_H + 3;

    const overlayGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
    this.crisisOverlayMesh = new THREE.Mesh(overlayGeo, new THREE.MeshBasicMaterial({
      color: def.overlayColor, transparent: true, opacity: 0.06,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    this.crisisOverlayMesh.position.set(cx, boxH / 2 - 0.5, cz);
    this.root.add(this.crisisOverlayMesh);

    const edgesGeo = new THREE.EdgesGeometry(overlayGeo);
    this.crisisEdgesMesh = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({
      color: def.edgeColor, transparent: true, opacity: 0.7,
    }));
    this.crisisEdgesMesh.position.copy(this.crisisOverlayMesh.position);
    this.root.add(this.crisisEdgesMesh);

    this.crisisPointLight = new THREE.PointLight(def.lightColor, 2.0, boxW * 5 + 10);
    this.crisisPointLight.position.set(cx, MAX_H * 0.6, cz);
    this.root.add(this.crisisPointLight);

    const changeLabel = this._calcCrisisChange(def, names, items, years);
    const el = document.createElement('div');
    el.className = 'crisis-badge';
    el.innerHTML = `
      <span class="crisis-badge-title">${def.label}</span>
      <span class="crisis-badge-period">${def.subLabel}</span>
      ${changeLabel ? `<span class="crisis-badge-change">${changeLabel}</span>` : ''}
    `;
    el.style.setProperty('--crisis-color', def.cssColor);
    this.crisisLabelObj = new CSS2DObject(el);
    this.crisisLabelObj.position.set(cx, MAX_H + 3.5, cz);
    this.scene.add(this.crisisLabelObj);
  }

  _calcCrisisChange(def, names, items, years) {
    const startY = def.startYear;
    const endY   = def.endYear;
    if (!years.includes(startY) && !years.includes(startY + 1)) return '';

    let totalPct = 0, count = 0;
    names.forEach(name => {
      const vals = items[name].values;
      const vStart = vals[startY - 1991];
      const vEnd   = vals[endY   - 1991];
      if (vStart && vEnd && vStart > 0) {
        totalPct += (vEnd - vStart) / vStart * 100;
        count++;
      }
    });
    if (!count) return '';
    const avg = totalPct / count;
    const sign = avg >= 0 ? '+' : '';
    return `avg ${sign}${avg.toFixed(1)}%`;
  }

  // ── Viewer plug-in interface ─────────────────────────────────────────────────

  getPickTargets() { return this.barMeshes; }

  describe(obj) {
    const { name, year, value, category } = obj.userData;
    if (name === undefined) return null;
    return { title: name, sub: category, value: `${year}: ${value.toLocaleString()} LCU/t` };
  }

  onHover(obj) {
    if (this.crisisPeriod) return;  // crisis uses its own animated glow
    this.barMeshes.forEach(m => m.material.emissive.set(0x000000));
    if (obj) obj.material.emissive.set(0x223344);
  }

  setVRMode(on) {
    if (this.grid) this.grid.visible = !on;
    if (this.floor) this.floor.visible = !on;
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(t /*, presenting */) {
    if (this.crisisPeriod && this.crisisBars.length) {
      const def = CRISIS_DEFS[this.crisisPeriod];
      const sinVal = Math.sin(t * def.pulseFreq);
      const pulse  = 1 + sinVal * def.pulseAmp;
      const glowT  = (sinVal + 1) / 2;

      this.crisisBars.forEach(m => {
        const h = m.userData.baseH;
        m.scale.y  = h * pulse;
        m.position.y = (h * pulse) / 2;
        m.material.emissive.copy(def.emissiveBase).multiplyScalar(0.35 + glowT * 0.65);
      });
      if (this.crisisOverlayMesh) this.crisisOverlayMesh.material.opacity = 0.03 + glowT * 0.07;
      if (this.crisisEdgesMesh)   this.crisisEdgesMesh.material.opacity   = 0.3 + glowT * 0.55;
      if (this.crisisPointLight)  this.crisisPointLight.intensity         = 0.8 + glowT * 2.4;
    }
  }

  dispose() {
    this._clearCrisisVisuals();
    this.scene.children.filter(c => c.userData.axisLabel).forEach(c => { c.element?.remove(); this.scene.remove(c); });
    this.barMeshes.forEach(m => m.material.dispose());
    this.barMeshes = [];
    this.sharedGeo?.dispose();
    this.controls?.dispose();
  }
}
