#!/usr/bin/env node
"use strict";

/*
 * Visual-evidence wrapper for the unified Contact QA runner.
 *
 * The unified runner still tests, in one viewport lifecycle:
 * - geometry / settled motion
 * - success visual state
 * - error visual state
 * - all four cooldown visual states
 *
 * For screenshots=all this wrapper keeps the normal geometry capture as the
 * full Contact region, but captures success/error/cooldown from the form only.
 * Those seven raw captures are composed afterward into ONE evidence sheet per
 * viewport/browser by compose-contact-evidence-sheets.cjs.
 */

const fs = require("fs");
const path = require("path");
const Module = require("module");

const runnerPath = path.join(
  __dirname,
  "run-contact-unified-qa.cjs"
);

/* Normalize Windows CRLF so source patching is platform-independent. */
const source = fs
  .readFileSync(runnerPath, "utf8")
  .replace(/\r\n?/g, "\n");

const needle = '  await page.locator(".contact").screenshot({';
const replacement = [
  '  const screenshotTarget =',
  '    stateId === "geometry" ? ".contact" : ".contact form";',
  '',
  '  await page.locator(screenshotTarget).screenshot({',
].join("\n");

if (!source.includes(needle)) {
  throw new Error(
    "Unified Contact runner changed: screenshot target hook was not found."
  );
}

const patchedSource = source.replace(needle, replacement);

const runnerModule = new Module(runnerPath, module.parent);
runnerModule.filename = runnerPath;
runnerModule.paths = Module._nodeModulePaths(path.dirname(runnerPath));
runnerModule._compile(patchedSource, runnerPath);
