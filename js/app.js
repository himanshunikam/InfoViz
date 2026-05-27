// ── Data source (CSV) ─────────────────────────────────────────────────────────
const DASH_PATTERNS = [[], [6, 3], [3, 3], [8, 4], [4, 2], [5, 2, 1, 2], [2, 2], [10, 3]];

let YEARS = [];
let ITEMS = {};
let names = [];
let ITEM_CATEGORY = {};
let CATEGORY_NAMES = [];
const sel = new Set();
let si = 0;
let ei = 0;
let chart = null;
let showRollingAvg = false;
let show3DView = false;
let rollingWindow = 3;
let showBasketMode = false;
let showIndexed = false;

const baset = new Set();
const legDiv = document.getElementById('legend');
const pillsDiv = document.getElementById('pills');
const toggle3DView = document.getElementById('toggle-3d-view');
const startSlider = document.getElementById('sl-start');
const endSlider = document.getElementById('sl-end');
const foodSelect = document.getElementById('food-select');
const categoryFilter = document.getElementById('category-filter');
const btnSelectAll = document.getElementById('btn-select-all');
const btnFirst8 = document.getElementById('btn-first-8');
const btnSelectCategory = document.getElementById('btn-select-category');
const btnClearCategory = document.getElementById('btn-clear-category');
const toggleRollingAvg = document.getElementById('toggle-rolling-avg');
const rollingWindowInput = document.getElementById('rolling-window');

const CATEGORY_ORDER = [
  'Milk & Dairy',
  'Meat',
  'Vegetables',
  'Fruits',
  'Cereals & Grains',
  'Pulses & Legumes',
  'Oilseeds & Oils',
  'Sweeteners',
  'Other'
];

// ── Utilities ─────────────────────────────────────────────────────────────────

// Tableau10 — a palette designed specifically for data visualisation.
// Each colour is perceptually distinct and readable on a white background.
const COLOR_PALETTE = [
  '#4e79a7', // steel blue
  '#f28e2b', // orange
  '#e15759', // red
  '#76b7b2', // teal
  '#59a14f', // green
  '#edc948', // amber
  '#b07aa1', // purple
  '#ff9da7', // rose
  '#9c755f', // brown
  '#bab0ac', // warm grey
];

function colorForIndex(idx) {
  return COLOR_PALETTE[idx % COLOR_PALETTE.length];
}

function categorizeItem(itemName) {
  const n = itemName.toLowerCase();

  if (n.includes('milk') || n.includes('egg') || n.includes('honey')) return 'Milk & Dairy';
  if (n.includes('meat') || n.includes('wool')) return 'Meat';
  if (
    n.includes('potato') || n.includes('onion') || n.includes('shallot') ||
    n.includes('tomato') || n.includes('cabbage') || n.includes('carrot') ||
    n.includes('turnip') || n.includes('cauliflower') || n.includes('broccoli') ||
    n.includes('cucumber') || n.includes('gherkin') || n.includes('lettuce') ||
    n.includes('chicory') || n.includes('leek') || n.includes('mushroom') ||
    n.includes('truffle') || n.includes('spinach') || n.includes('asparagus') ||
    n.includes('vegetable') || n.includes('pumpkin')
  ) return 'Vegetables';
  if (
    n.includes('apple') || n.includes('pear') || n.includes('peach') ||
    n.includes('nectarine') || n.includes('plum') || n.includes('sloe') ||
    n.includes('cherry') || n.includes('apricot') || n.includes('strawberr') ||
    n.includes('raspberr') || n.includes('blueberr') || n.includes('gooseberr') ||
    n.includes('currant') || n.includes('fruit') || n.includes('walnut') ||
    n.includes('berry')
  ) return 'Fruits';
  if (
    n.includes('wheat') || n.includes('barley') || n.includes('oat') ||
    n.includes('rye') || n.includes('maize') || n.includes('corn') || n.includes('triticale')
  ) return 'Cereals & Grains';
  if (
    n.includes('bean') || n.includes('pea') || n.includes('pulse') ||
    n.includes('lupin') || n.includes('vetch')
  ) return 'Pulses & Legumes';
  if (
    n.includes('soya') || n.includes('sunflower') || n.includes('rape') ||
    n.includes('colza') || n.includes('mustard seed') || n.includes('oil')
  ) return 'Oilseeds & Oils';
  if (n.includes('sugar')) return 'Sweeteners';
  return 'Other';
}

function visibleNamesByCategory() {
  const active = categoryFilter.value || 'All';
  if (active === 'All') return names;
  return names.filter(n => ITEM_CATEGORY[n] === active);
}

function nearestYearForPointer(mx, yearRange, xScale) {
  let nearest = yearRange[0];
  let nearestDistance = Infinity;

  yearRange.forEach(year => {
    const position = xScale(year);
    const distance = Math.abs(position - mx);
    if (distance < nearestDistance) {
      nearest = year;
      nearestDistance = distance;
    }
  });

  return nearest;
}

// ── Data Interpolation ────────────────────────────────────────────────────────
// Fills null gaps in a values array using linear interpolation.
// Edge gaps (no anchor on one side) are filled with the nearest known value.
function interpolateMissing(values) {
  const result = [...values];
  const n = result.length;
  let i = 0;

  while (i < n) {
    if (result[i] !== null) { i++; continue; }

    // Found a gap — locate its boundaries
    const left = i - 1;                              // last known index before gap (-1 if none)
    let right = i + 1;
    while (right < n && result[right] === null) right++; // first known index after gap

    for (let j = i; j < right; j++) {
      if (left < 0 && right >= n) {
        // No anchors at all — leave null (shouldn't happen after 50% filter)
        result[j] = null;
      } else if (left < 0) {
        // Leading gap: no data before — hold the first known value flat
        result[j] = result[right];
      } else if (right >= n) {
        // Trailing gap: no data after — hold the last known value flat
        result[j] = result[left];
      } else {
        // Interpolate: t goes from 0 at left+1 to 1 at right
        const t = (j - left) / (right - left);
        result[j] = Math.round((result[left] + t * (result[right] - result[left])) * 100) / 100;
      }
    }

    i = right;
  }

  return result;
}

// ── CSV Parsing ───────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('#')) continue;
    const cols = parseCsvLine(lines[i]);
    if (cols.length < header.length) continue;
    const row = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = cols[c];
    }
    rows.push(row);
  }
  return rows;
}

