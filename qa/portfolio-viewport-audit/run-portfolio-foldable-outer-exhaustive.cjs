#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const MAIN_RUNNER = path.join(
  __dirname,
  "run-portfolio-composition-qa.cjs"
);

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const mode = argValue("orientation", "all");
const browser = argValue("browser", "chromium");
const screenshots = argValue("screenshots", "all");
const outputRoot = path.resolve(
  ROOT,
  argValue(
    "output-root",
    `qa-results/portfolio/foldable-outer/${browser}`
  )
);

if (!["all", "portrait", "landscape"].includes(mode)) {
  throw new Error(
    "--orientation must be all, portrait, or landscape"
  );
}

if (!["chromium", "firefox", "webkit"].includes(browser)) {
  throw new Error(
    "--browser must be chromium, firefox, or webkit"
  );
}

const runs = [];

if (mode === "all" || mode === "portrait") {
  runs.push({
    orientation: "portrait",
    outputDir: path.join(outputRoot, "portrait"),
    candidate:
      "qa/portfolio-viewport-audit/candidates/portfolio-foldable-portrait-v2.css",
    postureFilter: "--max-width=500"
  });
}

if (mode === "all" || mode === "landscape") {
  runs.push({
    orientation: "landscape",
    outputDir: path.join(outputRoot, "landscape"),
    candidate:
      "qa/portfolio-viewport-audit/candidates/portfolio-foldable-outer-landscape-v1.css",
    postureFilter: "--max-height=500"
  });
}

function runMain(config) {
  fs.mkdirSync(config.outputDir, { recursive: true });

  const args = [
    MAIN_RUNNER,
    "--family=foldable",
    `--orientation=${config.orientation}`,
    config.postureFilter,
    "--project=all",
    `--screenshots=${screenshots}`,
    `--browser=${browser}`,
    "--interaction-check",
    `--override-css=${config.candidate}`,
    `--output-dir=${path.relative(ROOT, config.outputDir)}`
  ];

  console.log(
    `\n=== Folded/outer foldable ${config.orientation} / ${browser} ===`
  );

  const child = spawnSync(
    process.execPath,
    args,
    {
      cwd: ROOT,
      stdio: "inherit"
    }
  );

  if (child.error) {
    throw child.error;
  }

  if (child.status !== 0) {
    throw new Error(
      `Base Portfolio runner failed for foldable ${config.orientation} with exit code ${child.status}`
    );
  }

  return validateReport(config);
}

function centerX(rect) {
  return rect.left + rect.width / 2;
}

function centerY(rect) {
  return rect.top + rect.height / 2;
}

function isSingleLine(metrics) {
  return (
    metrics.title &&
    metrics.titleLineHeight > 0 &&
    metrics.title.height <= metrics.titleLineHeight * 1.2
  );
}

function isLeftAligned(value) {
  return ["left", "start"].includes(
    String(value || "").toLowerCase()
  );
}

