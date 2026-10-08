#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium, firefox, webkit } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const CONTRACT_PATH = path.join(__dirname, "contact-composition-contract.json");
const VIEWPORT_PATH = path.join(
  ROOT,
  "qa/viewport-audit/hero-cross-browser-exhaustive-contract.json"
);

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8"));
const viewportContract = JSON.parse(fs.readFileSync(VIEWPORT_PATH, "utf8"));

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function numArg(name) {
  const value = argValue(name);
  return value == null ? null : Number(value);
}

const family = argValue("family", "all");
const orientation = argValue("orientation");
const browserName = argValue("browser", "chromium");
const screenshotMode = argValue("screenshots", "all");
const overrideCss = argValue("override-css");
const outputDir = path.resolve(
  ROOT,
  argValue("output-dir", "qa-results/contact/status-visual")
);
const port = Number(argValue("port", "4196"));
const quick = hasFlag("quick");
const onePerWidth = hasFlag("one-per-width");
const minWidth = numArg("min-width");
const maxWidth = numArg("max-width");
const minHeight = numArg("min-height");
const maxHeight = numArg("max-height");

const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) {
  throw new Error(`Unsupported browser: ${browserName}`);
}

function caseOrientation(v) {
  return v.orientation || (v.width >= v.height ? "landscape" : "portrait");
}

function bucketFor(v) {
  return v.family === "foldable"
    ? `foldable:${caseOrientation(v)}`
    : v.family;
}

function familyCases(name) {
  const groupName = contract.familyGroups[name];
  if (!groupName) {
    throw new Error(`Unknown family: ${name}`);
  }

  const source = viewportContract.groups[groupName] || [];
  return source.map((v) => ({ ...v, family: v.family || name }));
}

