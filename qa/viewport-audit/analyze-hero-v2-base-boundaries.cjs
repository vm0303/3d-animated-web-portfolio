const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const auditDir = path.join(root, 'qa-results', 'viewport-audit');
const cssPath = path.join(root, 'src', 'components', 'hero', 'hero.css');
const inventoryPath = path.join(auditDir, 'hero-media-inventory.json');
const coveragePath = path.join(auditDir, 'hero-geometry-coverage.json');
const candidatesPath = path.join(auditDir, 'hero-v2-family-candidates.json');
const architecturePath = path.join(auditDir, 'hero-v2-architecture-proposal.json');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function readJson(p, prerequisite) {
  if (!fs.existsSync(p)) fail(`Missing ${path.relative(root, p)}. ${prerequisite || ''}`.trim());
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (error) {
    fail(`Could not parse ${path.relative(root, p)}: ${error.message}`);
  }
}

if (!fs.existsSync(cssPath)) fail(`Hero CSS not found: ${path.relative(root, cssPath)}`);
const css = fs.readFileSync(cssPath, 'utf8');
const inventory = readJson(inventoryPath, 'Run npm run qa:hero:inventory first.');
const coverage = readJson(coveragePath, 'Run npm run qa:hero:coverage first.');
const candidateArtifact = readJson(candidatesPath, 'Run npm run qa:hero:families first.');
const architecture = readJson(architecturePath, 'Run npm run qa:hero:architecture first.');

