const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INVENTORY_PATH = path.join(
  ROOT,
  'qa-results',
  'viewport-audit',
  'hero-media-inventory.json'
);
const REGISTRY_DIR = path.join(ROOT, 'qa-results', 'testmu', 'catalog');
const REGISTRY_LATEST = path.join(
  REGISTRY_DIR,
  'TESTMU__geometry-registry__us__latest.json'
);
const OUTPUT_DIR = path.join(ROOT, 'qa-results', 'viewport-audit');
const JSON_OUT = path.join(OUTPUT_DIR, 'hero-geometry-coverage.json');
const MD_OUT = path.join(OUTPUT_DIR, 'hero-geometry-coverage.md');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} was not found:\n${filePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Could not parse ${label}: ${error.message}`);
  }
}

function findRegistryPath() {
  if (fs.existsSync(REGISTRY_LATEST)) return REGISTRY_LATEST;

  if (!fs.existsSync(REGISTRY_DIR)) {
    fail(`TestMU catalog directory was not found:\n${REGISTRY_DIR}`);
  }

  const candidates = fs
    .readdirSync(REGISTRY_DIR)
    .filter(
      (name) =>
        /^TESTMU__geometry-registry__us__.*\.json$/i.test(name) &&
        !name.endsWith('__latest.json')
    )
    .map((name) => ({
      name,
      fullPath: path.join(REGISTRY_DIR, name),
      mtimeMs: fs.statSync(path.join(REGISTRY_DIR, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!candidates.length) {
    fail(`No TestMU geometry registry JSON was found in:\n${REGISTRY_DIR}`);
  }

  return candidates[0].fullPath;
}

function inRange(value, min, max) {
  if (Number.isFinite(min) && value < min) return false;
  if (Number.isFinite(max) && value > max) return false;
  return true;
}

function queryMatchesGeometry(query, geometry) {
  const range = query.range || {};
  const orientation = geometry.cssOrientation;
  const width = geometry.innerViewport?.width;
  const height = geometry.innerViewport?.height;

  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (range.orientation && range.orientation !== orientation) return false;

  return (
    inRange(width, range.minWidth, range.maxWidth) &&
    inRange(height, range.minHeight, range.maxHeight)
  );
}

function overlapClass(count) {
  if (count === 0) return 'UNCOVERED';
  if (count === 1) return 'SINGLE_MATCH';
  if (count <= 5) return 'LOW_OVERLAP';
  if (count <= 10) return 'MODERATE_OVERLAP';
  if (count <= 20) return 'HIGH_OVERLAP';
  return 'EXTREME_OVERLAP';
}

function aspectRatio(width, height) {
  if (!width || !height) return null;
  return Number((width / height).toFixed(4));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatRangeValue(value) {
  return Number.isFinite(value) ? String(value) : '—';
}

function mdEscape(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

const inventory = loadJson(INVENTORY_PATH, 'Hero media-query inventory');
const registryPath = findRegistryPath();
const registry = loadJson(registryPath, 'TestMU geometry registry');

if (!Array.isArray(inventory.mediaQueries)) {
  fail('Hero inventory does not contain a mediaQueries array.');
}

if (!Array.isArray(registry.exactGeometryFamilies)) {
  fail('Geometry registry does not contain an exactGeometryFamilies array.');
}

const queryUsage = new Map(
  inventory.mediaQueries.map((query) => [
    query.id,
    {
      id: query.id,
      startLine: query.startLine,
      endLine: query.endLine,
      condition: query.condition,
      orientation: query.range?.orientation || null,
      geometryMatchCount: 0,
      geometryKeys: [],
      deviceNames: new Set(),
      appearsAsLastMatchingBlockCount: 0,
    },
  ])
);

const geometries = registry.exactGeometryFamilies.map((geometry) => {
  const width = geometry.innerViewport?.width;
  const height = geometry.innerViewport?.height;
  const matches = inventory.mediaQueries.filter((query) =>
    queryMatchesGeometry(query, geometry)
  );

  const members = Array.isArray(geometry.members) ? geometry.members : [];
  const deviceNames = unique(members.map((member) => member.deviceName));
  const platformVersions = unique(members.map((member) => member.platformVersion));
  const browserVersions = unique(members.map((member) => member.browserVersion));
  const displayStates = unique(members.map((member) => member.displayState));
  const requestedDisplayScopes = unique(
    members.map((member) => member.requestedDisplayScope)
  );

  for (const query of matches) {
    const usage = queryUsage.get(query.id);
    usage.geometryMatchCount += 1;
    usage.geometryKeys.push(geometry.geometryKey);
    for (const deviceName of deviceNames) usage.deviceNames.add(deviceName);
  }

  const lastMatch = matches.length ? matches[matches.length - 1] : null;
  if (lastMatch) {
    queryUsage.get(lastMatch.id).appearsAsLastMatchingBlockCount += 1;
  }

  return {
    geometryKey: geometry.geometryKey,
    platformName: geometry.platformName,
    browserName: geometry.browserName,
    cssOrientation: geometry.cssOrientation,
    innerViewport: geometry.innerViewport,
    aspectRatio: aspectRatio(width, height),
    memberCount: geometry.memberCount ?? members.length,
    deviceNames,
    platformVersions,
    browserVersions,
    displayStates,
    requestedDisplayScopes,
    matchCount: matches.length,
    overlapClass: overlapClass(matches.length),
    matchingQueryIds: matches.map((query) => query.id),
    matchingQueries: matches.map((query) => ({
      id: query.id,
      startLine: query.startLine,
      endLine: query.endLine,
      condition: query.condition,
      declarationCount: query.declarationCount,
    })),
    lastMatchingBlock: lastMatch
      ? {
          id: lastMatch.id,
          startLine: lastMatch.startLine,
          condition: lastMatch.condition,
        }
      : null,
  };
});

const queryCoverage = [...queryUsage.values()].map((usage) => ({
  ...usage,
  deviceNames: [...usage.deviceNames].sort(),
  geometryKeys: usage.geometryKeys.sort(),
}));

const uncovered = geometries.filter((geometry) => geometry.matchCount === 0);
const extreme = geometries.filter((geometry) => geometry.matchCount > 20);
const singleMatch = geometries.filter((geometry) => geometry.matchCount === 1);
const queriesWithNoMeasuredGeometry = queryCoverage.filter(
  (query) => query.geometryMatchCount === 0
);
const maxMatchCount = Math.max(0, ...geometries.map((geometry) => geometry.matchCount));
const avgMatchCount = geometries.length
  ? Number(
      (
        geometries.reduce((sum, geometry) => sum + geometry.matchCount, 0) /
        geometries.length
      ).toFixed(2)
    )
  : 0;

const matchDistribution = {};
for (const geometry of geometries) {
  matchDistribution[geometry.overlapClass] =
    (matchDistribution[geometry.overlapClass] || 0) + 1;
}

const generatedAt = new Date().toISOString();
const report = {
  artifactType: 'hero-geometry-coverage-map',
  generatedAt,
  sources: {
    heroInventory: path.relative(ROOT, INVENTORY_PATH),
    geometryRegistry: path.relative(ROOT, registryPath),
  },
  summary: {
    mediaQueryCount: inventory.mediaQueries.length,
    exactGeometryCount: geometries.length,
    measuredDeviceModelCount: registry.summary?.measuredDeviceModels ?? null,
    measuredCaptureCount: registry.summary?.uniqueCaptures ?? null,
    uncoveredGeometryCount: uncovered.length,
    singleMatchGeometryCount: singleMatch.length,
    extremeOverlapGeometryCount: extreme.length,
    queriesWithNoMeasuredGeometryCount: queriesWithNoMeasuredGeometry.length,
    averageMatchingQueriesPerGeometry: avgMatchCount,
    maximumMatchingQueriesForOneGeometry: maxMatchCount,
    overlapDistribution: matchDistribution,
  },
  uncoveredGeometries: uncovered,
  queriesWithNoMeasuredGeometry,
  geometries,
  queryCoverage,
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

const md = [];
md.push('# Hero Geometry Coverage Map');
md.push('');
md.push(`Generated: ${generatedAt}`);
md.push(`Hero inventory: \`${path.relative(ROOT, INVENTORY_PATH)}\``);
md.push(`Geometry registry: \`${path.relative(ROOT, registryPath)}\``);
md.push('');
md.push('## Summary');
md.push('');
md.push(`- Media queries: **${report.summary.mediaQueryCount}**`);
md.push(`- Exact measured geometry families: **${report.summary.exactGeometryCount}**`);
if (report.summary.measuredDeviceModelCount !== null) {
  md.push(`- Measured device models: **${report.summary.measuredDeviceModelCount}**`);
}
if (report.summary.measuredCaptureCount !== null) {
  md.push(`- Unique measured captures: **${report.summary.measuredCaptureCount}**`);
}
md.push(`- Uncovered geometries: **${report.summary.uncoveredGeometryCount}**`);
md.push(`- Single-match geometries: **${report.summary.singleMatchGeometryCount}**`);
md.push(`- Extreme-overlap geometries (>20 matching blocks): **${report.summary.extremeOverlapGeometryCount}**`);
md.push(`- Queries with no measured geometry: **${report.summary.queriesWithNoMeasuredGeometryCount}**`);
md.push(`- Average matching media blocks per geometry: **${report.summary.averageMatchingQueriesPerGeometry}**`);
md.push(`- Maximum matching media blocks for one geometry: **${report.summary.maximumMatchingQueriesForOneGeometry}**`);
md.push('');
md.push('> `lastMatchingBlock` means the last matching media block in source order. It is not necessarily the final winner for every CSS property, because different blocks override different selectors/properties.');
md.push('');

