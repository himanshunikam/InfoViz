export const YEARS_FULL = Array.from({ length: 32 }, (_, i) => 1991 + i);

export const CATEGORY_ORDER = [
  'Milk & Dairy', 'Meat', 'Vegetables', 'Fruits',
  'Cereals & Grains', 'Pulses & Legumes', 'Oilseeds & Oils', 'Sweeteners', 'Other'
];

export const CATEGORY_COLORS = {
  'Milk & Dairy':     '#4e79a7',
  'Meat':             '#e15759',
  'Vegetables':       '#59a14f',
  'Fruits':           '#f28e2b',
  'Cereals & Grains': '#edc948',
  'Pulses & Legumes': '#76b7b2',
  'Oilseeds & Oils':  '#b07aa1',
  'Sweeteners':       '#ff9da7',
  'Other':            '#bab0ac',
};

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) { out.push(current.trim()); current = ''; continue; }
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
    for (let c = 0; c < header.length; c++) row[header[c]] = cols[c];
    rows.push(row);
  }
  return rows;
}

function interpolateMissing(values) {
  const result = [...values];
  const n = result.length;
  let i = 0;
  while (i < n) {
    if (result[i] !== null) { i++; continue; }
    const left = i - 1;
    let right = i + 1;
    while (right < n && result[right] === null) right++;
    for (let j = i; j < right; j++) {
      if (left < 0 && right >= n) result[j] = null;
      else if (left < 0) result[j] = result[right];
      else if (right >= n) result[j] = result[left];
      else {
        const t = (j - left) / (right - left);
        result[j] = Math.round((result[left] + t * (result[right] - result[left])) * 100) / 100;
      }
    }
    i = right;
  }
  return result;
}

export function categorizeItem(name) {
  const n = name.toLowerCase();
  if (n.includes('milk') || n.includes('egg') || n.includes('honey')) return 'Milk & Dairy';
  if (n.includes('meat') || n.includes('wool')) return 'Meat';
  if (n.includes('potato') || n.includes('onion') || n.includes('shallot') ||
      n.includes('tomato') || n.includes('cabbage') || n.includes('carrot') ||
      n.includes('turnip') || n.includes('cauliflower') || n.includes('broccoli') ||
      n.includes('cucumber') || n.includes('gherkin') || n.includes('lettuce') ||
      n.includes('chicory') || n.includes('leek') || n.includes('mushroom') ||
      n.includes('truffle') || n.includes('spinach') || n.includes('asparagus') ||
      n.includes('vegetable') || n.includes('pumpkin')) return 'Vegetables';
  if (n.includes('apple') || n.includes('pear') || n.includes('peach') ||
      n.includes('nectarine') || n.includes('plum') || n.includes('sloe') ||
      n.includes('cherry') || n.includes('apricot') || n.includes('strawberr') ||
      n.includes('raspberr') || n.includes('blueberr') || n.includes('gooseberr') ||
      n.includes('currant') || n.includes('fruit') || n.includes('walnut') ||
      n.includes('berry')) return 'Fruits';
  if (n.includes('wheat') || n.includes('barley') || n.includes('oat') ||
      n.includes('rye') || n.includes('maize') || n.includes('corn') ||
      n.includes('triticale')) return 'Cereals & Grains';
  if (n.includes('bean') || n.includes('pea') || n.includes('pulse') ||
      n.includes('lupin') || n.includes('vetch')) return 'Pulses & Legumes';
  if (n.includes('soya') || n.includes('sunflower') || n.includes('rape') ||
      n.includes('colza') || n.includes('mustard seed') || n.includes('oil')) return 'Oilseeds & Oils';
  if (n.includes('sugar')) return 'Sweeteners';
  return 'Other';
}

export async function loadData() {
  const text = await fetch('producer-prices_deu.csv').then(r => r.text());
  const rows = parseCsv(text);

  const annualRows = rows.filter(r =>
    r.Months === 'Annual value' &&
    r.Unit === 'LCU' &&
    r.Value !== '' &&
    Number.isFinite(Number(r.Year)) &&
    Number.isFinite(Number(r.Value))
  );

  const byItem = new Map();
  annualRows.forEach(r => {
    if (!byItem.has(r.Item)) byItem.set(r.Item, new Map());
    byItem.get(r.Item).set(Number(r.Year), Number(r.Value));
  });

  const filteredNames = [...byItem.keys()]
    .sort((a, b) => a.localeCompare(b))
    .filter(name => {
      const yearMap = byItem.get(name);
      const missing = YEARS_FULL.filter(y => !yearMap.has(y)).length;
      return missing / YEARS_FULL.length <= 0.5;
    });

  const items = {};
  filteredNames.forEach(name => {
    const yearMap = byItem.get(name);
    const category = categorizeItem(name);
    items[name] = {
      category,
      color: CATEGORY_COLORS[category],
      values: interpolateMissing(YEARS_FULL.map(y => yearMap.has(y) ? yearMap.get(y) : null))
    };
  });

  return { names: filteredNames, items };
}