function findMatchingBrace(text, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unclosed block beginning at index ${openBraceIndex}`);
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function normalizeSelector(selector) {
  return String(selector || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/\s*,\s*/g, ',');
}

function parseTopLevelRules(block) {
  const cleaned = stripComments(block);
  const rules = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    while (cursor < cleaned.length && /\s/.test(cleaned[cursor])) cursor += 1;
    if (cursor >= cleaned.length) break;
    const open = cleaned.indexOf('{', cursor);
    if (open === -1) break;
    const selector = cleaned.slice(cursor, open).replace(/\s+/g, ' ').trim();
    const close = findMatchingBrace(cleaned, open);
    const body = cleaned.slice(open + 1, close);
    const declarations = [];
    if (!body.includes('{')) {
      const declarationRegex = /([\w-]+)\s*:\s*([^;{}]+);?/g;
      let match;
      while ((match = declarationRegex.exec(body)) !== null) {
        declarations.push({
          property: match[1],
          value: match[2].replace(/\s+/g, ' ').trim(),
        });
      }
    }
    rules.push({ selector, normalizedSelector: normalizeSelector(selector), declarations });
    cursor = close + 1;
  }
  return rules;
}

function keyOf(selector, property) {
  return `${normalizeSelector(selector)}\u0000${property}`;
}

function splitKey(key) {
  const idx = key.indexOf('\u0000');
  return { selector: key.slice(0, idx), property: key.slice(idx + 1) };
}

const firstMediaIndex = css.indexOf('@media');
if (firstMediaIndex < 0) fail('No @media blocks found in Hero CSS.');
const baseCss = css.slice(0, firstMediaIndex);
const baseRules = parseTopLevelRules(baseCss);
const baseMap = new Map();
let baseDeclarationCount = 0;
for (const rule of baseRules) {
  for (const declaration of rule.declarations) {
    baseDeclarationCount += 1;
    baseMap.set(keyOf(rule.normalizedSelector, declaration.property), {
      selector: rule.normalizedSelector,
      property: declaration.property,
      value: declaration.value,
      source: 'BASE',
      originalSelector: rule.selector,
    });
  }
}

// Identify selector spellings that are semantically the same for the exact
// combinator/whitespace normalization used in this audit.
const mediaSelectorVariants = new Map();
for (const mq of inventory.mediaQueries || []) {
  for (const rule of mq.rules || []) {
    const normalized = normalizeSelector(rule.selector);
    if (!mediaSelectorVariants.has(normalized)) mediaSelectorVariants.set(normalized, new Set());
    mediaSelectorVariants.get(normalized).add(rule.selector);
  }
}
const selectorNormalizationCollisions = [...mediaSelectorVariants.entries()]
  .filter(([, variants]) => variants.size > 1)
  .map(([normalizedSelector, variants]) => ({ normalizedSelector, variants: [...variants].sort() }))
  .sort((a, b) => a.normalizedSelector.localeCompare(b.normalizedSelector));

const mqById = new Map((inventory.mediaQueries || []).map((mq) => [mq.id, mq]));
const candidateById = new Map((candidateArtifact.candidates || []).map((c) => [c.id, c]));
const geometryToCandidate = new Map();
for (const candidate of candidateArtifact.candidates || []) {
  for (const g of candidate.geometries || []) geometryToCandidate.set(g.geometryKey, candidate.id);
}

function resolvedMapForGeometry(geometry) {
  const out = new Map([...baseMap.entries()].map(([k, v]) => [k, { ...v }]));
  for (const queryId of geometry.matchingQueryIds || []) {
    const mq = mqById.get(queryId);
    if (!mq) continue;
    for (const rule of mq.rules || []) {
      const selector = normalizeSelector(rule.selector);
      for (const declaration of rule.declarations || []) {
        out.set(keyOf(selector, declaration.property), {
          selector,
          property: declaration.property,
          value: declaration.value,
          source: queryId,
          originalSelector: rule.selector,
        });
      }
    }
  }
  return out;
}

const resolvedByCandidate = new Map();
const candidateSignatureHashes = new Map();
const candidateInternalConsistency = [];

for (const candidate of candidateArtifact.candidates || []) {
  const memberMaps = [];
  for (const member of candidate.geometries || []) {
    const geometry = (coverage.geometries || []).find((g) => g.geometryKey === member.geometryKey);
    if (!geometry) continue;
    memberMaps.push({ geometry, map: resolvedMapForGeometry(geometry) });
  }
  if (!memberMaps.length) continue;

  function signatureOf(map) {
    const rows = [...map.values()]
      .map((entry) => [entry.selector, entry.property, entry.value])
      .sort((a, b) => `${a[0]}\u0000${a[1]}`.localeCompare(`${b[0]}\u0000${b[1]}`));
    return crypto.createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 10);
  }

  const hashes = memberMaps.map(({ map }) => signatureOf(map));
  const uniqueHashes = [...new Set(hashes)];
  candidateInternalConsistency.push({
    candidateId: candidate.id,
    measuredGeometryCount: memberMaps.length,
    normalizedFullStyleSignatureCount: uniqueHashes.length,
    consistent: uniqueHashes.length === 1,
  });

  resolvedByCandidate.set(candidate.id, memberMaps[0].map);
  candidateSignatureHashes.set(candidate.id, uniqueHashes[0]);
}

const uniqueNormalizedBehaviorSignatures = new Set(candidateSignatureHashes.values()).size;

const STRUCTURAL_PROPERTIES = new Set([
  'display', 'flex-direction', 'position', 'align-items', 'justify-content', 'align-self', 'text-align',
]);
const HIGH_RISK_KEYS = new Set([
  keyOf('.hero', 'flex-direction'),
  keyOf('.bubbleContainer', 'display'),
  keyOf('.socials', 'position'),
  keyOf('.heroSection', 'height'),
  keyOf('.heroSection', 'min-height'),
  keyOf('.heroSection.left', 'justify-content'),
  keyOf('.heroSection.right', 'align-items'),
  keyOf('.heroSection.right', 'justify-content'),
]);

function compareResolvedMaps(aId, bId) {
  const ma = resolvedByCandidate.get(aId) || new Map();
  const mb = resolvedByCandidate.get(bId) || new Map();
  const keys = [...new Set([...ma.keys(), ...mb.keys()])].sort();
  const differences = [];
  for (const key of keys) {
    const ea = ma.get(key);
    const eb = mb.get(key);
    const va = ea ? ea.value : '<IMPLICIT_OR_EXTERNAL>';
    const vb = eb ? eb.value : '<IMPLICIT_OR_EXTERNAL>';
    if (va === vb) continue;
    const { selector, property } = splitKey(key);
    differences.push({
      selector,
      property,
      from: va,
      to: vb,
      fromSource: ea?.source || 'IMPLICIT_OR_EXTERNAL',
      toSource: eb?.source || 'IMPLICIT_OR_EXTERNAL',
      structural: STRUCTURAL_PROPERTIES.has(property),
      highRisk: HIGH_RISK_KEYS.has(key),
      implicitOrExternalDependent: !ea || !eb,
    });
  }
  return differences;
}

function intervalGap(a, b) {
  if (a.max < b.min) return b.min - a.max;
  if (b.max < a.min) return a.min - b.max;
  return 0;
}
function center(r) { return (r.min + r.max) / 2; }
function geometryThresholds(formFactor, orientation) {
  if (formFactor === 'phone' && orientation === 'portrait') return { widthGap: 16, heightGap: 50 };
  if (formFactor === 'phone' && orientation === 'landscape') return { widthGap: 40, heightGap: 24 };
  if (formFactor === 'tablet' && orientation === 'portrait') return { widthGap: 24, heightGap: 120 };
  if (formFactor === 'tablet' && orientation === 'landscape') return { widthGap: 64, heightGap: 80 };
  if (formFactor === 'foldable' && orientation === 'landscape') return { widthGap: 120, heightGap: 80 };
  if (formFactor === 'foldable' && orientation === 'portrait') return { widthGap: 120, heightGap: 120 };
  return { widthGap: 24, heightGap: 60 };
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
  return { widthGap, heightGap, widthCenterDelta, heightCenterDelta, near, geometryRelation };
}

function baseAwareRecommendation(a, b, metrics, differences) {
  const structuralDiffCount = differences.filter((d) => d.structural).length;
  const highRiskDiffCount = differences.filter((d) => d.highRisk).length;
  const implicitCount = differences.filter((d) => d.implicitOrExternalDependent).length;
  const diffCount = differences.length;
  if (!metrics.near) return 'NOT_NEAR';
  if (metrics.geometryRelation === 'HEIGHT_PRESSURE_NEIGHBOR' && diffCount <= 20 && highRiskDiffCount <= 2) {
    return 'HEIGHT_PRESSURE_VARIANT';
  }
  if (structuralDiffCount > 0 || highRiskDiffCount > 0) return 'KEEP_SEPARATE_STRUCTURAL';
  if (diffCount <= 2 && implicitCount === 0) return 'MERGE_STRONG';
  if (diffCount <= 5 && implicitCount === 0) return 'MERGE_WITH_TOKENS';
  if (diffCount <= 5 && implicitCount > 0) return 'MERGE_REVIEW_IMPLICIT_OR_EXTERNAL';
  return 'KEEP_SEPARATE_COMPLEX';
}

const normalizedNearPairs = [];
const candidates = candidateArtifact.candidates || [];
for (let i = 0; i < candidates.length; i += 1) {
  for (let j = i + 1; j < candidates.length; j += 1) {
    const a = candidates[i];
    const b = candidates[j];
    if (a.formFactor !== b.formFactor || a.orientation !== b.orientation) continue;
    const metrics = geometryMetrics(a, b);
    if (!metrics.near) continue;
    const differences = compareResolvedMaps(a.id, b.id);
    normalizedNearPairs.push({
      a: a.id,
      b: b.id,
      formFactor: a.formFactor,
      orientation: a.orientation,
      recommendation: baseAwareRecommendation(a, b, metrics, differences),
      geometryRelation: metrics.geometryRelation,
      widthGap: metrics.widthGap,
      heightGap: metrics.heightGap,
      differenceCount: differences.length,
      structuralDiffCount: differences.filter((d) => d.structural).length,
      highRiskDiffCount: differences.filter((d) => d.highRisk).length,
      implicitOrExternalDiffCount: differences.filter((d) => d.implicitOrExternalDependent).length,
      differences,
    });
  }
}

const baseAwareRecommendationCounts = {};
for (const p of normalizedNearPairs) {
  baseAwareRecommendationCounts[p.recommendation] = (baseAwareRecommendationCounts[p.recommendation] || 0) + 1;
}

const previousBaseDependencyPairs = architecture.baseDependencyReviewPairs || [];
const baseDependencyResolution = previousBaseDependencyPairs.map((previous) => {
  const a = candidateById.get(previous.a);
  const b = candidateById.get(previous.b);
  const metrics = geometryMetrics(a, b);
  const differences = compareResolvedMaps(previous.a, previous.b);
  const recommendation = baseAwareRecommendation(a, b, metrics, differences);
  return {
    a: previous.a,
    b: previous.b,
    previousDifferenceCount: previous.differenceCount,
    normalizedFullStyleDifferenceCount: differences.length,
    previousBaseDependentDiffCount: previous.baseDependentDiffCount,
    remainingImplicitOrExternalDiffCount: differences.filter((d) => d.implicitOrExternalDependent).length,
    recommendation,
    differences,
  };
});

const newlyResolvedSafeMergePairs = baseDependencyResolution.filter((p) =>
  ['MERGE_STRONG', 'MERGE_WITH_TOKENS'].includes(p.recommendation)
);
const remainingImplicitReviewPairs = baseDependencyResolution.filter((p) =>
  p.recommendation === 'MERGE_REVIEW_IMPLICIT_OR_EXTERNAL'
);

// Candidate corridors between provisional base groups. These are evidence
// zones only; they are intentionally not emitted as final @media boundaries.
function envelopesOverlap(a, b) {
  return !(a.max < b.min || b.max < a.min);
}
function midpointBetween(aMax, bMin) {
  return Number(((aMax + bMin) / 2).toFixed(1));
}
function integerFuzz(boundary) {
  const b = Math.round(boundary);
  return [b - 2, b - 1, b, b + 1, b + 2];
}
function envelopeCenter(r) { return Math.round((r.min + r.max) / 2); }
function overlapCenter(a, b) {
  const lo = Math.max(a.min, b.min);
  const hi = Math.min(a.max, b.max);
  if (lo > hi) return null;
  return Math.round((lo + hi) / 2);
}

const tracks = new Map();
for (const group of architecture.provisionalBaseGroups || []) {
  const key = `${group.formFactor}/${group.orientation}`;
  if (!tracks.has(key)) tracks.set(key, []);
  tracks.get(key).push(group);
}

const boundaryCorridors = [];
let corridorIndex = 0;
for (const [track, groups] of [...tracks.entries()].sort()) {
  const sorted = [...groups].sort((a, b) =>
    center(a.measuredEnvelope.width) - center(b.measuredEnvelope.width) ||
    center(a.measuredEnvelope.height) - center(b.measuredEnvelope.height) ||
    a.id.localeCompare(b.id)
  );
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const aw = a.measuredEnvelope.width;
    const ah = a.measuredEnvelope.height;
    const bw = b.measuredEnvelope.width;
    const bh = b.measuredEnvelope.height;
    const widthOverlap = envelopesOverlap(aw, bw);
    const heightOverlap = envelopesOverlap(ah, bh);
    let type;
    if (!widthOverlap && heightOverlap) type = 'WIDTH_CORRIDOR_CANDIDATE';
    else if (widthOverlap && !heightOverlap) type = 'HEIGHT_CORRIDOR_CANDIDATE';
    else if (!widthOverlap && !heightOverlap) type = 'TWO_AXIS_CORRIDOR_CANDIDATE';
    else type = 'OVERLAPPING_MEASURED_ENVELOPES';

    const corridor = {
      id: `BC-${String(++corridorIndex).padStart(2, '0')}`,
      track,
      a: a.id,
      b: b.id,
      type,
      aEnvelope: a.measuredEnvelope,
      bEnvelope: b.measuredEnvelope,
      widthGap: intervalGap(aw, bw),
      heightGap: intervalGap(ah, bh),
      fuzzPlan: null,
    };

    if (type === 'WIDTH_CORRIDOR_CANDIDATE') {
      const left = aw.max < bw.min ? a : b;
      const right = left === a ? b : a;
      const boundary = midpointBetween(left.measuredEnvelope.width.max, right.measuredEnvelope.width.min);
      corridor.fuzzPlan = {
        axis: 'width',
        candidateBoundaryPx: boundary,
        values: integerFuzz(boundary),
        representativeCrossAxisPx: overlapCenter(ah, bh) ?? envelopeCenter(ah),
        note: 'Candidate test center only; not a final CSS breakpoint.',
      };
    } else if (type === 'HEIGHT_CORRIDOR_CANDIDATE') {
      const lower = ah.max < bh.min ? a : b;
      const upper = lower === a ? b : a;
      const boundary = midpointBetween(lower.measuredEnvelope.height.max, upper.measuredEnvelope.height.min);
      corridor.fuzzPlan = {
        axis: 'height',
        candidateBoundaryPx: boundary,
        values: integerFuzz(boundary),
        representativeCrossAxisPx: overlapCenter(aw, bw) ?? envelopeCenter(aw),
        note: 'Candidate test center only; not a final CSS breakpoint.',
      };
    } else if (type === 'TWO_AXIS_CORRIDOR_CANDIDATE') {
      corridor.fuzzPlan = {
        axis: 'two-axis',
        candidateWidthCenterPx: aw.max < bw.min ? midpointBetween(aw.max, bw.min) : midpointBetween(bw.max, aw.min),
        candidateHeightCenterPx: ah.max < bh.min ? midpointBetween(ah.max, bh.min) : midpointBetween(bh.max, ah.min),
        note: 'No single-axis breakpoint is justified by the measured envelopes. Requires synthetic two-axis probes before choosing a boundary.',
      };
    } else {
      corridor.fuzzPlan = {
        axis: 'overlap-review',
        note: 'Measured envelopes overlap in both axes; do not derive a breakpoint from geometry alone.',
      };
    }
    boundaryCorridors.push(corridor);
  }
}

const corridorTypeCounts = {};
for (const c of boundaryCorridors) corridorTypeCounts[c.type] = (corridorTypeCounts[c.type] || 0) + 1;
const singleAxisFuzzableCorridors = boundaryCorridors.filter((c) =>
  ['WIDTH_CORRIDOR_CANDIDATE', 'HEIGHT_CORRIDOR_CANDIDATE'].includes(c.type)
).length;

const output = {
  artifactType: 'hero-v2-base-boundary-analysis',
  generatedAt: new Date().toISOString(),
  sources: {
    heroCss: path.relative(root, cssPath).replaceAll('\\', '/'),
    inventory: path.relative(root, inventoryPath).replaceAll('\\', '/'),
    coverage: path.relative(root, coveragePath).replaceAll('\\', '/'),
    candidates: path.relative(root, candidatesPath).replaceAll('\\', '/'),
    architecture: path.relative(root, architecturePath).replaceAll('\\', '/'),
  },
  methodology: {
    scope: 'Hero.css only. This pass adds Hero base declarations to the measured media-query cascade and normalizes semantically equivalent selector whitespace around combinators.',
    selectorNormalization: 'Whitespace around >, +, ~ and commas is normalized. This is not a full CSS specificity engine.',
    baseModel: 'Exact normalized selector/property declarations before the first Hero @media block are applied first, followed by matching media queries in source order.',
    boundaryWarning: 'Boundary corridors and fuzz centers are test proposals only. They are not final @media min/max values.',
    externalWarning: 'Values absent from Hero.css may still come from browser initial values, SVG attributes, inheritance, other stylesheets, or inline styles. They remain marked implicit/external.',
  },
  summary: {
    baseRuleCount: baseRules.length,
    baseDeclarationCount,
    uniqueBaseSelectorPropertyKeys: baseMap.size,
    selectorNormalizationCollisionGroups: selectorNormalizationCollisions.length,
    measuredBehaviorCandidates: candidateArtifact.candidates?.length || 0,
    normalizedFullStyleBehaviorSignatures: uniqueNormalizedBehaviorSignatures,
    inconsistentCandidateGroupsAfterNormalization: candidateInternalConsistency.filter((x) => !x.consistent).length,
    previousBaseDependencyReviewPairs: previousBaseDependencyPairs.length,
    newlyResolvedSafeMergePairs: newlyResolvedSafeMergePairs.length,
    remainingImplicitOrExternalReviewPairs: remainingImplicitReviewPairs.length,
    normalizedNearPairs: normalizedNearPairs.length,
    normalizedRecommendationCounts: baseAwareRecommendationCounts,
    provisionalBaseGroupsFromStep8: architecture.provisionalBaseGroups?.length || 0,
    potentialBaseGroupCountAfterValidatedNewSafeMerges: Math.max(0, (architecture.provisionalBaseGroups?.length || 0) - newlyResolvedSafeMergePairs.length),
    boundaryCorridors: boundaryCorridors.length,
    singleAxisFuzzableCorridors,
    corridorTypeCounts,
    uncoveredGapGroupsStillPending: architecture.uncoveredGapGroups?.length || 0,
  },
  baseInventory: {
    rules: baseRules,
    selectorNormalizationCollisions,
  },
  candidateInternalConsistency,
  normalizedNearPairs,
  previousBaseDependencyResolution: baseDependencyResolution,
  newlyResolvedSafeMergePairs,
  remainingImplicitOrExternalReviewPairs: remainingImplicitReviewPairs,
  boundaryCorridors,
  uncoveredGapGroupsStillPending: architecture.uncoveredGapGroups || [],
};

fs.mkdirSync(auditDir, { recursive: true });
const jsonPath = path.join(auditDir, 'hero-v2-base-boundary-analysis.json');
const mdPath = path.join(auditDir, 'hero-v2-base-boundary-analysis.md');
fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);

function esc(v) { return String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
function fmtRange(r) { return r.min === r.max ? String(r.min) : `${r.min}–${r.max}`; }
function fmtEnvelope(e) { return `${fmtRange(e.width)} × ${fmtRange(e.height)}`; }

const md = [];
md.push('# Hero V2 Base + Boundary Analysis', '');
md.push(`Generated: ${output.generatedAt}`, '');
md.push('> **Hero-only analysis. No CSS is modified. Boundary centers are synthetic QA targets, not final breakpoints.**', '');
md.push('## Summary', '');
md.push(`- Hero base rules before first @media: **${output.summary.baseRuleCount}**`);
md.push(`- Raw Hero base declarations: **${output.summary.baseDeclarationCount}**`);
md.push(`- Unique normalized base selector/property keys: **${output.summary.uniqueBaseSelectorPropertyKeys}**`);
md.push(`- Semantically equivalent selector spelling groups found: **${output.summary.selectorNormalizationCollisionGroups}**`);
md.push(`- Measured behavior candidates: **${output.summary.measuredBehaviorCandidates}**`);
md.push(`- Normalized full-style behavior signatures: **${output.summary.normalizedFullStyleBehaviorSignatures}**`);
md.push(`- Step-8 base-dependency review pairs: **${output.summary.previousBaseDependencyReviewPairs}**`);
md.push(`- Newly resolved safe-merge opportunities: **${output.summary.newlyResolvedSafeMergePairs}**`);
md.push(`- Remaining implicit/external review pairs: **${output.summary.remainingImplicitOrExternalReviewPairs}**`);
md.push(`- Step-8 provisional base groups: **${output.summary.provisionalBaseGroupsFromStep8}**`);
md.push(`- Potential base-group count after validating the newly resolved merges: **${output.summary.potentialBaseGroupCountAfterValidatedNewSafeMerges}**`);
md.push(`- Adjacent base-group boundary corridors: **${output.summary.boundaryCorridors}**`);
md.push(`- Single-axis corridors ready for B±2 fuzz planning: **${output.summary.singleAxisFuzzableCorridors}**`);
md.push(`- Uncovered gap groups still pending layout validation: **${output.summary.uncoveredGapGroupsStillPending}**`, '');

md.push('### Normalized near-pair recommendations', '');
for (const [k, v] of Object.entries(output.summary.normalizedRecommendationCounts).sort()) md.push(`- ${k}: **${v}**`);
md.push('');

md.push('## Selector normalization findings', '');
if (!selectorNormalizationCollisions.length) {
  md.push('No equivalent selector spelling variants were found.');
} else {
  md.push('| Normalized selector | Spellings found |', '|---|---|');
  for (const item of selectorNormalizationCollisions) {
    md.push(`| \`${esc(item.normalizedSelector)}\` | ${item.variants.map((x) => `\`${esc(x)}\``).join(', ')} |`);
  }
}
md.push('');
md.push('This matters because whitespace around a child combinator does **not** create a different CSS selector. Earlier literal-selector analysis intentionally did not normalize this; this pass corrects that limitation before breakpoint boundaries are chosen.', '');

md.push('## Step-8 base-dependency pairs after base + selector normalization', '');
md.push('| Pair | Previous diffs | Full-style diffs | Remaining implicit/external | New recommendation |', '|---|---:|---:|---:|---|');
for (const p of baseDependencyResolution) {
  md.push(`| ${p.a} ↔ ${p.b} | ${p.previousDifferenceCount} | ${p.normalizedFullStyleDifferenceCount} | ${p.remainingImplicitOrExternalDiffCount} | ${p.recommendation} |`);
}
md.push('');
for (const p of baseDependencyResolution) {
  md.push(`### ${p.a} ↔ ${p.b}`, '');
  if (!p.differences.length) md.push('- No resolved full-style differences remain.', '');
  else {
    md.push('| Selector | Property | A | B | A source | B source |', '|---|---|---|---|---|---|');
    for (const d of p.differences) {
      md.push(`| \`${esc(d.selector)}\` | \`${esc(d.property)}\` | ${esc(d.from)} | ${esc(d.to)} | ${esc(d.fromSource)} | ${esc(d.toSource)} |`);
    }
    md.push('');
  }
}