function buildSeries(rows) {
  const annualRows = rows.filter(r =>
    r.Months === 'Annual value' &&
    r.Unit === 'LCU' &&
    r.Value !== '' &&
    Number.isFinite(Number(r.Year)) &&
    Number.isFinite(Number(r.Value))
  );

  const years = [...new Set(annualRows.map(r => Number(r.Year)))].sort((a, b) => a - b);
  const byItem = new Map();

  annualRows.forEach(r => {
    const item = r.Item;
    if (!byItem.has(item)) byItem.set(item, new Map());
    byItem.get(item).set(Number(r.Year), Number(r.Value));
  });

  const sortedNames = [...byItem.keys()].sort((a, b) => a.localeCompare(b));

  // Drop items where more than 50% of years have no data
  const filteredNames = sortedNames.filter(itemName => {
    const yearMap = byItem.get(itemName);
    const missingCount = years.filter(y => !yearMap.has(y)).length;
    return missingCount / years.length <= 0.5;
  });

  const built = {};

  filteredNames.forEach((itemName, idx) => {
    const yearMap = byItem.get(itemName);
    built[itemName] = {
      color: colorForIndex(idx),
      dash: DASH_PATTERNS[idx % DASH_PATTERNS.length],
      values: interpolateMissing(years.map(y => yearMap.has(y) ? yearMap.get(y) : null))
    };
  });

  return { years, items: built, names: filteredNames };
}

// ── UI Rendering ──────────────────────────────────────────────────────────────
function renderLegend() {
  legDiv.innerHTML = '';
  names.filter(n => sel.has(n)).forEach(n => {
    const span = document.createElement('span');
    span.className = 'legend-item';
    span.innerHTML = `<span class="legend-swatch" style="background:${ITEMS[n].color}"></span>${n}`;
    legDiv.appendChild(span);
  });
}

function renderPills() {
  pillsDiv.innerHTML = '';
  names.filter(n => sel.has(n)).forEach(n => {
    const b = document.createElement('button');
    b.className = 'pill';
    b.id = 'pill-' + n;
    b.style.border = `1.5px solid ${ITEMS[n].color}`;
    b.style.background = ITEMS[n].color + '22';
    b.innerHTML = `<span class="pill-dot" style="background:${ITEMS[n].color}"></span>${n}`;
    b.onclick = () => toggle(n);
    pillsDiv.appendChild(b);
  });
}

function renderFoodSelect() {
  foodSelect.innerHTML = '';
  const visible = visibleNamesByCategory();
  const groups = CATEGORY_ORDER.filter(c => CATEGORY_NAMES.includes(c));

  groups.forEach(cat => {
    const catNames = visible.filter(n => ITEM_CATEGORY[n] === cat);
    if (!catNames.length) return;

    const group = document.createElement('optgroup');
    group.label = cat;

    catNames.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      opt.selected = sel.has(n);
      group.appendChild(opt);
    });

    foodSelect.appendChild(group);
  });
}
function renderFoodList() {
  const list = document.getElementById('food-select-list');
  if (!list) return;
  list.innerHTML = '';

  const visible = visibleNamesByCategory();   // respects the dropdown

  visible.forEach(n => {
    const item = document.createElement('div');
    item.className = 'food-list-item' + (sel.has(n) ? ' active' : '');

    const dot = document.createElement('span');
    dot.className = 'food-list-dot';
    dot.style.background = ITEMS[n].color;

    const label = document.createElement('span');
    label.textContent = n;

    item.appendChild(dot);
    item.appendChild(label);
    item.addEventListener('click', () => toggle(n));
    list.appendChild(item);
  });
}

function syncFoodSelectSelection() {
  const selectedSet = new Set(sel);
  [...foodSelect.options].forEach(opt => {
    opt.selected = selectedSet.has(opt.value);
  });
}

function toggle(n) {
  if (sel.has(n)) {
    if (sel.size > 1) sel.delete(n);
  } else {
    sel.add(n);
  }
  names.forEach(nm => {
    const pill = document.getElementById('pill-' + nm);
    if (pill) pill.style.opacity = sel.has(nm) ? '1' : '0.28';
  });
  syncFoodSelectSelection();
  renderFoodList();
  refresh();
}

// ── Data Processing ──────────────────────────────────────────────────────────
function getData(n) {
  return ITEMS[n].values.slice(si, ei + 1);
}

function updateStats() {
  // stat cards removed; function kept so refresh() calls don't break
}

function applyRollingAverage(data, window) {
  if (window < 2) return data;
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(data.length, i + Math.ceil(window / 2));
    const slice = data.slice(start, end).filter(v => v != null);
    if (slice.length === 0) {
      result.push(null);
    } else {
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      result.push(Math.round(avg * 100) / 100);
    }
  }
  return result;
}

function indexData(values){
  const base = values[0];
  if (base== null || base ==0) return values;
  return values.map(v => v == null? null : Math.round((v/base)*1000)/10);

}

function buildDatasets() {
  if (showRollingAvg) {
    const selected = names.filter(n => sel.has(n));
    if (selected.length === 0) return [];

    const allData = YEARS.map((_, yearIdx) => {
      const values = selected
        .map(n => ITEMS[n].values[yearIdx])
        .filter(v => v != null);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    });

    const sliced = allData.slice(si, ei + 1);
    const finalData = applyRollingAverage(sliced, rollingWindow);

    return [{
      label: `Avg (${rollingWindow}yr rolling)`,
      data: finalData,
      borderColor: '#333',
      backgroundColor: 'transparent',
      borderDash: [],
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      tension: 0.4,
      fill: false,
      spanGaps: true
    }];
  }

  const lines = names.filter(n => sel.has(n)).map(n => ({
    label: n,
    data: showIndexed ? indexData(getData(n)) : getData(n),
    borderColor: ITEMS[n].color,
    backgroundColor: ITEMS[n].color + '12',
    borderDash: ITEMS[n].dash,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 5,
    tension: 0.35,
    fill: false,
    spanGaps: true
  }));

  const basketline = foodBasket();

  if (basketline) lines.push(basketline);

  return lines;
}

