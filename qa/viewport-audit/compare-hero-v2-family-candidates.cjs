const fs = require('fs');
const path = require('path');

const root = process.cwd();
const auditDir = path.join(root, 'qa-results', 'viewport-audit');
const candidatesPath = path.join(auditDir, 'hero-v2-family-candidates.json');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function readJson(p) {
  if (!fs.existsSync(p)) fail(`Missing ${path.relative(root, p)}. Run npm run qa:hero:families first.`);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (error) {
    fail(`Could not parse ${path.relative(root, p)}: ${error.message}`);
  }
}

const artifactIn = readJson(candidatesPath);
const candidates = artifactIn.candidates || [];
if (!Array.isArray(candidates) || !candidates.length) fail('No V2 candidate families found.');

const STRUCTURAL_PROPERTIES = new Set([
  'display',
  'flex-direction',
  'position',
  'align-items',
  'justify-content',
  'align-self',
  'text-align',
]);

const HIGH_RISK_KEYS = new Set([
  '.hero\u0000flex-direction',
  '.bubbleContainer\u0000display',
  '.socials\u0000position',
  '.heroSection\u0000height',
  '.heroSection\u0000min-height',
  '.heroSection.left\u0000justify-content',
  '.heroSection.right\u0000align-items',
  '.heroSection.right\u0000justify-content',
]);

function keyOf(selector, property) {
  return `${selector}\u0000${property}`;
}

function declarationMap(candidate) {
  return new Map(
    (candidate.effectiveDeclarations || []).map((entry) => [
      keyOf(entry.selector, entry.property),
      { selector: entry.selector, property: entry.property, value: entry.value },
    ])
  );
}

const maps = new Map(candidates.map((c) => [c.id, declarationMap(c)]));

function intervalGap(a, b) {
  if (a.max < b.min) return b.min - a.max;
  if (b.max < a.min) return a.min - b.max;
  return 0;
}

function center(r) {
  return (r.min + r.max) / 2;
}

function geometryThresholds(formFactor, orientation) {
  if (formFactor === 'phone' && orientation === 'portrait') return { widthGap: 16, heightGap: 50 };
  if (formFactor === 'phone' && orientation === 'landscape') return { widthGap: 40, heightGap: 24 };
  if (formFactor === 'tablet' && orientation === 'portrait') return { widthGap: 24, heightGap: 120 };
  if (formFactor === 'tablet' && orientation === 'landscape') return { widthGap: 64, heightGap: 80 };
  if (formFactor === 'foldable' && orientation === 'landscape') return { widthGap: 120, heightGap: 80 };
  if (formFactor === 'foldable' && orientation === 'portrait') return { widthGap: 120, heightGap: 120 };
  return { widthGap: 24, heightGap: 60 };
}

function compareDeclarations(a, b) {
  const ma = maps.get(a.id);
  const mb = maps.get(b.id);
  const keys = [...new Set([...ma.keys(), ...mb.keys()])].sort();
  const differences = [];

  for (const key of keys) {
    const ea = ma.get(key);
    const eb = mb.get(key);
    const va = ea ? ea.value : '<BASE>';
    const vb = eb ? eb.value : '<BASE>';
    if (va === vb) continue;
    const selector = (ea || eb).selector;
    const property = (ea || eb).property;
    differences.push({
      selector,
      property,
      from: va,
      to: vb,
      structural: STRUCTURAL_PROPERTIES.has(property),
      highRisk: HIGH_RISK_KEYS.has(key),
      baseDependent: !ea || !eb,
    });
  }

  return differences;
}