function uniqueCases(cases) {
  const seen = new Set();

  return cases.filter((v) => {
    const key = [
      v.family,
      v.width,
      v.height,
      caseOrientation(v),
      v.id,
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function onePerWidthFilter(cases) {
  const map = new Map();

  for (const v of cases) {
    const key = `${v.family}|${v.width}`;
    if (!map.has(key)) map.set(key, v);
  }

  return [...map.values()];
}

function quickSample(cases) {
  if (cases.length <= 3) return cases;

  const sorted = [...cases].sort(
    (a, b) =>
      a.width * a.height - b.width * b.height ||
      a.width - b.width ||
      a.height - b.height
  );

  return uniqueCases([
    sorted[0],
    sorted[Math.floor((sorted.length - 1) / 2)],
    sorted[sorted.length - 1],
  ]);
}

let cases =
  family === "all"
    ? Object.keys(contract.familyGroups).flatMap(familyCases)
    : familyCases(family);

const supplementals = contract.supplementalViewports.filter(
  (v) => family === "all" || v.family === family
);

cases = uniqueCases([...cases, ...supplementals]);

if (orientation) {
  cases = cases.filter((v) => caseOrientation(v) === orientation);
}
if (minWidth != null) {
  cases = cases.filter((v) => v.width >= minWidth);
}
if (maxWidth != null) {
  cases = cases.filter((v) => v.width <= maxWidth);
}
if (minHeight != null) {
  cases = cases.filter((v) => v.height >= minHeight);
}
if (maxHeight != null) {
  cases = cases.filter((v) => v.height <= maxHeight);
}
if (onePerWidth) {
  cases = onePerWidthFilter(cases);
}
if (quick) {
  cases = quickSample(cases);
}

if (!cases.length) {
  throw new Error("No Contact viewport cases matched the requested filters.");
}

fs.mkdirSync(outputDir, { recursive: true });
const screenshotsDir = path.join(outputDir, "screenshots");
fs.mkdirSync(screenshotsDir, { recursive: true });

const cssText = overrideCss
  ? overrideCss
      .split(",")
      .map((p) => fs.readFileSync(path.resolve(ROOT, p.trim()), "utf8"))
      .join("\n\n")
  : "";

function serverUp() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/",
        timeout: 5000,
      },
      (res) => {
        res.resume();
        resolve(true);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await serverUp()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

async function startServerIfNeeded() {
  if (await serverUp()) {
    return { child: null, reused: true };
  }

  const viteBin = path.join(
    ROOT,
    "node_modules",
    "vite",
    "bin",
    "vite.js"
  );

  if (!fs.existsSync(viteBin)) {
    throw new Error("Vite is not installed. Run npm install first.");
  }

  const child = spawn(
    process.execPath,
    [
      viteBin,
      ROOT,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
    }
  );

  child.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

  if (!(await waitForServer())) {
    child.kill();
    throw new Error(`Vite server did not become ready on port ${port}`);
  }

  return { child, reused: false };
}

function sanitize(value) {
  return String(value)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

async function injectStatus(page, type) {
  const text =
    type === "success"
      ? "Message sent! Thanks! I'll get back to you as soon as I can."
      : "Failed to send message. Please try again later";

  await page.evaluate(
    ({ type, text }) => {
      const status = document.querySelector(".formStatus");
      if (!status) return;

      status.replaceChildren();

      const span = document.createElement("span");
      span.className = type === "success" ? "successMessage" : "errorMessage";
      span.textContent = text;

      /*
       * Reproduce the settled visual state of the motion.span without
       * submitting the form, invoking EmailJS, or mocking any response.
       */
      span.style.opacity = "1";
      span.style.transform = "translateY(0px)";

      status.appendChild(span);
    },
    { type, text }
  );
}

async function readStatus(page, type) {
  return page.evaluate((type) => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };

    const contained = (inner, outer, tolerance = 2) =>
      Boolean(
        inner &&
          outer &&
          inner.left >= outer.left - tolerance &&
          inner.top >= outer.top - tolerance &&
          inner.right <= outer.right + tolerance &&
          inner.bottom <= outer.bottom + tolerance
      );

    const contact = document.querySelector(".contact");
    const form = document.querySelector(".contact form");
    const status = document.querySelector(".formStatus");
    const message = document.querySelector(
      type === "success" ? ".successMessage" : ".errorMessage"
    );

    const messageRect = rect(message);
    const contactRect = rect(contact);
    const formRect = rect(form);
    const statusRect = rect(status);
    const style = message ? getComputedStyle(message) : null;

    return {
      text: message?.textContent?.trim() || "",
      message: messageRect,
      contact: contactRect,
      form: formRect,
      status: statusRect,
      messageInsideContact: contained(messageRect, contactRect),
      statusInsideContact: contained(statusRect, contactRect),
      formInsideContact: contained(formRect, contactRect),
      opacity: style ? parseFloat(style.opacity) : null,
      display: style?.display || null,
      visibility: style?.visibility || null,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    };
  }, type);
}

function evaluateStatus(type, state) {
  const hard = [];
  const expectedText =
    type === "success"
      ? "Message sent! Thanks! I'll get back to you as soon as I can."
      : "Failed to send message. Please try again later";

  if (!state.message) hard.push(`${type.toUpperCase()}_MESSAGE_MISSING`);
  if (state.text !== expectedText) hard.push(`${type.toUpperCase()}_TEXT_MISMATCH`);
  if (!state.messageInsideContact) hard.push(`${type.toUpperCase()}_MESSAGE_OUTSIDE_CONTACT`);
  if (!state.statusInsideContact) hard.push(`${type.toUpperCase()}_STATUS_OUTSIDE_CONTACT`);
  if (!state.formInsideContact) hard.push(`${type.toUpperCase()}_FORM_OUTSIDE_CONTACT`);
  if (state.opacity != null && state.opacity < 0.99) hard.push(`${type.toUpperCase()}_MESSAGE_NOT_VISIBLE`);
  if (state.visibility === "hidden" || state.display === "none") {
    hard.push(`${type.toUpperCase()}_MESSAGE_HIDDEN`);
  }
  if (state.documentScrollWidth > state.documentClientWidth + 2) {
    hard.push(`${type.toUpperCase()}_HORIZONTAL_OVERFLOW`);
  }

  return hard;
}

(async () => {
  const server = await startServerIfNeeded();
  const browser = await browserType.launch({ headless: true });
  const results = [];

  try {
    for (let index = 0; index < cases.length; index++) {
      const v = cases[index];
      const touchFamily = !String(v.family).startsWith("desktop");

      process.stdout.write(
        `\n[${index + 1}/${cases.length}] ${v.id} ${v.width}x${v.height} (${bucketFor(v)})\n`
      );

      const context = await browser.newContext({
        viewport: { width: v.width, height: v.height },
        hasTouch: touchFamily,
      });
      const page = await context.newPage();

      await page.goto(`http://127.0.0.1:${port}/`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForSelector(".contact", { timeout: 30000 });

      if (cssText) {
        await page.addStyleTag({ content: cssText });
      }

      await page.locator(".contact").scrollIntoViewIfNeeded();
      await page.waitForTimeout(contract.thresholds.settleMs);

      const states = {};
      const hard = [];

      for (const type of ["success", "error"]) {
        await injectStatus(page, type);
        await page.waitForTimeout(100);

        const state = await readStatus(page, type);
        states[type] = state;
        hard.push(...evaluateStatus(type, state));

        const shouldShot = screenshotMode === "all" || hard.length > 0;
        if (shouldShot) {
          const filename = [
            hard.length ? "FAIL" : "PASS",
            type,
            browserName,
            sanitize(bucketFor(v)),
            `${v.width}x${v.height}`,
            sanitize(v.id),
          ].join("__") + ".png";

          await page.locator(".contact").screenshot({
            path: path.join(screenshotsDir, filename),
          });
        }
      }

      const status = hard.length ? "FAIL" : "PASS";

      results.push({
        viewport: v,
        bucket: bucketFor(v),
        browser: browserName,
        status,
        hard,
        states,
        testMode: "visual-status-injection-only",
        formSubmitted: false,
        emailJsInvoked: false,
        responseMockUsed: false,
      });

      process.stdout.write(
        `  ${status}` +
          (hard.length ? ` FAIL[${hard.join(",")}]` : "") +
          "\n"
      );

      await context.close();
    }
  } finally {
    await browser.close();
    if (server.child) server.child.kill();
  }

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    viewportCount: cases.length,
    family,
    orientation,
    quick,
    browser: browserName,
    testMode: "visual-status-injection-only",
    formSubmissions: 0,
    emailJsRequests: 0,
    responseMocks: 0,
  };

  fs.writeFileSync(
    path.join(outputDir, "report.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  process.stdout.write(
    `\nContact status visual QA summary\n${JSON.stringify(summary, null, 2)}\n`
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
