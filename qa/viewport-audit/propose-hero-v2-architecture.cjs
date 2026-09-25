const fs = require('fs');
const path = require('path');

const root = process.cwd();
const auditDir = path.join(root, 'qa-results', 'viewport-audit');
const candidatesPath = path.join(auditDir, 'hero-v2-family-candidates.json');
const comparisonPath = path.join(auditDir, 'hero-v2-family-comparison.json');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function readJson(p, prerequisite) {
  if (!fs.existsSync(p)) fail(`Missing ${path.relative(root, p)}. ${prerequisite}`);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (error) {
    fail(`Could not parse ${path.relative(root, p)}: ${error.message}`);
  }
}

const candidateArtifact = readJson(candidatesPath, 'Run npm run qa:hero:families first.');
const comparisonArtifact = readJson(comparisonPath, 'Run npm run qa:hero:compare-families first.');
const candidates = candidateArtifact.candidates || [];
const pairs = comparisonArtifact.nearPairs || [];
const uncovered = candidateArtifact.uncoveredGapCandidates || [];
if (!candidates.length) fail('No candidate behavior families found.');

const byId = new Map(candidates.map((c) => [c.id, c]));
const SAFE_MERGE = new Set(['MERGE_STRONG', 'MERGE_WITH_TOKENS']);
const safeEdges = pairs.filter((p) => SAFE_MERGE.has(p.recommendation));
const baseDependencyPairs = pairs.filter((p) => p.recommendation === 'MERGE_REVIEW_BASE_DEPENDENCY');
const heightPressurePairs = pairs.filter((p) => p.recommendation === 'HEIGHT_PRESSURE_VARIANT');

function edgeKey(a, b) {
  return [a, b].sort().join('|');
}
const safeEdgeMap = new Map(safeEdges.map((p) => [edgeKey(p.a, p.b), p]));

function classKey(c) {
  const ff = c.formFactor === 'phone' ? 'P' : c.formFactor === 'tablet' ? 'T' : 'F';
  const or = c.orientation === 'portrait' ? 'P' : 'L';
  return `${ff}${or}`;
}

function adjacencyFor(ids, edges) {
  const adj = new Map(ids.map((id) => [id, new Set()]));
  for (const p of edges) {
    if (!adj.has(p.a) || !adj.has(p.b)) continue;
    adj.get(p.a).add(p.b);
    adj.get(p.b).add(p.a);
  }
  return adj;
}

function connectedComponents(ids, edges) {
  const adj = adjacencyFor(ids, edges);
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id];
    const members = [];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop();
      members.push(cur);
      for (const n of adj.get(cur) || []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    out.push(members.sort());
  }
  return out;
}

// Bron-Kerbosch maximal cliques for small same-class merge graphs.
function maximalCliques(ids, edges) {
  const adj = adjacencyFor(ids, edges);
  const cliques = [];
  function intersect(set, neighbors) {
    return new Set([...set].filter((x) => neighbors.has(x)));
  }
  function bronk(R, P, X) {
    if (P.size === 0 && X.size === 0) {
      cliques.push([...R].sort());
      return;
    }
    const pList = [...P];
    for (const v of pList) {
      const nv = adj.get(v) || new Set();
      bronk(new Set([...R, v]), intersect(P, nv), intersect(X, nv));
      P.delete(v);
      X.add(v);
    }
  }
  bronk(new Set(), new Set(ids), new Set());
  return cliques.filter((c) => c.length >= 2);
}

function cliqueScore(members) {
  let strong = 0;
  let tokens = 0;
  let totalDiffs = 0;
  let totalGeometryGap = 0;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const p = safeEdgeMap.get(edgeKey(members[i], members[j]));
      if (!p) return null; // not a complete safe-merge clique
      if (p.recommendation === 'MERGE_STRONG') strong += 1;
      if (p.recommendation === 'MERGE_WITH_TOKENS') tokens += 1;
      totalDiffs += p.differenceCount || 0;
      totalGeometryGap += (p.widthGap || 0) + (p.heightGap || 0);
    }
  }
  return { size: members.length, strong, tokens, totalDiffs, totalGeometryGap };
}

