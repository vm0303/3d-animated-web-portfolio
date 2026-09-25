const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'qa-results', 'testmu', 'catalog', 'TESTMU__geometry-registry__us__latest.json');
const outDir = path.join(root, 'qa-results', 'viewport-audit');
const jsonOut = path.join(outDir, 'hero-testmu-mobile-portrait-pressure-map.json');
const mdOut = path.join(outDir, 'hero-testmu-mobile-portrait-pressure-map.md');

const PRESSURE_BANDS = [
  { id: 'EXTREME_SHORT', minHeight: null, maxHeight: 600 },
  { id: 'SEVERE_SHORT', minHeight: 601, maxHeight: 680 },
  { id: 'COMPACT', minHeight: 681, maxHeight: 730 },
  { id: 'NORMAL', minHeight: 731, maxHeight: 800 },
  { id: 'TALL', minHeight: 801, maxHeight: null },
];

const normalizeName = (value = '') => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isFoldable = (name) => /(fold|flip|surface\s*duo)/i.test(name);
const isTablet = (name) => /(ipad|tablet|galaxy\s*tab|matepad)/i.test(name);
const pressureBand = (height) => PRESSURE_BANDS.find((band) =>
  (band.minHeight == null || height >= band.minHeight) &&
  (band.maxHeight == null || height <= band.maxHeight)
)?.id || 'UNCLASSIFIED';

const uniqueBy = (items, keyFn) => {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
};

