const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const auditDir = path.join(root, 'qa-results', 'viewport-audit');
const cascadePath = path.join(auditDir, 'hero-cascade-analysis.json');
const coveragePath = path.join(auditDir, 'hero-geometry-coverage.json');

function readJson(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${path.relative(root, p)}. Run the earlier Hero audit commands first.`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const cascade = readJson(cascadePath);
const coverage = readJson(coveragePath);

function uniq(xs) {
  return [...new Set(xs)].sort();
}

function classifyFormFactor(g) {
  const names = (g.deviceNames || []).join(' ').toLowerCase();
  const w = g.innerViewport?.width || 0;
  const h = g.innerViewport?.height || 0;

  if (/\bfold\b|fold\d|\bflip\b|flip\d/.test(names)) return 'foldable';
  if (/ipad|tablet|galaxy tab|matepad/.test(names)) return 'tablet';

  // Geometry fallback for devices whose names do not expose their class.
  if (g.cssOrientation === 'portrait' && w >= 700 && h >= 900) return 'tablet';
  if (g.cssOrientation === 'landscape' && w >= 1000 && h >= 550) return 'tablet';
  return 'phone';
}

function effectiveSignature(g) {
  const entries = (g.cascadeEntries || [])
    .filter((e) => e && e.winner)
    .map((e) => ({
      selector: e.selector,
      property: e.property,
      value: e.winner.value,
    }))
    .sort((a, b) => {
      const ak = `${a.selector}\u0000${a.property}`;
      const bk = `${b.selector}\u0000${b.property}`;
      return ak.localeCompare(bk);
    });

  const raw = JSON.stringify(entries);
  return {
    hash: crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10),
    entries,
  };
}

function range(values) {
  if (!values.length) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

const covered = cascade.geometries.filter((g) => (g.cascadeEntries || []).length > 0);
const uncovered = cascade.geometries.filter((g) => (g.cascadeEntries || []).length === 0);

const grouped = new Map();
for (const g of covered) {
  const formFactor = classifyFormFactor(g);
  const sig = effectiveSignature(g);
  const key = `${formFactor}|${g.cssOrientation}|${sig.hash}`;
  if (!grouped.has(key)) {
    grouped.set(key, {
      formFactor,
      orientation: g.cssOrientation,
      signatureHash: sig.hash,
      signatureEntries: sig.entries,
      geometries: [],
    });
  }
  grouped.get(key).geometries.push(g);
}

const prefix = {
  phone: { portrait: 'PP', landscape: 'PL' },
  tablet: { portrait: 'TP', landscape: 'TL' },
  foldable: { portrait: 'FP', landscape: 'FL' },
};

const familyGroups = [...grouped.values()].sort((a, b) => {
  const order = { phone: 0, tablet: 1, foldable: 2 };
  if (order[a.formFactor] !== order[b.formFactor]) return order[a.formFactor] - order[b.formFactor];
  if (a.orientation !== b.orientation) return a.orientation.localeCompare(b.orientation);
  const aminw = Math.min(...a.geometries.map((g) => g.innerViewport.width));
  const bminw = Math.min(...b.geometries.map((g) => g.innerViewport.width));
  if (aminw !== bminw) return aminw - bminw;
  const aminh = Math.min(...a.geometries.map((g) => g.innerViewport.height));
  const bminh = Math.min(...b.geometries.map((g) => g.innerViewport.height));
  return aminh - bminh;
});

const counters = {};
const candidates = familyGroups.map((group) => {
  const pfx = prefix[group.formFactor]?.[group.orientation] || 'VX';
  counters[pfx] = (counters[pfx] || 0) + 1;
  const id = `V2-${pfx}-${String(counters[pfx]).padStart(2, '0')}`;
  const widths = group.geometries.map((g) => g.innerViewport.width);
  const heights = group.geometries.map((g) => g.innerViewport.height);
  const devices = uniq(group.geometries.flatMap((g) => g.deviceNames || []));
  const platforms = uniq(group.geometries.map((g) => g.platformName).filter(Boolean));
  const browsers = uniq(group.geometries.map((g) => g.browserName).filter(Boolean));
  const winnerQueries = uniq(
    group.geometries.flatMap((g) => (g.winnerSources || []).map((w) => w.queryId))
  );

  return {
    id,
    status: 'CANDIDATE_ONLY',
    formFactor: group.formFactor,
    orientation: group.orientation,
    signatureHash: group.signatureHash,
    measuredEnvelope: {
      width: range(widths),
      height: range(heights),
    },
    measuredGeometryCount: group.geometries.length,
    deviceCount: devices.length,
    devices,
    platforms,
    browsers,
    currentWinnerQueries: winnerQueries,
    effectiveDeclarationCount: group.signatureEntries.length,
    effectiveDeclarations: group.signatureEntries,
    geometries: group.geometries
      .map((g) => ({
        geometryKey: g.geometryKey,
        viewport: `${g.innerViewport.width}x${g.innerViewport.height}`,
        width: g.innerViewport.width,
        height: g.innerViewport.height,
        platformName: g.platformName,
        browserName: g.browserName,
        deviceNames: g.deviceNames,
        winnerSourceCount: g.winnerSourceCount,
        winnerSources: g.winnerSources,
      }))
      .sort((a, b) => a.width - b.width || a.height - b.height),
  };
});

const gapCandidates = uncovered
  .map((g) => ({
    formFactor: classifyFormFactor(g),
    orientation: g.cssOrientation,
    viewport: `${g.innerViewport.width}x${g.innerViewport.height}`,
    width: g.innerViewport.width,
    height: g.innerViewport.height,
    platformName: g.platformName,
    browserName: g.browserName,
    deviceNames: g.deviceNames,
  }))
  .sort((a, b) => a.formFactor.localeCompare(b.formFactor) || a.orientation.localeCompare(b.orientation) || a.width - b.width || a.height - b.height);

const countsByClass = {};
for (const c of candidates) {
  const k = `${c.formFactor}/${c.orientation}`;
  countsByClass[k] = (countsByClass[k] || 0) + 1;
}

const multiGeometryCandidates = candidates.filter((c) => c.measuredGeometryCount > 1).length;
const singletonCandidates = candidates.filter((c) => c.measuredGeometryCount === 1).length;

const artifact = {
  artifactType: 'hero-v2-family-candidates',
  generatedAt: new Date().toISOString(),
  sources: {
    cascade: path.relative(root, cascadePath),
    coverage: path.relative(root, coveragePath),
  },
  methodology: {
    principle: 'Group measured geometries by identical current effective selector/property values, then annotate by form factor and orientation.',
    important: 'These are candidate behavior families, not final CSS breakpoint ranges.',
    measuredEnvelopeWarning: 'A candidate measured envelope describes only observed member points. Do not copy it directly into @media min/max boundaries.',
    formFactorHeuristic: 'Known Fold/Flip names => foldable; known iPad/Tablet/Tab/MatePad names or tablet-like geometry => tablet; remaining measured mobile geometries => phone.',
  },
  summary: {
    measuredGeometries: cascade.geometries.length,
    coveredGeometries: covered.length,
    uncoveredGeometries: uncovered.length,
    candidateBehaviorFamilies: candidates.length,
    multiGeometryCandidates,
    singletonCandidates,
    countsByClass,
  },
  candidates,
  uncoveredGapCandidates: gapCandidates,
};

fs.mkdirSync(auditDir, { recursive: true });
const jsonPath = path.join(auditDir, 'hero-v2-family-candidates.json');
const mdPath = path.join(auditDir, 'hero-v2-family-candidates.md');
fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2));

function fmtRange(r) {
  return r.min === r.max ? String(r.min) : `${r.min}–${r.max}`;
}
function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|');
}

let md = `# Hero V2 Candidate Family Map\n\n`;
md += `Generated: ${artifact.generatedAt}\n\n`;
md += `> These are **candidate behavior families**, not final media-query boundaries. They preserve what the current measured CSS actually resolves to before we start merging/rebounding.\n\n`;
md += `## Summary\n\n`;
md += `- Measured geometries: **${artifact.summary.measuredGeometries}**\n`;
md += `- Covered geometries: **${artifact.summary.coveredGeometries}**\n`;
md += `- Uncovered geometries: **${artifact.summary.uncoveredGeometries}**\n`;
md += `- Candidate behavior families: **${artifact.summary.candidateBehaviorFamilies}**\n`;
md += `- Multi-geometry candidates: **${multiGeometryCandidates}**\n`;
md += `- Singleton candidates: **${singletonCandidates}**\n\n`;
md += `### Candidate counts by class\n\n`;
for (const [k, v] of Object.entries(countsByClass).sort()) md += `- ${k}: **${v}**\n`;

md += `\n## Candidate behavior families\n\n`;
md += `| ID | Class | Measured envelope W×H | Geometries | Devices | Current winner MQs |\n`;
md += `|---|---|---:|---:|---:|---|\n`;
for (const c of candidates) {
  md += `| ${c.id} | ${c.formFactor}/${c.orientation} | ${fmtRange(c.measuredEnvelope.width)} × ${fmtRange(c.measuredEnvelope.height)} | ${c.measuredGeometryCount} | ${c.deviceCount} | ${esc(c.currentWinnerQueries.join(', '))} |\n`;
}

for (const c of candidates) {
  md += `\n### ${c.id} — ${c.formFactor}/${c.orientation}\n\n`;
  md += `- Signature: \`${c.signatureHash}\`\n`;
  md += `- Measured envelope: **${fmtRange(c.measuredEnvelope.width)} × ${fmtRange(c.measuredEnvelope.height)}**\n`;
  md += `- Measured geometries: **${c.measuredGeometryCount}**\n`;
  md += `- Devices: ${c.devices.length ? c.devices.join(', ') : '—'}\n`;
  md += `- Browsers represented: ${c.browsers.length ? c.browsers.join(', ') : '—'}\n`;
  md += `- Current winner media queries: ${c.currentWinnerQueries.length ? c.currentWinnerQueries.join(', ') : '—'}\n\n`;
  md += `| Viewport | Platform | Browser | Devices | Winner sources |\n`;
  md += `|---:|---|---|---|---|\n`;
  for (const g of c.geometries) {
    md += `| ${g.viewport} | ${esc(g.platformName)} | ${esc(g.browserName)} | ${esc((g.deviceNames || []).join(', '))} | ${esc((g.winnerSources || []).map((w) => w.queryId).join(', '))} |\n`;
  }
}

md += `\n## Uncovered measured geometries — gap candidates\n\n`;
md += `> These geometries have no current Hero media-query match. They are not assigned final V2 families yet.\n\n`;
md += `| Viewport | Class | Platform | Browser | Devices |\n`;
md += `|---:|---|---|---|---|\n`;
for (const g of gapCandidates) {
  md += `| ${g.viewport} | ${g.formFactor}/${g.orientation} | ${esc(g.platformName)} | ${esc(g.browserName)} | ${esc((g.deviceNames || []).join(', '))} |\n`;
}

md += `\n## Next decision stage\n\n`;
md += `The next audit should compare neighboring candidate behavior families and calculate which ones can be safely merged, which need independent height-pressure modifiers, and which should remain form-factor-specific. No CSS should be changed from this report alone.\n`;

fs.writeFileSync(mdPath, md);

console.log('Hero V2 candidate family map generated.');
console.log(`Measured geometries: ${artifact.summary.measuredGeometries}`);
console.log(`Covered geometries: ${artifact.summary.coveredGeometries}`);
console.log(`Uncovered geometries: ${artifact.summary.uncoveredGeometries}`);
console.log(`Candidate behavior families: ${artifact.summary.candidateBehaviorFamilies}`);
console.log(`Multi-geometry candidates: ${multiGeometryCandidates}`);
console.log(`Singleton candidates: ${singletonCandidates}`);
for (const [k, v] of Object.entries(countsByClass).sort()) console.log(`${k}: ${v}`);
console.log(`JSON: ${path.relative(root, jsonPath)}`);
console.log(`Markdown: ${path.relative(root, mdPath)}`);
