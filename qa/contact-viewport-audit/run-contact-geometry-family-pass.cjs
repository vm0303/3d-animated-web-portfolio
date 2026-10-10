#!/usr/bin/env node
"use strict";

/*
 * Production Contact family / closure pass.
 *
 * Geometry/motion, success/error visuals, and all cooldown visual states run
 * in ONE page lifecycle per viewport through the unified runner.
 *
 * --browser=all runs Chromium, Firefox, and WebKit sequentially from this one
 * command. With --screenshots=all, each engine writes exactly ONE settled
 * normal-state Contact screenshot per viewport; success/error/cooldown remain
 * fully tested and recorded in the same report without multiplying PNG output.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(
  __dirname,
  "run-contact-unified-visual-evidence-qa.cjs"
);

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const requestedBrowser = argValue("browser", "chromium");
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
      "With --screenshots=all: one settled geometry PNG per viewport per browser.",
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
