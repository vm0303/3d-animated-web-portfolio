const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const CSS_PATH = path.join(ROOT, 'src', 'components', 'hero', 'hero.css');
const OUT_DIR = path.join(ROOT, 'qa-results', 'viewport-audit');
const JSON_OUT = path.join(OUT_DIR, 'hero-media-inventory.json');
const MD_OUT = path.join(OUT_DIR, 'hero-media-inventory.md');

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function pxValue(condition, feature) {
  const escaped = feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = condition.match(new RegExp(`\\(${escaped}\\s*:\\s*([0-9.]+)px\\)`, 'i'));
  return match ? Number(match[1]) : null;
}

function orientationValue(condition) {
  const match = condition.match(/\(orientation\s*:\s*(portrait|landscape)\)/i);
  return match ? match[1].toLowerCase() : null;
}

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

    // The Hero media blocks currently contain ordinary selector blocks.
    // If nested at-rules are added later, keep the selector but do not
    // incorrectly parse nested declarations as direct declarations.
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

    rules.push({ selector, declarations });
    cursor = close + 1;
  }

  return rules;
}

function nearestComment(css, mediaStart) {
  const before = css.slice(0, mediaStart);
  const matches = [...before.matchAll(/\/\*[\s\S]*?\*\//g)];
  if (!matches.length) return null;
  return matches[matches.length - 1][0]
    .slice(2, -2)
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMediaBlocks(css) {
  const blocks = [];
  let cursor = 0;

  while (true) {
    const mediaStart = css.indexOf('@media', cursor);
    if (mediaStart === -1) break;

    const openBrace = css.indexOf('{', mediaStart);
    if (openBrace === -1) throw new Error('Found @media without opening brace.');

    const closeBrace = findMatchingBrace(css, openBrace);
    const condition = css
      .slice(mediaStart + '@media'.length, openBrace)
      .replace(/\s+/g, ' ')
      .trim();
    const body = css.slice(openBrace + 1, closeBrace);
    const rules = parseTopLevelRules(body);
    const declarations = rules.flatMap((rule) =>
      rule.declarations.map((declaration) => ({
        selector: rule.selector,
        ...declaration,
      })),
    );

    blocks.push({
      id: `MQ-${String(blocks.length + 1).padStart(2, '0')}`,
      startLine: lineNumberAt(css, mediaStart),
      endLine: lineNumberAt(css, closeBrace),
      condition,
      range: {
        minWidth: pxValue(condition, 'min-width'),
        maxWidth: pxValue(condition, 'max-width'),
        minHeight: pxValue(condition, 'min-height'),
        maxHeight: pxValue(condition, 'max-height'),
        orientation: orientationValue(condition),
      },
      precedingComment: nearestComment(css, mediaStart),
      selectors: [...new Set(rules.map((rule) => rule.selector).filter(Boolean))],
      properties: [...new Set(declarations.map((item) => item.property))].sort(),
      declarationCount: declarations.length,
      rules,
    });

    cursor = closeBrace + 1;
  }

  return blocks;
}

function fmt(value) {
  return value == null ? '—' : String(value);
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

if (!fs.existsSync(CSS_PATH)) {
  console.error(`Hero CSS not found: ${CSS_PATH}`);
  process.exit(1);
}

const css = fs.readFileSync(CSS_PATH, 'utf8');
const mediaBlocks = parseMediaBlocks(css);
const orientationCounts = mediaBlocks.reduce((acc, item) => {
  const key = item.range.orientation || 'unspecified';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const report = {
  artifactType: 'hero-media-query-inventory',
  generatedAt: new Date().toISOString(),
  source: path.relative(ROOT, CSS_PATH).replaceAll('\\', '/'),
  summary: {
    cssLines: css.replace(/\n$/, '').split('\n').length,
    mediaQueryCount: mediaBlocks.length,
    orientationCounts,
  },
  mediaQueries: mediaBlocks,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);

const md = [];
md.push('# Hero Media Query Inventory', '');
md.push(`Generated: ${report.generatedAt}`);
md.push(`Source: \`${report.source}\``);
md.push(`CSS lines: **${report.summary.cssLines}**`);
md.push(`Media queries: **${report.summary.mediaQueryCount}**`, '');
md.push('| ID | Lines | Orientation | Min W | Max W | Min H | Max H | Declarations | Condition |');
md.push('|---|---:|---|---:|---:|---:|---:|---:|---|');

for (const item of mediaBlocks) {
  md.push(
    `| ${item.id} | ${item.startLine}-${item.endLine} | ${fmt(item.range.orientation)} | ${fmt(item.range.minWidth)} | ${fmt(item.range.maxWidth)} | ${fmt(item.range.minHeight)} | ${fmt(item.range.maxHeight)} | ${item.declarationCount} | ${escapeCell(item.condition)} |`,
  );
}

md.push('', '## Selector/property details', '');
for (const item of mediaBlocks) {
  md.push(`### ${item.id} — line ${item.startLine}`);
  md.push('');
  md.push(`- Query: \`${item.condition}\``);
  md.push(`- Selectors: ${item.selectors.map((s) => `\`${s}\``).join(', ') || 'none'}`);
  md.push(`- Properties: ${item.properties.map((p) => `\`${p}\``).join(', ') || 'none'}`);
  if (item.precedingComment) md.push(`- Previous comment: ${item.precedingComment}`);
  md.push('');
}

fs.writeFileSync(MD_OUT, `${md.join('\n')}\n`);

console.log('Hero media-query inventory generated.');
console.log(`CSS lines: ${report.summary.cssLines}`);
console.log(`Media queries: ${report.summary.mediaQueryCount}`);
console.log(`Orientation counts: ${JSON.stringify(report.summary.orientationCounts)}`);
console.log(`JSON: ${path.relative(ROOT, JSON_OUT)}`);
console.log(`Markdown: ${path.relative(ROOT, MD_OUT)}`);
