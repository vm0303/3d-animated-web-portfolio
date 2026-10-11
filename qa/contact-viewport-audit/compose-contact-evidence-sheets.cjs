#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function sanitize(value) {
  return String(value)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDataUrl(filePath) {
  return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function stateVerdict(record, stateId) {
  if (stateId === "geometry") {
    return record.geometry?.status || record.status || "UNKNOWN";
  }

  if (stateId === "success" || stateId === "error") {
    const hard = record.statusVisual?.states?.[stateId]?.hard || [];
    return hard.length ? "FAIL" : "PASS";
  }

  const hard = record.cooldownVisual?.states?.[stateId]?.hard || [];
  return hard.length ? "FAIL" : "PASS";
}

const STATE_ORDER = [
  ["geometry", "Normal / geometry"],
  ["success", "Success message"],
  ["error", "Failure message"],
  ["cooldown-3h00m", "Cooldown — 3h 0m"],
  ["cooldown-2h47m", "Cooldown — 2h 47m"],
  ["cooldown-8m", "Cooldown — 8m"],
  ["cooldown-5s", "Cooldown — 5s"],
];

const outputDir = path.resolve(argValue("output-dir"));
const reportPath = path.join(outputDir, "report.json");
const rawScreenshotsDir = path.join(outputDir, "screenshots");
const composedDir = path.join(outputDir, ".evidence-sheets-tmp");

if (!fs.existsSync(reportPath)) {
  throw new Error(`Missing Contact report: ${reportPath}`);
}
if (!fs.existsSync(rawScreenshotsDir)) {
  throw new Error(`Missing Contact screenshots: ${rawScreenshotsDir}`);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const records = Array.isArray(report.results) ? report.results : [];
const rawFiles = fs
  .readdirSync(rawScreenshotsDir)
  .filter((name) => name.toLowerCase().endsWith(".png"));

if (!records.length) {
  throw new Error("Contact report contains no viewport results.");
}

fs.rmSync(composedDir, { recursive: true, force: true });
fs.mkdirSync(composedDir, { recursive: true });

function rawFileFor(record, stateId) {
  const v = record.viewport;
  const suffix = [
    record.browser,
    sanitize(record.bucket),
    `${v.width}x${v.height}`,
    `${sanitize(v.id)}.png`,
  ].join("__");

  const matches = rawFiles.filter((name) => {
    const parts = name.split("__");
    return parts[1] === stateId && name.endsWith(`__${suffix}`);
  });

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one raw screenshot for ${record.browser} ${v.id} ${stateId}; found ${matches.length}.`
    );
  }

  return path.join(rawScreenshotsDir, matches[0]);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2300, height: 900 } });

  try {
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      const v = record.viewport;
      const portrait = v.height > v.width;

      process.stdout.write(
        `\rComposing Contact evidence ${index + 1}/${records.length} ${record.browser} ${v.id}`
      );

      const cards = STATE_ORDER.map(([stateId, label]) => ({
        stateId,
        label,
        verdict: stateVerdict(record, stateId),
        dataUrl: toDataUrl(rawFileFor(record, stateId)),
      }));

      const geometry = cards[0];
      const stateCards = cards.slice(1);
      const gridColumns = portrait ? 3 : 2;

      const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0b1020; color: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .sheet { width: 2240px; padding: 34px; margin: 0 auto; }
  .heading { margin-bottom: 24px; }
  .heading h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.15; }
  .meta { font-size: 22px; line-height: 1.35; opacity: 0.9; }
  .card { background: #121a2e; border: 1px solid rgba(255,255,255,.18); border-radius: 16px; padding: 16px; }
  .label { font-size: 22px; font-weight: 700; margin: 0 0 12px; }
  .label span { font-weight: 400; opacity: .8; }
  .geometry { margin-bottom: 24px; }
  .geometry img {
    display: block;
    width: ${portrait ? "1000px" : "100%"};
    max-width: 100%;
    height: auto;
    margin: 0 auto;
    background: #000;
  }
  .states {
    display: grid;
    grid-template-columns: repeat(${gridColumns}, minmax(0, 1fr));
    gap: 20px;
    align-items: start;
  }
  .states img { display: block; width: 100%; height: auto; background: #000; }
</style>
</head>
<body>
  <main class="sheet">
    <header class="heading">
      <h1>Contact exhaustive visual evidence</h1>
      <div class="meta">
        ${escapeHtml(record.browser)} · ${v.width}×${v.height} · ${escapeHtml(record.bucket)} · ${escapeHtml(v.id)} · overall ${escapeHtml(record.status)}
      </div>
    </header>

    <section class="card geometry">
      <div class="label">${escapeHtml(geometry.label)} <span>— ${escapeHtml(geometry.verdict)}</span></div>
      <img src="${geometry.dataUrl}" alt="Normal Contact geometry" />
    </section>

    <section class="states">
      ${stateCards
        .map(
          (card) => `
        <article class="card">
          <div class="label">${escapeHtml(card.label)} <span>— ${escapeHtml(card.verdict)}</span></div>
          <img src="${card.dataUrl}" alt="${escapeHtml(card.label)}" />
        </article>`
        )
        .join("")}
    </section>
  </main>
</body>
</html>`;

      await page.setContent(html, { waitUntil: "load" });
      await page.waitForFunction(() =>
        [...document.images].every((image) => image.complete && image.naturalWidth > 0)
      );

      const filename = [
        "EVIDENCE",
        record.status,
        record.browser,
        sanitize(record.bucket),
        `${v.width}x${v.height}`,
        sanitize(v.id),
      ].join("__") + ".png";

      await page.screenshot({
        path: path.join(composedDir, filename),
        fullPage: true,
      });
    }
  } finally {
    await browser.close();
  }

  process.stdout.write("\n");

  const finalCount = fs
    .readdirSync(composedDir)
    .filter((name) => name.toLowerCase().endsWith(".png")).length;

  if (finalCount !== records.length) {
    throw new Error(
      `Evidence sheet count mismatch: expected ${records.length}, got ${finalCount}. Raw screenshots were preserved.`
    );
  }

  fs.rmSync(rawScreenshotsDir, { recursive: true, force: true });
  fs.renameSync(composedDir, rawScreenshotsDir);

  const evidenceSummary = {
    generatedAt: new Date().toISOString(),
    viewportCount: records.length,
    evidenceSheetCount: finalCount,
    statesPerSheet: STATE_ORDER.map(([id]) => id),
    rule:
      "One PNG per viewport/browser containing normal geometry, success, failure, and all four cooldown visual states.",
  };

  fs.writeFileSync(
    path.join(outputDir, "evidence-summary.json"),
    JSON.stringify(evidenceSummary, null, 2)
  );

  process.stdout.write(
    `Composed ${finalCount} Contact evidence sheets in ${rawScreenshotsDir}\n`
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
