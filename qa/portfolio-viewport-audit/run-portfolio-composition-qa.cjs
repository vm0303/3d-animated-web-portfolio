#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium, firefox, webkit } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const CONTRACT_PATH = path.join(__dirname, "portfolio-composition-contract.json");
const VIEWPORT_PATH = path.join(ROOT, "qa/viewport-audit/hero-cross-browser-exhaustive-contract.json");
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8"));
const viewportContract = JSON.parse(fs.readFileSync(VIEWPORT_PATH, "utf8"));

function argValue(name, fallback = null) {
  const prefix = "--" + name + "=";
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}
function hasFlag(name) {
  return process.argv.includes("--" + name);
}
function numArg(name) {
  const value = argValue(name);
  return value == null ? null : Number(value);
}

const family = argValue("family", "all");
const orientation = argValue("orientation");
const heightTier = argValue("height-tier");
const projectArg = argValue("project", "all");
const browserName = argValue("browser", "chromium");
const screenshotMode = argValue("screenshots", "bad");
const overrideCss = argValue("override-css");
const outputDir = path.resolve(ROOT, argValue("output-dir", "qa-results/portfolio/run"));
const port = Number(argValue("port", "4190"));
const quick = hasFlag("quick");
const strict = hasFlag("strict");
const interactionCheck = hasFlag("interaction-check");
const onePerWidth = hasFlag("one-per-width");
const minWidth = numArg("min-width");
const maxWidth = numArg("max-width");
const minHeight = numArg("min-height");
const maxHeight = numArg("max-height");

const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error("Unsupported browser: " + browserName);

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
  if (v.family === "foldable") return tier ? "foldable:" + o + ":" + tier : "foldable:" + o;
  return tier ? v.family + ":" + tier : v.family;
}
function readabilityFor(v) {
  return contract.readability[bucketFor(v)] || contract.readability[v.family] || { minTitleFontPx: 16, minBodyFontPx: 12 };
}
function familyCases(name) {
  const groupName = contract.familyGroups[name];
  if (!groupName) throw new Error("Unknown family: " + name);
  const source = viewportContract.groups[groupName] || [];
  return source.map((v) => ({ ...v, family: v.family || name }));
}
function allCases() {
  const names = Object.keys(contract.familyGroups);
  return names.flatMap(familyCases);
}
function uniqueCases(cases) {
  const seen = new Set();
  return cases.filter((v) => {
    const key = [v.family, v.width, v.height, caseOrientation(v), v.id].join("|");
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
    arr.sort((a, b) => (a.width * a.height) - (b.width * b.height) || a.width - b.width || a.height - b.height);
    if (arr.length <= 3) selected.push(...arr);
    else selected.push(arr[0], arr[Math.floor((arr.length - 1) / 2)], arr[arr.length - 1]);
  }
  return uniqueCases(selected);
}
function onePerWidthFilter(cases) {
  const map = new Map();
  for (const v of cases) {
    const key = v.family + "|" + v.width;
    if (!map.has(key)) map.set(key, v);
  }
  return [...map.values()];
}

let cases = family === "all" ? allCases() : familyCases(family);
const allowedSupplementals = contract.supplementalViewports.filter((v) => family === "all" || v.family === family);
cases = uniqueCases([...cases, ...allowedSupplementals]);

if (orientation) cases = cases.filter((v) => caseOrientation(v) === orientation);
if (heightTier) cases = cases.filter((v) => tierFor(v) === heightTier);
if (minWidth != null) cases = cases.filter((v) => v.width >= minWidth);
if (maxWidth != null) cases = cases.filter((v) => v.width <= maxWidth);
if (minHeight != null) cases = cases.filter((v) => v.height >= minHeight);
if (maxHeight != null) cases = cases.filter((v) => v.height <= maxHeight);
if (onePerWidth) cases = onePerWidthFilter(cases);
if (quick) cases = quickSample(cases);

if (!cases.length) throw new Error("No Portfolio viewport cases matched the requested filters.");

const projects = projectArg === "all"
  ? contract.projects
  : contract.projects.filter((p) => String(p.id) === String(projectArg) || String(p.index) === String(projectArg));

if (!projects.length) throw new Error("No Portfolio project matched --project=" + projectArg);

fs.mkdirSync(outputDir, { recursive: true });
const screenshotsDir = path.join(outputDir, "screenshots");
fs.mkdirSync(screenshotsDir, { recursive: true });

const cssText = overrideCss
  ? overrideCss.split(",").map((p) => fs.readFileSync(path.resolve(ROOT, p.trim()), "utf8")).join("\n\n")
  : "";

function serverUp() {
  return new Promise((resolve) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: "/", timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}
async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await serverUp()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
async function startServerIfNeeded() {
  if (await serverUp()) return { child: null, reused: true };
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npm, ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none" }
  });
  child.stdout.on("data", (d) => process.stdout.write("[vite] " + d));
  child.stderr.on("data", (d) => process.stderr.write("[vite] " + d));
  if (!(await waitForServer())) {
    child.kill();
    throw new Error("Vite server did not become ready on port " + port);
  }
  return { child, reused: false };
}