md.push('## Candidate breakpoint corridors', '');
md.push('> These corridors describe where synthetic QA should probe **between** measured behavior groups. They are not final CSS ranges.', '');
md.push('| ID | Track | A | B | Type | A envelope | B envelope | W gap | H gap | Fuzz target |', '|---|---|---|---|---|---:|---:|---:|---:|---|');
for (const c of boundaryCorridors) {
  let fuzz = c.fuzzPlan?.axis || '—';
  if (c.fuzzPlan?.candidateBoundaryPx != null) fuzz += ` @ ${c.fuzzPlan.candidateBoundaryPx}px → [${c.fuzzPlan.values.join(', ')}]`;
  if (c.fuzzPlan?.axis === 'two-axis') fuzz += ` W≈${c.fuzzPlan.candidateWidthCenterPx}, H≈${c.fuzzPlan.candidateHeightCenterPx}`;
  md.push(`| ${c.id} | ${c.track} | ${c.a} | ${c.b} | ${c.type} | ${fmtEnvelope(c.aEnvelope)} | ${fmtEnvelope(c.bEnvelope)} | ${c.widthGap} | ${c.heightGap} | ${esc(fuzz)} |`);
}
md.push('');

md.push('### Corridor counts', '');
for (const [k, v] of Object.entries(corridorTypeCounts).sort()) md.push(`- ${k}: **${v}**`);
md.push('');

