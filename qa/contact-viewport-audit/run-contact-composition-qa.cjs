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
const heightTier = argValue("height-tier");
const browserName = argValue("browser", "chromium");
const screenshotMode = argValue("screenshots", "bad");
const overrideCss = argValue("override-css");
const outputDir = path.resolve(
  ROOT,
  argValue("output-dir", "qa-results/contact/run")
);
const port = Number(argValue("port", "4194"));
const quick = hasFlag("quick");
const strict = hasFlag("strict");
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

function tierFor(v) {
  const o = caseOrientation(v);
  if (o !== "landscape") return null;
  const cfg = contract.landscapeTiers[v.family];
  if (!cfg) return null;
  return v.height <= cfg.shortMaxHeightPx ? "short" : "normal";
}

function bucketFor(v) {
  const o = caseOrientation(v);
  const tier = tierFor(v);

  if (v.family === "foldable") {
    return tier
      ? `foldable:${o}:${tier}`
      : `foldable:${o}`;
  }

  return tier ? `${v.family}:${tier}` : v.family;
}

function readabilityFor(v) {
  return (
    contract.readability[bucketFor(v)] ||
    contract.readability[v.family] ||
    {
      minTitleFontPx: 16,
      minLabelFontPx: 12,
      minControlFontPx: 12,
      minInputHeightPx: 28,
      minTextareaHeightPx: 48,
      minButtonHeightPx: 28,
    }
  );
}

function familyCases(name) {
  const groupName = contract.familyGroups[name];
  if (!groupName) {
    throw new Error(`Unknown family: ${name}`);
  }

  const source = viewportContract.groups[groupName] || [];
  return source.map((v) => ({ ...v, family: v.family || name }));
}

function allCases() {
  return Object.keys(contract.familyGroups).flatMap(familyCases);
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

function quickSample(cases) {
  const buckets = new Map();

  for (const v of cases) {
    const key = bucketFor(v);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(v);
  }

  const selected = [];

  for (const arr of buckets.values()) {
    arr.sort(
      (a, b) =>
        a.width * a.height - b.width * b.height ||
        a.width - b.width ||
        a.height - b.height
    );

    if (arr.length <= 3) {
      selected.push(...arr);
    } else {
      selected.push(
        arr[0],
        arr[Math.floor((arr.length - 1) / 2)],
        arr[arr.length - 1]
      );
    }
  }

  return uniqueCases(selected);
}

function onePerWidthFilter(cases) {
  const map = new Map();

  for (const v of cases) {
    const key = `${v.family}|${v.width}`;
    if (!map.has(key)) map.set(key, v);
  }

  return [...map.values()];
}

let cases = family === "all" ? allCases() : familyCases(family);
const supplementals = contract.supplementalViewports.filter(
  (v) => family === "all" || v.family === family
);
cases = uniqueCases([...cases, ...supplementals]);

if (orientation) {
  cases = cases.filter((v) => caseOrientation(v) === orientation);
}
if (heightTier) {
  cases = cases.filter((v) => tierFor(v) === heightTier);
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

        /*
         * Any HTTP response proves that Vite is listening.
         * Playwright will diagnose application/render failures afterward.
         */
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

function rectContained(inner, outer, tolerance) {
  if (!inner || !outer) return false;

  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance
  );
}

function intersectionArea(a, b) {
  if (!a || !b) return 0;

  const width = Math.max(
    0,
    Math.min(a.right, b.right) - Math.max(a.left, b.left)
  );
  const height = Math.max(
    0,
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  );

  return width * height;
}

function sanitize(value) {
  return String(value)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const q = (selector, root = document) => root.querySelector(selector);
    const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

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

    const style = (el) => (el ? getComputedStyle(el) : null);

    const contact = q(".contact");
    const section = contact?.closest("section") || null;
    const sections = contact ? qa(":scope > .cSection", contact) : [];
    const formSection = sections[0] || null;
    const visualSection = sections[1] || null;
    const form = contact && q("form", contact);
    const title = form && q("h1", form);
    const labels = form ? qa(".formItem > label", form) : [];
    const inputs = form ? qa(".formItem > input", form) : [];
    const textarea = form && q("textarea", form);
    const button = form && q("button[type='submit']", form);
    const status = form && q(".formStatus", form);
    const visual = contact && q(".contactVisual", contact);
    const svg = visual && q("svg", visual);

    const labelFonts = labels.map((el) => parseFloat(style(el).fontSize));
    const inputFonts = inputs.map((el) => parseFloat(style(el).fontSize));
    const inputHeights = inputs.map((el) => rect(el)?.height || 0);

    return {
      viewport: {
        width: innerWidth,
        height: innerHeight,
      },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      section: rect(section),
      contact: rect(contact),
      formSection: rect(formSection),
      visualSection: rect(visualSection),
      form: rect(form),
      title: rect(title),
      labels: labels.map(rect),
      inputs: inputs.map(rect),
      textarea: rect(textarea),
      button: rect(button),
      status: rect(status),
      visual: rect(visual),
      svg: rect(svg),
      formOpacity: form ? parseFloat(style(form).opacity) : null,
      visualOpacity: visual ? parseFloat(style(visual).opacity) : null,
      titleFont: title ? parseFloat(style(title).fontSize) : 0,
      minLabelFont: labelFonts.length ? Math.min(...labelFonts) : 0,
      minInputFont: inputFonts.length ? Math.min(...inputFonts) : 0,
      textareaFont: textarea ? parseFloat(style(textarea).fontSize) : 0,
      buttonFont: button ? parseFloat(style(button).fontSize) : 0,
      minInputHeight: inputHeights.length ? Math.min(...inputHeights) : 0,
      textareaHeight: rect(textarea)?.height || 0,
      buttonHeight: rect(button)?.height || 0,
      contactFlexDirection: contact ? style(contact).flexDirection : "",
    };
  });
}