function rectContained(inner, outer, tol) {
  return inner.left >= outer.left - tol &&
    inner.top >= outer.top - tol &&
    inner.right <= outer.right + tol &&
    inner.bottom <= outer.bottom + tol;
}
function intersectionArea(a, b) {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}
function sanitize(s) {
  return String(s).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function readMetrics(page, expectedIndex) {
  return page.evaluate(({ expectedIndex }) => {
    const q = (sel, root = document) => root.querySelector(sel);
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
    };
    const portfolio = q(".portfolio");
    const viewport = q(".pViewport");
    const active = q('.pSlide[aria-hidden="false"]');
    const content = active && q(".pSlideContent", active);
    const image = active && q(".pImg", active);
    const imageEl = image && q("img", image);
    const text = active && q(".pText", active);
    const title = text && q("h1", text);
    const body = text && q("p", text);
    const button = text && q("button", text);
    const leftArrow = q(".pArrowLeft");
    const rightArrow = q(".pArrowRight");
    const dots = q(".pDots");
    const dotNodes = [...document.querySelectorAll(".pDot")];
    const currentDot = dotNodes.findIndex((d) => d.getAttribute("aria-current") === "true");
    const style = (el) => el ? getComputedStyle(el) : null;
    return {
      viewport:{width:innerWidth,height:innerHeight},
      document:{scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth},
      expectedIndex,
      currentDot,
      portfolio:rect(portfolio),
      carouselViewport:rect(viewport),
      slide:rect(active),
      content:rect(content),
      image:rect(image),
      imageNatural:imageEl ? {width:imageEl.naturalWidth,height:imageEl.naturalHeight,complete:imageEl.complete} : null,
      text:rect(text),
      title:rect(title),
      body:rect(body),
      button:rect(button),
      leftArrow:rect(leftArrow),
      rightArrow:rect(rightArrow),
      dots:rect(dots),
      titleFont:title ? parseFloat(style(title).fontSize) : 0,
      bodyFont:body ? parseFloat(style(body).fontSize) : 0,
      bodyLineHeight:body ? parseFloat(style(body).lineHeight) : 0,
      buttonFont:button ? parseFloat(style(button).fontSize) : 0,
      imageOpacity:image ? parseFloat(style(image).opacity) : 0,
      textOpacity:text ? parseFloat(style(text).opacity) : 0,
      touchAction:viewport ? style(q(".pContainer")).touchAction : ""
    };
  }, { expectedIndex });
}

async function selectProject(page, project) {
  const dots = page.locator(".pDot");
  await dots.nth(project.index).click({ force:true });
  await page.waitForTimeout(contract.thresholds.settleMs);
}

