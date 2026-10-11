#!/usr/bin/env node
"use strict";

/*
 * Production Contact family / closure pass.
 *
 * Geometry/motion, success/error visuals, and all cooldown visual states run
 * in ONE page lifecycle per viewport through the unified runner.
 *
 * --browser=all runs Chromium, Firefox, and WebKit sequentially from this one
 * command. With --screenshots=all, each engine finishes with exactly ONE PNG
 * per viewport. That PNG is an evidence sheet containing:
 * - the settled normal Contact composition;
 * - success;
 * - failure;
 * - cooldown 3h 0m;
 * - cooldown 2h 47m;
 * - cooldown 8m;
 * - cooldown 5s.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(
  __dirname,
  "run-contact-unified-visual-evidence-qa.cjs"
);
const COMPOSER = path.join(
  __dirname,
  "compose-contact-evidence-sheets.cjs"
);

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const requestedBrowser = argValue("browser", "chromium");
const screenshotMode = argValue("screenshots", "bad");
const baseOutput = argValue(
  "output-dir",
  "qa-results/contact/geometry-family-pass"
);
const basePort = Number(argValue("port", "4194"));

const browsers =
  requestedBrowser === "all"
    ? ["chromium", "firefox", "webkit"]
    : [requestedBrowser];

for (const browser of browsers) {
  if (!["chromium", "firefox", "webkit"].includes(browser)) {
    throw new Error(
      `Unsupported browser: ${browser}. Use chromium, firefox, webkit, or all.`
    );
  }
}

const multiBrowser = browsers.length > 1;

const forwarded = process.argv
  .slice(2)
  .filter(
    (arg) =>
      !arg.startsWith("--browser=") &&
      !arg.startsWith("--output-dir=") &&
      !arg.startsWith("--port=")
  );

const baseOutputAbs = path.resolve(ROOT, baseOutput);
fs.mkdirSync(baseOutputAbs, { recursive: true });

const engineResults = [];
let failed = false;

for (let index = 0; index < browsers.length; index++) {
  const browser = browsers[index];
  const engineOutputAbs = multiBrowser
    ? path.join(baseOutputAbs, browser)
    : baseOutputAbs;
  const port = basePort + index;

  process.stdout.write(
    `\n============================================================\n` +
      `Contact exhaustive QA — ${browser}\n` +
      `============================================================\n`
  );

  const result = spawnSync(
    process.execPath,
    [
      RUNNER,
      ...forwarded,
      `--browser=${browser}`,
      `--port=${port}`,
      `--output-dir=${engineOutputAbs}`,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    }
  );

  const exitCode = result.error ? 1 : result.status ?? 1;
  if (result.error) {
    console.error(result.error);
  }
  if (exitCode !== 0) {
    failed = true;
  }

  const reportPath = path.join(engineOutputAbs, "report.json");

  /*
   * screenshots=all intentionally captures seven settled raw states while the
   * viewport is already loaded. Compose those into one reviewable PNG, then
   * remove the raw state files. The final screenshot count therefore remains
   * exactly one per viewport/browser.
   */
  if (screenshotMode === "all" && fs.existsSync(reportPath)) {
    process.stdout.write(
      `\nComposing one evidence sheet per ${browser} viewport...\n`
    );

    const composeResult = spawnSync(
      process.execPath,
      [COMPOSER, `--output-dir=${engineOutputAbs}`],
      {
        cwd: ROOT,
        stdio: "inherit",
        env: process.env,
      }
    );

    const composeExitCode =
      composeResult.error ? 1 : composeResult.status ?? 1;

    if (composeResult.error) {
      console.error(composeResult.error);
    }
    if (composeExitCode !== 0) {
      failed = true;
    }
  }

  const summaryPath = path.join(engineOutputAbs, "summary.json");
  let summary = null;

  if (fs.existsSync(summaryPath)) {
    try {
      summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    } catch (error) {
      console.error(`Could not read ${summaryPath}:`, error);
    }
  }

  const screenshotsDir = path.join(engineOutputAbs, "screenshots");
  const screenshotCount = fs.existsSync(screenshotsDir)
    ? fs
        .readdirSync(screenshotsDir, { withFileTypes: true })
        .filter(
          (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png")
        ).length
    : 0;

  engineResults.push({
    browser,
    exitCode,
    outputDir: engineOutputAbs,
    screenshotCount,
    summary,
  });
}

if (multiBrowser) {
  const combined = {
    generatedAt: new Date().toISOString(),
    browsers,
    expectedScreenshotRule:
      "With --screenshots=all: one composite evidence PNG per viewport/browser containing geometry, success, failure, and all four cooldown states.",
    totalViewportExecutions: engineResults.reduce(
      (sum, item) => sum + Number(item.summary?.viewportCount || 0),
      0
    ),
    totalScreenshots: engineResults.reduce(
      (sum, item) => sum + item.screenshotCount,
      0
    ),
    engines: engineResults,
  };

  fs.writeFileSync(
    path.join(baseOutputAbs, "combined-summary.json"),
    JSON.stringify(combined, null, 2)
  );

  process.stdout.write(
    `\nThree-engine Contact QA summary\n${JSON.stringify(
      combined,
      null,
      2
    )}\n`
  );
}

if (failed) {
  process.exitCode = 1;
}