function evaluateCase(v, metrics, motion) {
  const hard = [];
  const review = [];
  const t = contract.thresholds;
  const read = readabilityFor(v);
  const portrait = caseOrientation(v) === "portrait";
  const touchPortrait =
    portrait &&
    ["phone-portrait", "tablet-portrait", "foldable"].includes(v.family);

  const requiredRects = [
    "section",
    "contact",
    "formSection",
    "visualSection",
    "form",
    "title",
    "textarea",
    "button",
    "status",
    "visual",
    "svg",
  ];

  for (const key of requiredRects) {
    if (!metrics[key]) hard.push(`MISSING_${key.toUpperCase()}`);
  }

  if (metrics.inputs.length !== 2) {
    hard.push("INPUT_COUNT_MISMATCH");
  }
  if (metrics.labels.length !== 3) {
    hard.push("LABEL_COUNT_MISMATCH");
  }

  if (
    metrics.document.scrollWidth >
    metrics.document.clientWidth + t.horizontalOverflowTolerancePx
  ) {
    hard.push("DOCUMENT_HORIZONTAL_OVERFLOW");
  }

  const contactChildren = [
    ["FORM", metrics.form],
    ["TITLE", metrics.title],
    ["TEXTAREA", metrics.textarea],
    ["BUTTON", metrics.button],
    ["STATUS", metrics.status],
    ["VISUAL", metrics.visual],
    ["SVG", metrics.svg],
  ];

  for (const [name, r] of contactChildren) {
    if (
      r &&
      metrics.contact &&
      !rectContained(r, metrics.contact, t.containmentTolerancePx)
    ) {
      hard.push(`${name}_OUTSIDE_CONTACT`);
    }
  }

  for (let i = 0; i < metrics.inputs.length; i++) {
    if (
      metrics.inputs[i] &&
      metrics.contact &&
      !rectContained(
        metrics.inputs[i],
        metrics.contact,
        t.containmentTolerancePx
      )
    ) {
      hard.push(`INPUT_${i + 1}_OUTSIDE_CONTACT`);
    }
  }

  for (let i = 0; i < metrics.labels.length; i++) {
    if (
      metrics.labels[i] &&
      metrics.contact &&
      !rectContained(
        metrics.labels[i],
        metrics.contact,
        t.containmentTolerancePx
      )
    ) {
      hard.push(`LABEL_${i + 1}_OUTSIDE_CONTACT`);
    }
  }

  if (
    metrics.svg &&
    metrics.visual &&
    !rectContained(metrics.svg, metrics.visual, t.containmentTolerancePx)
  ) {
    hard.push("SVG_OUTSIDE_VISUAL_BACKGROUND");
  }

  if (
    metrics.form &&
    metrics.visual &&
    intersectionArea(metrics.form, metrics.visual) > t.overlapToleranceAreaPx
  ) {
    hard.push("FORM_VISUAL_OVERLAP");
  }

  if (touchPortrait && metrics.visual && metrics.form) {
    if (
      metrics.visual.bottom >
      metrics.form.top + t.containmentTolerancePx
    ) {
      hard.push("PORTRAIT_VISUAL_FORM_ORDER");
    }

    if (metrics.contactFlexDirection !== "column") {
      hard.push("PORTRAIT_NOT_COLUMN_LAYOUT");
    }
  } else if (!portrait && metrics.form && metrics.visual) {
    if (
      metrics.form.right >
      metrics.visual.left + t.containmentTolerancePx
    ) {
      hard.push("LANDSCAPE_FORM_VISUAL_ORDER");
    }
  }

  if (metrics.titleFont < read.minTitleFontPx) {
    review.push("TITLE_FONT_SMALL");
  }
  if (metrics.minLabelFont < read.minLabelFontPx) {
    review.push("LABEL_FONT_SMALL");
  }

  const minControlFont = Math.min(
    metrics.minInputFont || Infinity,
    metrics.textareaFont || Infinity,
    metrics.buttonFont || Infinity
  );

  if (minControlFont < read.minControlFontPx) {
    review.push("CONTROL_FONT_SMALL");
  }
  if (metrics.minInputHeight < read.minInputHeightPx) {
    review.push("INPUT_HEIGHT_SMALL");
  }
  if (metrics.textareaHeight < read.minTextareaHeightPx) {
    review.push("TEXTAREA_HEIGHT_SMALL");
  }
  if (metrics.buttonHeight < read.minButtonHeightPx) {
    review.push("BUTTON_HEIGHT_SMALL");
  }

  if (motion) {
    if (!motion.before || !motion.after) {
      review.push("MOTION_NOT_MEASURED");
    } else {
      if (
        motion.before.formOpacity > t.motionInactiveMaxOpacity ||
        motion.before.visualOpacity > t.motionInactiveMaxOpacity
      ) {
        review.push("ENTRY_MOTION_NOT_INACTIVE_BEFORE_SCROLL");
      }

      if (
        motion.after.formOpacity < t.motionActiveMinOpacity ||
        motion.after.visualOpacity < t.motionActiveMinOpacity
      ) {
        hard.push("ENTRY_MOTION_NOT_ACTIVE_AFTER_SCROLL");
      }
    }
  }

  return {
    hard,
    review,
    status: hard.length ? "FAIL" : review.length ? "REVIEW" : "PASS",
  };
}

