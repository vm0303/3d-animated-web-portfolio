const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INVENTORY_PATH = path.join(ROOT, 'qa-results', 'viewport-audit', 'hero-media-inventory.json');
const COVERAGE_PATH = path.join(ROOT, 'qa-results', 'viewport-audit', 'hero-geometry-coverage.json');
const OUTPUT_DIR = path.join(ROOT, 'qa-results', 'viewport-audit');
const JSON_OUT = path.join(OUTPUT_DIR, 'hero-cascade-analysis.json');
const MD_OUT = path.join(OUTPUT_DIR, 'hero-cascade-analysis.md');

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

function unique(values) {
  return [...new Set(values)];
}

function mdEscape(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function selectorPropertyKey(selector, property) {
  return `${selector}\u0000${property}`;
}

function splitSelectorPropertyKey(key) {
  const index = key.indexOf('\u0000');
  return {
    selector: key.slice(0, index),
    property: key.slice(index + 1),
  };
}

const inventory = loadJson(INVENTORY_PATH, 'Hero media-query inventory');
const coverage = loadJson(COVERAGE_PATH, 'Hero geometry coverage map');

if (!Array.isArray(inventory.mediaQueries)) {
  fail('Hero inventory does not contain a mediaQueries array.');
}
if (!Array.isArray(coverage.geometries)) {
  fail('Hero coverage map does not contain a geometries array.');
}

const queryById = new Map(inventory.mediaQueries.map((query) => [query.id, query]));

// Track cross-geometry usage of every media-query declaration source.
const queryStats = new Map(
  inventory.mediaQueries.map((query) => [
    query.id,
    {
      id: query.id,
      startLine: query.startLine,
      endLine: query.endLine,
      condition: query.condition,
      matchedGeometryCount: 0,
      winningGeometryCount: 0,
      winningSelectorPropertyCount: 0,
      winningKeys: new Set(),
      devices: new Set(),
    },
  ])
);

const keyStats = new Map();

const geometries = coverage.geometries.map((geometry) => {
  const streams = new Map();
  const matchedIds = Array.isArray(geometry.matchingQueryIds)
    ? geometry.matchingQueryIds
    : [];

  for (const queryId of matchedIds) {
    const query = queryById.get(queryId);
    if (!query) continue;

    const qStat = queryStats.get(queryId);
    qStat.matchedGeometryCount += 1;
    for (const device of geometry.deviceNames || []) qStat.devices.add(device);

    for (const rule of query.rules || []) {
      for (const declaration of rule.declarations || []) {
        const key = selectorPropertyKey(rule.selector, declaration.property);
        if (!streams.has(key)) streams.set(key, []);
        streams.get(key).push({
          queryId,
          startLine: query.startLine,
          selector: rule.selector,
          property: declaration.property,
          value: declaration.value,
        });
      }
    }
  }

  const cascadeEntries = [];
  const winnerQueryIds = new Set();
  const winnerKeyCountsByQuery = new Map();
  let multiSourceKeyCount = 0;
  let overriddenDeclarationCount = 0;
  let longestCascadeDepth = 0;

  for (const [key, stream] of streams.entries()) {
    const { selector, property } = splitSelectorPropertyKey(key);
    const winner = stream[stream.length - 1];
    const sourceQueryIds = unique(stream.map((item) => item.queryId));
    const distinctValues = unique(stream.map((item) => item.value));
    const cascadeDepth = stream.length;

    longestCascadeDepth = Math.max(longestCascadeDepth, cascadeDepth);
    overriddenDeclarationCount += Math.max(0, cascadeDepth - 1);
    if (sourceQueryIds.length > 1) multiSourceKeyCount += 1;

    winnerQueryIds.add(winner.queryId);
    winnerKeyCountsByQuery.set(
      winner.queryId,
      (winnerKeyCountsByQuery.get(winner.queryId) || 0) + 1
    );

    const qStat = queryStats.get(winner.queryId);
    qStat.winningSelectorPropertyCount += 1;
    qStat.winningKeys.add(key);

    if (!keyStats.has(key)) {
      keyStats.set(key, {
        selector,
        property,
        measuredGeometryCount: 0,
        multiSourceGeometryCount: 0,
        conflictingValueGeometryCount: 0,
        maxCascadeDepth: 0,
        winnerQueries: new Map(),
        values: new Map(),
      });
    }

    const kStat = keyStats.get(key);
    kStat.measuredGeometryCount += 1;
    if (sourceQueryIds.length > 1) kStat.multiSourceGeometryCount += 1;
    if (distinctValues.length > 1) kStat.conflictingValueGeometryCount += 1;
    kStat.maxCascadeDepth = Math.max(kStat.maxCascadeDepth, cascadeDepth);
    kStat.winnerQueries.set(
      winner.queryId,
      (kStat.winnerQueries.get(winner.queryId) || 0) + 1
    );
    kStat.values.set(winner.value, (kStat.values.get(winner.value) || 0) + 1);

    cascadeEntries.push({
      selector,
      property,
      cascadeDepth,
      sourceQueryIds,
      distinctValues,
      hasValueConflict: distinctValues.length > 1,
      path: stream,
      winner,
    });
  }

  for (const queryId of winnerQueryIds) {
    queryStats.get(queryId).winningGeometryCount += 1;
  }

  const mostContested = [...cascadeEntries]
    .sort((a, b) =>
      b.cascadeDepth - a.cascadeDepth ||
      Number(b.hasValueConflict) - Number(a.hasValueConflict) ||
      a.selector.localeCompare(b.selector) ||
      a.property.localeCompare(b.property)
    )
    .slice(0, 20);

  const winnerSources = [...winnerKeyCountsByQuery.entries()]
    .map(([queryId, keyCount]) => ({ queryId, keyCount }))
    .sort((a, b) => b.keyCount - a.keyCount || a.queryId.localeCompare(b.queryId));

  return {
    geometryKey: geometry.geometryKey,
    platformName: geometry.platformName,
    browserName: geometry.browserName,
    cssOrientation: geometry.cssOrientation,
    innerViewport: geometry.innerViewport,
    deviceNames: geometry.deviceNames || [],
    matchCount: geometry.matchCount,
    matchingQueryIds: matchedIds,
    selectorPropertyKeyCount: cascadeEntries.length,
    multiSourceSelectorPropertyCount: multiSourceKeyCount,
    overriddenDeclarationCount,
    longestCascadeDepth,
    winnerSourceCount: winnerQueryIds.size,
    winnerSources,
    mostContestedSelectorProperties: mostContested,
    cascadeEntries,
  };
});

const keyCoverage = [...keyStats.values()]
  .map((stat) => ({
    selector: stat.selector,
    property: stat.property,
    measuredGeometryCount: stat.measuredGeometryCount,
    multiSourceGeometryCount: stat.multiSourceGeometryCount,
    conflictingValueGeometryCount: stat.conflictingValueGeometryCount,
    maxCascadeDepth: stat.maxCascadeDepth,
    winnerQueries: [...stat.winnerQueries.entries()]
      .map(([queryId, geometryCount]) => ({ queryId, geometryCount }))
      .sort((a, b) => b.geometryCount - a.geometryCount || a.queryId.localeCompare(b.queryId)),
    winningValues: [...stat.values.entries()]
      .map(([value, geometryCount]) => ({ value, geometryCount }))
      .sort((a, b) => b.geometryCount - a.geometryCount || a.value.localeCompare(b.value)),
  }))
  .sort((a, b) =>
    b.conflictingValueGeometryCount - a.conflictingValueGeometryCount ||
    b.multiSourceGeometryCount - a.multiSourceGeometryCount ||
    b.maxCascadeDepth - a.maxCascadeDepth ||
    a.selector.localeCompare(b.selector) ||
    a.property.localeCompare(b.property)
  );

const queryUsage = [...queryStats.values()].map((stat) => ({
  id: stat.id,
  startLine: stat.startLine,
  endLine: stat.endLine,
  condition: stat.condition,
  matchedGeometryCount: stat.matchedGeometryCount,
  winningGeometryCount: stat.winningGeometryCount,
  winningSelectorPropertyCount: stat.winningSelectorPropertyCount,
  uniqueWinningSelectorPropertyCount: stat.winningKeys.size,
  devices: [...stat.devices].sort(),
}));

const matchedButNeverWins = queryUsage.filter(
  (query) => query.matchedGeometryCount > 0 && query.winningGeometryCount === 0
);
const queriesWithMeasuredWins = queryUsage.filter((query) => query.winningGeometryCount > 0);
const coveredGeometries = geometries.filter((geometry) => geometry.matchCount > 0);
const mixedWinnerGeometries = coveredGeometries.filter((geometry) => geometry.winnerSourceCount > 1);

const averageWinnerSources = coveredGeometries.length
  ? Number(
      (
        coveredGeometries.reduce((sum, geometry) => sum + geometry.winnerSourceCount, 0) /
        coveredGeometries.length
      ).toFixed(2)
    )
  : 0;

const maximumWinnerSources = Math.max(
  0,
  ...coveredGeometries.map((geometry) => geometry.winnerSourceCount)
);
const maximumCascadeDepth = Math.max(
  0,
  ...coveredGeometries.map((geometry) => geometry.longestCascadeDepth)
);

const generatedAt = new Date().toISOString();
const report = {
  artifactType: 'hero-property-cascade-analysis',
  generatedAt,
  sources: {
    heroInventory: path.relative(ROOT, INVENTORY_PATH),
    geometryCoverage: path.relative(ROOT, COVERAGE_PATH),
  },
  methodology: {
    scope: 'Media-query declarations only. Base CSS outside @media blocks is not included.',
    winnerDefinition:
      'For the same literal selector + property, the last declaration in matching media-query source order is treated as the winning media-query declaration.',
    limitation:
      'This is not a full browser CSS cascade engine. It intentionally does not resolve interactions between different selectors with different specificity that target the same DOM element.',
  },
  summary: {
    mediaQueryCount: inventory.mediaQueries.length,
    measuredGeometryCount: geometries.length,
    coveredGeometryCount: coveredGeometries.length,
    uncoveredGeometryCount: geometries.length - coveredGeometries.length,
    selectorPropertyPairCount: keyCoverage.length,
    mixedWinnerGeometryCount: mixedWinnerGeometries.length,
    averageWinnerMediaQueriesPerCoveredGeometry: averageWinnerSources,
    maximumWinnerMediaQueriesForOneGeometry: maximumWinnerSources,
    maximumCascadeDepthForOneSelectorProperty: maximumCascadeDepth,
    matchedButNeverWinsQueryCount: matchedButNeverWins.length,
    queriesWithMeasuredWinsCount: queriesWithMeasuredWins.length,
  },
  matchedButNeverWins,
  queryUsage,
  selectorPropertyCoverage: keyCoverage,
  geometries,
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

const md = [];
md.push('# Hero Property-Level Cascade Analysis', '');
md.push(`Generated: ${generatedAt}`);
md.push(`Inventory: \`${path.relative(ROOT, INVENTORY_PATH)}\``);
md.push(`Coverage map: \`${path.relative(ROOT, COVERAGE_PATH)}\``, '');
md.push('## Summary', '');
md.push(`- Media queries: **${report.summary.mediaQueryCount}**`);
md.push(`- Measured geometries: **${report.summary.measuredGeometryCount}**`);
md.push(`- Covered geometries: **${report.summary.coveredGeometryCount}**`);
md.push(`- Uncovered geometries: **${report.summary.uncoveredGeometryCount}**`);
md.push(`- Literal selector/property pairs seen in media queries: **${report.summary.selectorPropertyPairCount}**`);
md.push(`- Covered geometries whose final media-query declarations come from >1 MQ: **${report.summary.mixedWinnerGeometryCount}**`);
md.push(`- Average distinct winning MQs per covered geometry: **${report.summary.averageWinnerMediaQueriesPerCoveredGeometry}**`);
md.push(`- Maximum distinct winning MQs for one geometry: **${report.summary.maximumWinnerMediaQueriesForOneGeometry}**`);
md.push(`- Maximum cascade depth for one selector/property: **${report.summary.maximumCascadeDepthForOneSelectorProperty}**`);
md.push(`- MQs that match measured geometries but never win any literal selector/property: **${report.summary.matchedButNeverWinsQueryCount}**`);
md.push('');
md.push('> Scope: this analyzes declarations inside Hero `@media` blocks. For the same literal selector + property, the last matching declaration in source order is the media-query winner. It does not yet model cross-selector specificity or base CSS outside `@media`.');
md.push('');

md.push('## Media queries that match measured geometries but never win', '');
if (!matchedButNeverWins.length) {
  md.push('None.', '');
} else {
  md.push('| ID | Lines | Measured geometries matched | Condition |');
  md.push('|---|---:|---:|---|');
  for (const query of matchedButNeverWins) {
    md.push(`| ${query.id} | ${query.startLine}-${query.endLine} | ${query.matchedGeometryCount} | ${mdEscape(query.condition)} |`);
  }
  md.push('');
}

md.push('## Most conflict-prone selector/property pairs', '');
md.push('| Selector | Property | Geometries with multiple sources | Geometries with different values | Max depth | Top winner MQs |');
md.push('|---|---|---:|---:|---:|---|');
for (const item of keyCoverage.slice(0, 40)) {
  const winners = item.winnerQueries
    .slice(0, 6)
    .map((entry) => `${entry.queryId} (${entry.geometryCount})`)
    .join(', ');
  md.push(`| ${mdEscape(item.selector)} | ${mdEscape(item.property)} | ${item.multiSourceGeometryCount} | ${item.conflictingValueGeometryCount} | ${item.maxCascadeDepth} | ${mdEscape(winners)} |`);
}
md.push('');

md.push('## Geometries with the most mixed winner sources', '');
md.push('| Geometry | Viewport | Devices | Matching MQs | Winning MQ sources | Overridden declarations | Longest selector/property cascade |');
md.push('|---|---:|---|---:|---:|---:|---:|');
for (const geometry of [...coveredGeometries]
  .sort((a, b) =>
    b.winnerSourceCount - a.winnerSourceCount ||
    b.overriddenDeclarationCount - a.overriddenDeclarationCount ||
    a.geometryKey.localeCompare(b.geometryKey)
  )
  .slice(0, 40)) {
  md.push(`| ${mdEscape(geometry.geometryKey)} | ${geometry.innerViewport.width}×${geometry.innerViewport.height} | ${mdEscape(geometry.deviceNames.join(', '))} | ${geometry.matchCount} | ${geometry.winnerSourceCount} | ${geometry.overriddenDeclarationCount} | ${geometry.longestCascadeDepth} |`);
}
md.push('');

md.push('## Query winning usage', '');
md.push('| ID | Lines | Geometries matched | Geometries where it wins something | Winning selector/property declarations | Unique winning selector/property keys |');
md.push('|---|---:|---:|---:|---:|---:|');
for (const query of queryUsage) {
  md.push(`| ${query.id} | ${query.startLine}-${query.endLine} | ${query.matchedGeometryCount} | ${query.winningGeometryCount} | ${query.winningSelectorPropertyCount} | ${query.uniqueWinningSelectorPropertyCount} |`);
}
md.push('');

md.push('## Per-geometry winner sources', '');
md.push('| Geometry | Viewport | Winning MQs | Top winning sources |');
md.push('|---|---:|---:|---|');
for (const geometry of [...geometries].sort((a, b) => {
  if (a.cssOrientation !== b.cssOrientation) return a.cssOrientation.localeCompare(b.cssOrientation);
  if (a.innerViewport.width !== b.innerViewport.width) return a.innerViewport.width - b.innerViewport.width;
  return a.innerViewport.height - b.innerViewport.height;
})) {
  const sources = geometry.winnerSources
    .slice(0, 10)
    .map((entry) => `${entry.queryId}:${entry.keyCount}`)
    .join(', ');
  md.push(`| ${mdEscape(geometry.geometryKey)} | ${geometry.innerViewport.width}×${geometry.innerViewport.height} | ${geometry.winnerSourceCount} | ${mdEscape(sources || '—')} |`);
}
md.push('');

fs.writeFileSync(MD_OUT, md.join('\n') + '\n', 'utf8');

console.log('Hero property-level cascade analysis generated.');
console.log(`Media queries: ${report.summary.mediaQueryCount}`);
console.log(`Measured geometries: ${report.summary.measuredGeometryCount}`);
console.log(`Covered geometries: ${report.summary.coveredGeometryCount}`);
console.log(`Uncovered geometries: ${report.summary.uncoveredGeometryCount}`);
console.log(`Selector/property pairs: ${report.summary.selectorPropertyPairCount}`);
console.log(`Mixed-winner geometries: ${report.summary.mixedWinnerGeometryCount}`);
console.log(`Average winning MQ sources/covered geometry: ${report.summary.averageWinnerMediaQueriesPerCoveredGeometry}`);
console.log(`Maximum winning MQ sources/geometry: ${report.summary.maximumWinnerMediaQueriesForOneGeometry}`);
console.log(`Maximum selector/property cascade depth: ${report.summary.maximumCascadeDepthForOneSelectorProperty}`);
console.log(`Matching MQs that never win measured selector/property declarations: ${report.summary.matchedButNeverWinsQueryCount}`);
console.log(`JSON: ${path.relative(ROOT, JSON_OUT)}`);
console.log(`Markdown: ${path.relative(ROOT, MD_OUT)}`);