function averageForCategoryYear(category, yearIdx, selectedNames) {
  const values = selectedNames
    .filter(name => ITEM_CATEGORY[name] === category)
    .map(name => ITEMS[name].values[yearIdx])
    .filter(value => value != null);

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nearestBandYear(mx, yearRange, xScale) {
  let nearest = yearRange[0];
  let nearestDistance = Infinity;

  yearRange.forEach(year => {
    const bandX = xScale(String(year));
    if (bandX == null) return;
    const distance = Math.abs((bandX + (xScale.bandwidth() / 2)) - mx);
    if (distance < nearestDistance) {
      nearest = year;
      nearestDistance = distance;
    }
  });

  return nearest;
}

function buildCategoryChangeData(yearRange) {
  const selectedNames = names.filter(name => sel.has(name));
  const categories = CATEGORY_ORDER.filter(category =>
    selectedNames.some(name => ITEM_CATEGORY[name] === category)
  );

  if (selectedNames.length === 0 || categories.length === 0 || yearRange.length < 2) {
    return { categories: [], rows: [] };
  }

  const annualCategoryValues = yearRange.map((year, idx) => {
    const yearIdx = si + idx;
    const row = { year };

    categories.forEach(category => {
      const avg = averageForCategoryYear(category, yearIdx, selectedNames);
      row[category] = avg == null ? 0 : avg;
    });

    return row;
  });

  const rows = annualCategoryValues.map((row, idx) => {
    const nextRow = { year: row.year };
    categories.forEach(category => {
      const currentValue = annualCategoryValues[idx][category] ?? 0;
      const previousValue = idx > 0 ? (annualCategoryValues[idx - 1][category] ?? 0) : 0;
      nextRow[category] = idx === 0 ? 0 : currentValue - previousValue;
    });
    return nextRow;
  });

  return { categories, rows };
}

function buildChart3D(svg, fullWidth, fullHeight, margin, width, height, yearRange, datasets) {
  svg.selectAll('*').remove();

  svg
    .attr('width', fullWidth)
    .attr('height', fullHeight)
    .style('display', 'block');

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  if (datasets.length === 0) {
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#888780')
      .text('No items selected');
    return;
  }

  let allValues = [];
  datasets.forEach(ds => {
    ds.data.forEach(v => {
      if (v != null) allValues.push(v);
    });
  });

  const yMin = Math.min(...allValues) * 0.95;
  const yMax = Math.max(...allValues) * 1.05;
  const maxDepth = Math.max(datasets.length - 1, 0);
  const depthX = Math.max(12, Math.round(width * 0.02));
  const depthY = Math.max(8, Math.round(height * 0.015));
  const plotWidth = Math.max(12, width - (depthX * maxDepth));
  const plotHeight = Math.max(12, height - (depthY * maxDepth));
  const baseYOffset = depthY * maxDepth;

  const xScale = d3.scalePoint()
    .domain(yearRange)
    .range([0, plotWidth])
    .padding(0.5);

  const yScale = d3.scaleLinear()
    .domain([yMin, yMax])
    .range([plotHeight, 0]);

  const projectPoint = (year, value, depth) => ({
    x: xScale(year) + (depth * depthX),
    y: baseYOffset + yScale(value) - (depth * depthY)
  });

  const frontTopLeft = [0, baseYOffset];
  const frontTopRight = [plotWidth, baseYOffset];
  const frontBottomLeft = [0, baseYOffset + plotHeight];
  const frontBottomRight = [plotWidth, baseYOffset + plotHeight];
  const backTopLeft = [maxDepth * depthX, 0];
  const backTopRight = [plotWidth + (maxDepth * depthX), 0];
  const backBottomRight = [plotWidth + (maxDepth * depthX), plotHeight];

  g.append('polygon')
    .attr('points', `${frontTopLeft[0]},${frontTopLeft[1]} ${frontTopRight[0]},${frontTopRight[1]} ${backTopRight[0]},${backTopRight[1]} ${backTopLeft[0]},${backTopLeft[1]}`)
    .attr('fill', 'rgba(29,158,117,0.05)');

  g.append('polygon')
    .attr('points', `${frontTopRight[0]},${frontTopRight[1]} ${backTopRight[0]},${backTopRight[1]} ${backBottomRight[0]},${backBottomRight[1]} ${frontBottomRight[0]},${frontBottomRight[1]}`)
    .attr('fill', 'rgba(0,0,0,0.03)');

  g.append('polygon')
    .attr('points', `${frontTopLeft[0]},${frontTopLeft[1]} ${frontTopRight[0]},${frontTopRight[1]} ${frontBottomRight[0]},${frontBottomRight[1]} ${frontBottomLeft[0]},${frontBottomLeft[1]}`)
    .attr('fill', 'rgba(255,255,255,0.55)')
    .attr('stroke', 'rgba(0,0,0,0.08)');

  const gridTicks = yScale.ticks(5);
  g.append('g')
    .selectAll('line')
    .data(gridTicks)
    .enter()
    .append('line')
    .attr('x1', 0)
    .attr('y1', d => yScale(d) + baseYOffset)
    .attr('x2', plotWidth)
    .attr('y2', d => yScale(d) + baseYOffset)
    .attr('stroke', 'rgba(136,135,128,0.13)')
    .attr('stroke-width', 0.7);

  const yAxisGroup = g.append('g')
    .call(d3.axisLeft(yScale)
      .tickFormat(d => {
        if (showRollingAvg) return d.toFixed(0);
        return d.toLocaleString();
      })
    )
    .attr('color', '#888780');

  yAxisGroup.selectAll('text')
    .attr('font-size', '11px');

  g.append('g')
    .attr('transform', `translate(0,${baseYOffset + plotHeight})`)
    .call(d3.axisBottom(xScale)
      .tickValues(yearRange.filter((y, i) => i % Math.ceil(yearRange.length / 10) === 0))
    )
    .attr('color', '#888780')
    .selectAll('text')
    .attr('font-size', '11px');

  g.select('g:last-of-type .domain').remove();

  const area = d3.area()
    .defined(d => d != null)
    .x(d => d.x)
    .y0(d => d.baseY)
    .y1(d => d.y);

  const line = d3.line()
    .defined(d => d != null)
    .x(d => d.x)
    .y(d => d.y);

  datasets.forEach((ds, depth) => {
    const projected = yearRange.map((year, index) => {
      const value = ds.data[index];
      if (value == null) return null;
      const point = projectPoint(year, value, depth);
      return {
        ...point,
        baseY: baseYOffset + plotHeight - (depth * depthY)
      };
    });

    const shadow = projected.map(point => point ? ({
      x: point.x + 3,
      y: point.y + 3,
      baseY: point.baseY + 3
    }) : null);

    g.append('path')
      .attr('d', area(shadow))
      .attr('fill', 'rgba(0,0,0,0.12)')
      .attr('opacity', 0.22);

    g.append('path')
      .attr('d', area(projected))
      .attr('fill', ds.borderColor)
      .attr('fill-opacity', 0.18);

    g.append('path')
      .attr('d', line(projected))
      .attr('fill', 'none')
      .attr('stroke', ds.borderColor)
      .attr('stroke-width', 2.4)
      .attr('stroke-dasharray', ds.borderDash.length > 0 ? ds.borderDash.join(',') : 'none')
      .attr('opacity', 0.92);
  });

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left)
    .attr('x', 0 - (height / 2))
    .attr('dy', '1em')
    .attr('text-anchor', 'middle')
    .attr('fill', '#888780')
    .attr('font-size', '11px')
    .text(showRollingAvg
      ? `Avg LCU / tonne (${rollingWindow}yr rolling)`
      : 'LCU / tonne');

  d3.select('#d3-tooltip').remove();
  const tooltip = d3.select('body').append('div')
    .attr('id', 'd3-tooltip')
    .style('position', 'absolute')
    .style('background', 'rgba(0,0,0,0.8)')
    .style('color', 'white')
    .style('padding', '6px 10px')
    .style('border-radius', '4px')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('display', 'none')
    .style('z-index', '1000');

  const overlay = g.append('rect')
    .attr('width', plotWidth)
    .attr('height', plotHeight)
    .attr('fill', 'none')
    .attr('pointer-events', 'auto')
    .attr('transform', `translate(0,${baseYOffset})`)
    .on('mousemove', function(event) {
      const [mx] = d3.pointer(event, this);
      const yearIdx = nearestYearForPointer(mx, yearRange, xScale);
      if (!yearRange.includes(yearIdx)) {
        tooltip.style('display', 'none');
        return;
      }

      let html = `<strong>Year ${yearIdx}</strong><br>`;
      datasets.forEach(ds => {
        const val = ds.data[yearRange.indexOf(yearIdx)];
        if (val != null) {
          if (showRollingAvg) {
            html += `${ds.label}: ${val.toFixed(1)}<br>`;
          } else {
            html += `${ds.label}: ${val.toLocaleString()} LCU/t<br>`;
          }
        }
      });

      tooltip
        .html(html)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('display', 'block');
    })
    .on('mouseleave', function() {
      tooltip.style('display', 'none');
    });

  chart = { svg, g, xScale, yScale, yearRange, datasets };
}

