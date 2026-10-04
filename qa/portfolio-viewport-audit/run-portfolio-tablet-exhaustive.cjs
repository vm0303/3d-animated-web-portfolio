#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const MAIN_RUNNER = path.join(__dirname, "run-portfolio-composition-qa.cjs");

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
  argValue("output-root", `qa-results/portfolio/tablet/${browser}`)
);

if (!["all", "portrait", "landscape"].includes(mode)) {
  throw new Error("--orientation must be all, portrait, or landscape");
}

if (!["chromium", "firefox", "webkit"].includes(browser)) {
  throw new Error("--browser must be chromium, firefox, or webkit");
}

const runs = [];

if (mode === "all" || mode === "portrait") {
  runs.push({
    orientation: "portrait",
    family: "tablet-portrait",
    outputDir: path.join(outputRoot, "portrait"),
    candidate:
      "qa/portfolio-viewport-audit/candidates/portfolio-tablet-portrait-v1.css"
  });
}

if (mode === "all" || mode === "landscape") {
  runs.push({
    orientation: "landscape",
    family: "tablet-landscape",
    outputDir: path.join(outputRoot, "landscape"),
    candidate:
      "qa/portfolio-viewport-audit/candidates/portfolio-tablet-landscape-v1.css"
  });
}

function runMain(config) {
  fs.mkdirSync(config.outputDir, { recursive: true });

  const args = [
    MAIN_RUNNER,
    `--family=${config.family}`,
    `--orientation=${config.orientation}`,
    "--project=all",
    `--screenshots=${screenshots}`,
    `--browser=${browser}`,
    `--override-css=${config.candidate}`,
    `--output-dir=${path.relative(ROOT, config.outputDir)}`
  ];

  console.log(`\n=== Tablet ${config.orientation} / ${browser} ===`);

  const child = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit"
  });

  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(
      `Base Portfolio runner failed for tablet ${config.orientation} with exit code ${child.status}`
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

function near(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function isLeftAligned(value) {
  return ["left", "start"].includes(String(value || "").toLowerCase());
}

function validatePortrait(result) {
  const m = result.metrics;
  const issues = [];

  if (!m.portfolio || !m.image || !m.title || !m.body || !m.button) {
    issues.push("MISSING_REQUIRED_GEOMETRY");
    return issues;
  }

  const p = m.portfolio;
  const xTolerance = Math.max(16, p.width * 0.055);

  if (!near(centerX(m.image), centerX(p), xTolerance)) {
    issues.push("TABLET_PORTRAIT_IMAGE_NOT_CENTERED");
  }

  if (m.image.bottom > m.title.top + 2) {
    issues.push("TABLET_PORTRAIT_IMAGE_TITLE_ORDER");
  }

  if (m.title.bottom > m.body.top + 2) {
    issues.push("TABLET_PORTRAIT_TITLE_TEXT_ORDER");
  }

  if (m.body.bottom > m.button.top + 2) {
    issues.push("TABLET_PORTRAIT_TEXT_BUTTON_ORDER");
  }

  if (!isLeftAligned(m.bodyTextAlign)) {
    issues.push("TABLET_PORTRAIT_PARAGRAPH_NOT_LEFT_ALIGNED");
  }

  if (!near(centerX(m.button), centerX(p), xTolerance)) {
    issues.push("TABLET_PORTRAIT_BUTTON_NOT_CENTERED");
  }

  if (
    m.leftArrowDisplay !== "none" ||
    m.rightArrowDisplay !== "none"
  ) {
    issues.push("TABLET_ARROWS_VISIBLE");
  }

  /*
   * Large tablet portraits must visibly scale beyond phone geometry.
   * These are floors, not target sizes; manual screenshot review still wins.
   */
  if (p.width >= 900) {
    if (m.image.width < 540) {
      issues.push("TABLET_PORTRAIT_LARGE_IMAGE_UNDERSCALED");
    }
    if (m.titleFont < 44) {
      issues.push("TABLET_PORTRAIT_LARGE_TITLE_UNDERSCALED");
    }
    if (m.bodyFont < 18) {
      issues.push("TABLET_PORTRAIT_LARGE_BODY_UNDERSCALED");
    }
    if (m.buttonFont < 15) {
      issues.push("TABLET_PORTRAIT_LARGE_BUTTON_UNDERSCALED");
    }
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
  const halfTolerance = Math.max(12, p.width * 0.035);
  const xCenterTolerance = Math.max(24, p.width * 0.1);
  const yCenterTolerance = Math.max(18, p.height * 0.12);
  const columnTolerance = Math.max(8, p.width * 0.012);

  if (!near(centerX(m.image), leftHalfCenterX, xCenterTolerance)) {
    issues.push("TABLET_LANDSCAPE_IMAGE_NOT_CENTERED_IN_LEFT_HALF");
  }

  if (!near(centerY(m.image), centerY(p), yCenterTolerance)) {
    issues.push("TABLET_LANDSCAPE_IMAGE_NOT_VERTICALLY_CENTERED");
  }

  if (m.image.right > midpointX + halfTolerance) {
    issues.push("TABLET_LANDSCAPE_IMAGE_ESCAPES_LEFT_HALF");
  }

  if (
    m.title.left < midpointX - halfTolerance ||
    m.body.left < midpointX - halfTolerance ||
    m.button.left < midpointX - halfTolerance
  ) {
    issues.push("TABLET_LANDSCAPE_RIGHT_COLUMN_NOT_IN_RIGHT_HALF");
  }

  if (
    !near(m.title.left, m.body.left, columnTolerance) ||
    !near(m.title.left, m.button.left, columnTolerance)
  ) {
    issues.push("TABLET_LANDSCAPE_RIGHT_COLUMN_NOT_LEFT_ALIGNED");
  }

  if (!isLeftAligned(m.bodyTextAlign)) {
    issues.push("TABLET_LANDSCAPE_PARAGRAPH_NOT_LEFT_ALIGNED");
  }

  if (m.title.bottom > m.body.top + 2) {
    issues.push("TABLET_LANDSCAPE_TITLE_TEXT_ORDER");
  }

  if (m.body.bottom > m.button.top + 2) {
    issues.push("TABLET_LANDSCAPE_TEXT_BUTTON_ORDER");
  }

  if (
    m.leftArrowDisplay !== "none" ||
    m.rightArrowDisplay !== "none"
  ) {
    issues.push("TABLET_ARROWS_VISIBLE");
  }

  /* Larger tablet landscapes should not look like stretched phone cards. */
  if (p.width >= 1300) {
    if (m.image.width < 430) {
      issues.push("TABLET_LANDSCAPE_LARGE_IMAGE_UNDERSCALED");
    }
    if (m.titleFont < 40) {
      issues.push("TABLET_LANDSCAPE_LARGE_TITLE_UNDERSCALED");
    }
    if (m.bodyFont < 16) {
      issues.push("TABLET_LANDSCAPE_LARGE_BODY_UNDERSCALED");
    }
    if (m.buttonFont < 15) {
      issues.push("TABLET_LANDSCAPE_LARGE_BUTTON_UNDERSCALED");
    }
  }

  return issues;
}

const ignoredBaseArrowIssues = new Set([
  "LEFTARROW_OUTSIDE_PORTFOLIO",
  "RIGHTARROW_OUTSIDE_PORTFOLIO",
  "MISSING_LEFTARROW",
  "MISSING_RIGHTARROW"
]);

function validateReport(config) {
  const reportPath = path.join(config.outputDir, "report.json");
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Missing report: ${reportPath}`);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

  const validated = report.results.map((result) => {
    const requirementIssues =
      config.orientation === "portrait"
        ? validatePortrait(result)
        : validateLandscape(result);

    const baseIssues = (result.hard || []).filter(
      (issue) => !ignoredBaseArrowIssues.has(issue)
    );

    const issues = [...new Set([...baseIssues, ...requirementIssues])];

    return {
      viewport: result.viewport,
      bucket: result.bucket,
      project: result.project,
      baseStatus: result.status,
      baseReview: result.review || [],
      requirementIssues,
      ignoredBaseArrowIssues: (result.hard || []).filter((issue) =>
        ignoredBaseArrowIssues.has(issue)
      ),
      issues,
      status: issues.length ? "FAIL" : "PASS"
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
    baseReviewCount: validated.filter((r) => r.baseReview.length > 0).length
  };

  const contract =
    config.orientation === "portrait"
      ? [
          "image -> title -> text -> button",
          "image centered",
          "paragraph left aligned",
          "button centered",
          "large tablet components scale up",
          "no tablet arrows"
        ]
      : [
          "image left; title -> text -> button right",
          "image centered vertically in left half",
          "right column left aligned",
          "paragraph left aligned",
          "large tablet components scale up",
          "no tablet arrows"
        ];

  fs.writeFileSync(
    path.join(config.outputDir, "requirements-report.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), contract, summary, results: validated },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(config.outputDir, "requirements-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\nTablet ${config.orientation} requirement summary:`);
  console.log(JSON.stringify(summary, null, 2));

  return summary;
}

let failed = false;
const aggregate = [];

for (const config of runs) {
  const summary = runMain(config);
  aggregate.push(summary);
  if (summary.fail > 0) failed = true;
}

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(
  path.join(outputRoot, "tablet-summary.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      browser,
      runs: aggregate
    },
    null,
    2
  )
);

if (failed) process.exitCode = 1;
