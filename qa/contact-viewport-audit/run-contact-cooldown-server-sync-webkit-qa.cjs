#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { webkit } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const STORAGE_KEY = "portfolioContactCooldownUntil";
const DEFAULT_PORT = 4203;
const SEED_SECONDS = 45;
const REMINDER_VISIBLE_MS = 9000;

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const port = Number(argValue("port", String(DEFAULT_PORT)));
const headed = hasFlag("headed");
const outputDir = path.resolve(
  ROOT,
  argValue(
    "output-dir",
    "qa-results/contact/cooldown-server-sync-webkit"
  )
);

fs.mkdirSync(outputDir, { recursive: true });
const screenshotsDir = path.join(outputDir, "screenshots");
fs.mkdirSync(screenshotsDir, { recursive: true });

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
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
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

  child.stdout.on("data", (data) => {
    process.stdout.write(`[vite] ${data}`);
  });

  child.stderr.on("data", (data) => {
    process.stderr.write(`[vite] ${data}`);
  });

  if (!(await waitForServer())) {
    child.kill();
    throw new Error(`Vite server did not become ready on port ${port}`);
  }

  return { child, reused: false };
}

async function apiJson(page, url, options = {}) {
  return page.evaluate(
    async ({ url, options }) => {
      const response = await fetch(url, options);
      let payload = {};

      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      return {
        ok: response.ok,
        status: response.status,
        payload,
      };
    },
    { url, options }
  );
}

async function state(page) {
  return page.evaluate((key) => {
    const stored = Number(localStorage.getItem(key) || 0);
    const message = document.querySelector(".cooldownMessageText");
    const button = document.querySelector(".formButton");

    return {
      storedRemainingSeconds:
        stored > Date.now()
          ? Math.ceil((stored - Date.now()) / 1000)
          : 0,
      text: message?.textContent?.trim() || "",
      messagePresent: Boolean(message),
      ariaDisabled: button?.getAttribute("aria-disabled") || null,
      nativeDisabled: Boolean(button?.disabled),
      shakeClass: Boolean(
        message?.classList.contains("cooldownJumpShake")
      ),
    };
  }, STORAGE_KEY);
}

async function waitForCooldown(page, timeout = 8000) {
  await page.waitForFunction(
    (key) => {
      const stored = Number(localStorage.getItem(key) || 0);
      return (
        stored > Date.now() &&
        document.querySelector(".formButton")?.getAttribute("aria-disabled") === "true"
      );
    },
    STORAGE_KEY,
    { timeout }
  );
}

async function waitForClear(page, timeout = 8000) {
  await page.waitForFunction(
    (key) => {
      const stored = Number(localStorage.getItem(key) || 0);
      return (
        stored <= Date.now() &&
        document.querySelector(".formButton")?.getAttribute("aria-disabled") !== "true"
      );
    },
    STORAGE_KEY,
    { timeout }
  );
}

