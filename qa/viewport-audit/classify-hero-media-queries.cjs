const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const AUDIT_DIR = path.join(ROOT, 'qa-results', 'viewport-audit');
const INVENTORY_PATH = path.join(AUDIT_DIR, 'hero-media-inventory.json');
const COVERAGE_PATH = path.join(AUDIT_DIR, 'hero-geometry-coverage.json');
const CASCADE_PATH = path.join(AUDIT_DIR, 'hero-cascade-analysis.json');
const JSON_OUT = path.join(AUDIT_DIR, 'hero-media-classification.json');
const MD_OUT = path.join(AUDIT_DIR, 'hero-media-classification.md');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} was not found:\n${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Could not parse ${label}: ${error.message}`);
  }
}

function mdEscape(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function finite(value) {
  return Number.isFinite(value);
}

function rangeSpan(min, max) {
  return finite(min) && finite(max) ? max - min : null;
}

function rangeText(range) {
  const w = `${finite(range.minWidth) ? range.minWidth : '—'}–${finite(range.maxWidth) ? range.maxWidth : '—'}`;
  const h = `${finite(range.minHeight) ? range.minHeight : '—'}–${finite(range.maxHeight) ? range.maxHeight : '—'}`;
  return `${w} × ${h}`;
}

const inventory = loadJson(INVENTORY_PATH, 'Hero media-query inventory');
const coverage = loadJson(COVERAGE_PATH, 'Hero geometry coverage map');
const cascade = loadJson(CASCADE_PATH, 'Hero cascade analysis');

if (!Array.isArray(inventory.mediaQueries)) fail('Hero inventory does not contain mediaQueries.');
if (!Array.isArray(coverage.queryCoverage)) fail('Coverage report does not contain queryCoverage.');
if (!Array.isArray(cascade.queryUsage)) fail('Cascade report does not contain queryUsage.');

const coverageById = new Map(coverage.queryCoverage.map((item) => [item.id, item]));
const cascadeById = new Map(cascade.queryUsage.map((item) => [item.id, item]));

function classify(query, cov, use) {
  const range = query.range || {};
  const fullyBounded =
    finite(range.minWidth) && finite(range.maxWidth) &&
    finite(range.minHeight) && finite(range.maxHeight);

  if ((cov?.geometryMatchCount || 0) === 0) {
    return {
      category: 'HISTORICAL_UNMEASURED',
      rationale: 'No current measured exact TestMU geometry matches this media query.',
    };
  }

  if ((use?.winningGeometryCount || 0) === 0) {
    return {
      category: 'SHADOWED_REVIEW',
      rationale: 'Matches measured geometries but never supplies the final measured declaration for any identical selector/property pair.',
    };
  }

  if (fullyBounded) {
    return {
      category: 'PROTECT_BOUNDED_MEASURED',
      rationale: 'Has measured winning behavior and already has finite width and height bounds.',
    };
  }

  return {
    category: 'PROTECT_REBOUND_CANDIDATE',
    rationale: 'Supplies measured winning behavior, but at least one lower width/height bound is open and should be reviewed when V2 ranges are designed.',
  };
}

function buildSignals(query, cov, use) {
  const range = query.range || {};
  const signals = [];
  const widthSpan = rangeSpan(range.minWidth, range.maxWidth);
  const heightSpan = rangeSpan(range.minHeight, range.maxHeight);
  const matches = cov?.geometryMatchCount || 0;
  const wins = use?.winningGeometryCount || 0;

  if (!finite(range.minWidth) && finite(range.maxWidth)) signals.push('OPEN_MIN_WIDTH');
  if (!finite(range.minHeight) && finite(range.maxHeight)) signals.push('OPEN_MIN_HEIGHT');
  if (!finite(range.minWidth) && !finite(range.minHeight)) signals.push('MAX_ONLY_CUMULATIVE');
  if (finite(widthSpan) && widthSpan <= 2) signals.push('DEVICE_PRECISION_WIDTH_BAND');
  if (finite(heightSpan) && heightSpan <= 2) signals.push('DEVICE_PRECISION_HEIGHT_BAND');
  if (matches >= 20) signals.push('HIGH_MEASURED_MATCH_FOOTPRINT');
  if (matches > 0 && wins > 0 && wins / matches <= 0.1) signals.push('LOW_WIN_RATIO');
  if (wins >= 10) signals.push('HIGH_WIN_FOOTPRINT');
  if (matches > 0 && wins === 0) signals.push('MEASURED_BUT_SHADOWED');
  if (matches === 0) signals.push('NO_CURRENT_MEASURED_EVIDENCE');
  if (!finite(range.minHeight) && finite(range.maxHeight)) signals.push('HEIGHT_CEILING_SIGNAL');

  return signals;
}

const rows = inventory.mediaQueries.map((query) => {
  const cov = coverageById.get(query.id) || {};
  const use = cascadeById.get(query.id) || {};
  const classification = classify(query, cov, use);
  const range = query.range || {};
  const matched = cov.geometryMatchCount || 0;
  const winning = use.winningGeometryCount || 0;

  return {
    id: query.id,
    startLine: query.startLine,
    endLine: query.endLine,
    condition: query.condition,
    orientation: range.orientation || null,
    range,
    rangeText: rangeText(range),
    precedingComment: query.precedingComment || '',
    declarationCount: query.declarationCount || 0,
    measuredGeometryMatchCount: matched,
    measuredWinningGeometryCount: winning,
    uniqueWinningSelectorPropertyCount: use.uniqueWinningSelectorPropertyCount || 0,
    winRatio: matched ? Number((winning / matched).toFixed(3)) : null,
    category: classification.category,
    rationale: classification.rationale,
    signals: buildSignals(query, cov, use),
    measuredDevices: Array.isArray(cov.deviceNames) ? cov.deviceNames : [],
  };
});

const categoryOrder = [
  'PROTECT_BOUNDED_MEASURED',
  'PROTECT_REBOUND_CANDIDATE',
  'SHADOWED_REVIEW',
  'HISTORICAL_UNMEASURED',
];

const categoryDescriptions = {
  PROTECT_BOUNDED_MEASURED:
    'Current measured behavior is active and the query is already finite in both width and height. Preserve behavior during migration; merging is still possible later.',
  PROTECT_REBOUND_CANDIDATE:
    'Current measured behavior is active, but the query has an open lower width and/or height boundary. Preserve its visual result while designing bounded V2 ranges.',
  SHADOWED_REVIEW:
    'The query matches measured geometries but never wins an identical selector/property pair in the current measured set. Review for merge/rebound; do not delete based on this report alone.',
  HISTORICAL_UNMEASURED:
    'No current measured exact geometry matches the query. Treat as historical/inferred evidence until its original target or a new measurement validates it.',
};

const categoryCounts = {};
for (const category of categoryOrder) {
  categoryCounts[category] = rows.filter((row) => row.category === category).length;
}

const signalCounts = {};
for (const row of rows) {
  for (const signal of row.signals) signalCounts[signal] = (signalCounts[signal] || 0) + 1;
}

const uncovered = Array.isArray(coverage.uncoveredGeometries)
  ? coverage.uncoveredGeometries.map((geometry) => ({
      geometryKey: geometry.geometryKey,
      platformName: geometry.platformName,
      browserName: geometry.browserName,
      cssOrientation: geometry.cssOrientation,
      innerViewport: geometry.innerViewport,
      deviceNames: geometry.deviceNames || [],
      displayStates: geometry.displayStates || [],
    }))
  : [];

const generatedAt = new Date().toISOString();
const report = {
  artifactType: 'hero-media-query-classification',
  generatedAt,
  sources: {
    inventory: path.relative(ROOT, INVENTORY_PATH),
    coverage: path.relative(ROOT, COVERAGE_PATH),
    cascade: path.relative(ROOT, CASCADE_PATH),
  },
  methodology: {
    warning:
      'These categories are migration evidence labels, not deletion instructions or final Viewport Family V2 assignments.',
    categories: categoryDescriptions,
  },
  summary: {
    mediaQueryCount: rows.length,
    categoryCounts,
    signalCounts,
    uncoveredMeasuredGeometryCount: uncovered.length,
  },
  uncoveredMeasuredGeometries: uncovered,
  mediaQueries: rows,
};

fs.mkdirSync(AUDIT_DIR, { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

const md = [];
md.push('# Hero Media Query Classification', '');
md.push(`Generated: ${generatedAt}`, '');
md.push('> These are migration evidence labels, not deletion instructions or final V2 breakpoint assignments.', '');
md.push('## Summary', '');
md.push(`- Media queries: **${rows.length}**`);
for (const category of categoryOrder) {
  md.push(`- ${category}: **${categoryCounts[category]}**`);
}
md.push(`- Uncovered measured geometries (separate from MQ classification): **${uncovered.length}**`, '');

md.push('## Category meanings', '');
for (const category of categoryOrder) {
  md.push(`- **${category}** — ${categoryDescriptions[category]}`);
}
md.push('');

for (const category of categoryOrder) {
  const items = rows.filter((row) => row.category === category);
  md.push(`## ${category} (${items.length})`, '');
  md.push('| ID | Lines | Orientation | Range W×H | Matches | Wins | Unique winning keys | Win ratio | Signals |');
  md.push('|---|---:|---|---|---:|---:|---:|---:|---|');
  for (const item of items) {
    md.push(`| ${item.id} | ${item.startLine}-${item.endLine} | ${item.orientation || '—'} | ${mdEscape(item.rangeText)} | ${item.measuredGeometryMatchCount} | ${item.measuredWinningGeometryCount} | ${item.uniqueWinningSelectorPropertyCount} | ${item.winRatio ?? '—'} | ${mdEscape(item.signals.join(', ') || '—')} |`);
  }
  md.push('');
}