md.push('## Uncovered measured geometries');
md.push('');
if (!uncovered.length) {
  md.push('None.');
} else {
  md.push('| Geometry | Platform | Browser | Orientation | Viewport | Devices |');
  md.push('|---|---|---|---|---:|---|');
  for (const geometry of uncovered) {
    md.push(
      `| ${mdEscape(geometry.geometryKey)} | ${mdEscape(geometry.platformName)} | ${mdEscape(geometry.browserName)} | ${mdEscape(geometry.cssOrientation)} | ${geometry.innerViewport.width}×${geometry.innerViewport.height} | ${mdEscape(geometry.deviceNames.join(', '))} |`
    );
  }
}
md.push('');

md.push('## Highest-overlap measured geometries');
md.push('');
md.push('| Geometry | Viewport | Devices | Matches | Last matching block |');
md.push('|---|---:|---|---:|---|');
for (const geometry of [...geometries]
  .sort((a, b) => b.matchCount - a.matchCount || a.geometryKey.localeCompare(b.geometryKey))
  .slice(0, 30)) {
  md.push(
    `| ${mdEscape(geometry.geometryKey)} | ${geometry.innerViewport.width}×${geometry.innerViewport.height} | ${mdEscape(geometry.deviceNames.join(', '))} | ${geometry.matchCount} | ${geometry.lastMatchingBlock?.id || '—'} |`
  );
}
md.push('');