async function motionProbe(page) {
  const before = await page.evaluate(() => {
    const form = document.querySelector(".contact form");
    const visual = document.querySelector(".contactVisual");

    return {
      formOpacity: form ? parseFloat(getComputedStyle(form).opacity) : null,
      visualOpacity: visual ? parseFloat(getComputedStyle(visual).opacity) : null,
    };
  });

  await page.locator(".contact").scrollIntoViewIfNeeded();
  await page.waitForTimeout(contract.thresholds.settleMs);

  const after = await page.evaluate(() => {
    const form = document.querySelector(".contact form");
    const visual = document.querySelector(".contactVisual");

    return {
      formOpacity: form ? parseFloat(getComputedStyle(form).opacity) : null,
      visualOpacity: visual ? parseFloat(getComputedStyle(visual).opacity) : null,
    };
  });

  return { before, after };
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
        timeout: 30000,
      });
      await page.waitForSelector(".contact", { timeout: 30000 });

      if (cssText) {
        await page.addStyleTag({ content: cssText });
      }

      const motion = await motionProbe(page);
      const metrics = await readMetrics(page);
      const verdict = evaluateCase(v, metrics, motion);

      const record = {
        viewport: v,
        bucket: bucketFor(v),
        browser: browserName,
        metrics,
        motion,
        ...verdict,
      };

      results.push(record);

      const shouldShot =
        screenshotMode === "all" ||
        (screenshotMode === "bad" && verdict.status !== "PASS");

      if (shouldShot) {
        const filename = [
          verdict.status,
          browserName,
          sanitize(bucketFor(v)),
          `${v.width}x${v.height}`,
          sanitize(v.id),
        ].join("__") + ".png";

        await page.locator(".contact").screenshot({
          path: path.join(screenshotsDir, filename),
        });
      }

      process.stdout.write(
        `  ${verdict.status}` +
          (verdict.hard.length
            ? ` FAIL[${verdict.hard.join(",")}]`
            : "") +
          (verdict.review.length
            ? ` REVIEW[${verdict.review.join(",")}]`
            : "") +
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
    review: results.filter((r) => r.status === "REVIEW").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    viewportCount: cases.length,
    family,
    orientation,
    heightTier,
    quick,
    browser: browserName,
  };

  fs.writeFileSync(
    path.join(outputDir, "report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary,
        results,
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  process.stdout.write(
    `\nContact QA summary\n${JSON.stringify(summary, null, 2)}\n`
  );

  if (strict && summary.fail > 0) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
