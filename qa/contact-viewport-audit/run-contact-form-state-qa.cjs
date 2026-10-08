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
const screenshotMode = argValue("screenshots", "bad");
const overrideCss = argValue("override-css");
const outputDir = path.resolve(
  ROOT,
  argValue("output-dir", "qa-results/contact/form-states")
);
const port = Number(argValue("port", "4195"));
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

function rectContained(inner, outer, tolerance = 2) {
  if (!inner || !outer) return false;

  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance
  );
}

async function installFetchMock(page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);

    window.__CONTACT_QA_EMAIL_MODE = "success";
    window.__CONTACT_QA_EMAILJS_REQUESTS = 0;

    window.fetch = async (...args) => {
      const input = args[0];
      const url =
        typeof input === "string"
          ? input
          : input && typeof input.url === "string"
            ? input.url
            : "";

      if (url.includes("api.emailjs.com")) {
        window.__CONTACT_QA_EMAILJS_REQUESTS += 1;

        const success = window.__CONTACT_QA_EMAIL_MODE === "success";

        return new Response(
          success ? "OK" : "QA_MOCKED_FAILURE",
          {
            status: success ? 200 : 500,
            headers: {
              "Content-Type": "text/plain",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      return originalFetch(...args);
    };
  });
}

async function readState(page, messageSelector) {
  return page.evaluate((selector) => {
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

    const contact = document.querySelector(".contact");
    const form = document.querySelector(".contact form");
    const status = document.querySelector(".formStatus");
    const message = document.querySelector(selector);
    const successMessage = document.querySelector(".successMessage");
    const errorMessage = document.querySelector(".errorMessage");
    const button = document.querySelector(".formButton");
    const name = document.querySelector("#name");
    const email = document.querySelector("#email");
    const textarea = document.querySelector("#message");

    const style = message ? getComputedStyle(message) : null;

    return {
      contact: rect(contact),
      form: rect(form),
      status: rect(status),
      message: rect(message),
      text: message?.textContent?.trim() || "",
      messageOpacity: style ? parseFloat(style.opacity) : null,
      messageDisplay: style?.display || null,
      messageVisibility: style?.visibility || null,
      successPresent: Boolean(successMessage),
      errorPresent: Boolean(errorMessage),
      buttonDisabled: Boolean(button?.disabled),
      buttonText: button?.textContent?.trim() || "",
      values: {
        name: name?.value || "",
        email: email?.value || "",
        message: textarea?.value || "",
      },
      requestCount: window.__CONTACT_QA_EMAILJS_REQUESTS || 0,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    };
  }, messageSelector);
}

async function focusProbe(page) {
  const before = await page.evaluate(() => {
    const input = document.querySelector("#email");
    const textarea = document.querySelector("#message");

    return {
      inputFontPx: input ? parseFloat(getComputedStyle(input).fontSize) : null,
      textareaFontPx: textarea
        ? parseFloat(getComputedStyle(textarea).fontSize)
        : null,
      scale: window.visualViewport?.scale ?? 1,
      width: window.visualViewport?.width ?? innerWidth,
      height: window.visualViewport?.height ?? innerHeight,
    };
  });

  await page.locator("#email").focus();
  await page.waitForTimeout(250);

  const after = await page.evaluate(() => ({
    scale: window.visualViewport?.scale ?? 1,
    width: window.visualViewport?.width ?? innerWidth,
    height: window.visualViewport?.height ?? innerHeight,
  }));

  await page.locator("#email").blur();

  const minFontPx = Math.min(
    before.inputFontPx ?? Infinity,
    before.textareaFontPx ?? Infinity
  );

  return {
    ...before,
    after,
    minFontPx,
    fontBelow16: minFontPx < 16,
    observedScaleChange: after.scale > before.scale + 0.01,
    authoritativeForIOSSafari: false,
    note:
      "Desktop Playwright WebKit does not reproduce every iOS Safari browser-UI behavior. A <16px focused control remains a real-iPhone verification item even when this probe shows no scale change.",
  };
}

function evaluateState(type, state, expectedValues) {
  const hard = [];

  if (!state.message) hard.push(`${type.toUpperCase()}_MESSAGE_MISSING`);

  if (
    state.message &&
    state.contact &&
    !rectContained(state.message, state.contact)
  ) {
    hard.push(`${type.toUpperCase()}_MESSAGE_OUTSIDE_CONTACT`);
  }

  if (
    state.status &&
    state.contact &&
    !rectContained(state.status, state.contact)
  ) {
    hard.push(`${type.toUpperCase()}_STATUS_OUTSIDE_CONTACT`);
  }

  if (
    state.form &&
    state.contact &&
    !rectContained(state.form, state.contact)
  ) {
    hard.push(`${type.toUpperCase()}_FORM_OUTSIDE_CONTACT`);
  }

  if (
    state.documentScrollWidth >
    state.documentClientWidth + 2
  ) {
    hard.push(`${type.toUpperCase()}_HORIZONTAL_OVERFLOW`);
  }

  if (state.buttonDisabled) {
    hard.push(`${type.toUpperCase()}_BUTTON_STILL_DISABLED`);
  }

  if (state.buttonText !== "Send") {
    hard.push(`${type.toUpperCase()}_BUTTON_TEXT_NOT_RESET`);
  }

  if (state.requestCount < 1) {
    hard.push(`${type.toUpperCase()}_EMAILJS_MOCK_NOT_USED`);
  }

  if (type === "success") {
    const expectedText =
      "Message sent! Thanks! I'll get back to you as soon as I can.";

    if (state.text !== expectedText) {
      hard.push("SUCCESS_MESSAGE_TEXT_MISMATCH");
    }

    if (!state.successPresent || state.errorPresent) {
      hard.push("SUCCESS_MESSAGE_STATE_MISMATCH");
    }

    if (
      state.values.name ||
      state.values.email ||
      state.values.message
    ) {
      hard.push("SUCCESS_FORM_NOT_RESET");
    }
  } else {
    const expectedText =
      "Failed to send message. Please try again later";

    if (state.text !== expectedText) {
      hard.push("ERROR_MESSAGE_TEXT_MISMATCH");
    }

    if (!state.errorPresent || state.successPresent) {
      hard.push("ERROR_MESSAGE_STATE_MISMATCH");
    }

    if (
      state.values.name !== expectedValues.name ||
      state.values.email !== expectedValues.email ||
      state.values.message !== expectedValues.message
    ) {
      hard.push("ERROR_FORM_VALUES_NOT_PRESERVED");
    }
  }

  return hard;
}

async function fillForm(page, values) {
  await page.locator("#name").fill(values.name);
  await page.locator("#email").fill(values.email);
  await page.locator("#message").fill(values.message);
}

async function takeStateScreenshot(page, filename) {
  await page.locator(".contact").screenshot({
    path: path.join(screenshotsDir, filename),
  });
}

(async () => {
  const server = await startServerIfNeeded();
  const browser = await browserType.launch({ headless: true });
  const results = [];

  try {
    for (let index = 0; index < cases.length; index++) {
      const v = cases[index];
      const touchFamily = !String(v.family).startsWith("desktop");
      let routeMode = "success";
      let routedEmailRequests = 0;

      process.stdout.write(
        `\n[${index + 1}/${cases.length}] ${v.id} ${v.width}x${v.height} (${bucketFor(v)})\n`
      );

      const context = await browser.newContext({
        viewport: { width: v.width, height: v.height },
        hasTouch: touchFamily,
      });
      const page = await context.newPage();

      await installFetchMock(page);

      await page.route("https://api.emailjs.com/**", async (route) => {
        const request = route.request();

        if (request.method() === "OPTIONS") {
          await route.fulfill({
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          });
          return;
        }

        routedEmailRequests += 1;

        await route.fulfill({
          status: routeMode === "success" ? 200 : 500,
          contentType: "text/plain",
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
          body: routeMode === "success" ? "OK" : "QA_MOCKED_FAILURE",
        });
      });

      await page.goto(`http://127.0.0.1:${port}/`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForSelector(".contact", { timeout: 30000 });

      if (cssText) {
        await page.addStyleTag({ content: cssText });
      }

      await page.locator(".contact").scrollIntoViewIfNeeded();
      await page.waitForTimeout(contract.thresholds.settleMs);

      const focus = await focusProbe(page);

      const values = {
        name: "Contact QA",
        email: "contact-qa@example.com",
        message: "Mocked Contact QA message. No EmailJS request should leave the browser.",
      };

      /* SUCCESS — no external EmailJS request is allowed. */
      routeMode = "success";
      await page.evaluate(() => {
        window.__CONTACT_QA_EMAIL_MODE = "success";
        window.__CONTACT_QA_EMAILJS_REQUESTS = 0;
      });
      routedEmailRequests = 0;

      await fillForm(page, values);
      await page.locator(".formButton").click();
      await page.waitForSelector(".successMessage", { timeout: 5000 });
      await page.waitForTimeout(500);

      const success = await readState(page, ".successMessage");
      success.routeMockCount = routedEmailRequests;
      success.mockUsed = success.requestCount + routedEmailRequests > 0;
      if (success.requestCount < 1 && routedEmailRequests > 0) {
        success.requestCount = routedEmailRequests;
      }

      const successHard = evaluateState("success", success, values);

      let successAutoHideVerified = null;
      if (index === 0) {
        try {
          await page.waitForSelector(".successMessage", {
            state: "detached",
            timeout: 7500,
          });
          successAutoHideVerified = true;
        } catch {
          successAutoHideVerified = false;
          successHard.push("SUCCESS_MESSAGE_DID_NOT_AUTO_HIDE");
        }
      }

      /* FAILURE — values must remain and error must persist. */
      routeMode = "failure";
      await page.evaluate(() => {
        window.__CONTACT_QA_EMAIL_MODE = "failure";
        window.__CONTACT_QA_EMAILJS_REQUESTS = 0;
      });
      routedEmailRequests = 0;

      await fillForm(page, values);
      await page.locator(".formButton").click();
      await page.waitForSelector(".errorMessage", { timeout: 5000 });
      await page.waitForTimeout(500);

      const error = await readState(page, ".errorMessage");
      error.routeMockCount = routedEmailRequests;
      error.mockUsed = error.requestCount + routedEmailRequests > 0;
      if (error.requestCount < 1 && routedEmailRequests > 0) {
        error.requestCount = routedEmailRequests;
      }

      const errorHard = evaluateState("error", error, values);

      let errorPersistenceVerified = null;
      if (index === 0) {
        await page.waitForTimeout(1500);
        errorPersistenceVerified =
          (await page.locator(".errorMessage").count()) === 1;
        if (!errorPersistenceVerified) {
          errorHard.push("ERROR_MESSAGE_DID_NOT_PERSIST");
        }
      }

      const hard = [...successHard, ...errorHard];
      const review = [];

      if (
        browserName === "webkit" &&
        touchFamily &&
        caseOrientation(v) === "portrait" &&
        focus.fontBelow16
      ) {
        review.push("IOS_SAFARI_FOCUS_ZOOM_RISK_LT_16PX");
      }

      if (focus.observedScaleChange) {
        review.push("FOCUS_SCALE_CHANGE_OBSERVED_IN_PLAYWRIGHT");
      }

      const status = hard.length ? "FAIL" : review.length ? "REVIEW" : "PASS";

      const shouldShot =
        screenshotMode === "all" ||
        (screenshotMode === "bad" && status !== "PASS");

      if (shouldShot) {
        /* Recreate success state for a screenshot if the lifecycle probe hid it. */
        routeMode = "success";
        await page.evaluate(() => {
          window.__CONTACT_QA_EMAIL_MODE = "success";
          window.__CONTACT_QA_EMAILJS_REQUESTS = 0;
        });
        await fillForm(page, values);
        await page.locator(".formButton").click();
        await page.waitForSelector(".successMessage", { timeout: 5000 });
        await page.waitForTimeout(450);

        await takeStateScreenshot(
          page,
          [
            status,
            "success",
            browserName,
            sanitize(bucketFor(v)),
            `${v.width}x${v.height}`,
            sanitize(v.id),
          ].join("__") + ".png"
        );

        routeMode = "failure";
        await page.evaluate(() => {
          window.__CONTACT_QA_EMAIL_MODE = "failure";
          window.__CONTACT_QA_EMAILJS_REQUESTS = 0;
        });
        await fillForm(page, values);
        await page.locator(".formButton").click();
        await page.waitForSelector(".errorMessage", { timeout: 5000 });
        await page.waitForTimeout(450);

        await takeStateScreenshot(
          page,
          [
            status,
            "error",
            browserName,
            sanitize(bucketFor(v)),
            `${v.width}x${v.height}`,
            sanitize(v.id),
          ].join("__") + ".png"
        );
      }

      const record = {
        viewport: v,
        bucket: bucketFor(v),
        browser: browserName,
        status,
        hard,
        review,
        success,
        error,
        lifecycle: {
          successAutoHideVerified,
          errorPersistenceVerified,
        },
        focus,
      };

      results.push(record);

      process.stdout.write(
        `  ${status}` +
          (hard.length ? ` FAIL[${hard.join(",")}]` : "") +
          (review.length ? ` REVIEW[${review.join(",")}]` : "") +
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
    quick,
    browser: browserName,
    emailJsRequestsAreMocked: true,
    externalEmailJsRequestsExpected: 0,
    iosSafariFocusRule:
      "Focused inputs below 16px are flagged in WebKit. Desktop Playwright WebKit is not authoritative for iOS Safari auto-zoom; final real-iPhone verification remains required when the risk flag is present.",
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
    `\nContact form-state QA summary\n${JSON.stringify(summary, null, 2)}\n`
  );

  if (strict && summary.fail > 0) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