md.push('## Media queries with no measured geometry');
md.push('');
if (!queriesWithNoMeasuredGeometry.length) {
  md.push('None.');
} else {
  md.push('| ID | Lines | Orientation | Condition |');
  md.push('|---|---:|---|---|');
  for (const query of queriesWithNoMeasuredGeometry) {
    md.push(
      `| ${query.id} | ${query.startLine}-${query.endLine} | ${mdEscape(query.orientation)} | ${mdEscape(query.condition)} |`
    );
  }
}
md.push('');

md.push('## All measured geometry families');
md.push('');
md.push('| Geometry | Viewport | Orientation | Devices | Matches | Overlap class | Matching MQs |');
md.push('|---|---:|---|---|---:|---|---|');
for (const geometry of [...geometries].sort((a, b) => {
  if (a.cssOrientation !== b.cssOrientation) {
    return a.cssOrientation.localeCompare(b.cssOrientation);
  }
  if (a.innerViewport.width !== b.innerViewport.width) {
    return a.innerViewport.width - b.innerViewport.width;
  }
  return a.innerViewport.height - b.innerViewport.height;
})) {
  md.push(
    `| ${mdEscape(geometry.geometryKey)} | ${geometry.innerViewport.width}×${geometry.innerViewport.height} | ${mdEscape(geometry.cssOrientation)} | ${mdEscape(geometry.deviceNames.join(', '))} | ${geometry.matchCount} | ${geometry.overlapClass} | ${mdEscape(geometry.matchingQueryIds.join(', ')) || '—'} |`
  );
}
md.push('');

md.push('## Query usage against measured geometries');
md.push('');
md.push('| ID | Lines | Measured geometries matched | Last-block count | Devices |');
md.push('|---|---:|---:|---:|---|');
for (const query of queryCoverage) {
  md.push(
    `| ${query.id} | ${query.startLine}-${query.endLine} | ${query.geometryMatchCount} | ${query.appearsAsLastMatchingBlockCount} | ${mdEscape(query.deviceNames.join(', ')) || '—'} |`
  );
}
md.push('');

fs.writeFileSync(MD_OUT, md.join('\n') + '\n', 'utf8');

console.log('Hero geometry coverage map generated.');
console.log(`Media queries: ${report.summary.mediaQueryCount}`);
console.log(`Exact measured geometries: ${report.summary.exactGeometryCount}`);
console.log(`Uncovered geometries: ${report.summary.uncoveredGeometryCount}`);
console.log(`Average matching MQs/geometry: ${report.summary.averageMatchingQueriesPerGeometry}`);
console.log(`Maximum matching MQs/geometry: ${report.summary.maximumMatchingQueriesForOneGeometry}`);
console.log(`Queries with no measured geometry: ${report.summary.queriesWithNoMeasuredGeometryCount}`);
console.log(`JSON: ${path.relative(ROOT, JSON_OUT)}`);
console.log(`Markdown: ${path.relative(ROOT, MD_OUT)}`);
