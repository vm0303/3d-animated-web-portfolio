#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const COMPOSITION_RUNNER = path.join(
  __dirname,
  "run-contact-composition-qa.cjs"
);
const FORM_STATE_RUNNER = path.join(
  __dirname,
  "run-contact-form-state-qa.cjs"
);

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const baseOutput = argValue(
  "output-dir",
  "qa-results/contact/portrait-pass"
);

const sharedScreenshotMode = argValue("screenshots", "bad");
const geometryScreenshotMode = argValue(
  "geometry-screenshots",
  sharedScreenshotMode
);
const formStateScreenshotMode = argValue(
  "form-state-screenshots",
  "bad"
);

const forwarded = process.argv
  .slice(2)
  .filter(
    (arg) =>
      !arg.startsWith("--output-dir=") &&
      !arg.startsWith("--screenshots=") &&
      !arg.startsWith("--geometry-screenshots=") &&
      !arg.startsWith("--form-state-screenshots=")
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

const formStateCode = run(
  "Contact mocked success / failure QA",
  FORM_STATE_RUNNER,
  "form-states",
  formStateScreenshotMode
);

if (geometryCode !== 0 || formStateCode !== 0) {
  process.exitCode = 1;
}
