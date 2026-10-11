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

async function cooldownState(page) {
  return page.evaluate((key) => {
    const message = document.querySelector(".cooldownMessageText");
    const button = document.querySelector(".formButton");
    const stored = Number(localStorage.getItem(key) || 0);

    return {
      text: message?.textContent?.trim() || "",
      messageVisible: Boolean(
        message &&
        message.getBoundingClientRect().width > 0 &&
        getComputedStyle(message).visibility !== "hidden"
      ),
      ariaDisabled: button?.getAttribute("aria-disabled") || null,
      nativeDisabled: Boolean(button?.disabled),
      storedCooldownUntil: stored,
      storedRemainingSeconds:
        stored > Date.now()
          ? Math.ceil((stored - Date.now()) / 1000)
          : 0,
    };
  }, STORAGE_KEY);
}

async function waitForCooldown(page, timeout = 5000) {
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

async function waitForCooldownClear(page, timeout = 5000) {
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

async function screenshotContact(page, name) {
  await page.locator(".contact").screenshot({
    path: path.join(screenshotsDir, `${name}.png`),
  });
}

(async () => {
  const server = await startServerIfNeeded();
  const browser = await webkit.launch({ headless: !headed });

  const hard = [];
  const checks = {};
  let emailJsRequests = 0;
  let contactPostRequests = 0;
  let contactGetRequests = 0;

  const contexts = [];

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

    /* Start from a clean shared server state. */
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

    await pageA.reload({ waitUntil: "domcontentloaded" });
    await pageB.reload({ waitUntil: "domcontentloaded" });

    const beforeA = await cooldownState(pageA);
    const beforeB = await cooldownState(pageB);

    checks.independentContextsStartClear =
      beforeA.storedRemainingSeconds === 0 &&
      beforeB.storedRemainingSeconds === 0;

    if (!checks.independentContextsStartClear) {
      hard.push("CONTEXTS_DID_NOT_START_CLEAR");
    }

    /* Seed from browser/context A without EmailJS. */
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

    /*
     * A was already open before seeding. Bringing it forward must trigger the
     * focus/visibility status refresh and hydrate its local cooldown state.
     */
    await pageA.bringToFront();
    await waitForCooldown(pageA);

    const afterSeedA = await cooldownState(pageA);
    checks.seedBrowserHydrated =
      afterSeedA.storedRemainingSeconds > 0 &&
      afterSeedA.ariaDisabled === "true" &&
      afterSeedA.nativeDisabled === false;

    if (!checks.seedBrowserHydrated) {
      hard.push("SEED_BROWSER_DID_NOT_HYDRATE");
    }

    await screenshotContact(pageA, "01-seed-browser-active");

    /*
     * B is an entirely separate WebKit storage context that was already open
     * before the seed. Focus must make it discover the shared server cooldown.
     */
    await pageB.bringToFront();
    await waitForCooldown(pageB);

    const syncedB = await cooldownState(pageB);
    checks.preexistingIndependentContextSyncedOnFocus =
      syncedB.storedRemainingSeconds > 0 &&
      syncedB.ariaDisabled === "true" &&
      syncedB.nativeDisabled === false &&
      /Message limit reached\. Try again in /.test(syncedB.text);

    if (!checks.preexistingIndependentContextSyncedOnFocus) {
      hard.push("PREEXISTING_CONTEXT_DID_NOT_SYNC_ON_FOCUS");
    }

    await screenshotContact(pageB, "02-preexisting-independent-context-synced");

    /*
     * C models another browser/private session opened only after the cooldown
     * already exists. It has no localStorage but must hydrate on first load.
     */
    const contextC = await makeContext();
    const pageC = await contextC.newPage();

    await pageC.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await pageC.waitForSelector(".contact", { timeout: 30000 });
    await waitForCooldown(pageC);

    const syncedC = await cooldownState(pageC);
    checks.freshPrivateLikeContextSyncedOnInitialLoad =
      syncedC.storedRemainingSeconds > 0 &&
      syncedC.ariaDisabled === "true" &&
      syncedC.nativeDisabled === false;

    if (!checks.freshPrivateLikeContextSyncedOnInitialLoad) {
      hard.push("FRESH_CONTEXT_DID_NOT_SYNC_ON_INITIAL_LOAD");
    }

    await screenshotContact(pageC, "03-fresh-private-like-context-synced");

    /* Exact-second countdown must continue against the original expiry. */
    const firstText = syncedC.text;
    const firstRemaining = syncedC.storedRemainingSeconds;

    await pageC.waitForTimeout(2200);

    const laterC = await cooldownState(pageC);
    checks.dynamicCountdownTicks =
      laterC.storedRemainingSeconds <= firstRemaining - 1 &&
      laterC.text !== firstText &&
      /\d+s\./.test(laterC.text);

    if (!checks.dynamicCountdownTicks) {
      hard.push(
        `COUNTDOWN_DID_NOT_TICK:first=${firstText};later=${laterC.text}`
      );
    }

    /*
     * Let the 9-second reminder visibility window expire. The actual cooldown
     * must remain active; a blocked Send click must reveal the current time and
     * replay the horizontal shake without submitting.
     */
    const buttonC = pageC.locator(".formButton");
    const messageC = pageC.locator(".cooldownMessage");

    await messageC.waitFor({
      state: "detached",
      timeout: REMINDER_VISIBLE_MS + 3500,
    });

    const activeAfterFade = await cooldownState(pageC);
    checks.fadeDoesNotEndCooldown =
      activeAfterFade.storedRemainingSeconds > 0 &&
      activeAfterFade.ariaDisabled === "true";

    if (!checks.fadeDoesNotEndCooldown) {
      hard.push("REMINDER_FADE_ENDED_COOLDOWN");
    }

    await buttonC.click({ force: true });
    await messageC.waitFor({ state: "visible", timeout: 1500 });

    const shakeDetected = await pageC.evaluate(() => {
      const node = document.querySelector(".cooldownMessageText");
      if (!node) return false;

      if (node.classList.contains("cooldownJumpShake")) {
        return true;
      }

      return node
        .getAnimations()
        .some((animation) =>
          String(animation.animationName || "").includes(
            "contactCooldownHorizontalShake"
          )
        );
    });

    const restoredC = await cooldownState(pageC);
    checks.blockedClickRestoresCurrentCountdown =
      restoredC.messageVisible &&
      restoredC.storedRemainingSeconds > 0 &&
      /Message limit reached\. Try again in /.test(restoredC.text);

    checks.horizontalShakeReplayed = shakeDetected;

    if (!checks.blockedClickRestoresCurrentCountdown) {
      hard.push("BLOCKED_CLICK_DID_NOT_RESTORE_CURRENT_COUNTDOWN");
    }

    if (!checks.horizontalShakeReplayed) {
      hard.push("HORIZONTAL_SHAKE_NOT_DETECTED");
    }

    await screenshotContact(pageC, "04-blocked-click-restored-after-fade");

    /* Clear on A; B and C must clear when focused again. */
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

    await pageB.bringToFront();
    await waitForCooldownClear(pageB);

    await pageC.bringToFront();
    await waitForCooldownClear(pageC);

    const clearedB = await cooldownState(pageB);
    const clearedC = await cooldownState(pageC);

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

    if (contactGetRequests < 3) {
      hard.push(`INSUFFICIENT_STATUS_GETS:${contactGetRequests}`);
    }

    const summary = {
      status: hard.length ? "FAIL" : "PASS",
      browser: "webkit",
      purpose: "shared server cooldown synchronization across independent browser/storage contexts",
      seedSeconds: SEED_SECONDS,
      reminderVisibleMs: REMINDER_VISIBLE_MS,
      hard,
      checks,
      evidence: {
        screenshots: [
          "01-seed-browser-active.png",
          "02-preexisting-independent-context-synced.png",
          "03-fresh-private-like-context-synced.png",
          "04-blocked-click-restored-after-fade.png",
        ],
      },
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