function geometryMetrics(a, b) {
  const aw = a.measuredEnvelope.width;
  const ah = a.measuredEnvelope.height;
  const bw = b.measuredEnvelope.width;
  const bh = b.measuredEnvelope.height;
  const widthGap = intervalGap(aw, bw);
  const heightGap = intervalGap(ah, bh);
  const widthCenterDelta = Math.abs(center(aw) - center(bw));
  const heightCenterDelta = Math.abs(center(ah) - center(bh));
  const thresholds = geometryThresholds(a.formFactor, a.orientation);
  const near = widthGap <= thresholds.widthGap && heightGap <= thresholds.heightGap;
  const widthNear = widthGap <= Math.min(8, thresholds.widthGap);
  const heightNear = heightGap <= Math.min(12, thresholds.heightGap);

  let geometryRelation = 'DISTANT';
  if (near) {
    if (widthNear && heightCenterDelta >= 20) geometryRelation = 'HEIGHT_PRESSURE_NEIGHBOR';
    else if (heightNear && widthCenterDelta >= 8) geometryRelation = 'WIDTH_STEP_NEIGHBOR';
    else geometryRelation = 'TWO_AXIS_NEIGHBOR';
  }

  return {
    widthGap,
    heightGap,
    widthCenterDelta: Number(widthCenterDelta.toFixed(1)),
    heightCenterDelta: Number(heightCenterDelta.toFixed(1)),
    thresholds,
    near,
    geometryRelation,
  };
}

function recommendation(a, b, metrics, differences) {
  const structuralDiffCount = differences.filter((d) => d.structural).length;
  const highRiskDiffCount = differences.filter((d) => d.highRisk).length;
  const baseDependentDiffCount = differences.filter((d) => d.baseDependent).length;
  const diffCount = differences.length;

  if (!metrics.near) return 'NOT_NEAR';

  // Same/near width with a meaningful height shift is evidence for a shared
  // width family plus a short-height modifier. This is intentionally allowed
  // to contain structural changes such as hiding a bubble at an ultra-short height.
  if (
    metrics.geometryRelation === 'HEIGHT_PRESSURE_NEIGHBOR' &&
    diffCount <= 20 &&
    highRiskDiffCount <= 2
  ) {
    return 'HEIGHT_PRESSURE_VARIANT';
  }

  if (structuralDiffCount > 0 || highRiskDiffCount > 0) return 'KEEP_SEPARATE_STRUCTURAL';

  if (diffCount <= 2 && baseDependentDiffCount === 0) return 'MERGE_STRONG';
  if (diffCount <= 5 && baseDependentDiffCount === 0) return 'MERGE_WITH_TOKENS';
  if (diffCount <= 5 && baseDependentDiffCount > 0) return 'MERGE_REVIEW_BASE_DEPENDENCY';

  return 'KEEP_SEPARATE_COMPLEX';
}

const allPairs = [];
for (let i = 0; i < candidates.length; i += 1) {
  for (let j = i + 1; j < candidates.length; j += 1) {
    const a = candidates[i];
    const b = candidates[j];
    if (a.formFactor !== b.formFactor || a.orientation !== b.orientation) continue;

    const geom = geometryMetrics(a, b);
    const differences = compareDeclarations(a, b);
    const structuralDiffCount = differences.filter((d) => d.structural).length;
    const highRiskDiffCount = differences.filter((d) => d.highRisk).length;
    const baseDependentDiffCount = differences.filter((d) => d.baseDependent).length;
    const rec = recommendation(a, b, geom, differences);

    // Lower score = more similar, used only to select each family's closest peer.
    const similarityScore =
      differences.length * 10 +
      structuralDiffCount * 50 +
      highRiskDiffCount * 75 +
      geom.widthGap +
      geom.heightGap * 0.5;

    allPairs.push({
      a: a.id,
      b: b.id,
      formFactor: a.formFactor,
      orientation: a.orientation,
      recommendation: rec,
      geometryRelation: geom.geometryRelation,
      near: geom.near,
      widthGap: geom.widthGap,
      heightGap: geom.heightGap,
      widthCenterDelta: geom.widthCenterDelta,
      heightCenterDelta: geom.heightCenterDelta,
      differenceCount: differences.length,
      structuralDiffCount,
      highRiskDiffCount,
      baseDependentDiffCount,
      similarityScore: Number(similarityScore.toFixed(2)),
      differences,
    });
  }
}

const nearPairs = allPairs.filter((p) => p.near);
const actionablePairs = nearPairs.filter((p) =>
  ['MERGE_STRONG', 'MERGE_WITH_TOKENS', 'MERGE_REVIEW_BASE_DEPENDENCY', 'HEIGHT_PRESSURE_VARIANT'].includes(p.recommendation)
);