md.push('## Interpretation', '');
md.push('This pass deliberately does **not** edit Hero.css. It corrects one important analysis limitation (equivalent selector spellings), applies explicit Hero base declarations before media-query winners, narrows the Step-8 base-dependency uncertainty, and identifies where boundary fuzzing is meaningful. The next stage should inspect the remaining implicit/external dependency, review the actual base Hero structure and global section sizing that affect the Hero, and validate the four uncovered tablet work groups before final V2 @media ranges are written.');

fs.writeFileSync(mdPath, `${md.join('\n')}\n`);

console.log('Hero V2 base + boundary analysis generated.');
console.log(`Base rules: ${output.summary.baseRuleCount}`);
console.log(`Base declarations: ${output.summary.baseDeclarationCount}`);
console.log(`Unique base selector/property keys: ${output.summary.uniqueBaseSelectorPropertyKeys}`);
console.log(`Selector normalization collision groups: ${output.summary.selectorNormalizationCollisionGroups}`);
console.log(`Measured behavior candidates: ${output.summary.measuredBehaviorCandidates}`);
console.log(`Normalized full-style behavior signatures: ${output.summary.normalizedFullStyleBehaviorSignatures}`);
console.log(`Newly resolved safe-merge opportunities: ${output.summary.newlyResolvedSafeMergePairs}`);
console.log(`Remaining implicit/external review pairs: ${output.summary.remainingImplicitOrExternalReviewPairs}`);
console.log(`Boundary corridors: ${output.summary.boundaryCorridors}`);
console.log(`Single-axis fuzzable corridors: ${output.summary.singleAxisFuzzableCorridors}`);
console.log(`Corridor types: ${JSON.stringify(output.summary.corridorTypeCounts)}`);
console.log(`JSON: ${path.relative(root, jsonPath)}`);
console.log(`Markdown: ${path.relative(root, mdPath)}`);