function evaluateCase(v, project, metrics, motion) {
  const hard = [];
  const review = [];
  const t = contract.thresholds;
  const read = readabilityFor(v);
  const requiredRects = ["portfolio","carouselViewport","slide","content","image","text","title","body","button","leftArrow","rightArrow","dots"];
  for (const key of requiredRects) if (!metrics[key]) hard.push("MISSING_" + key.toUpperCase());

  if (metrics.document.scrollWidth > metrics.document.clientWidth + t.horizontalOverflowTolerancePx) {
    hard.push("DOCUMENT_HORIZONTAL_OVERFLOW");
  }
  if (metrics.currentDot !== project.index) hard.push("ACTIVE_DOT_MISMATCH");

  if (metrics.portfolio && metrics.carouselViewport && !rectContained(metrics.carouselViewport, metrics.portfolio, t.containmentTolerancePx)) {
    hard.push("VIEWPORT_OUTSIDE_PORTFOLIO");
  }
  for (const key of ["content","image","text","title","body","button"]) {
    if (metrics[key] && metrics.portfolio && !rectContained(metrics[key], metrics.portfolio, t.containmentTolerancePx)) {
      hard.push(key.toUpperCase() + "_OUTSIDE_PORTFOLIO");
    }
  }
  for (const key of ["leftArrow","rightArrow","dots"]) {
    if (metrics[key] && metrics.portfolio && !rectContained(metrics[key], metrics.portfolio, t.containmentTolerancePx)) {
      hard.push(key.toUpperCase() + "_OUTSIDE_PORTFOLIO");
    }
  }
  if (!metrics.imageNatural || !metrics.imageNatural.complete || metrics.imageNatural.width <= 0 || metrics.imageNatural.height <= 0) {
    hard.push("IMAGE_NOT_LOADED");
  }
  if (metrics.image && metrics.text && intersectionArea(metrics.image, metrics.text) > 4) {
    hard.push("IMAGE_TEXT_OVERLAP");
  }
  if (metrics.dots && metrics.button && intersectionArea(metrics.dots, metrics.button) > 4) {
    review.push("DOTS_BUTTON_OVERLAP");
  }
  if (metrics.leftArrow && metrics.leftArrow.width < t.minArrowHitWidthPx) review.push("LEFT_ARROW_HIT_WIDTH");
  if (metrics.rightArrow && metrics.rightArrow.width < t.minArrowHitWidthPx) review.push("RIGHT_ARROW_HIT_WIDTH");
  if (metrics.leftArrow && metrics.leftArrow.height < t.minArrowHitHeightPx) review.push("LEFT_ARROW_HIT_HEIGHT");
  if (metrics.rightArrow && metrics.rightArrow.height < t.minArrowHitHeightPx) review.push("RIGHT_ARROW_HIT_HEIGHT");
  if (metrics.titleFont < read.minTitleFontPx) review.push("TITLE_FONT_SMALL");
  if (metrics.bodyFont < read.minBodyFontPx) review.push("BODY_FONT_SMALL");

  if (project.index === 0 && motion) {
    if (!motion.before || !motion.after) review.push("MOTION_NOT_MEASURED");
    else {
      if (motion.before.imageOpacity > t.motionInactiveMaxOpacity || motion.before.textOpacity > t.motionInactiveMaxOpacity) {
        review.push("ENTRY_MOTION_NOT_INACTIVE_BEFORE_SCROLL");
      }
      if (motion.after.imageOpacity < t.motionActiveMinOpacity || motion.after.textOpacity < t.motionActiveMinOpacity) {
        hard.push("ENTRY_MOTION_NOT_ACTIVE_AFTER_SCROLL");
      }
    }
  }

  return { hard, review, status:hard.length ? "FAIL" : review.length ? "REVIEW" : "PASS" };
}

async function motionProbe(page) {
  const before = await page.evaluate(() => {
    const active = document.querySelector('.pSlide[aria-hidden="false"]');
    const img = active?.querySelector(".pImg");
    const text = active?.querySelector(".pText");
    return {
      imageOpacity:img ? parseFloat(getComputedStyle(img).opacity) : null,
      textOpacity:text ? parseFloat(getComputedStyle(text).opacity) : null
    };
  });
  await page.locator(".portfolio").scrollIntoViewIfNeeded();
  await page.waitForTimeout(contract.thresholds.settleMs);
  const after = await page.evaluate(() => {
    const active = document.querySelector('.pSlide[aria-hidden="false"]');
    const img = active?.querySelector(".pImg");
    const text = active?.querySelector(".pText");
    return {
      imageOpacity:img ? parseFloat(getComputedStyle(img).opacity) : null,
      textOpacity:text ? parseFloat(getComputedStyle(text).opacity) : null
    };
  });
  return { before, after };
}