md.push('## Uncovered measured geometries', '');
if (!uncovered.length) {
  md.push('None.', '');
} else {
  md.push('| Viewport | Orientation | Platform | Browser | Devices |');
  md.push('|---:|---|---|---|---|');
  for (const geometry of uncovered) {
    const viewport = geometry.innerViewport
      ? `${geometry.innerViewport.width}×${geometry.innerViewport.height}`
      : '—';
    md.push(`| ${viewport} | ${geometry.cssOrientation || '—'} | ${mdEscape(geometry.platformName || '—')} | ${mdEscape(geometry.browserName || '—')} | ${mdEscape((geometry.deviceNames || []).join(', ') || '—')} |`);
  }
  md.push('');
}

md.push('## All media queries', '');
md.push('| ID | Category | Condition | Prior family/comment |');
md.push('|---|---|---|---|');
for (const item of rows) {
  md.push(`| ${item.id} | ${item.category} | ${mdEscape(item.condition)} | ${mdEscape(item.precedingComment)} |`);
}
md.push('');

fs.writeFileSync(MD_OUT, md.join('\n') + '\n', 'utf8');

console.log('Hero media-query classification generated.');
console.log(`Media queries: ${rows.length}`);
for (const category of categoryOrder) {
  console.log(`${category}: ${categoryCounts[category]}`);
}
console.log(`Uncovered measured geometries: ${uncovered.length}`);
console.log(`JSON: ${path.relative(ROOT, JSON_OUT)}`);
console.log(`Markdown: ${path.relative(ROOT, MD_OUT)}`);