function buildStackedCategoryChart() {
  const svg = d3.select('#stackedChart');
  svg.selectAll('*').remove();

  const margin = { top: 18, right: 16, bottom: 38, left: 60 };
  const containerRect = svg.node().parentElement.getBoundingClientRect();
  const fullWidth = containerRect.width > 0 ? containerRect.width : 800;
  const fullHeight = containerRect.height > 0 ? containerRect.height : 280;
  const width = fullWidth - margin.left - margin.right;
  const height = fullHeight - margin.top - margin.bottom;

  svg
    .attr('width', fullWidth)
    .attr('height', fullHeight)
    .style('display', 'block');

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const yearRange = YEARS.slice(si, ei + 1);
  const { categories, rows } = buildCategoryChangeData(yearRange);

  if (rows.length === 0 || categories.length === 0) {
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#888780')
      .text('No category change data for the current selection');
    return;
  }

  const xScale = d3.scaleBand()
    .domain(yearRange.map(String))
    .range([0, width])
    .padding(0.18);

  const stack = d3.stack()
    .keys(categories)
    .offset(d3.stackOffsetDiverging);

  const stackedSeries = stack(rows);

  let yMin = 0;
  let yMax = 0;
  stackedSeries.forEach(series => {
    series.forEach(point => {
      yMin = Math.min(yMin, point[0], point[1]);
      yMax = Math.max(yMax, point[0], point[1]);
    });
  });

  const yScale = d3.scaleLinear()
    .domain([yMin * 1.08, yMax * 1.08])
    .nice()
    .range([height, 0]);

  g.append('g')
    .attr('class', 'd3-grid')
    .attr('opacity', 0.1)
    .call(d3.axisLeft(yScale)
      .tickSize(-width)
      .tickFormat('')
    );

  g.append('line')
    .attr('x1', 0)
    .attr('x2', width)
    .attr('y1', yScale(0))
    .attr('y2', yScale(0))
    .attr('stroke', 'rgba(0,0,0,0.35)')
    .attr('stroke-width', 1);

  const STACK_PALETTE = [
    '#7eb8d4', // sky blue     — Milk & Dairy
    '#e07b8a', // blush rose   — Meat
    '#6dbf8e', // mint green   — Vegetables
    '#f5c26b', // peach yellow — Fruits
    '#a89fd8', // lavender     — Cereals & Grains
    '#6bc4c4', // soft teal    — Pulses & Legumes
    '#f0a070', // salmon       — Oilseeds & Oils
    '#aac96e', // light olive  — Sweeteners
    '#b0aaa5', // silver grey  — Other
  ];

  const categoryColors = d3.scaleOrdinal()
    .domain(CATEGORY_ORDER)
    .range(STACK_PALETTE);

  const seriesGroups = g.selectAll('.stack-layer')
    .data(stackedSeries)
    .enter()
    .append('g')
    .attr('class', 'stack-layer')
    .attr('fill', d => categoryColors(d.key));

  seriesGroups.selectAll('rect')
    .data(d => d)
    .enter()
    .append('rect')
    .attr('x', d => xScale(String(d.data.year)))
    .attr('y', d => yScale(Math.max(d[0], d[1])))
    .attr('width', xScale.bandwidth())
    .attr('height', d => Math.max(1, Math.abs(yScale(d[0]) - yScale(d[1]))))
    .attr('rx', 2)
    .attr('ry', 2)
    .attr('opacity', 0.9);

  const tickStep = Math.ceil(yearRange.length / 10);
  g.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
      .tickValues(yearRange.filter((year, index) => index % tickStep === 0).map(String))
    )
    .attr('color', '#888780')
    .selectAll('text')
    .attr('font-size', '11px');

  g.select('g:last-of-type .domain').remove();

  g.append('g')
    .call(d3.axisLeft(yScale)
      .tickFormat(d => `${d >= 0 ? '+' : ''}${d.toLocaleString()}`)
    )
    .attr('color', '#888780')
    .selectAll('text')
    .attr('font-size', '11px');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left)
    .attr('x', 0 - (height / 2))
    .attr('dy', '1em')
    .attr('text-anchor', 'middle')
    .attr('fill', '#888780')
    .attr('font-size', '11px')
    .text('Year-over-year change in LCU / tonne');

  d3.select('#stacked-tooltip').remove();
  const tooltip = d3.select('body').append('div')
    .attr('id', 'stacked-tooltip')
    .style('position', 'absolute')
    .style('background', 'rgba(0,0,0,0.84)')
    .style('color', 'white')
    .style('padding', '6px 10px')
    .style('border-radius', '4px')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('display', 'none')
    .style('z-index', '1000');

  const overlay = g.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'none')
    .attr('pointer-events', 'all')
    .on('mousemove', function(event) {
      const [mx] = d3.pointer(event, this);
      const yearIdx = nearestBandYear(mx, yearRange, xScale);
      const row = rows[yearRange.indexOf(yearIdx)];
      if (!row) {
        tooltip.style('display', 'none');
        return;
      }

      const totalChange = categories.reduce((sum, category) => sum + (row[category] || 0), 0);
      let html = `<strong>Year ${yearIdx}</strong><br>Total change: ${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(1)}<br>`;
      categories.forEach(category => {
        const value = row[category] || 0;
        html += `${category}: ${value >= 0 ? '+' : ''}${value.toFixed(1)}<br>`;
      });

      tooltip
        .html(html)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .style('display', 'block');
    })
    .on('mouseleave', function() {
      tooltip.style('display', 'none');
    });

  chart = { svg, g, xScale, yScale, yearRange, rows, categories };
}
function buildBasketData(){
  
  const yearIndices = [];
  for (let i = si; i <= ei; i++){
    yearIndices.push(i)
  }

  return yearIndices.map(yearIndex => {
    const selectedItems = [...sel];
    const prices = selectedItems.map( name => ITEMS[name].values[yearIndex]).filter(price => price !== null)
    if (prices.length === 0) return null;
    return prices.reduce((sum, p) => sum + p, 0);
  })

}