if (!fs.existsSync(registryPath)) {
  console.error(`Missing TestMU geometry registry: ${registryPath}`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const captures = registry.captures || [];

const eligible = captures.filter((capture) => {
  const year = capture.releaseYear;
  const name = capture.deviceName || '';
  const viewport = capture.innerViewport || {};
  return capture.cssMediaOrientation === 'portrait' &&
    Number.isFinite(year) && year >= 2020 && year <= 2026 &&
    !isFoldable(name) && !isTablet(name) &&
    Number.isFinite(viewport.width) && Number.isFinite(viewport.height) &&
    viewport.width <= 600;
});

const rows = uniqueBy(eligible, (capture) => [
  normalizeName(capture.deviceName),
  capture.platformName,
  capture.browserName,
  capture.innerViewport.width,
  capture.innerViewport.height,
].join('|')).map((capture) => ({
  deviceName: capture.deviceName,
  normalizedDeviceName: normalizeName(capture.deviceName),
  releaseYear: capture.releaseYear,
  platformName: capture.platformName,
  platformVersion: capture.platformVersion,
  browserName: capture.browserName,
  browserVersion: capture.browserVersion,
  width: capture.innerViewport.width,
  height: capture.innerViewport.height,
  visualWidth: capture.visualViewport?.width ?? null,
  visualHeight: capture.visualViewport?.height ?? null,
  screenWidth: capture.screen?.width ?? null,
  screenHeight: capture.screen?.height ?? null,
  pressureBand: pressureBand(capture.innerViewport.height),
  sourcePath: capture.sourcePath,
})).sort((a, b) => a.width - b.width || a.height - b.height || a.deviceName.localeCompare(b.deviceName));

const bandSummaries = PRESSURE_BANDS.map((band) => {
  const members = rows.filter((row) => row.pressureBand === band.id);
  const widths = members.map((row) => row.width);
  const heights = members.map((row) => row.height);
  return {
    ...band,
    measuredRows: members.length,
    measuredDevices: new Set(members.map((row) => row.normalizedDeviceName)).size,
    widthRange: members.length ? { min: Math.min(...widths), max: Math.max(...widths) } : null,
    heightRangeObserved: members.length ? { min: Math.min(...heights), max: Math.max(...heights) } : null,
    browsers: [...new Set(members.map((row) => `${row.platformName} ${row.browserName}`))].sort(),
    exactGeometries: uniqueBy(members, (row) => `${row.width}x${row.height}`).map((row) => ({ width: row.width, height: row.height })),
  };
});

const browserCoverageMap = new Map();
for (const row of rows) {
  const key = `${row.platformName} ${row.browserName}`;
  if (!browserCoverageMap.has(key)) browserCoverageMap.set(key, []);
  browserCoverageMap.get(key).push(row);
}
const browserCoverage = [...browserCoverageMap.entries()].map(([browser, members]) => ({
  browser,
  measuredRows: members.length,
  measuredDevices: new Set(members.map((row) => row.normalizedDeviceName)).size,
  minHeight: Math.min(...members.map((row) => row.height)),
  maxHeight: Math.max(...members.map((row) => row.height)),
  minWidth: Math.min(...members.map((row) => row.width)),
  maxWidth: Math.max(...members.map((row) => row.width)),
})).sort((a, b) => b.measuredRows - a.measuredRows || a.browser.localeCompare(b.browser));

const byDevice = new Map();
for (const row of rows) {
  if (!byDevice.has(row.normalizedDeviceName)) byDevice.set(row.normalizedDeviceName, []);
  byDevice.get(row.normalizedDeviceName).push(row);
}

const crossBrowserDevices = [];
for (const [normalizedDeviceName, members] of byDevice) {
  const browsers = [...new Set(members.map((row) => `${row.platformName} ${row.browserName}`))];
  if (browsers.length < 2) continue;
  const heights = members.map((row) => row.height);
  const bands = [...new Set(members.map((row) => row.pressureBand))];
  crossBrowserDevices.push({
    normalizedDeviceName,
    displayName: members[0].deviceName,
    minHeight: Math.min(...heights),
    maxHeight: Math.max(...heights),
    heightSpread: Math.max(...heights) - Math.min(...heights),
    bandAgreement: bands.length === 1,
    bands,
    variants: members
      .map((row) => ({ browser: `${row.platformName} ${row.browserName}`, width: row.width, height: row.height, pressureBand: row.pressureBand }))
      .sort((a, b) => a.height - b.height || a.browser.localeCompare(b.browser)),
  });
}
crossBrowserDevices.sort((a, b) => b.heightSpread - a.heightSpread || a.displayName.localeCompare(b.displayName));

const exactGeometries = uniqueBy(rows, (row) => `${row.width}x${row.height}`)
  .map((row) => ({ width: row.width, height: row.height, pressureBand: row.pressureBand }))
  .sort((a, b) => a.width - b.width || a.height - b.height);

const narrow360Anchors = rows
  .filter((row) => row.width === 360)
  .map((row) => ({
    deviceName: row.deviceName,
    browser: `${row.platformName} ${row.browserName}`,
    width: row.width,
    height: row.height,
    pressureBand: row.pressureBand,
  }))
  .sort((a, b) => a.height - b.height || a.deviceName.localeCompare(b.deviceName));

const boundaryProbes = [600, 680, 730, 800].map((boundary) => ({
  boundary,
  fuzzHeights: [boundary - 2, boundary - 1, boundary, boundary + 1, boundary + 2],
}));

const report = {
  artifactType: 'hero-testmu-mobile-portrait-pressure-map',
  generatedAt: new Date().toISOString(),
  source: {
    registryPath: path.relative(root, registryPath),
    registryGeneratedAt: registry.generatedAt,
    registrySummary: registry.summary,
  },
  scope: {
    releaseYears: '2020-2026',
    orientation: 'portrait',
    formFactor: 'standard phones only',
    excluded: ['tablets', 'foldables/flips/dual-screen', 'portrait widths > 600px'],
    geometrySourceOfTruth: 'innerViewport.width × innerViewport.height',
  },
  compositionContract: {
    normalOrder: ['title', 'certifications', 'certification badges', 'speech bubble', 'scroll indicator', 'portrait + fluid shape', 'contact button'],
    severeHeightPolicy: 'Optional elements may be hidden rather than compressing primary content. Bubble is the first approved optional element.',
    horizontalBubblePolicy: 'When visible on mobile, the longest speech message should remain on one line by coordinating bubble width/font/avatar sizing; do not truncate the text.',
  },
  proposedPressureBands: PRESSURE_BANDS,
  summary: {
    eligibleMeasuredRows: rows.length,
    normalizedDeviceModels: new Set(rows.map((row) => row.normalizedDeviceName)).size,
    exactViewportGeometries: exactGeometries.length,
    crossBrowserDeviceFamilies: crossBrowserDevices.length,
    crossBrowserBandDisagreements: crossBrowserDevices.filter((item) => !item.bandAgreement).length,
    narrow360MeasuredRows: narrow360Anchors.length,
  },
  browserCoverage,
  bandSummaries,
  crossBrowserDevices,
  narrow360Anchors,
  boundaryProbes,
  exactGeometries,
  rows,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);

const md = [];
md.push('# Hero TestMU Mobile Portrait Pressure Map', '');
md.push(`Generated: ${report.generatedAt}`, '');
md.push('> Analysis only. This report does not modify Hero.css and does not declare final breakpoint values.', '');
md.push('## Scope', '');
md.push(`- TestMU registry: **${report.source.registrySummary.uniqueCaptures} validated captures**, **${report.source.registrySummary.measuredDeviceModels} measured models**, **${report.source.registrySummary.exactGeometryFamilies} exact registry geometries**.`);
md.push('- Filter: standard phone portrait captures, release years 2020–2026, width ≤ 600px.');
md.push('- CSS geometry source: `innerViewport.width × innerViewport.height`.');
md.push('- Tablets and foldable/flip/dual-screen devices are intentionally excluded from this phone pressure map.', '');
md.push('## Hero composition contract', '');
md.push('Normal vertical order: **title → certifications → badges → bubble → scroll → portrait/shape → contact**.');
md.push('At severe height pressure, optional content may be hidden rather than crushing the primary content. The bubble is the first approved optional element.');
md.push('When the bubble is visible on mobile, its longest speech message should remain on one line without text truncation.', '');
md.push('## Summary', '');
md.push(`- Eligible measured device/browser rows: **${report.summary.eligibleMeasuredRows}**`);
md.push(`- Normalized standard-phone models: **${report.summary.normalizedDeviceModels}**`);
md.push(`- Exact phone portrait geometries: **${report.summary.exactViewportGeometries}**`);
md.push(`- Same-device cross-browser families: **${report.summary.crossBrowserDeviceFamilies}**`);
md.push(`- Cross-browser families split across proposed pressure bands: **${report.summary.crossBrowserBandDisagreements}**`);
md.push(`- Measured 360px-wide rows: **${report.summary.narrow360MeasuredRows}**`, '');

md.push('## Proposed pressure bands — experimental', '');
md.push('| Band | Proposed height range | Measured rows | Devices | Observed heights | Observed widths |');
md.push('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const band of bandSummaries) {
  const proposed = `${band.minHeight ?? '−∞'}–${band.maxHeight ?? '∞'}`;
  const observedH = band.heightRangeObserved ? `${band.heightRangeObserved.min}–${band.heightRangeObserved.max}` : '—';
  const observedW = band.widthRange ? `${band.widthRange.min}–${band.widthRange.max}` : '—';
  md.push(`| ${band.id} | ${proposed} | ${band.measuredRows} | ${band.measuredDevices} | ${observedH} | ${observedW} |`);
}
md.push('');

md.push('## Browser coverage in this phone-portrait slice', '');
md.push('| Browser | Rows | Devices | Width range | Height range |');
md.push('| --- | ---: | ---: | ---: | ---: |');
for (const item of browserCoverage) {
  md.push(`| ${item.browser} | ${item.measuredRows} | ${item.measuredDevices} | ${item.minWidth}–${item.maxWidth} | ${item.minHeight}–${item.maxHeight} |`);
}
md.push('');

md.push('## Same-device cross-browser checks', '');
if (!crossBrowserDevices.length) {
  md.push('No same-device cross-browser phone portrait families were found.', '');
} else {
  md.push('| Device | Height spread | Band agreement | Variants |');
  md.push('| --- | ---: | --- | --- |');
  for (const item of crossBrowserDevices) {
    const variants = item.variants.map((v) => `${v.browser} ${v.width}×${v.height} (${v.pressureBand})`).join('<br>');
    md.push(`| ${item.displayName} | ${item.heightSpread}px | ${item.bandAgreement ? 'YES' : 'NO'} | ${variants} |`);
  }
  md.push('');
}

md.push('## 360px measured portrait anchors', '');
md.push('| Height | Device | Browser | Band |');
md.push('| ---: | --- | --- | --- |');
for (const row of narrow360Anchors) {
  md.push(`| ${row.height} | ${row.deviceName} | ${row.browser} | ${row.pressureBand} |`);
}
md.push('');

md.push('## Boundary fuzz probes', '');
for (const probe of boundaryProbes) {
  md.push(`- ${probe.boundary}px boundary → ${probe.fuzzHeights.join(', ')}px`);
}
md.push('');
md.push('## Interpretation rules', '');
md.push('- A new device should first be mapped by measured `innerViewport` into an existing width family + height-pressure band.');
md.push('- A device/browser landing near a pressure boundary must pass the ±2px fuzz probes before the boundary is accepted.');
md.push('- Same-device browser variants should ideally remain in the same pressure band; disagreements are review signals, not automatic new breakpoints.');
md.push('- These height bands do not determine bubble width. Bubble one-line fit is a width-family concern layered with height-pressure visibility.');

fs.writeFileSync(mdOut, `${md.join('\n')}\n`);

console.log('Hero TestMU mobile portrait pressure map generated.');
console.log(`Eligible measured rows: ${report.summary.eligibleMeasuredRows}`);
console.log(`Normalized device models: ${report.summary.normalizedDeviceModels}`);
console.log(`Exact phone portrait geometries: ${report.summary.exactViewportGeometries}`);
console.log(`Same-device cross-browser families: ${report.summary.crossBrowserDeviceFamilies}`);
console.log(`Cross-browser band disagreements: ${report.summary.crossBrowserBandDisagreements}`);
for (const band of bandSummaries) {
  console.log(`${band.id}: ${band.measuredRows} rows / ${band.measuredDevices} devices`);
}
console.log(`360px measured rows: ${report.summary.narrow360MeasuredRows}`);
console.log(`JSON: ${path.relative(root, jsonOut)}`);
console.log(`Markdown: ${path.relative(root, mdOut)}`);