function componentsFromEdges(edges) {
  const adjacency = new Map();
  for (const c of candidates) adjacency.set(c.id, new Set());
  for (const edge of edges) {
    adjacency.get(edge.a).add(edge.b);
    adjacency.get(edge.b).add(edge.a);
  }
  const seen = new Set();
  const comps = [];
  for (const id of adjacency.keys()) {
    if (seen.has(id) || adjacency.get(id).size === 0) continue;
    const stack = [id];
    const members = [];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop();
      members.push(cur);
      for (const n of adjacency.get(cur)) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    comps.push(members.sort());
  }
  return comps.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

const mergeEdges = nearPairs.filter((p) =>
  ['MERGE_STRONG', 'MERGE_WITH_TOKENS', 'MERGE_REVIEW_BASE_DEPENDENCY'].includes(p.recommendation)
);
const mergeReviewGroups = componentsFromEdges(mergeEdges).map((members, index) => ({
  id: `MRG-${String(index + 1).padStart(2, '0')}`,
  members,
  note: 'Review group only. A transitive connection does not prove all members should become one final CSS family.',
}));

const nearestNeighborByCandidate = candidates.map((candidate) => {
  const peers = allPairs
    .filter((p) => p.a === candidate.id || p.b === candidate.id)
    .sort((x, y) => x.similarityScore - y.similarityScore || x.differenceCount - y.differenceCount);
  const best = peers[0] || null;
  if (!best) return { candidateId: candidate.id, nearest: null };
  return {
    candidateId: candidate.id,
    nearest: best.a === candidate.id ? best.b : best.a,
    recommendation: best.recommendation,
    geometryRelation: best.geometryRelation,
    differenceCount: best.differenceCount,
    structuralDiffCount: best.structuralDiffCount,
    widthGap: best.widthGap,
    heightGap: best.heightGap,
    similarityScore: best.similarityScore,
  };
});

const recommendationCounts = {};
for (const p of nearPairs) recommendationCounts[p.recommendation] = (recommendationCounts[p.recommendation] || 0) + 1;

const relationCounts = {};
for (const p of nearPairs) relationCounts[p.geometryRelation] = (relationCounts[p.geometryRelation] || 0) + 1;

const candidateById = new Map(candidates.map((c) => [c.id, c]));
const candidatesWithoutNearPeer = candidates
  .filter((c) => !nearPairs.some((p) => p.a === c.id || p.b === c.id))
  .map((c) => ({
    id: c.id,
    formFactor: c.formFactor,
    orientation: c.orientation,
    measuredEnvelope: c.measuredEnvelope,
    measuredGeometryCount: c.measuredGeometryCount,
    devices: c.devices,
  }));

const output = {
  artifactType: 'hero-v2-family-comparison',
  generatedAt: new Date().toISOString(),
  source: path.relative(root, candidatesPath),
  methodology: {
    purpose: 'Compare nearby V2 behavior candidates before defining final CSS families.',
    warning: 'Recommendations are review evidence, not automatic CSS edit instructions.',
    structuralProperties: [...STRUCTURAL_PROPERTIES],
    recommendationMeanings: {
      MERGE_STRONG: 'Nearby candidates differ by at most two non-structural declarations and have no base-dependency difference.',
      MERGE_WITH_TOKENS: 'Nearby candidates differ by at most five non-structural declarations and are plausible candidates for one family using controlled tokens/clamp.',
      MERGE_REVIEW_BASE_DEPENDENCY: 'Small non-structural difference set, but one side relies on the base rule for at least one value. Inspect before merging.',
      HEIGHT_PRESSURE_VARIANT: 'Near/same width with a meaningful height shift; likely evidence for a shared width family plus a height-pressure modifier.',
      KEEP_SEPARATE_STRUCTURAL: 'Nearby candidates differ in layout/structural behavior. Preserve separately unless manual testing proves a common structure.',
      KEEP_SEPARATE_COMPLEX: 'Nearby candidates have more than five effective declaration differences; do not merge automatically.',
    },
  },
  summary: {
    candidateFamilies: candidates.length,
    sameClassPairs: allPairs.length,
    nearPairs: nearPairs.length,
    actionableReviewPairs: actionablePairs.length,
    mergeReviewGroups: mergeReviewGroups.length,
    candidatesWithoutNearPeer: candidatesWithoutNearPeer.length,
    recommendationCounts,
    geometryRelationCounts: relationCounts,
  },
  mergeReviewGroups,
  actionablePairs: actionablePairs.sort((a, b) =>
    a.recommendation.localeCompare(b.recommendation) ||
    a.differenceCount - b.differenceCount ||
    a.a.localeCompare(b.a) ||
    a.b.localeCompare(b.b)
  ),
  nearPairs: nearPairs.sort((a, b) =>
    a.formFactor.localeCompare(b.formFactor) ||
    a.orientation.localeCompare(b.orientation) ||
    a.widthGap - b.widthGap ||
    a.heightGap - b.heightGap ||
    a.differenceCount - b.differenceCount
  ),
  nearestNeighborByCandidate,
  candidatesWithoutNearPeer,
};

fs.mkdirSync(auditDir, { recursive: true });
const jsonPath = path.join(auditDir, 'hero-v2-family-comparison.json');
const mdPath = path.join(auditDir, 'hero-v2-family-comparison.md');
fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));