function foodBasket(){
  if (!showBasketMode) return null;

  const data = buildBasketData();

  return {
    label : 'Basket Total',
    data : data,
    borderColor : '#e05c00',
    backgroundColor:'transparent',
    borderDash : [],
    borderWidth: 3,
    pointRadius: 0,
    pointHoverRadius: 6,
    tension : 0.35,
    fill: false,
    spanGaps: true
  }
}
// ── Event Listeners ───────────────────────────────────────────────────────────
foodSelect.addEventListener('change', function () {
  const chosen = [...this.selectedOptions].map(o => o.value);
  if (chosen.length === 0) {
    syncFoodSelectSelection();
    return;
  }
  sel.clear();
  chosen.forEach(n => sel.add(n));
  renderFoodList();
  refresh();
});

categoryFilter.addEventListener('change', function () {
  renderFoodList();
  syncFoodSelectSelection();
});

toggleRollingAvg.addEventListener('change', function () {
  showRollingAvg = this.checked;
  refresh();
});

toggle3DView.addEventListener('click', function () {
  show3DView = !show3DView;
  this.classList.toggle('active', show3DView);
  refresh();
});

rollingWindowInput.addEventListener('change', function () {
  rollingWindow = Math.max(2, Math.min(10, parseInt(this.value) || 3));
  this.value = rollingWindow;
  if (showRollingAvg) refresh();
});

btnSelectAll.addEventListener('click', function () {
  sel.clear();
  names.forEach(n => sel.add(n));
  renderFoodList();
  syncFoodSelectSelection();
  /*renderPills();*/
  refresh();
});

btnFirst8.addEventListener('click', function () {
  sel.clear();
  names.slice(0, 8).forEach(n => sel.add(n));
  renderFoodList();
  syncFoodSelectSelection();
  /*renderPills();*/
  refresh();
});

btnSelectCategory.addEventListener('click', function () {
  const active = categoryFilter.value || 'All';
  const targets = active === 'All' ? names : names.filter(n => ITEM_CATEGORY[n] === active);
  if (!targets.length) return;
  sel.clear();
  targets.forEach(n => sel.add(n));
  syncFoodSelectSelection();
  renderFoodList();
  refresh();
});

btnClearCategory.addEventListener('click', function () {
  const active = categoryFilter.value || 'All';
  const targets = active === 'All' ? names : names.filter(n => ITEM_CATEGORY[n] === active);
  if (!targets.length) return;
  if (sel.size <= targets.length) return;
  targets.forEach(n => sel.delete(n));
  syncFoodSelectSelection();
  renderFoodList();
  refresh();
});

startSlider.addEventListener('input', function () {
  if (!YEARS.length) return;
  si = Math.min(+this.value, ei - 1);
  this.value = si;
  document.getElementById('lbl-start').textContent = YEARS[si];
  refresh();
});

endSlider.addEventListener('input', function () {
  if (!YEARS.length) return;
  ei = Math.max(+this.value, si + 1);
  this.value = ei;
  document.getElementById('lbl-end').textContent = YEARS[ei];
  refresh();
});

document.getElementById('toggle-indexed').addEventListener('click', function () {
  showIndexed = !showIndexed;
  this.classList.toggle('active', showIndexed);
  refresh();
});

