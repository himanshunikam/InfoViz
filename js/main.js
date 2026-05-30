import { loadData, YEARS_FULL } from './data.js';
import { BarMatrixViz } from './viz1.js';
import { TerrainViz } from './viz2.js';
import { BubbleViz } from './viz3.js';

// ── State ──────────────────────────────────────────────────────────────────────
let ITEMS = {};
let NAMES = [];
const sel = new Set();
let activeViz = 1;
let startIdx = 0;
let endIdx = 31;
let timeIdx = 31;
let animating = false;
let animTimer = null;
let viz = null;

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

// ── Boot ───────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const data = await loadData();
    ITEMS = data.items;
    NAMES = data.names;
    buildFoodList();
    selectFirst8();
    switchViz(1);
    loading.classList.add('hidden');
  } catch (err) {
    loading.textContent = 'Failed to load data. Please run via a local server.';
    console.error(err);
  }
}

// ── Food list ──────────────────────────────────────────────────────────────────
function buildFoodList() {
  const cat = catFilter.value;
  const visible = cat === 'All' ? NAMES : NAMES.filter(n => ITEMS[n].category === cat);

  foodList.innerHTML = '';
  visible.forEach(name => {
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

function selectFirst8() {
  sel.clear();
  NAMES.slice(0, 8).forEach(n => sel.add(n));
  buildFoodList();
  renderLegend();
}

btnSelectAll.addEventListener('click', () => {
  const cat = catFilter.value;
  const visible = cat === 'All' ? NAMES : NAMES.filter(n => ITEMS[n].category === cat);
  visible.forEach(n => sel.add(n));
  buildFoodList();
  refreshViz();
  renderLegend();
});

btnFirst8.addEventListener('click', () => {
  selectFirst8();
  refreshViz();
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
  lblYearStart.textContent = YEARS_FULL[startIdx];
  refreshViz();
});

slEnd.addEventListener('input', () => {
  endIdx = Number(slEnd.value);
  if (endIdx <= startIdx) { endIdx = Math.min(31, startIdx + 1); slEnd.value = endIdx; }
  lblYearEnd.textContent = YEARS_FULL[endIdx];
  refreshViz();
});

// ── Time slider (viz3 only) ────────────────────────────────────────────────────
slTime.addEventListener('input', () => {
  timeIdx = Number(slTime.value);
  lblTimeYear.textContent = YEARS_FULL[timeIdx];
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
  if (timeIdx >= 31) timeIdx = 0;

  animTimer = setInterval(() => {
    timeIdx = Math.min(31, timeIdx + 1);
    slTime.value = timeIdx;
    lblTimeYear.textContent = YEARS_FULL[timeIdx];
    if (viz?.setYearIdx) viz.setYearIdx(timeIdx, selNames(), ITEMS);
    if (timeIdx >= 31) {
      clearInterval(animTimer);
      animating = false;
      btnAnimate.innerHTML = '&#9654;';
    }
  }, 420);
});

// ── Viz switching ──────────────────────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchViz(Number(btn.dataset.viz));
  });
});

function switchViz(n) {
  if (animating) { clearInterval(animTimer); animating = false; btnAnimate.innerHTML = '&#9654;'; }
  if (viz) viz.destroy();
  activeViz = n;

  timeControl.style.display   = n === 3 ? 'flex' : 'none';
  crisisControl.style.display = n === 1 ? 'flex' : 'none';

  // Reset crisis button state when leaving viz1
  if (n !== 1) {
    crisisBtns.forEach(b => b.classList.toggle('active', b.dataset.crisis === ''));
    crisisBtns.forEach(b => b.style.removeProperty('--crisis-color'));
  }

  if (n === 1) viz = new BarMatrixViz(canvas, tooltip);
  else if (n === 2) viz = new TerrainViz(canvas, tooltip);
  else              viz = new BubbleViz(canvas, tooltip);

  viz.init();
  refreshViz();
}

// ── Crisis period buttons (viz1 only) ─────────────────────────────────────────
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
  const years = YEARS_FULL.slice(startIdx, endIdx + 1);
  if (activeViz === 3) viz.update(names, ITEMS, timeIdx);
  else viz.update(names, ITEMS, years);
}

init();