function near(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function validatePortrait(result) {
  const m = result.metrics;
  const issues = [];

  if (!m.portfolio || !m.image || !m.title || !m.body || !m.button) {
    issues.push("MISSING_REQUIRED_GEOMETRY");
    return issues;
  }

  const width = m.portfolio.width;
  const xTolerance = Math.max(12, width * 0.08);
  const portfolioCenter = centerX(m.portfolio);

  if (!near(centerX(m.image), portfolioCenter, xTolerance)) {
    issues.push("PORTRAIT_IMAGE_NOT_CENTERED");
  }

  if (!isSingleLine(m)) {
    issues.push("PORTRAIT_TITLE_WRAPPED");
  }

  if (!isLeftAligned(m.bodyTextAlign)) {
    issues.push("PORTRAIT_PARAGRAPH_NOT_LEFT_ALIGNED");
  }

  if (!near(centerX(m.button), portfolioCenter, xTolerance)) {
    issues.push("PORTRAIT_BUTTON_NOT_CENTERED");
  }

  if (m.image.bottom > m.title.top + 2) {
    issues.push("PORTRAIT_IMAGE_TITLE_ORDER");
  }

  if (m.title.bottom > m.body.top + 2) {
    issues.push("PORTRAIT_TITLE_TEXT_ORDER");
  }

  if (m.body.bottom > m.button.top + 2) {
    issues.push("PORTRAIT_TEXT_BUTTON_ORDER");
  }

  if (
    m.leftArrowDisplay !== "none" ||
    m.rightArrowDisplay !== "none"
  ) {
    issues.push("FOLDABLE_ARROWS_VISIBLE");
  }

  return issues;
}

function validateLandscape(result) {
  const m = result.metrics;
  const issues = [];

  if (!m.portfolio || !m.image || !m.title || !m.body || !m.button) {
    issues.push("MISSING_REQUIRED_GEOMETRY");
    return issues;
  }

  const p = m.portfolio;
  const midpointX = p.left + p.width / 2;
  const leftHalfCenterX = p.left + p.width / 4;
  const pCenterY = centerY(p);

  const horizontalCenterTolerance = Math.max(18, p.width * 0.12);
  const verticalCenterTolerance = Math.max(14, p.height * 0.14);
  const halfBoundaryTolerance = Math.max(8, p.width * 0.035);
  const columnAlignTolerance = Math.max(6, p.width * 0.012);

  if (
    !near(
      centerX(m.image),
      leftHalfCenterX,
      horizontalCenterTolerance
    )
  ) {
    issues.push("LANDSCAPE_IMAGE_NOT_CENTERED_IN_LEFT_HALF");
  }

  if (
    !near(
      centerY(m.image),
      pCenterY,
      verticalCenterTolerance
    )
  ) {
    issues.push("LANDSCAPE_IMAGE_NOT_VERTICALLY_CENTERED");
  }

  if (m.image.right > midpointX + halfBoundaryTolerance) {
    issues.push("LANDSCAPE_IMAGE_ESCAPES_LEFT_HALF");
  }

  if (!isSingleLine(m)) {
    issues.push("LANDSCAPE_TITLE_WRAPPED");
  }

  if (
    m.title.left < midpointX - halfBoundaryTolerance ||
    m.body.left < midpointX - halfBoundaryTolerance ||
    m.button.left < midpointX - halfBoundaryTolerance
  ) {
    issues.push("LANDSCAPE_RIGHT_COLUMN_NOT_IN_RIGHT_HALF");
  }

  if (
    !near(m.title.left, m.body.left, columnAlignTolerance) ||
    !near(m.title.left, m.button.left, columnAlignTolerance)
  ) {
    issues.push("LANDSCAPE_RIGHT_COLUMN_NOT_LEFT_ALIGNED");
  }

  if (!isLeftAligned(m.bodyTextAlign)) {
    issues.push("LANDSCAPE_PARAGRAPH_NOT_LEFT_ALIGNED");
  }

  if (m.title.bottom > m.body.top + 2) {
    issues.push("LANDSCAPE_TITLE_TEXT_ORDER");
  }

  if (m.body.bottom > m.button.top + 2) {
    issues.push("LANDSCAPE_TEXT_BUTTON_ORDER");
  }

  if (
    m.leftArrowDisplay !== "none" ||
    m.rightArrowDisplay !== "none"
  ) {
    issues.push("FOLDABLE_ARROWS_VISIBLE");
  }

  return issues;
}

function validateReport(config) {
  const reportPath = path.join(config.outputDir, "report.json");

  if (!fs.existsSync(reportPath)) {
    throw new Error(
      `Missing report: ${reportPath}`
    );
  }

  const report = JSON.parse(
    fs.readFileSync(reportPath, "utf8")
  );

  const validated = report.results.map((result) => {
    const requirementIssues =
      config.orientation === "portrait"
        ? validatePortrait(result)
        : validateLandscape(result);

    const baseIssues = [
      ...(result.hard || [])
    ];

    const allIssues = [
      ...new Set([
        ...baseIssues,
        ...requirementIssues
      ])
    ];

    return {
      viewport: result.viewport,
      project: result.project,
      baseStatus: result.status,
      baseReview: result.review || [],
      requirementIssues,
      issues: allIssues,
      status: allIssues.length ? "FAIL" : "PASS"
    };
  });

  const summary = {
    orientation: config.orientation,
    browser,
    viewportCount: report.summary.viewportCount,
    projectCount: report.summary.projectCount,
    total: validated.length,
    pass: validated.filter((r) => r.status === "PASS").length,
    fail: validated.filter((r) => r.status === "FAIL").length,
    baseReviewCount: validated.filter(
      (r) => (r.baseReview || []).length > 0
    ).length,
    interactionCheck: report.summary.interactionCheck
  };

  fs.writeFileSync(
    path.join(config.outputDir, "requirements-report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        contract:
          config.orientation === "portrait"
            ? [
                "image centered",
                "title one line",
                "paragraph left aligned",
                "button centered",
                "image -> title -> text -> button",
                "no foldable arrows"
              ]
            : [
                "image centered vertically in left half",
                "title one line in right half",
                "title/text/button left aligned",
                "paragraph left aligned",
                "title -> text -> button",
                "no foldable arrows"
              ],
        summary,
        results: validated
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(config.outputDir, "requirements-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(
    `\nFoldable ${config.orientation} requirement summary:`
  );
  console.log(JSON.stringify(summary, null, 2));

  return summary;
}

let failed = false;
const aggregate = [];

for (const config of runs) {
  const summary = runMain(config);
  aggregate.push(summary);

  if (summary.fail > 0) {
    failed = true;
  }

  const interaction = summary.interactionCheck;
  if (
    interaction &&
    (
      !interaction.nextLoop ||
      !interaction.prevLoop ||
      !interaction.keyboard ||
      !interaction.controlsHiddenInitially ||
      !interaction.controlsStayHiddenOnPhone
    )
  ) {
    failed = true;
  }
}

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(
  path.join(outputRoot, "foldable-outer-summary.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      browser,
      posture: "folded/outer",
      definition:
        "Folded/outer = short edge <= 500 CSS px (portrait width <= 500; landscape height <= 500)",
      runs: aggregate
    },
    null,
    2
  )
);

if (failed) {
  process.exitCode = 1;
}
