import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

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
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.controls = null;
    this.labelRenderer = null;
    this.animId = null;
    this.barMeshes = [];
    this.sharedGeo = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-9999, -9999);
    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);

    // Crisis state
    this.crisisPeriod = null;
    this.crisisBars = [];      // meshes inside crisis years
    this.normalBars = [];      // meshes outside crisis years
    this.crisisOverlayMesh = null;
    this.crisisEdgesMesh = null;
    this.crisisLabelObj = null;
    this.crisisPointLight = null;
    this._clock = new THREE.Clock();
    this._currentYears = [];
    this._currentNames = [];
    this._currentItems = {};
    this._layout = null;
  }

  init() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);
    this.scene.fog = new THREE.FogExp2(0x0d1117, 0.008);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    this.camera.position.set(20, 22, 36);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.canvas.parentElement.appendChild(this.labelRenderer.domElement);

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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 200;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    const grid = new THREE.GridHelper(300, 60, 0x30363d, 0x21262d);
    this.scene.add(grid);

    const floorGeo = new THREE.PlaneGeometry(300, 300);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, new THREE.ShadowMaterial({ opacity: 0.2 }));
    floor.receiveShadow = true;
    floor.position.y = -0.01;
    this.scene.add(floor);

    this.sharedGeo = new THREE.BoxGeometry(1, 1, 1);

    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this._animate();
  }

  update(names, items, years) {
    this._clearCrisisVisuals();

    this.barMeshes.forEach(m => { m.material.dispose(); this.scene.remove(m); });
    this.barMeshes = [];
    this.scene.children.filter(c => c.userData.axisLabel).forEach(c => this.scene.remove(c));

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
        // baseH stored for pulse animation
        mesh.userData = { name, year: y, value: val, category: items[name].category, baseH: h };
        this.scene.add(mesh);
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

  // Called from main.js when user picks a crisis period (null | 'eur' | 'covid')
  setCrisisPeriod(period) {
    this.crisisPeriod = period || null;
    this._applyCrisisVisuals();
  }

  // ── Crisis helpers ─────────────────────────────────────────────────────────────

  _clearCrisisVisuals() {
    // Reset every bar back to its original appearance
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
      this.scene.remove(this.crisisOverlayMesh);
      this.crisisOverlayMesh.geometry.dispose();
      this.crisisOverlayMesh.material.dispose();
      this.crisisOverlayMesh = null;
    }
    if (this.crisisEdgesMesh) {
      this.scene.remove(this.crisisEdgesMesh);
      this.crisisEdgesMesh.geometry.dispose();
      this.crisisEdgesMesh.material.dispose();
      this.crisisEdgesMesh = null;
    }
    if (this.crisisLabelObj) {
      this.scene.remove(this.crisisLabelObj);
      this.crisisLabelObj = null;
    }
    if (this.crisisPointLight) {
      this.scene.remove(this.crisisPointLight);
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

    // Classify bars and apply initial crisis styling
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

    // Bounding box of crisis columns across all item rows
    const xStart = minYi * step - (nYears * step) / 2 + step / 2 - barW / 2 - 0.5;
    const xEnd   = maxYi * step - (nYears * step) / 2 + step / 2 + barW / 2 + 0.5;
    const zStart = -(nItems * step) / 2 - 0.6;
    const zEnd   =  (nItems * step) / 2 + 0.6;
    const cx     = (xStart + xEnd) / 2;
    const cz     = (zStart + zEnd) / 2;
    const boxW   = xEnd - xStart;
    const boxD   = zEnd - zStart;
    const boxH   = MAX_H + 3;

    // Translucent filled volume
    const overlayGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
    this.crisisOverlayMesh = new THREE.Mesh(overlayGeo, new THREE.MeshBasicMaterial({
      color: def.overlayColor,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    this.crisisOverlayMesh.position.set(cx, boxH / 2 - 0.5, cz);
    this.scene.add(this.crisisOverlayMesh);

    // Glowing edge outline of the crisis zone box
    const edgesGeo = new THREE.EdgesGeometry(overlayGeo);
    this.crisisEdgesMesh = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({
      color: def.edgeColor,
      transparent: true,
      opacity: 0.7,
    }));
    this.crisisEdgesMesh.position.copy(this.crisisOverlayMesh.position);
    this.scene.add(this.crisisEdgesMesh);

    // Coloured point light inside the crisis zone for glow-on-floor effect
    this.crisisPointLight = new THREE.PointLight(def.lightColor, 2.0, boxW * 5 + 10);
    this.crisisPointLight.position.set(cx, MAX_H * 0.6, cz);
    this.scene.add(this.crisisPointLight);

    // Compute average % price change for selected items across the crisis window
    const changeLabel = this._calcCrisisChange(def, names, items, years);

    // CSS2D badge pinned above the crisis zone
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
    // Average price change from the year before the crisis to the last crisis year
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

  // ── Mouse ──────────────────────────────────────────────────────────────────────

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.barMeshes);

    if (hits.length) {
      const { name, year, value, category } = hits[0].object.userData;
      this.tooltip.classList.remove('hidden');
      this.tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
      this.tooltip.style.top = (e.clientY - rect.top - 36) + 'px';
      this.tooltip.innerHTML =
        `<strong>${name}</strong><br><span style="color:#8b949e">${category}</span><br>${year}: <strong>${value.toLocaleString()} LCU/t</strong>`;

      // Emissive hover highlight — only when not in crisis mode (crisis uses animated glow)
      if (!this.crisisPeriod) {
        this.barMeshes.forEach(m => m.material.emissive.set(0x000000));
        hits[0].object.material.emissive.set(0x223344);
      }
    } else {
      this.tooltip.classList.add('hidden');
      if (!this.crisisPeriod) {
        this.barMeshes.forEach(m => m.material.emissive.set(0x000000));
      }
    }
  }

  // ── Render loop ────────────────────────────────────────────────────────────────

  _animate() {
    this.animId = requestAnimationFrame(() => this._animate());
    const t = this._clock.getElapsedTime();

    if (this.crisisPeriod && this.crisisBars.length) {
      const def = CRISIS_DEFS[this.crisisPeriod];
      const sinVal = Math.sin(t * def.pulseFreq);
      const pulse  = 1 + sinVal * def.pulseAmp;
      // glowT: 0 → 1, drives opacity/intensity
      const glowT  = (sinVal + 1) / 2;

      // Pulse bar heights
      this.crisisBars.forEach(m => {
        const h = m.userData.baseH;
        m.scale.y  = h * pulse;
        m.position.y = (h * pulse) / 2;
        // Vary emissive brightness with the pulse
        m.material.emissive.copy(def.emissiveBase).multiplyScalar(0.35 + glowT * 0.65);
      });

      // Pulse overlay fill opacity
      if (this.crisisOverlayMesh) {
        this.crisisOverlayMesh.material.opacity = 0.03 + glowT * 0.07;
      }
      // Pulse edge line opacity
      if (this.crisisEdgesMesh) {
        this.crisisEdgesMesh.material.opacity = 0.3 + glowT * 0.55;
      }
      // Pulse point light intensity
      if (this.crisisPointLight) {
        this.crisisPointLight.intensity = 0.8 + glowT * 2.4;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  // ── Resize / destroy ───────────────────────────────────────────────────────────

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  destroy() {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    if (this.labelRenderer?.domElement?.parentElement) {
      this.labelRenderer.domElement.parentElement.removeChild(this.labelRenderer.domElement);
    }
    this._clearCrisisVisuals();
    this.sharedGeo?.dispose();
    this.barMeshes.forEach(m => m.material.dispose());
    this.renderer.dispose();
  }
}
