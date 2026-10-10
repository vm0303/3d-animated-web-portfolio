#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const COMPOSITION_RUNNER = path.join(
  __dirname,
  "run-contact-composition-qa.cjs"
);
const STATUS_VISUAL_RUNNER = path.join(
  __dirname,
  "run-contact-status-visual-qa.cjs"
);
const COOLDOWN_VISUAL_RUNNER = path.join(
  __dirname,
  "run-contact-cooldown-visual-qa.cjs"
);

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const baseOutput = argValue(
  "output-dir",
  "qa-results/contact/geometry-family-pass"
);

const sharedScreenshotMode = argValue("screenshots", "all");
const geometryScreenshotMode = argValue(
  "geometry-screenshots",
  sharedScreenshotMode
);
const statusScreenshotMode = argValue(
  "status-screenshots",
  sharedScreenshotMode
);
const cooldownScreenshotMode = argValue(
  "cooldown-screenshots",
  sharedScreenshotMode
);

const forwarded = process.argv
  .slice(2)
  .filter(
    (arg) =>
      !arg.startsWith("--output-dir=") &&
      !arg.startsWith("--screenshots=") &&
      !arg.startsWith("--geometry-screenshots=") &&
      !arg.startsWith("--status-screenshots=") &&
      !arg.startsWith("--cooldown-screenshots=")
  );

function run(label, runner, outputSuffix, screenshotMode) {
  process.stdout.write(`\n=== ${label} ===\n`);

  const result = spawnSync(
    process.execPath,
    [
      runner,
      ...forwarded,
      `--screenshots=${screenshotMode}`,
      `--output-dir=${path.join(baseOutput, outputSuffix)}`,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    }
  );

  if (result.error) {
    console.error(result.error);
    return 1;
  }

  return result.status ?? 1;
}

const geometryCode = run(
  "Contact geometry / motion QA",
  COMPOSITION_RUNNER,
  "geometry",
  geometryScreenshotMode
);

const statusCode = run(
  "Contact success / error visual QA (NO FORM SUBMISSION)",
  STATUS_VISUAL_RUNNER,
  "status-visual",
  statusScreenshotMode
);

const cooldownCode = run(
  "Contact cooldown countdown visual QA (NO FORM SUBMISSION)",
  COOLDOWN_VISUAL_RUNNER,
  "cooldown-visual",
  cooldownScreenshotMode
);

if (
  geometryCode !== 0 ||
  statusCode !== 0 ||
  cooldownCode !== 0
) {
  process.exitCode = 1;
}
