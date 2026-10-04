#!/usr/bin/env node
"use strict";

/*
 * Desktop-only Portfolio interaction certification for Firefox/WebKit.
 *
 * Run through portfolio-cross-browser-preload.cjs so navigation/bootstrap uses
 * the same hardened path as the final geometry closure.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium, firefox, webkit } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const browserName = String(argValue("browser", "firefox")).toLowerCase();
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error("Unsupported browser: " + browserName);

const port = Number(argValue("port", browserName === "webkit" ? "5791" : "5790"));
const outputDir = path.resolve(
  ROOT,
  argValue(
    "output-dir",
    `qa-results/portfolio/final-cross-browser-closure/${browserName}/desktop-interaction`
  )
);

fs.mkdirSync(outputDir, { recursive: true });

function serverUp() {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: "/", timeout: 800 },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await serverUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready on ${port}`);
}

async function startServer() {
  if (await serverUp()) return { child: null, reused: true };

  const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
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
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  child.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));

  await waitForServer();
  return { child, reused: false };
}

async function arrowSnapshot(page) {
  return page.evaluate(() => {
    const arrow = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
      };
    };

    const dots = [...document.querySelectorAll(".pDot")];

    return {
      portfolioClass: document.querySelector(".portfolio")?.className || null,
      touchLayoutActive:
        document.querySelector(".portfolio")?.classList.contains("pTouchLayout") ?? null,
      left: arrow(".pArrowLeft"),
      right: arrow(".pArrowRight"),
      activeDot: dots.findIndex((dot) => dot.getAttribute("aria-current") === "true"),
    };
  });
}

function arrowsVisible(snapshot) {
  return (
    snapshot?.left?.display !== "none" &&
    snapshot?.right?.display !== "none" &&
    snapshot?.left?.visibility === "visible" &&
    snapshot?.right?.visibility === "visible" &&
    snapshot?.left?.opacity >= 0.9 &&
    snapshot?.right?.opacity >= 0.9
  );
}

function arrowsHidden(snapshot) {
  return (
    snapshot?.left?.display !== "none" &&
    snapshot?.right?.display !== "none" &&
    snapshot?.left?.opacity <= 0.1 &&
    snapshot?.right?.opacity <= 0.1
  );
}

(async () => {
  const server = await startServer();
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const result = {
    artifactType: "portfolio-desktop-interaction-cross-browser",
    generatedAt: new Date().toISOString(),
    browser: browserName,
    viewport: { width: 1440, height: 900 },
    checks: {},
    snapshots: {},
    status: "PASS",
  };

  try {
    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForSelector(".portfolio", { timeout: 30000 });

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      document
        .querySelector(".portfolio")
        ?.closest("section")
        ?.scrollIntoView({ behavior: "auto", block: "start" });
    });

    /* Entering Portfolio should trigger the same 900ms fade-in as pointer activity. */
    await page.waitForTimeout(1050);
    result.snapshots.afterScrollIn = await arrowSnapshot(page);
    result.checks.fadeInOnScroll = arrowsVisible(result.snapshots.afterScrollIn);
    result.checks.desktopTouchLayoutInactive =
      result.snapshots.afterScrollIn.touchLayoutActive === false;

    /* 5s idle + 900ms fade-out + small scheduling margin. */
    await page.waitForTimeout(6100);
    result.snapshots.afterIdle = await arrowSnapshot(page);
    result.checks.fadeOutAfterIdle = arrowsHidden(result.snapshots.afterIdle);

    const portfolioBox = await page.locator(".portfolio").boundingBox();
    if (!portfolioBox) throw new Error("Portfolio bounding box missing");

    await page.mouse.move(
      portfolioBox.x + portfolioBox.width * 0.5,
      portfolioBox.y + portfolioBox.height * 0.5
    );
    await page.waitForTimeout(1050);
    result.snapshots.afterPointerMove = await arrowSnapshot(page);
    result.checks.fadeInOnPointerMove = arrowsVisible(result.snapshots.afterPointerMove);

    const dots = page.locator(".pDot");
    await dots.nth(4).click({ force: true });
    await page.waitForTimeout(1350);

    await page.mouse.move(
      portfolioBox.x + portfolioBox.width * 0.55,
      portfolioBox.y + portfolioBox.height * 0.5
    );
    await page.waitForTimeout(1050);

    await page.locator(".pArrowRight").click({ force: true });
    await page.waitForTimeout(1350);
    result.snapshots.afterNextLoop = await arrowSnapshot(page);
    result.checks.nextLoop = result.snapshots.afterNextLoop.activeDot === 0;

    await page.locator(".pArrowLeft").click({ force: true });
    await page.waitForTimeout(1350);
    result.snapshots.afterPrevLoop = await arrowSnapshot(page);
    result.checks.prevLoop = result.snapshots.afterPrevLoop.activeDot === 4;

    await page.locator(".portfolio").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1350);
    result.snapshots.afterKeyboard = await arrowSnapshot(page);
    result.checks.keyboard = result.snapshots.afterKeyboard.activeDot === 0;

    const failedChecks = Object.entries(result.checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);

    if (failedChecks.length) {
      result.status = "FAIL";
      result.failedChecks = failedChecks;
    }

    await page.locator(".portfolio").screenshot({
      path: path.join(outputDir, `${result.status}__${browserName}__1440x900__desktop-interaction.png`),
    });
  } catch (error) {
    result.status = "FAIL";
    result.error = String(error?.stack || error);

    try {
      await page.screenshot({
        path: path.join(outputDir, `FAIL__${browserName}__1440x900__desktop-interaction-execution.png`),
        fullPage: false,
      });
    } catch {
      /* Browser/page may already be unavailable. */
    }
  } finally {
    fs.writeFileSync(
      path.join(outputDir, "interaction-report.json"),
      JSON.stringify(result, null, 2) + "\n",
      "utf8"
    );

    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (server.child) server.child.kill();
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "PASS") process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