function compareCliqueChoice(a, b) {
  const sa = cliqueScore(a);
  const sb = cliqueScore(b);
  if (sa.size !== sb.size) return sb.size - sa.size;
  if (sa.strong !== sb.strong) return sb.strong - sa.strong;
  if (sa.totalDiffs !== sb.totalDiffs) return sa.totalDiffs - sb.totalDiffs;
  if (sa.totalGeometryGap !== sb.totalGeometryGap) return sa.totalGeometryGap - sb.totalGeometryGap;
  return a.join(',').localeCompare(b.join(','));
}

const safeMergeCores = [];
const assignedToCore = new Set();

for (const cls of [...new Set(candidates.map(classKey))].sort()) {
  const ids = candidates.filter((c) => classKey(c) === cls).map((c) => c.id);
  const clsEdges = safeEdges.filter((p) => ids.includes(p.a) && ids.includes(p.b));
  const comps = connectedComponents(ids, clsEdges).filter((members) => members.length > 1);
  for (const comp of comps) {
    const cliques = maximalCliques(comp, clsEdges).sort(compareCliqueChoice);
    if (!cliques.length) continue;
    const chosen = cliques[0];
    safeMergeCores.push({ members: chosen, score: cliqueScore(chosen) });
    chosen.forEach((id) => assignedToCore.add(id));
  }
}

const provisionalRawGroups = [];
for (const core of safeMergeCores) {
  const first = byId.get(core.members[0]);
  provisionalRawGroups.push({
    groupType: 'SAFE_MERGE_CORE',
    formFactor: first.formFactor,
    orientation: first.orientation,
    members: core.members,
    mergeEvidence: core.score,
  });
}
for (const c of candidates) {
  if (!assignedToCore.has(c.id)) {
    provisionalRawGroups.push({
      groupType: 'PRESERVED_SINGLETON',
      formFactor: c.formFactor,
      orientation: c.orientation,
      members: [c.id],
      mergeEvidence: null,
    });
  }
}

function extentForMembers(members) {
  const cs = members.map((id) => byId.get(id));
  const minW = Math.min(...cs.map((c) => c.measuredEnvelope.width.min));
  const maxW = Math.max(...cs.map((c) => c.measuredEnvelope.width.max));
  const minH = Math.min(...cs.map((c) => c.measuredEnvelope.height.min));
  const maxH = Math.max(...cs.map((c) => c.measuredEnvelope.height.max));
  return { width: { min: minW, max: maxW }, height: { min: minH, max: maxH } };
}

const prefix = {
  'phone/portrait': 'PP',
  'phone/landscape': 'PL',
  'tablet/portrait': 'TP',
  'tablet/landscape': 'TL',
  'foldable/portrait': 'FP',
  'foldable/landscape': 'FL',
};

const counters = {};
const provisionalBaseGroups = provisionalRawGroups
  .map((g) => ({ ...g, measuredEnvelope: extentForMembers(g.members) }))
  .sort((a, b) => {
    const ak = `${a.formFactor}/${a.orientation}`;
    const bk = `${b.formFactor}/${b.orientation}`;
    if (ak !== bk) return ak.localeCompare(bk);
    if (a.measuredEnvelope.width.min !== b.measuredEnvelope.width.min) return a.measuredEnvelope.width.min - b.measuredEnvelope.width.min;
    if (a.measuredEnvelope.height.min !== b.measuredEnvelope.height.min) return a.measuredEnvelope.height.min - b.measuredEnvelope.height.min;
    return a.members[0].localeCompare(b.members[0]);
  })
  .map((g) => {
    const k = `${g.formFactor}/${g.orientation}`;
    const p = prefix[k] || 'VX';
    counters[p] = (counters[p] || 0) + 1;
    return { id: `BASE-${p}-${String(counters[p]).padStart(2, '0')}`, ...g };
  });

// Cluster uncovered measured gaps conservatively by class + nearby geometry.
function gapThreshold(formFactor, orientation) {
  if (formFactor === 'tablet' && orientation === 'portrait') return { width: 90, height: 170 };
  if (formFactor === 'tablet' && orientation === 'landscape') return { width: 100, height: 100 };
  if (formFactor === 'phone' && orientation === 'portrait') return { width: 24, height: 70 };
  if (formFactor === 'phone' && orientation === 'landscape') return { width: 50, height: 30 };
  return { width: 120, height: 120 };
}

