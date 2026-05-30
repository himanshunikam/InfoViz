import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CATEGORY_ORDER = [
  'Milk & Dairy', 'Meat', 'Vegetables', 'Fruits',
  'Cereals & Grains', 'Pulses & Legumes', 'Oilseeds & Oils', 'Sweeteners', 'Other'
];

export class BubbleViz {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.controls = null;
    this.animId = null;
    this.bubbles = [];
    this.sphereGeo = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-9999, -9999);
    this._clock = new THREE.Clock();
    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
  }

  init() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);

    // Star field
    const starGeo = new THREE.BufferGeometry();
    const verts = [];
    for (let i = 0; i < 3000; i++) {
      verts.push(
        (Math.random() - 0.5) * 400,
        (Math.random() - 0.5) * 400,
        (Math.random() - 0.5) * 400
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8b949e, size: 0.25 })));

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    this.camera.position.set(0, 0, 75);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);
    const pt1 = new THREE.PointLight(0xffffff, 1.8, 300);
    pt1.position.set(40, 60, 40);
    this.scene.add(pt1);
    const pt2 = new THREE.PointLight(0x3355ff, 0.7, 300);
    pt2.position.set(-40, -30, 20);
    this.scene.add(pt2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.4;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 200;

    // Shared sphere geometry — medium detail
    this.sphereGeo = new THREE.SphereGeometry(1, 28, 20);

    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this._animate();
  }

  update(names, items, yearIdx) {
    this.bubbles.forEach(({ mesh }) => {
      mesh.material.dispose();
      this.scene.remove(mesh);
    });
    this.bubbles = [];

    if (!names.length) return;

    // Group items by category
    const byCategory = {};
    CATEGORY_ORDER.forEach(c => byCategory[c] = []);
    names.forEach(name => {
      const cat = items[name].category;
      (byCategory[cat] || byCategory['Other']).push(name);
    });

    const activeCats = CATEGORY_ORDER.filter(c => byCategory[c].length > 0);
    const nCats = activeCats.length;

    let globalMax = 0;
    names.forEach(name => {
      const v = items[name].values[yearIdx];
      if (v && v > globalMax) globalMax = v;
    });

    activeCats.forEach((cat, ci) => {
      const catNames = byCategory[cat];
      // Place cluster center on a circle in the XY plane
      const clusterAngle = (ci / nCats) * Math.PI * 2;
      const clusterR = nCats > 1 ? 22 : 0;
      const cx = Math.cos(clusterAngle) * clusterR;
      const cy = Math.sin(clusterAngle) * clusterR;
      const cz = 0;

      catNames.forEach((name, ni) => {
        const val = items[name].values[yearIdx] || 0;
        const t = globalMax > 0 ? val / globalMax : 0;
        const radius = 0.6 + t * 4.8;
        const color = new THREE.Color(items[name].color);

        const mat = new THREE.MeshPhongMaterial({
          color,
          emissive: color.clone().multiplyScalar(0.12),
          shininess: 90,
          transparent: true,
          opacity: 0.82,
          specular: new THREE.Color(0xffffff),
        });

        const mesh = new THREE.Mesh(this.sphereGeo, mat);

        // Deterministic placement within cluster: small circle
        const localAngle = (ni / Math.max(catNames.length, 1)) * Math.PI * 2;
        const localR = 5 + Math.floor(ni / 8) * 4;
        const px = cx + Math.cos(localAngle) * localR;
        const py = cy + Math.sin(localAngle) * localR;
        const pz = cz + (ni % 3 - 1) * 5;

        mesh.position.set(px, py, pz);
        mesh.scale.setScalar(radius);

        // Store for animation floating
        mesh.userData = {
          name,
          category: cat,
          value: val,
          baseX: px, baseY: py, baseZ: pz,
          phase: (ni + ci * 7) * 1.3, // deterministic phase offset
        };

        this.scene.add(mesh);
        this.bubbles.push({ mesh, name });
      });
    });
  }

  setYearIdx(yearIdx, names, items) {
    let globalMax = 0;
    names.forEach(name => {
      const v = items[name].values[yearIdx];
      if (v && v > globalMax) globalMax = v;
    });

    this.bubbles.forEach(({ mesh, name }) => {
      const val = items[name]?.values[yearIdx] || 0;
      const t = globalMax > 0 ? val / globalMax : 0;
      const radius = 0.6 + t * 4.8;
      mesh.scale.setScalar(radius);
      mesh.userData.value = val;
    });
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.bubbles.map(b => b.mesh));

    if (hits.length) {
      const { name, category, value } = hits[0].object.userData;
      this.tooltip.classList.remove('hidden');
      this.tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
      this.tooltip.style.top = (e.clientY - rect.top - 36) + 'px';
      this.tooltip.innerHTML =
        `<strong>${name}</strong><br><span style="color:#8b949e">${category}</span><br>Price: <strong>${value.toLocaleString()} LCU/t</strong>`;
      // Pause auto-rotate on hover
      this.controls.autoRotate = false;
    } else {
      this.tooltip.classList.add('hidden');
      this.controls.autoRotate = true;
    }
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    this.animId = requestAnimationFrame(() => this._animate());
    const t = this._clock.getElapsedTime();

    this.bubbles.forEach(({ mesh }) => {
      const { baseX, baseY, baseZ, phase } = mesh.userData;
      mesh.position.x = baseX + Math.sin(t * 0.45 + phase) * 0.6;
      mesh.position.y = baseY + Math.cos(t * 0.38 + phase) * 0.6;
      mesh.position.z = baseZ + Math.sin(t * 0.28 + phase * 0.7) * 0.4;
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.bubbles.forEach(({ mesh }) => mesh.material.dispose());
    this.sphereGeo?.dispose();
    this.renderer.dispose();
  }
}