async function runInteractionCheck(page) {
  const result = { nextLoop:false, prevLoop:false, keyboard:false };
  const dots = page.locator(".pDot");
  await dots.nth(4).click({force:true});
  await page.waitForTimeout(contract.thresholds.settleMs);
  await page.locator(".pArrowRight").click({force:true});
  await page.waitForTimeout(contract.thresholds.settleMs);
  result.nextLoop = await page.locator(".pDot").nth(0).getAttribute("aria-current") === "true";

  await page.locator(".pArrowLeft").click({force:true});
  await page.waitForTimeout(contract.thresholds.settleMs);
  result.prevLoop = await page.locator(".pDot").nth(4).getAttribute("aria-current") === "true";

  await page.locator(".portfolio").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(contract.thresholds.settleMs);
  result.keyboard = await page.locator(".pDot").nth(0).getAttribute("aria-current") === "true";
  return result;
}

(async () => {
  const server = await startServerIfNeeded();
  const browser = await browserType.launch({ headless:true });
  const results = [];
  let interactions = null;

  try {
    for (let vi = 0; vi < cases.length; vi++) {
      const v = cases[vi];
      process.stdout.write("\n[" + (vi + 1) + "/" + cases.length + "] " + v.id + " " + v.width + "x" + v.height + " (" + bucketFor(v) + ")\n");
      const context = await browser.newContext({ viewport:{width:v.width,height:v.height} });
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:" + port + "/", { waitUntil:"domcontentloaded", timeout:30000 });
      await page.waitForSelector(".portfolio", { timeout:30000 });
      if (cssText) await page.addStyleTag({ content:cssText });

      const motion = await motionProbe(page);

      for (const project of projects) {
        await selectProject(page, project);
        const metrics = await readMetrics(page, project.index);
        const verdict = evaluateCase(v, project, metrics, project.index === 0 ? motion : null);
        const rec = {
          viewport:v,
          bucket:bucketFor(v),
          project,
          browser:browserName,
          metrics,
          motion:project.index === 0 ? motion : null,
          ...verdict
        };
        results.push(rec);

        const shouldShot = screenshotMode === "all" || (screenshotMode === "bad" && verdict.status !== "PASS");
        if (shouldShot) {
          await page.locator(".portfolio").hover({ force:true }).catch(() => {});
          const filename = [
            verdict.status,
            browserName,
            sanitize(bucketFor(v)),
            v.width + "x" + v.height,
            "project-" + project.id + "-" + sanitize(project.title)
          ].join("__") + ".png";
          await page.locator(".portfolio").screenshot({ path:path.join(screenshotsDir, filename) });
        }
        process.stdout.write("  " + project.id + " " + project.title + ": " + verdict.status +
          (verdict.hard.length ? " FAIL[" + verdict.hard.join(",") + "]" : "") +
          (verdict.review.length ? " REVIEW[" + verdict.review.join(",") + "]" : "") + "\n");
      }

      if (interactionCheck && interactions == null) {
        interactions = await runInteractionCheck(page);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    if (server.child) server.child.kill();
  }

  const summary = {
    total:results.length,
    pass:results.filter((r) => r.status === "PASS").length,
    review:results.filter((r) => r.status === "REVIEW").length,
    fail:results.filter((r) => r.status === "FAIL").length,
    viewportCount:cases.length,
    projectCount:projects.length,
    family,
    orientation,
    heightTier,
    quick,
    browser:browserName,
    interactionCheck:interactions
  };

  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify({ generatedAt:new Date().toISOString(), summary, results }, null, 2));
  fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));

  process.stdout.write("\nPortfolio QA summary\n" + JSON.stringify(summary, null, 2) + "\n");
  if (interactions && (!interactions.nextLoop || !interactions.prevLoop || !interactions.keyboard)) {
    process.exitCode = strict ? 1 : 0;
  }
  if (strict && summary.fail > 0) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