function gapConnected(a, b) {
  if (a.formFactor !== b.formFactor || a.orientation !== b.orientation) return false;
  const t = gapThreshold(a.formFactor, a.orientation);
  return Math.abs(a.width - b.width) <= t.width && Math.abs(a.height - b.height) <= t.height;
}

function gapComponents(items) {
  const seen = new Set();
  const comps = [];
  for (let i = 0; i < items.length; i += 1) {
    if (seen.has(i)) continue;
    const stack = [i];
    const group = [];
    seen.add(i);
    while (stack.length) {
      const cur = stack.pop();
      group.push(items[cur]);
      for (let j = 0; j < items.length; j += 1) {
        if (seen.has(j)) continue;
        if (gapConnected(items[cur], items[j])) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    comps.push(group);
  }
  return comps;
}

const gapCounters = {};
const gapGroups = gapComponents(uncovered)
  .sort((a, b) => {
    const ak = `${a[0].formFactor}/${a[0].orientation}`;
    const bk = `${b[0].formFactor}/${b[0].orientation}`;
    if (ak !== bk) return ak.localeCompare(bk);
    return Math.min(...a.map((x) => x.width)) - Math.min(...b.map((x) => x.width));
  })
  .map((items) => {
    const k = `${items[0].formFactor}/${items[0].orientation}`;
    const p = prefix[k] || 'VX';
    gapCounters[p] = (gapCounters[p] || 0) + 1;
    return {
      id: `GAP-${p}-${String(gapCounters[p]).padStart(2, '0')}`,
      status: 'NEEDS_LAYOUT_VALIDATION',
      formFactor: items[0].formFactor,
      orientation: items[0].orientation,
      measuredEnvelope: {
        width: { min: Math.min(...items.map((x) => x.width)), max: Math.max(...items.map((x) => x.width)) },
        height: { min: Math.min(...items.map((x) => x.height)), max: Math.max(...items.map((x) => x.height)) },
      },
      geometries: items.sort((a, b) => a.width - b.width || a.height - b.height),
    };
  });

function summarizePair(p) {
  return {
    a: p.a,
    b: p.b,
    recommendation: p.recommendation,
    geometryRelation: p.geometryRelation,
    differenceCount: p.differenceCount,
    structuralDiffCount: p.structuralDiffCount,
    baseDependentDiffCount: p.baseDependentDiffCount,
    widthGap: p.widthGap,
    heightGap: p.heightGap,
    differences: p.differences,
  };
}

const countsByBaseClass = {};
for (const g of provisionalBaseGroups) {
  const k = `${g.formFactor}/${g.orientation}`;
  countsByBaseClass[k] = (countsByBaseClass[k] || 0) + 1;
}

const output = {
  artifactType: 'hero-v2-architecture-proposal',
  generatedAt: new Date().toISOString(),
  sources: {
    candidates: path.relative(root, candidatesPath),
    comparison: path.relative(root, comparisonPath),
  },
  methodology: {
    purpose: 'Create a conservative architecture proposal before editing Hero CSS.',
    warning: 'This artifact proposes migration structure only. It does not define final @media boundaries and must not be copied directly into Hero.css.',
    safeMergeRule: 'Only MERGE_STRONG and MERGE_WITH_TOKENS relationships can form provisional base merge cores. Every member of a selected core must be pairwise safe-merge compatible.',
    baseDependencyRule: 'MERGE_REVIEW_BASE_DEPENDENCY pairs remain manual review items and are not merged automatically.',
    heightPressureRule: 'HEIGHT_PRESSURE_VARIANT relationships are kept separate from base-family merging so height-driven behavior can become modifiers later.',
    gapRule: 'Uncovered measured geometries are clustered only as validation work queues; they are not assigned CSS until tested.',
  },
  summary: {
    originalMediaQueries: 77,
    measuredBehaviorCandidates: candidates.length,
    provisionalBaseGroups: provisionalBaseGroups.length,
    safeMergeCores: provisionalBaseGroups.filter((g) => g.groupType === 'SAFE_MERGE_CORE').length,
    preservedSingletonGroups: provisionalBaseGroups.filter((g) => g.groupType === 'PRESERVED_SINGLETON').length,
    candidateBehaviorsAbsorbedBySafeMerges: candidates.length - provisionalBaseGroups.length,
    heightPressureRelationships: heightPressurePairs.length,
    baseDependencyReviewPairs: baseDependencyPairs.length,
    uncoveredMeasuredGeometries: uncovered.length,
    uncoveredGapGroups: gapGroups.length,
    countsByBaseClass,
  },
  provisionalBaseGroups,
  heightPressureRelationships: heightPressurePairs.map(summarizePair),
  baseDependencyReviewPairs: baseDependencyPairs.map(summarizePair),
  uncoveredGapGroups: gapGroups,
  implementationLayers: [
    {
      order: 1,
      layer: 'BASE',
      purpose: 'Shared default Hero structure and tokens. No device names.',
    },
    {
      order: 2,
      layer: 'FORM_FACTOR_ORIENTATION_FAMILY',
      purpose: 'Bounded phone/tablet/foldable portrait/landscape families derived from provisional base groups.',
    },
    {
      order: 3,
      layer: 'HEIGHT_PRESSURE',
      purpose: 'Short/ultra-short height modifiers applied only where measured evidence shows height-driven behavior changes.',
    },
    {
      order: 4,
      layer: 'FEATURE_ENHANCEMENT',
      purpose: 'Safe-area and foldable/posture progressive enhancements without making them prerequisites for a working Hero.',
    },
    {
      order: 5,
      layer: 'EXCEPTION',
      purpose: 'Small documented exceptions only after measured QA proves a family + modifier cannot handle a geometry.',
    },
  ],
};

fs.mkdirSync(auditDir, { recursive: true });
const jsonPath = path.join(auditDir, 'hero-v2-architecture-proposal.json');
const mdPath = path.join(auditDir, 'hero-v2-architecture-proposal.md');
fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));

