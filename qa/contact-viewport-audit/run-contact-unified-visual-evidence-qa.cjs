#!/usr/bin/env node
"use strict";

/*
 * Final visual-evidence wrapper for the unified Contact QA runner.
 *
 * The unified runner still tests, in one viewport lifecycle:
 * - geometry / settled motion
 * - success visual state
 * - error visual state
 * - all four cooldown visual states
 *
 * For --screenshots=all, this wrapper limits file output to ONE settled
 * geometry screenshot per viewport. That keeps exhaustive manual evidence at
 * exactly one PNG per viewport/browser while all injected states are still
 * validated in report.json.
 */

const fs = require("fs");
const path = require("path");
const Module = require("module");

const runnerPath = path.join(
  __dirname,
  "run-contact-unified-qa.cjs"
);

/*
 * Git checkouts on Windows commonly use CRLF line endings. Normalize the
 * source before applying the small evidence-only screenshot hook so the
 * wrapper behaves identically on Windows, macOS, and Linux.
 */
const source = fs
  .readFileSync(runnerPath, "utf8")
  .replace(/\r\n?/g, "\n");

const needle = [
  "async function captureContact(page, stateId, status, v) {",
  "  if (!shouldScreenshot(status)) return;",
].join("\n");

const replacement = [
  "async function captureContact(page, stateId, status, v) {",
  "  /*",
  "   * Final exhaustive evidence keeps one settled normal-state screenshot",
  "   * per viewport/browser. Success/error/cooldown states are still tested",
  "   * in this same page lifecycle and remain fully recorded in report.json.",
  "   */",
  "  if (screenshotMode === \"all\" && stateId !== \"geometry\") return;",
  "  if (!shouldScreenshot(status)) return;",
].join("\n");

if (!source.includes(needle)) {
  throw new Error(
    "Unified Contact runner changed: screenshot hook target was not found."
  );
}

const patchedSource = source.replace(needle, replacement);

const runnerModule = new Module(runnerPath, module.parent);
runnerModule.filename = runnerPath;
runnerModule.paths = Module._nodeModulePaths(path.dirname(runnerPath));
runnerModule._compile(patchedSource, runnerPath);