document.getElementById('toggle-basket').addEventListener('click', function () {
  showBasketMode = !showBasketMode;
  this.classList.toggle('active', showBasketMode);
  refresh();
});
// ── Chart Building with D3 ───────────────────────────────────────────────────
function buildChart() {
  const svg = d3.select('#mainChart');
  svg.selectAll('*').remove();

  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const containerRect = svg.node().parentElement.getBoundingClientRect();
  const fullWidth = containerRect.width > 0 ? containerRect.width : 800;
  const fullHeight = containerRect.height > 0 ? containerRect.height : 380;
  const width = fullWidth - margin.left - margin.right;
  const height = fullHeight - margin.top - margin.bottom;

  svg
    .attr('width', fullWidth)
    .attr('height', fullHeight)
    .style('display', 'block');

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const yearRange = YEARS.slice(si, ei + 1);
  const datasets = buildDatasets();

  if (show3DView) {
    buildChart3D(svg, fullWidth, fullHeight, margin, width, height, yearRange, datasets);
    return;
  }

  if (datasets.length === 0) {
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#888780')
      .text('No items selected');
    return;
  }

  // Collect all values to determine y-scale domain
  let allValues = [];
  datasets.forEach(ds => {
    ds.data.forEach(v => {
      if (v != null) allValues.push(v);
    });
  });

  const yMin = Math.min(...allValues) * 0.95;
  const yMax = Math.max(...allValues) * 1.05;

  const xScale = d3.scalePoint()
    .domain(yearRange)
    .range([0, width])
    .padding(0.5);

  const yScale = d3.scaleLinear()
    .domain([yMin, yMax])
    .range([height, 0]);

  const line = d3.line()
    .defined(d => d != null)
    .x((d, i) => xScale(yearRange[i]))
    .y(d => yScale(d));

  // Draw grid
  g.append('g')
    .attr('class', 'd3-grid')
    .attr('opacity', 0.1)
    .call(d3.axisLeft(yScale)
      .tickSize(-width)
      .tickFormat('')
    );

  // Draw EUR line
  const eurIdx = yearRange.indexOf(2002);
  if (eurIdx !== -1) {
    const eurX = xScale(2002);
    g.append('line')
      .attr('x1', eurX)
      .attr('y1', 0)
      .attr('x2', eurX)
      .attr('y2', height)
      .attr('stroke', 'rgba(136,135,128,0.4)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3');

    g.append('text')
      .attr('x', eurX + 4)
      .attr('y', 12)
      .attr('fill', 'rgba(100,100,100,0.65)')
      .attr('font-size', '10px')
      .text('EUR →');
  }
  // Draw 2020 COVID highlight band
  const covidIdx = yearRange.indexOf(2020);
  if (covidIdx !== -1) {
    const covidX = xScale(2020);
    const bandHalf = (xScale.step() * (1 - xScale.padding())) / 2;

    g.append('rect')
      .attr('x', covidX - bandHalf)
      .attr('y', 0)
      .attr('width', bandHalf * 2)
      .attr('height', height)
      .attr('fill', 'rgba(220,50,50,0.10)')
      .attr('pointer-events', 'none');

    g.append('line')
      .attr('x1', covidX)
      .attr('y1', 0)
      .attr('x2', covidX)
      .attr('y2', height)
      .attr('stroke', 'rgba(200,60,60,0.45)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3')
      .attr('pointer-events', 'none');

    g.append('text')
      .attr('x', covidX + 4)
      .attr('y', 12)
      .attr('fill', 'rgba(190,60,60,0.75)')
      .attr('font-size', '10px')
      .text('COVID-19 ↓');
  }
  // Draw lines for each dataset
  datasets.forEach((ds, i) => {
    g.append('path')
      .attr('d', line(ds.data))
      .attr('fill', 'none')
      .attr('stroke', ds.borderColor)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', ds.borderDash.length > 0 ? ds.borderDash.join(',') : 'none')
      .attr('opacity', 0.8)
      .attr('class', `line-${i}`)
      .attr('data-label', ds.label);
  });

  // Draw x-axis
  g.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
      .tickValues(yearRange.filter((y, i) => i % Math.ceil(yearRange.length / 10) === 0))
    )
    .attr('color', '#888780')
    .selectAll('text')
    .attr('font-size', '11px');

  g.select('g:last-of-type .domain').remove();

  const yAxisGroup = g.append('g')
    .call(d3.axisLeft(yScale)
      .tickFormat(d => {
        if (showRollingAvg) return d.toFixed(0);
        return d.toLocaleString();
      })
    )
    .attr('color', '#888780');

  yAxisGroup.selectAll('text')
    .attr('font-size', '11px');

  // Y-axis label
  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left)
    .attr('x', 0 - (height / 2))
    .attr('dy', '1em')
    .attr('text-anchor', 'middle')
    .attr('fill', '#888780')
    .attr('font-size', '11px')
    .text(showIndexed
      ? `Index (${YEARS[si]= 100})`
      : showRollingAvg
        ? `Avg LCU / tonne (${rollingWindow}yr rolling)`
        : 'LCU / tonne'
    )

  // ── Interactive hover: crosshair + dots + tooltip ────────────────────────
  d3.select('#d3-tooltip').remove();
  const tooltip = d3.select('body').append('div')
    .attr('id', 'd3-tooltip')
    .style('position', 'absolute')
    .style('background', 'rgba(20,20,28,0.92)')
    .style('color', 'white')
    .style('padding', '8px 12px')
    .style('border-radius', '6px')
    .style('font-size', '12px')
    .style('line-height', '1.6')
    .style('pointer-events', 'none')
    .style('display', 'none')
    .style('z-index', '1000')
    .style('box-shadow', '0 2px 8px rgba(0,0,0,0.35)')
    .style('max-width', '260px');

  // Vertical crosshair line (hidden until hover)
  const crosshair = g.append('line')
    .attr('id', 'hover-crosshair')
    .attr('y1', 0)
    .attr('y2', height)
    .attr('stroke', 'rgba(150,150,150,0.5)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,3')
    .attr('pointer-events', 'none')
    .style('display', 'none');

  // Group for the dots that appear on each line
  const dotsGroup = g.append('g')
    .attr('id', 'hover-dots')
    .attr('pointer-events', 'none');

  const overlay = g.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'none')
    .attr('pointer-events', 'auto')
    .on('mousemove', function(event) {
      const [mx] = d3.pointer(event, this);
      const nearestYear = nearestYearForPointer(mx, yearRange, xScale);
      if (!yearRange.includes(nearestYear)) {
        tooltip.style('display', 'none');
        crosshair.style('display', 'none');
        dotsGroup.selectAll('*').remove();
        return;
      }

      const yearDataIdx = yearRange.indexOf(nearestYear);
      const snapX = xScale(nearestYear);

      // Move crosshair to snapped year
      crosshair
        .attr('x1', snapX)
        .attr('x2', snapX)
        .style('display', null);

      // Draw a dot on each line at the hovered year
      dotsGroup.selectAll('*').remove();
      datasets.forEach(ds => {
        const val = ds.data[yearDataIdx];
        if (val == null) return;
        dotsGroup.append('circle')
          .attr('cx', snapX)
          .attr('cy', yScale(val))
          .attr('r', 4.5)
          .attr('fill', ds.borderColor)
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5);
      });

      // Build tooltip HTML with color swatches
      let html = `<strong style="font-size:13px">📅 ${nearestYear}</strong><br>`;
      datasets.forEach(ds => {
        const val = ds.data[yearDataIdx];
        if (val == null) return;
        const formatted = showRollingAvg || showIndexed
          ? val.toFixed(1)
          : val.toLocaleString() + ' LCU/t';
        html += `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${ds.borderColor};margin-right:5px;vertical-align:middle;"></span>`
              + `<span style="color:rgba(255,255,255,0.75)">${ds.label}:</span> <strong>${formatted}</strong><br>`;
      });

      // Flip tooltip to the left if near the right edge
      const flipLeft = event.pageX + 270 > window.innerWidth;
      tooltip
        .html(html)
        .style('left', flipLeft ? (event.pageX - 270) + 'px' : (event.pageX + 14) + 'px')
        .style('top', (event.pageY - 14) + 'px')
        .style('display', 'block');
    })
    .on('mouseleave', function() {
      tooltip.style('display', 'none');
      crosshair.style('display', 'none');
      dotsGroup.selectAll('*').remove();
    });

  // Store chart reference for refresh
  chart = { svg, g, xScale, yScale, yearRange, datasets };
}