function fmtRange(r) {
  return r.min === r.max ? String(r.min) : `${r.min}–${r.max}`;
}
function esc(v) {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

let md = `# Hero V2 Architecture Proposal\n\n`;
md += `Generated: ${output.generatedAt}\n\n`;
md += `> **Architecture proposal only. Do not copy these measured envelopes directly into @media rules. Hero.css remains unchanged at this stage.**\n\n`;
md += `## Summary\n\n`;
md += `- Legacy media queries: **${output.summary.originalMediaQueries}**\n`;
md += `- Measured behavior candidates: **${output.summary.measuredBehaviorCandidates}**\n`;
md += `- Provisional base behavior groups: **${output.summary.provisionalBaseGroups}**\n`;
md += `- Safe merge cores: **${output.summary.safeMergeCores}**\n`;
md += `- Preserved singleton groups: **${output.summary.preservedSingletonGroups}**\n`;
md += `- Candidate behaviors absorbed by conservative safe merges: **${output.summary.candidateBehaviorsAbsorbedBySafeMerges}**\n`;
md += `- Height-pressure relationships: **${output.summary.heightPressureRelationships}**\n`;
md += `- Base-dependency review pairs: **${output.summary.baseDependencyReviewPairs}**\n`;
md += `- Uncovered measured geometries: **${output.summary.uncoveredMeasuredGeometries}**\n`;
md += `- Uncovered gap work groups: **${output.summary.uncoveredGapGroups}**\n\n`;

md += `### Provisional base groups by class\n\n`;
for (const [k, v] of Object.entries(countsByBaseClass).sort()) md += `- ${k}: **${v}**\n`;

md += `\n## Proposed CSS architecture layers\n\n`;
for (const layer of output.implementationLayers) {
  md += `${layer.order}. **${layer.layer}** — ${layer.purpose}\n`;
}

md += `\n## Provisional base behavior groups\n\n`;
md += `| ID | Class | Type | Measured envelope W×H | Current behavior candidates |\n`;
md += `|---|---|---|---:|---|\n`;
for (const g of provisionalBaseGroups) {
  md += `| ${g.id} | ${g.formFactor}/${g.orientation} | ${g.groupType} | ${fmtRange(g.measuredEnvelope.width)} × ${fmtRange(g.measuredEnvelope.height)} | ${g.members.join(', ')} |\n`;
}

md += `\n## Safe merge cores\n\n`;
md += `> These are the only groups Step 8 is willing to consolidate automatically in the architecture draft. Final media boundaries still require the next stage.\n\n`;
for (const g of provisionalBaseGroups.filter((x) => x.groupType === 'SAFE_MERGE_CORE')) {
  md += `- **${g.id}**: ${g.members.join(', ')} (strong edges ${g.mergeEvidence.strong}, token edges ${g.mergeEvidence.tokens}, total CSS diffs ${g.mergeEvidence.totalDiffs})\n`;
}

md += `\n## Height-pressure relationships\n\n`;
md += `> These stay separate from base merging. They are evidence that width-family CSS may need a short-height modifier rather than another device breakpoint.\n\n`;
md += `| A | B | CSS diffs | W gap | H gap | Relation |\n`;
md += `|---|---|---:|---:|---:|---|\n`;
for (const p of output.heightPressureRelationships) {
  md += `| ${p.a} | ${p.b} | ${p.differenceCount} | ${p.widthGap} | ${p.heightGap} | ${p.geometryRelation} |\n`;
}

md += `\n## Base-dependency merge review\n\n`;
md += `> These may still merge later, but Step 8 refuses to do so until the base Hero declarations are included in the comparison.\n\n`;
md += `| A | B | CSS diffs | Base-dependent | W gap | H gap |\n`;
md += `|---|---|---:|---:|---:|---:|\n`;
for (const p of output.baseDependencyReviewPairs) {
  md += `| ${p.a} | ${p.b} | ${p.differenceCount} | ${p.baseDependentDiffCount} | ${p.widthGap} | ${p.heightGap} |\n`;
}

md += `\n## Uncovered measured geometry work groups\n\n`;
md += `> These groups organize validation work only. They do not yet have Hero CSS behavior, because the current stylesheet does not cover them.\n\n`;
for (const g of gapGroups) {
  md += `### ${g.id} — ${g.formFactor}/${g.orientation}\n\n`;
  md += `- Measured envelope: **${fmtRange(g.measuredEnvelope.width)} × ${fmtRange(g.measuredEnvelope.height)}**\n`;
  md += `- Status: **${g.status}**\n`;
  for (const x of g.geometries) md += `- ${x.viewport}: ${esc((x.deviceNames || []).join(', '))}\n`;
  md += `\n`;
}

md += `## Interpretation\n\n`;
md += `Step 8 intentionally stops short of final breakpoint numbers. It establishes the migration architecture: preserve ${output.summary.provisionalBaseGroups} provisional base behavior groups after conservative safe merging, treat ${output.summary.heightPressureRelationships} relationships as height-pressure evidence, keep ${output.summary.baseDependencyReviewPairs} base-dependent pairs under manual review, and validate ${output.summary.uncoveredGapGroups} uncovered geometry groups before assigning CSS.\n\n`;
md += `The next stage should include the base Hero declarations in the effective-style model, derive candidate lower/upper boundaries between adjacent measured groups, and create breakpoint-boundary test points before any media query is edited.\n`;

fs.writeFileSync(mdPath, md);

console.log('Hero V2 architecture proposal generated.');
console.log(`Legacy media queries: ${output.summary.originalMediaQueries}`);
console.log(`Measured behavior candidates: ${output.summary.measuredBehaviorCandidates}`);
console.log(`Provisional base behavior groups: ${output.summary.provisionalBaseGroups}`);
console.log(`Safe merge cores: ${output.summary.safeMergeCores}`);
console.log(`Preserved singleton groups: ${output.summary.preservedSingletonGroups}`);
console.log(`Candidate behaviors absorbed by safe merges: ${output.summary.candidateBehaviorsAbsorbedBySafeMerges}`);
console.log(`Height-pressure relationships: ${output.summary.heightPressureRelationships}`);
console.log(`Base-dependency review pairs: ${output.summary.baseDependencyReviewPairs}`);
console.log(`Uncovered measured geometries: ${output.summary.uncoveredMeasuredGeometries}`);
console.log(`Uncovered gap work groups: ${output.summary.uncoveredGapGroups}`);
for (const [k, v] of Object.entries(countsByBaseClass).sort()) console.log(`${k}: ${v}`);
console.log(`JSON: ${path.relative(root, jsonPath)}`);
console.log(`Markdown: ${path.relative(root, mdPath)}`);
