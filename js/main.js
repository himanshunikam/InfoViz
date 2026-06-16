import { loadData, loadCpiData } from './data.js';
import { Viewer } from './viewer.js';
import { BarMatrixViz } from './viz1.js';
import { TerrainViz } from './viz2.js';
import { BubbleViz } from './viz3.js';
import { InflationViz } from './viz4.js';

// ── State ──────────────────────────────────────────────────────────────────────
const DATASETS = {};
let dsKey = 'producer';
let ITEMS = {};
let NAMES = [];
let YEARS = [];
const sel = new Set();
let activeViz = 1;
let startIdx = 0;
let endIdx = 0;
let timeIdx = 0;
let animating = false;
let animTimer = null;
let viz = null;
let viewer = null;

// ── DOM ────────────────────────────────────────────────────────────────────────
const canvas       = document.getElementById('three-canvas');
const tooltip      = document.getElementById('tooltip');
const loading      = document.getElementById('loading');
const foodList     = document.getElementById('food-list');
const catFilter    = document.getElementById('category-filter');
const btnSelectAll = document.getElementById('btn-select-all');
const btnFirst8    = document.getElementById('btn-first-8');
const btnClear     = document.getElementById('btn-clear');
const tabBtns      = document.querySelectorAll('.tab-btn');
const tabInflation = document.getElementById('tab-inflation');
const dsBtns       = document.querySelectorAll('.ds-btn');
const slStart      = document.getElementById('sl-start');
const slEnd        = document.getElementById('sl-end');
const slTime       = document.getElementById('sl-time');
const lblYearStart = document.getElementById('year-start-label');
const lblYearEnd   = document.getElementById('year-end-label');
const lblTimeYear  = document.getElementById('time-year-label');
const timeControl   = document.getElementById('time-control');
const btnAnimate    = document.getElementById('btn-animate');
const legendDiv     = document.getElementById('legend');
const crisisControl = document.getElementById('crisis-control');
const crisisBtns    = document.querySelectorAll('.crisis-btn');
const footerInfo    = document.querySelector('.sidebar-footer p');

// ── Boot ───────────────────────────────────────────────────────────────────────
async function init() {
  try {
    // Load only the producer dataset at startup (single fetch). CPI is fetched
    // lazily the first time the user switches to it — keeps boot fast/reliable.
    DATASETS.producer = await loadData();

    viewer = new Viewer(canvas, tooltip);
    viewer.init();
    viewer.onRequestViz = (n) => switchViz(n);  // in-VR panel buttons

    await setDataset('producer');
    loading.classList.add('hidden');
  } catch (err) {
    loading.textContent = 'Failed to load data. Please run via a local server.';
    console.error(err);
  }
}

// ── Dataset switching ────────────────────────────────────────────────────────────
const DATASET_LOADERS = { producer: loadData, cpi: loadCpiData };

async function setDataset(key) {
  // Lazy-load on first use.
  if (!DATASETS[key]) {
    const loader = DATASET_LOADERS[key];
    if (!loader) return;
    loading.textContent = 'Loading dataset…';
    loading.classList.remove('hidden');
    try {
      DATASETS[key] = await loader();
    } catch (err) {
      loading.textContent = 'Failed to load dataset.';
      console.error(err);
      return;
    }
    loading.classList.add('hidden');
  }

  const d = DATASETS[key];
  if (!d) return;
  dsKey = key;
  ITEMS = d.items;
  NAMES = d.names;
  YEARS = d.years;

  dsBtns.forEach(b => b.classList.toggle('active', b.dataset.dataset === key));
  tabInflation.style.display = d.hasMonthly ? 'flex' : 'none';
  catFilter.disabled = (key === 'cpi');     // CPI categories are the items themselves
  if (key === 'cpi') catFilter.value = 'All';
  if (footerInfo) footerInfo.textContent =
    key === 'cpi' ? 'Source: Destatis · Index 2020=100' : 'Source: FAOSTAT · Unit: LCU/tonne';

  // Re-range the sliders for this dataset's span.
  const last = YEARS.length - 1;
  slStart.max = last; slEnd.max = last; slTime.max = last;
  startIdx = 0; endIdx = last; timeIdx = last;
  slStart.value = 0; slEnd.value = last; slTime.value = last;
  lblYearStart.textContent = YEARS[0];
  lblYearEnd.textContent = YEARS[last];
  lblTimeYear.textContent = YEARS[last];

  // Default selection: first 8 producer items, or all 12 CPI categories.
  sel.clear();
  (key === 'cpi' ? NAMES : NAMES.slice(0, 8)).forEach(n => sel.add(n));
  buildFoodList();
  renderLegend();

  // Inflation viz only exists for CPI; fall back to bars otherwise.
  let target = activeViz;
  if (!d.hasMonthly && target === 4) target = 1;
  switchViz(target);
}

dsBtns.forEach(btn => {
  btn.addEventListener('click', () => setDataset(btn.dataset.dataset));
});

// ── Food list ──────────────────────────────────────────────────────────────────
function visibleNames() {
  if (dsKey === 'cpi') return NAMES;
  const cat = catFilter.value;
  return cat === 'All' ? NAMES : NAMES.filter(n => ITEMS[n].category === cat);
}

