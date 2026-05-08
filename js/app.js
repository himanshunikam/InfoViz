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
function colorForIndex(idx, total) {
  const hue = Math.round((idx / Math.max(total, 1)) * 360);
  return `hsl(${hue}, 62%, 44%)`;
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
  const built = {};

  sortedNames.forEach((itemName, idx) => {
    const yearMap = byItem.get(itemName);
    built[itemName] = {
      color: colorForIndex(idx, sortedNames.length),
      dash: DASH_PATTERNS[idx % DASH_PATTERNS.length],
      values: years.map(y => yearMap.has(y) ? yearMap.get(y) : null)
    };
  });

  return { years, items: built, names: sortedNames };
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
  renderPills();
  refresh();
}

// ── Data Processing ──────────────────────────────────────────────────────────
function getData(n) {
  return ITEMS[n].values.slice(si, ei + 1);
}

function updateStats() {
  document.getElementById('s-items').textContent = sel.size;
  document.getElementById('s-range').textContent = YEARS[si] + ' – ' + YEARS[ei];
  document.getElementById('s-pts').textContent = sel.size * (ei - si + 1);
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

  return names.filter(n => sel.has(n)).map(n => ({
    label: n,
    data: getData(n),
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

  const categoryColors = d3.scaleOrdinal()
    .domain(CATEGORY_ORDER)
    .range(CATEGORY_ORDER.map((_, idx) => colorForIndex(idx, CATEGORY_ORDER.length)));

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

// ── Event Listeners ───────────────────────────────────────────────────────────
foodSelect.addEventListener('change', function () {
  const chosen = [...this.selectedOptions].map(o => o.value);
  if (chosen.length === 0) {
    syncFoodSelectSelection();
    return;
  }
  sel.clear();
  chosen.forEach(n => sel.add(n));
  renderPills();
  refresh();
});

categoryFilter.addEventListener('change', function () {
  renderFoodSelect();
  syncFoodSelectSelection();
});

toggleRollingAvg.addEventListener('change', function () {
  showRollingAvg = this.checked;
  refresh();
});

toggle3DView.addEventListener('change', function () {
  show3DView = this.checked;
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
  categoryFilter.value = 'All';
  renderFoodSelect();
  syncFoodSelectSelection();
  renderPills();
  refresh();
});

btnFirst8.addEventListener('click', function () {
  sel.clear();
  names.slice(0, 8).forEach(n => sel.add(n));
  categoryFilter.value = 'All';
  renderFoodSelect();
  syncFoodSelectSelection();
  renderPills();
  refresh();
});

btnSelectCategory.addEventListener('click', function () {
  const active = categoryFilter.value || 'All';
  const targets = active === 'All' ? names : names.filter(n => ITEM_CATEGORY[n] === active);
  if (!targets.length) return;
  sel.clear();
  targets.forEach(n => sel.add(n));
  syncFoodSelectSelection();
  renderPills();
  refresh();
});

btnClearCategory.addEventListener('click', function () {
  const active = categoryFilter.value || 'All';
  const targets = active === 'All' ? names : names.filter(n => ITEM_CATEGORY[n] === active);
  if (!targets.length) return;
  if (sel.size <= targets.length) return;
  targets.forEach(n => sel.delete(n));
  syncFoodSelectSelection();
  renderPills();
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
    .text(showRollingAvg 
      ? `Avg LCU / tonne (${rollingWindow}yr rolling)`
      : 'LCU / tonne');

  // Interactive tooltip - remove old one first
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
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'none')
    .attr('pointer-events', 'auto')
    .on('mousemove', function(event) {
      const [mx, my] = d3.pointer(event, this);
      const yearIdx = nearestYearForPointer(mx, yearRange, xScale);
      if (!yearRange.includes(yearIdx)) {
        tooltip.style('display', 'none');
        return;
      }

      let html = `<strong>Year ${yearIdx}</strong><br>`;
      datasets.forEach((ds, i) => {
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

  // Store chart reference for refresh
  chart = { svg, g, xScale, yScale, yearRange, datasets };
}

// ── Refresh ───────────────────────────────────────────────────────────────────
function refresh() {
  buildChart();
  buildStackedCategoryChart();
  updateStats();
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
    categoryFilter.value = 'All';

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
    renderFoodSelect();
    renderPills();
    refresh();
    toggleRollingAvg.checked = false;
    showRollingAvg = false;
    rollingWindowInput.value = rollingWindow;
    subtitle.textContent = `Annual producer prices from producer-prices_deu.csv · ${YEARS[0]}–${YEARS[YEARS.length - 1]} · FAOSTAT`;
  } catch (err) {
    console.error(err);
    subtitle.textContent = 'Could not load producer-prices_deu.csv. Run from a local web server (not file://).';
  }
}

initFromCsv();