// ── Refresh ───────────────────────────────────────────────────────────────────
function refresh() {
  buildChart();
  buildStackedCategoryChart();
  updateStats();
  renderLegend();
}

// ── Initialization ────────────────────────────────────────────────────────────
async function initFromCsv() {
  const subtitle = document.querySelector('.subtitle');
  try {
    const res = await fetch('producer-prices_deu.csv');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();
    const rows = parseCsv(csvText);
    const built = buildSeries(rows);

    YEARS = built.years;
    ITEMS = built.items;
    names = built.names;
    ITEM_CATEGORY = {};
    names.forEach(n => {
      ITEM_CATEGORY[n] = categorizeItem(n);
    });
    CATEGORY_NAMES = [...new Set(names.map(n => ITEM_CATEGORY[n]))]
      .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));

    if (!YEARS.length || !names.length) {
      throw new Error('No annual LCU data found in CSV');
    }

    sel.clear();
    names.slice(0, 8).forEach(n => sel.add(n));

    categoryFilter.innerHTML = '<option value="All">All categories</option>';
    CATEGORY_NAMES.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      categoryFilter.appendChild(option);
    });
    categoryFilter.value = CATEGORY_NAMES[0];

    si = 0;
    ei = YEARS.length - 1;

    startSlider.min = 0;
    startSlider.max = YEARS.length - 1;
    startSlider.value = si;
    endSlider.min = 0;
    endSlider.max = YEARS.length - 1;
    endSlider.value = ei;
    document.getElementById('lbl-start').textContent = YEARS[si];
    document.getElementById('lbl-end').textContent = YEARS[ei];
    renderLegend();
    renderFoodList();
   /* renderPills();*/
    refresh();
    toggleRollingAvg.checked = false;
    showRollingAvg = false;
    rollingWindowInput.value = rollingWindow;
  } catch (err) {
    console.error(err);
    subtitle.textContent = 'Could not load producer-prices_deu.csv. Run from a local web server (not file://).';
  }
}

// ── AR Feature ────────────────────────────────────────────────────────────────
//
// How it works:
//   1. User clicks "View in AR"
//   2. We check if the browser supports WebXR immersive-ar (Android Chrome only)
//   3. If yes → real WebXR session (camera managed by the browser itself)
//   4. If no  → we ask for camera permission ourselves via getUserMedia,
//               show the feed in a <video>, and draw the chart on a <canvas>
//              layered on top. Visually identical to AR.

let arStream = null;   // holds the camera MediaStream so we can stop it later
let arAnimId = null;   // holds the requestAnimationFrame id so we can cancel it
let xrSession = null;  // holds the WebXR session if we managed to start one

// Entry point — called when user clicks the AR button
async function startAR() {
  // navigator.xr exists only in browsers that understand WebXR at all
  if (navigator.xr) {
    try {
      // isSessionSupported asks "can this browser do immersive-ar right now?"
      const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
      if (arSupported) {
        await startWebXRAR();
        return;
      }
    } catch (e) {
      // Some browsers expose navigator.xr but throw on this call — treat as unsupported
    }
  }
  // Fallback: do it ourselves with getUserMedia
  await startCameraAR();
}

// ── Path A: camera-overlay AR (works everywhere) ──────────────────────────────
async function startCameraAR() {
  const overlay = document.getElementById('ar-overlay');
  const video   = document.getElementById('ar-video');
  const canvas  = document.getElementById('ar-canvas');

  try {
    // getUserMedia returns a Promise — "await" pauses here until the user
    // either grants or denies camera access.
    // facingMode:'environment' = back camera on phones, any camera on desktop
    arStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });

    // Plug the camera stream into the <video> element
    video.srcObject = arStream;
    overlay.style.display = 'block';

    // The video isn't ready instantly — we wait for 'loadedmetadata' before
    // we know its real pixel dimensions, then size our canvas to match.
    video.addEventListener('loadedmetadata', function onReady() {
      video.removeEventListener('loadedmetadata', onReady); // clean up listener
      canvas.width  = video.videoWidth  || window.innerWidth;
      canvas.height = video.videoHeight || window.innerHeight;
      drawARLoop(); // start drawing
    });

  } catch (err) {
    alert(
      'Could not access the camera.\n\n' +
      'Make sure you click "Allow" when the browser asks for camera permission.\n\n' +
      'Error: ' + err.message
    );
  }
}

// ── Path B: real WebXR AR (Android Chrome with AR hardware support) ───────────
async function startWebXRAR() {
  const overlay = document.getElementById('ar-overlay');
  const canvas  = document.getElementById('ar-canvas');

  overlay.style.display = 'block';

  try {
    // 'dom-overlay' lets us show regular HTML on top of the camera feed.
    // Without it we'd have to render everything in WebGL — much harder.
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['dom-overlay'],
      domOverlay: { root: overlay }
    });

    // WebXR always needs a WebGL context to manage its frame rendering,
    // even if we're not drawing 3D objects ourselves.
    const gl = canvas.getContext('webgl', { xrCompatible: true });
    await gl.makeXRCompatible();

    const xrLayer = new XRWebGLLayer(xrSession, gl);
    xrSession.updateRenderState({ baseLayer: xrLayer });

    const refSpace = await xrSession.requestReferenceSpace('local');

    // This is the XR render loop. XR has its OWN requestAnimationFrame.
    // Each frame: clear the GL buffer (camera feed fills it automatically).
    function onXRFrame(time, frame) {
      xrSession.requestAnimationFrame(onXRFrame);
      const pose = frame.getViewerPose(refSpace);
      if (pose) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, xrLayer.framebuffer);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      }
    }
    xrSession.requestAnimationFrame(onXRFrame);
    xrSession.addEventListener('end', stopAR);

    // Size canvas and start drawing our chart (shown via dom-overlay)
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    drawARLoop();

  } catch (err) {
    console.error('WebXR session failed:', err);
    overlay.style.display = 'none';
    // If WebXR setup fails mid-way, fall back to camera approach
    await startCameraAR();
  }
}