function buildFoodList() {
  foodList.innerHTML = '';
  visibleNames().forEach(name => {
    const div = document.createElement('div');
    div.className = 'food-item' + (sel.has(name) ? ' selected' : '');
    div.innerHTML = `
      <span class="food-swatch" style="background:${ITEMS[name].color}"></span>
      <span class="food-label">${name}</span>
    `;
    div.addEventListener('click', () => {
      if (sel.has(name)) { sel.delete(name); div.classList.remove('selected'); }
      else { sel.add(name); div.classList.add('selected'); }
      refreshViz();
      renderLegend();
    });
    foodList.appendChild(div);
  });
}

btnSelectAll.addEventListener('click', () => {
  visibleNames().forEach(n => sel.add(n));
  buildFoodList();
  refreshViz();
  renderLegend();
});

btnFirst8.addEventListener('click', () => {
  sel.clear();
  NAMES.slice(0, 8).forEach(n => sel.add(n));
  buildFoodList();
  refreshViz();
  renderLegend();
});

btnClear.addEventListener('click', () => {
  sel.clear();
  buildFoodList();
  refreshViz();
  renderLegend();
});

catFilter.addEventListener('change', buildFoodList);

// ── Legend ─────────────────────────────────────────────────────────────────────
function renderLegend() {
  legendDiv.innerHTML = '';
  NAMES.filter(n => sel.has(n)).forEach(name => {
    const span = document.createElement('span');
    span.className = 'legend-item';
    span.innerHTML = `<span class="legend-swatch" style="background:${ITEMS[name].color}"></span>${name}`;
    legendDiv.appendChild(span);
  });
}

// ── Year range sliders ─────────────────────────────────────────────────────────
slStart.addEventListener('input', () => {
  startIdx = Number(slStart.value);
  if (startIdx >= endIdx) { startIdx = Math.max(0, endIdx - 1); slStart.value = startIdx; }
  lblYearStart.textContent = YEARS[startIdx];
  refreshViz();
});

slEnd.addEventListener('input', () => {
  endIdx = Number(slEnd.value);
  if (endIdx <= startIdx) { endIdx = Math.min(YEARS.length - 1, startIdx + 1); slEnd.value = endIdx; }
  lblYearEnd.textContent = YEARS[endIdx];
  refreshViz();
});

// ── Time slider (viz3 only) ────────────────────────────────────────────────────
slTime.addEventListener('input', () => {
  timeIdx = Number(slTime.value);
  lblTimeYear.textContent = YEARS[timeIdx];
  if (viz?.setYearIdx) viz.setYearIdx(timeIdx, selNames(), ITEMS);
});

btnAnimate.addEventListener('click', () => {
  if (animating) {
    clearInterval(animTimer);
    animating = false;
    btnAnimate.innerHTML = '&#9654;';
    return;
  }
  animating = true;
  btnAnimate.innerHTML = '&#9646;&#9646;';
  const last = YEARS.length - 1;
  if (timeIdx >= last) timeIdx = 0;

  animTimer = setInterval(() => {
    timeIdx = Math.min(last, timeIdx + 1);
    slTime.value = timeIdx;
    lblTimeYear.textContent = YEARS[timeIdx];
    if (viz?.setYearIdx) viz.setYearIdx(timeIdx, selNames(), ITEMS);
    if (timeIdx >= last) {
      clearInterval(animTimer);
      animating = false;
      btnAnimate.innerHTML = '&#9654;';
    }
  }, 420);
});

// ── Viz switching ──────────────────────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchViz(Number(btn.dataset.viz)));
});

function setActiveTabUI(n) {
  tabBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.viz) === n));
  timeControl.style.display   = n === 3 ? 'flex' : 'none';
  crisisControl.style.display = (n === 1 && dsKey === 'producer') ? 'flex' : 'none';
  crisisBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.crisis === '');
    b.style.removeProperty('--crisis-color');
  });
}

function switchViz(n) {
  if (animating) { clearInterval(animTimer); animating = false; btnAnimate.innerHTML = '&#9654;'; }
  if (viz) viz.dispose();
  activeViz = n;
  setActiveTabUI(n);

  if (n === 1)      viz = new BarMatrixViz();
  else if (n === 2) viz = new TerrainViz();
  else if (n === 3) viz = new BubbleViz();
  else              viz = new InflationViz();

  viz.build(viewer.renderer);
  viewer.setActiveViz(viz);
  refreshViz();
}

// ── Crisis period buttons (producer viz1 only) ────────────────────────────────
const CRISIS_COLORS = { eur: '#f4a261', covid: '#e63946' };

crisisBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    crisisBtns.forEach(b => {
      b.classList.remove('active');
      b.style.removeProperty('--crisis-color');
    });
    btn.classList.add('active');
    const period = btn.dataset.crisis || null;
    if (period && CRISIS_COLORS[period]) {
      btn.style.setProperty('--crisis-color', CRISIS_COLORS[period]);
    }
    if (viz?.setCrisisPeriod) viz.setCrisisPeriod(period);
  });
});

function selNames() {
  return NAMES.filter(n => sel.has(n));
}

function refreshViz() {
  if (!viz) return;
  const names = selNames();
  const years = YEARS.slice(startIdx, endIdx + 1);
  if (activeViz === 3) viz.update(names, ITEMS, timeIdx);
  else viz.update(names, ITEMS, years);
  viewer?.refitVR();   // keep the VR tabletop hologram correctly sized
}

init();