function esc(v) {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
function fmtRange(r) {
  return r.min === r.max ? String(r.min) : `${r.min}–${r.max}`;
}
function familyEnvelope(id) {
  const c = candidateById.get(id);
  if (!c) return '';
  return `${fmtRange(c.measuredEnvelope.width)} × ${fmtRange(c.measuredEnvelope.height)}`;
}

let md = `# Hero V2 Candidate Family Comparison\n\n`;
md += `Generated: ${output.generatedAt}\n\n`;
md += `> This is a **review artifact**, not an instruction to merge CSS automatically. It compares nearby measured behavior candidates while preserving your current effective Hero results.\n\n`;
md += `## Summary\n\n`;
md += `- Candidate behavior families: **${output.summary.candidateFamilies}**\n`;
md += `- Same-class pair comparisons: **${output.summary.sameClassPairs}**\n`;
md += `- Geometry-near pairs: **${output.summary.nearPairs}**\n`;
md += `- Actionable review pairs: **${output.summary.actionableReviewPairs}**\n`;
md += `- Merge review groups: **${output.summary.mergeReviewGroups}**\n`;
md += `- Candidates without a geometry-near peer: **${output.summary.candidatesWithoutNearPeer}**\n\n`;
md += `### Recommendations among geometry-near pairs\n\n`;
for (const [k, v] of Object.entries(recommendationCounts).sort()) md += `- ${k}: **${v}**\n`;
md += `\n### Geometry relations among geometry-near pairs\n\n`;
for (const [k, v] of Object.entries(relationCounts).sort()) md += `- ${k}: **${v}**\n`;

md += `\n## Merge review groups\n\n`;
md += `> These are connected components formed only from MERGE_STRONG / MERGE_WITH_TOKENS / MERGE_REVIEW_BASE_DEPENDENCY edges. They are **not final families**; transitive grouping can over-connect candidates.\n\n`;
for (const group of mergeReviewGroups) {
  md += `- **${group.id}**: ${group.members.join(', ')}\n`;
}

md += `\n## Actionable review pairs\n\n`;
md += `| A | B | Recommendation | Geometry relation | A envelope | B envelope | CSS diffs | Structural | Base-dependent | W gap | H gap |\n`;
md += `|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|\n`;
for (const p of output.actionablePairs) {
  md += `| ${p.a} | ${p.b} | ${p.recommendation} | ${p.geometryRelation} | ${familyEnvelope(p.a)} | ${familyEnvelope(p.b)} | ${p.differenceCount} | ${p.structuralDiffCount} | ${p.baseDependentDiffCount} | ${p.widthGap} | ${p.heightGap} |\n`;
}

md += `\n## Difference details for actionable pairs\n\n`;
for (const p of output.actionablePairs) {
  md += `### ${p.a} ↔ ${p.b} — ${p.recommendation}\n\n`;
  md += `- Geometry: ${p.geometryRelation}; width gap ${p.widthGap}px; height gap ${p.heightGap}px\n`;
  md += `- Effective declaration differences: ${p.differenceCount}; structural: ${p.structuralDiffCount}; base-dependent: ${p.baseDependentDiffCount}\n\n`;
  if (!p.differences.length) {
    md += `No differences.\n\n`;
    continue;
  }
  md += `| Selector | Property | A | B | Flags |\n`;
  md += `|---|---|---|---|---|\n`;
  for (const d of p.differences) {
    const flags = [d.structural ? 'STRUCTURAL' : '', d.highRisk ? 'HIGH_RISK' : '', d.baseDependent ? 'BASE_DEP' : ''].filter(Boolean).join(', ');
    md += `| ${esc(d.selector)} | ${esc(d.property)} | ${esc(d.from)} | ${esc(d.to)} | ${flags || '—'} |\n`;
  }
  md += `\n`;
}

md += `## Nearby pairs kept separate for now\n\n`;
md += `| A | B | Recommendation | Relation | CSS diffs | Structural | High-risk | W gap | H gap |\n`;
md += `|---|---|---|---|---:|---:|---:|---:|---:|\n`;
for (const p of output.nearPairs.filter((x) => x.recommendation.startsWith('KEEP_'))) {
  md += `| ${p.a} | ${p.b} | ${p.recommendation} | ${p.geometryRelation} | ${p.differenceCount} | ${p.structuralDiffCount} | ${p.highRiskDiffCount} | ${p.widthGap} | ${p.heightGap} |\n`;
}

md += `\n## Candidates without a geometry-near peer\n\n`;
if (!candidatesWithoutNearPeer.length) {
  md += `None.\n`;
} else {
  md += `| ID | Class | Measured envelope | Geometries | Devices |\n`;
  md += `|---|---|---:|---:|---|\n`;
  for (const c of candidatesWithoutNearPeer) {
    md += `| ${c.id} | ${c.formFactor}/${c.orientation} | ${fmtRange(c.measuredEnvelope.width)} × ${fmtRange(c.measuredEnvelope.height)} | ${c.measuredGeometryCount} | ${esc((c.devices || []).join(', '))} |\n`;
  }
}

md += `\n## Nearest peer for every candidate\n\n`;
md += `| Candidate | Nearest peer | Recommendation | Relation | CSS diffs | Structural | W gap | H gap |\n`;
md += `|---|---|---|---|---:|---:|---:|---:|\n`;
for (const n of nearestNeighborByCandidate) {
  if (!n.nearest) {
    md += `| ${n.candidateId} | — | — | — | — | — | — | — |\n`;
  } else {
    md += `| ${n.candidateId} | ${n.nearest} | ${n.recommendation} | ${n.geometryRelation} | ${n.differenceCount} | ${n.structuralDiffCount} | ${n.widthGap} | ${n.heightGap} |\n`;
  }
}

md += `\n## Next decision stage\n\n`;
md += `Use this report to draft the first **proposed V2 family architecture**: merge only high-confidence neighboring behaviors, model repeated height-driven differences as height-pressure modifiers, preserve structural/form-factor differences, and keep the nine uncovered measured tablet geometries as explicit gap inputs. Do not edit Hero CSS from this comparison alone.\n`;

fs.writeFileSync(mdPath, md);

console.log('Hero V2 family comparison generated.');
console.log(`Candidate families: ${output.summary.candidateFamilies}`);
console.log(`Same-class pair comparisons: ${output.summary.sameClassPairs}`);
console.log(`Geometry-near pairs: ${output.summary.nearPairs}`);
console.log(`Actionable review pairs: ${output.summary.actionableReviewPairs}`);
console.log(`Merge review groups: ${output.summary.mergeReviewGroups}`);
for (const [k, v] of Object.entries(recommendationCounts).sort()) console.log(`${k}: ${v}`);
console.log(`Candidates without a geometry-near peer: ${output.summary.candidatesWithoutNearPeer}`);
console.log(`JSON: ${path.relative(root, jsonPath)}`);
console.log(`Markdown: ${path.relative(root, mdPath)}`);