// ── Chart drawing on canvas ───────────────────────────────────────────────────
// requestAnimationFrame calls this ~60 times/second. Each call:
//   1. Clears the canvas (transparent → camera shows through)
//   2. Redraws the chart with the latest data
function drawARLoop() {
  const canvas = document.getElementById('ar-canvas');
  if (!canvas || canvas.style.display === 'none') return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Clear to fully transparent — the video behind shows through
  ctx.clearRect(0, 0, W, H);

  const selected = names.filter(n => sel.has(n));

  // Get each selected item's price for the currently selected end-year
  const data = selected
    .map(name => ({ name, value: ITEMS[name].values[ei], color: ITEMS[name].color }))
    .filter(d => d.value != null);

  if (selected.length > 0) {
    drawARLineChart(ctx, W, H, selected);
  }

  // Schedule ourselves to run again next frame
  arAnimId = requestAnimationFrame(drawARLoop);
}

// Draws the line chart (matching the main chart) onto the AR canvas
function drawARLineChart(ctx, W, H, selected) {
  // ── Panel layout ───────────────────────────────────────────────────────────
  const panelW  = Math.min(W * 0.94, 780);
  const panelH  = Math.min(H * 0.72, 420);
  const panelX  = (W - panelW) / 2;
  const panelY  = (H - panelH) / 2;

  const headerH = 52;
  const mLeft   = 58;
  const mRight  = 16;
  const mBottom = 36;

  const plotX = panelX + mLeft;
  const plotY = panelY + headerH;
  const plotW = panelW - mLeft - mRight;
  const plotH = panelH - headerH - mBottom;

  // ── Background panel ───────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(10, 10, 20, 0.86)';
  arRoundRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  arRoundRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.stroke();

  // ── Header ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Food Producer Prices · ${YEARS[si]}–${YEARS[ei]}`, panelX + mLeft, panelY + 22);

  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('LCU / tonne · Germany · FAOSTAT', panelX + mLeft, panelY + 40);

  // ── Collect data for the visible year range ────────────────────────────────
  const yearRange = YEARS.slice(si, ei + 1);
  const datasets  = selected.map(name => ({
    name,
    color: ITEMS[name].color,
    values: ITEMS[name].values.slice(si, ei + 1)
  }));

  // y-scale: find global min/max across all selected items
  let allVals = [];
  datasets.forEach(ds => ds.values.forEach(v => { if (v != null) allVals.push(v); }));
  if (allVals.length === 0) return;
  const yMin = Math.min(...allVals) * 0.95;
  const yMax = Math.max(...allVals) * 1.05;

  // Helper functions that convert data → pixel coords
  const xOf = i   => plotX + (i / (yearRange.length - 1 || 1)) * plotW;
  const yOf = val => plotY + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  // ── Faint horizontal grid lines ────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.8;
  const tickCount = 5;
  for (let t = 0; t <= tickCount; t++) {
    const val = yMin + (t / tickCount) * (yMax - yMin);
    const py  = yOf(val);
    ctx.beginPath();
    ctx.moveTo(plotX, py);
    ctx.lineTo(plotX + plotW, py);
    ctx.stroke();

    // Y-axis label
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(0),
                 plotX - 5, py + 4);
  }

  // ── X-axis year labels ─────────────────────────────────────────────────────
  const step = Math.ceil(yearRange.length / 8);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  yearRange.forEach((yr, i) => {
    if (i % step !== 0 && i !== yearRange.length - 1) return;
    ctx.fillText(String(yr), xOf(i), plotY + plotH + 18);
  });

  // ── Draw one line per selected item ───────────────────────────────────────
  datasets.forEach(ds => {
    ctx.beginPath();
    ctx.strokeStyle = ds.color;
    ctx.lineWidth   = 2;
    ctx.globalAlpha = 0.88;
    let started = false;
    ds.values.forEach((val, i) => {
      if (val == null) { started = false; return; }
      if (!started) { ctx.moveTo(xOf(i), yOf(val)); started = true; }
      else            ctx.lineTo(xOf(i), yOf(val));
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // ── Legend — coloured dot + truncated name ─────────────────────────────────
  const legendY  = plotY + plotH + mBottom - 4;   // just below x-axis labels
  // stacked vertically on the right margin instead, to avoid overlap
  const legX     = panelX + panelW - mRight - 4;
  const legLineH = 15;
  const maxLegItems = Math.floor(plotH / legLineH);
  const legItems = datasets.slice(0, maxLegItems);

  legItems.forEach((ds, i) => {
    const ly = plotY + i * legLineH + 10;
    // dot
    ctx.beginPath();
    ctx.arc(legX - 90, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = ds.color;
    ctx.fill();
    // name
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const label = ds.name.length > 18 ? ds.name.slice(0, 16) + '…' : ds.name;
    ctx.fillText(label, legX - 82, ly + 4);
  });
}

// Helper: builds a rounded-rectangle path (ctx.fill() or ctx.stroke() after calling)
function arRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x, y + h - r,     r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

// ── Cleanup: stop everything when user exits AR ───────────────────────────────
function stopAR() {
  if (arAnimId) { cancelAnimationFrame(arAnimId); arAnimId = null; }
  if (arStream) { arStream.getTracks().forEach(t => t.stop()); arStream = null; }
  if (xrSession) { xrSession.end().catch(() => {}); xrSession = null; }
  const overlay = document.getElementById('ar-overlay');
  if (overlay) overlay.style.display = 'none';
}

document.getElementById('btn-ar').addEventListener('click', startAR);
document.getElementById('ar-close').addEventListener('click', stopAR);

initFromCsv();