async function triggerFocusSync(page) {
  /*
   * Playwright WebKit's bringToFront() does not consistently emit a DOM
   * window "focus" event, especially across independent BrowserContexts.
   * The application listens to the standard focus event, so dispatch it
   * deterministically here. Real Safari focus behavior was separately checked
   * manually; this test verifies the WebKit application handler and server sync.
   */
  await page.bringToFront();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

async function screenshotContact(page, name) {
  await page.locator(".contact").screenshot({
    path: path.join(screenshotsDir, `${name}.png`),
  });
}

(async () => {
  const server = await startServerIfNeeded();
  const browser = await webkit.launch({ headless: !headed });
  const contexts = [];
  const hard = [];
  const checks = {};

  let emailJsRequests = 0;
  let contactGetRequests = 0;
  let contactPostRequests = 0;

  try {
    const makeContext = async () => {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        reducedMotion: "no-preference",
      });

      contexts.push(context);

      context.on("request", (request) => {
        const url = request.url();

        if (url.includes("/api/contact")) {
          if (request.method() === "GET") {
            contactGetRequests += 1;
          } else if (request.method() === "POST") {
            contactPostRequests += 1;
          }
        }

        if (url.startsWith("https://api.emailjs.com/")) {
          emailJsRequests += 1;
        }
      });

      return context;
    };

    const contextA = await makeContext();
    const contextB = await makeContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const url = `http://127.0.0.1:${port}/?contactCooldownDebug=1`;

    await Promise.all([
      pageA.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }),
      pageB.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }),
    ]);

    await Promise.all([
      pageA.waitForSelector(".contact", { timeout: 30000 }),
      pageB.waitForSelector(".contact", { timeout: 30000 }),
    ]);

    const clearBefore = await apiJson(
      pageA,
      "/api/contact?debugCooldown=clear",
      { method: "POST" }
    );

    checks.clearBefore =
      clearBefore.ok &&
      clearBefore.payload?.cooldownActive === false;

    if (!checks.clearBefore) {
      hard.push(`CLEAR_BEFORE_FAILED:${JSON.stringify(clearBefore)}`);
    }

    await Promise.all([
      pageA.reload({ waitUntil: "domcontentloaded" }),
      pageB.reload({ waitUntil: "domcontentloaded" }),
    ]);

    const beforeA = await state(pageA);
    const beforeB = await state(pageB);

    checks.independentContextsStartClear =
      beforeA.storedRemainingSeconds === 0 &&
      beforeB.storedRemainingSeconds === 0;

    if (!checks.independentContextsStartClear) {
      hard.push("CONTEXTS_DID_NOT_START_CLEAR");
    }

    const seedResult = await apiJson(
      pageA,
      "/api/contact?debugCooldown=seed",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: SEED_SECONDS }),
      }
    );

    checks.seedSucceeded =
      seedResult.ok &&
      seedResult.payload?.cooldownActive === true &&
      Number(seedResult.payload?.retryAfterSeconds) > 0;

    if (!checks.seedSucceeded) {
      hard.push(`SEED_FAILED:${JSON.stringify(seedResult)}`);
    }

    const serverStatus = await apiJson(pageA, "/api/contact");
    checks.serverStatusReportsCooldown =
      serverStatus.ok &&
      serverStatus.payload?.cooldownActive === true &&
      Number(serverStatus.payload?.retryAfterSeconds) > 0;

    if (!checks.serverStatusReportsCooldown) {
      hard.push(`SERVER_STATUS_MISSED_SEED:${JSON.stringify(serverStatus)}`);
    }

    await triggerFocusSync(pageA);
    await waitForCooldown(pageA);

    const afterSeedA = await state(pageA);
    checks.seedBrowserHydrated =
      afterSeedA.storedRemainingSeconds > 0 &&
      afterSeedA.ariaDisabled === "true" &&
      afterSeedA.nativeDisabled === false;

    if (!checks.seedBrowserHydrated) {
      hard.push("SEED_BROWSER_DID_NOT_HYDRATE");
    }

    await screenshotContact(pageA, "01-seed-browser-active");

    await triggerFocusSync(pageB);
    await waitForCooldown(pageB);

    const syncedB = await state(pageB);
    checks.preexistingIndependentContextSyncedOnFocus =
      syncedB.storedRemainingSeconds > 0 &&
      syncedB.ariaDisabled === "true" &&
      syncedB.nativeDisabled === false &&
      /Message limit reached\. Try again in /.test(syncedB.text);

    if (!checks.preexistingIndependentContextSyncedOnFocus) {
      hard.push("PREEXISTING_CONTEXT_DID_NOT_SYNC_ON_FOCUS");
    }

    await screenshotContact(pageB, "02-preexisting-independent-context-synced");

    const contextC = await makeContext();
    const pageC = await contextC.newPage();

    await pageC.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await pageC.waitForSelector(".contact", { timeout: 30000 });
    await waitForCooldown(pageC);

    const syncedC = await state(pageC);
    checks.freshPrivateLikeContextSyncedOnInitialLoad =
      syncedC.storedRemainingSeconds > 0 &&
      syncedC.ariaDisabled === "true" &&
      syncedC.nativeDisabled === false;

    if (!checks.freshPrivateLikeContextSyncedOnInitialLoad) {
      hard.push("FRESH_CONTEXT_DID_NOT_SYNC_ON_INITIAL_LOAD");
    }

    await screenshotContact(pageC, "03-fresh-private-like-context-synced");

    const firstText = syncedC.text;
    const firstRemaining = syncedC.storedRemainingSeconds;

    await pageC.waitForTimeout(2200);

    const laterC = await state(pageC);
    checks.dynamicCountdownTicks =
      laterC.storedRemainingSeconds <= firstRemaining - 1 &&
      laterC.text !== firstText &&
      /\d+s\./.test(laterC.text);

    if (!checks.dynamicCountdownTicks) {
      hard.push(
        `COUNTDOWN_DID_NOT_TICK:first=${firstText};later=${laterC.text}`
      );
    }

    const messageC = pageC.locator(".cooldownMessage");
    const buttonC = pageC.locator(".formButton");

    await messageC.waitFor({
      state: "detached",
      timeout: REMINDER_VISIBLE_MS + 4000,
    });

    const afterFade = await state(pageC);
    checks.fadeDoesNotEndCooldown =
      afterFade.storedRemainingSeconds > 0 &&
      afterFade.ariaDisabled === "true";

    if (!checks.fadeDoesNotEndCooldown) {
      hard.push("REMINDER_FADE_ENDED_COOLDOWN");
    }

    await buttonC.click({ force: true });
    await messageC.waitFor({ state: "visible", timeout: 1500 });

    const restoredC = await state(pageC);
    checks.blockedClickRestoresCurrentCountdown =
      restoredC.messagePresent &&
      restoredC.storedRemainingSeconds > 0 &&
      /Message limit reached\. Try again in /.test(restoredC.text);

    checks.horizontalShakeReplayed = restoredC.shakeClass;

    if (!checks.blockedClickRestoresCurrentCountdown) {
      hard.push("BLOCKED_CLICK_DID_NOT_RESTORE_CURRENT_COUNTDOWN");
    }

    if (!checks.horizontalShakeReplayed) {
      hard.push("HORIZONTAL_SHAKE_NOT_DETECTED");
    }

    await screenshotContact(pageC, "04-blocked-click-restored-after-fade");

    const clearAfter = await apiJson(
      pageA,
      "/api/contact?debugCooldown=clear",
      { method: "POST" }
    );

    checks.clearAfter =
      clearAfter.ok &&
      clearAfter.payload?.cooldownActive === false;

    if (!checks.clearAfter) {
      hard.push(`CLEAR_AFTER_FAILED:${JSON.stringify(clearAfter)}`);
    }

    await triggerFocusSync(pageB);
    await waitForClear(pageB);

    await triggerFocusSync(pageC);
    await waitForClear(pageC);

    const clearedB = await state(pageB);
    const clearedC = await state(pageC);

    checks.serverClearPropagatesOnFocus =
      clearedB.storedRemainingSeconds === 0 &&
      clearedC.storedRemainingSeconds === 0 &&
      clearedB.ariaDisabled !== "true" &&
      clearedC.ariaDisabled !== "true";

    if (!checks.serverClearPropagatesOnFocus) {
      hard.push("SERVER_CLEAR_DID_NOT_PROPAGATE");
    }

    checks.emailJsRequests = emailJsRequests;
    checks.contactGetRequests = contactGetRequests;
    checks.contactPostRequests = contactPostRequests;

    if (emailJsRequests !== 0) {
      hard.push(`EMAILJS_REQUESTS_DETECTED:${emailJsRequests}`);
    }

    if (contactGetRequests < 4) {
      hard.push(`INSUFFICIENT_STATUS_GETS:${contactGetRequests}`);
    }

    const summary = {
      status: hard.length ? "FAIL" : "PASS",
      browser: "webkit",
      purpose:
        "shared server cooldown synchronization across independent browser/storage contexts",
      seedSeconds: SEED_SECONDS,
      reminderVisibleMs: REMINDER_VISIBLE_MS,
      hard,
      checks,
      safety: {
        emailJsRequests,
      },
    };

    fs.writeFileSync(
      path.join(outputDir, "report.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          summary,
        },
        null,
        2
      )
    );

    process.stdout.write(
      `\nContact shared-cooldown WebKit QA\n${JSON.stringify(summary, null, 2)}\n`
    );

    if (hard.length) {
      process.exitCode = 1;
    }
  } finally {
    for (const context of contexts) {
      try {
        await context.close();
      } catch {
        // Ignore cleanup-only failures.
      }
    }

    await browser.close();

    if (server.child) {
      server.child.kill();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
