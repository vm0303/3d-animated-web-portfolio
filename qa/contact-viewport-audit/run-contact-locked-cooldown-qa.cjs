#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(
  __dirname,
  "run-contact-cooldown-visual-qa.cjs"
);

const browser =
  process.argv.find((arg) => arg.startsWith("--browser="))?.split("=")[1] ||
  "chromium";

const screenshots =
  process.argv.find((arg) => arg.startsWith("--screenshots="))?.split("=")[1] ||
  "all";

const cooldownState =
  process.argv.find((arg) => arg.startsWith("--cooldown-state="))?.split("=")[1] ||
  null;

const runs = [
  {
    label: "phone portrait",
    args: ["--family=phone-portrait", "--orientation=portrait"],
    output: "phone-portrait",
  },
  {
    label: "phone landscape",
    args: ["--family=phone-landscape", "--orientation=landscape"],
    output: "phone-landscape",
  },
  {
    label: "foldable portrait (outer + unfolded inner)",
    args: ["--family=foldable", "--orientation=portrait"],
    output: "foldable-portrait",
  },
  {
    label: "foldable landscape (outer + unfolded inner)",
    args: ["--family=foldable", "--orientation=landscape"],
    output: "foldable-landscape",
  },
  {
    label: "tablet portrait",
    args: ["--family=tablet-portrait", "--orientation=portrait"],
    output: "tablet-portrait",
  },
  {
    label: "tablet landscape",
    args: ["--family=tablet-landscape", "--orientation=landscape"],
    output: "tablet-landscape",
  },
];

let failed = false;

for (const run of runs) {
  process.stdout.write(`\n=== Locked Contact cooldown: ${run.label} ===\n`);

  const args = [
    RUNNER,
    ...run.args,
    `--browser=${browser}`,
    `--screenshots=${screenshots}`,
    `--output-dir=${path.join(
      "qa-results/contact/locked-cooldown",
      run.output
    )}`,
  ];

  if (cooldownState) {
    args.push(`--cooldown-state=${cooldownState}`);
  }

  const result = spawnSync(
    process.execPath,
    args,
    {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    }
  );

  if (result.error || result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
}
