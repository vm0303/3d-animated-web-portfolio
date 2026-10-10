#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium, firefox, webkit } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const STORAGE_KEY = "portfolioContactCooldownUntil";
const TWO_HOURS_47_MINUTES_MS = (2 * 60 + 47) * 60 * 1000;
const EXPECTED_TEXT = "Message limit reached. Try again in 2h 47m.";
const REMINDER_VISIBLE_MS = 6000;

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const browserName = argValue("browser", "chromium");
const port = Number(argValue("port", "4198"));
const width = Number(argValue("width", "412"));
const height = Number(argValue("height", "915"));
const screenshotMode = argValue("screenshots", "all");
const headed = hasFlag("headed");
const outputDir = path.resolve(
  ROOT,
  argValue("output-dir", "qa-results/contact/cooldown-interaction")
);

const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) {
  throw new Error(`Unsupported browser: ${browserName}`);
}

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

async function waitForShake(page, timeout = 1200) {
  try {
    await page.waitForFunction(
      () => {
        const node = document.querySelector(".cooldownMessageText");
        if (!node) return false;

        return node.getAnimations().some((animation) => {
          const frames = animation.effect?.getKeyframes?.() || [];
          return frames.some((frame) =>
            String(frame.transform || "").includes("translateX")
          );
        });
      },
      null,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

async function messageVisible(page) {
  const locator = page.locator(".cooldownMessage");
  return (await locator.count()) > 0 && (await locator.isVisible());
}

async function screenshotContact(page, name) {
  if (screenshotMode !== "all") return;

  await page.locator(".contact").screenshot({
    path: path.join(screenshotsDir, `${name}.png`),
  });
}

(async () => {
  const server = await startServerIfNeeded();
  const browser = await browserType.launch({ headless: !headed });
  const hard = [];
  const checks = {};
  let contactApiRequests = 0;
  let emailJsRequests = 0;

  try {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      reducedMotion: "no-preference",
    });

    await context.addInitScript(
      ({ key, duration }) => {
        try {
          window.localStorage.setItem(
            key,
            String(Date.now() + duration)
          );
        } catch {
          // Ignore inaccessible pre-navigation documents. The script runs again
          // for the real page origin before application code executes.
        }
      },
      {
        key: STORAGE_KEY,
        duration: TWO_HOURS_47_MINUTES_MS,
      }
    );

    const page = await context.newPage();

    await page.route("**/api/contact", async (route) => {
      contactApiRequests += 1;
      await route.abort();
    });

    await page.route("https://api.emailjs.com/**", async (route) => {
      emailJsRequests += 1;
      await route.abort();
    });

    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForSelector(".contact", { timeout: 30000 });

    await page.evaluate(() => {
      window.__contactSubmitCount = 0;
      document.addEventListener(
        "submit",
        (event) => {
          if (event.target?.matches?.(".contact form")) {
            window.__contactSubmitCount += 1;
          }
        },
        true
      );
    });

    const message = page.locator(".cooldownMessage");
    const button = page.locator(".formButton");

    await message.waitFor({ state: "visible", timeout: 3000 });

    const initialText = (await message.textContent())?.trim() || "";
    checks.initialExactCopy = initialText === EXPECTED_TEXT;
    if (!checks.initialExactCopy) {
      hard.push(`INITIAL_COPY_MISMATCH:${initialText}`);
    }

    checks.initialAriaDisabled =
      (await button.getAttribute("aria-disabled")) === "true";
    if (!checks.initialAriaDisabled) {
      hard.push("BUTTON_NOT_ARIA_DISABLED_DURING_COOLDOWN");
    }

    checks.nativeButtonStillClickable = await button.evaluate(
      (node) => !node.disabled
    );
    if (!checks.nativeButtonStillClickable) {
      hard.push("BUTTON_NATIVE_DISABLED_PREVENTS_REMINDER_INTERACTION");
    }

    checks.initialShakeDetected = await waitForShake(page);
    if (!checks.initialShakeDetected) {
      hard.push("INITIAL_SHAKE_NOT_DETECTED");
    }

    await page.locator(".contact").scrollIntoViewIfNeeded();
    await screenshotContact(page, "01-initial-cooldown-visible");

    /* Initial reminder should disappear after six seconds of inactivity. */
    await message.waitFor({
      state: "detached",
      timeout: REMINDER_VISIBLE_MS + 2500,
    });
    checks.initialFadeOutAfterInactivity = true;

    /* A blocked click must restore the message and shake it again. */
    await button.click({ force: true });
    await message.waitFor({ state: "visible", timeout: 1200 });

    checks.clickRestoresMessage = await messageVisible(page);
    checks.clickRestoresExactCopy =
      ((await message.textContent())?.trim() || "") === EXPECTED_TEXT;
    checks.clickRestartsShake = await waitForShake(page);

    if (!checks.clickRestoresMessage) hard.push("CLICK_DID_NOT_RESTORE_MESSAGE");
    if (!checks.clickRestoresExactCopy) hard.push("CLICK_COPY_MISMATCH");
    if (!checks.clickRestartsShake) hard.push("CLICK_DID_NOT_RESTART_SHAKE");

    await screenshotContact(page, "02-blocked-click-restored-reminder");

    /*
     * Prove the inactivity timer restarts. Three seconds after the first click,
     * click again. At 3.5 seconds after that second click the message must still
     * be visible even though more than six seconds have elapsed since click #1.
     */
    await page.waitForTimeout(3000);
    await button.click({ force: true });
    await page.waitForTimeout(3500);

    checks.timerResetKeepsMessageVisible = await messageVisible(page);
    if (!checks.timerResetKeepsMessageVisible) {
      hard.push("INACTIVITY_TIMER_DID_NOT_RESET");
    }

    /* It should disappear only after six seconds from the most recent click. */
    await message.waitFor({ state: "detached", timeout: 3800 });
    checks.fadeOutUsesLastClick = true;

    /*
     * Spam-click sequence: each click should restart the shake/timer. The
     * reminder must remain visible until six seconds after the final click.
     */
    let spamShakeDetected = true;

    for (let i = 0; i < 4; i += 1) {
      await button.click({ force: true });
      await message.waitFor({ state: "visible", timeout: 1200 });

      if (!(await waitForShake(page))) {
        spamShakeDetected = false;
      }

      if (i < 3) {
        await page.waitForTimeout(450);
      }
    }

    checks.repeatedClicksRestartShake = spamShakeDetected;
    if (!checks.repeatedClicksRestartShake) {
      hard.push("REPEATED_CLICK_SHAKE_NOT_RESTARTED");
    }

    await page.waitForTimeout(3500);
    checks.spamTimerStillVisible = await messageVisible(page);
    if (!checks.spamTimerStillVisible) {
      hard.push("SPAM_CLICKS_DID_NOT_KEEP_REMINDER_VISIBLE");
    }

    await screenshotContact(page, "03-spam-click-timer-reset");

    await message.waitFor({ state: "detached", timeout: 3800 });
    checks.spamReminderEventuallyFades = true;

    const submitCount = await page.evaluate(
      () => window.__contactSubmitCount || 0
    );

    checks.formSubmissions = submitCount;
    checks.contactApiRequests = contactApiRequests;
    checks.emailJsRequests = emailJsRequests;

    if (submitCount !== 0) {
      hard.push(`FORM_SUBMITTED_DURING_COOLDOWN:${submitCount}`);
    }
    if (contactApiRequests !== 0) {
      hard.push(`CONTACT_API_REQUEST_DURING_COOLDOWN:${contactApiRequests}`);
    }
    if (emailJsRequests !== 0) {
      hard.push(`EMAILJS_REQUEST_DURING_COOLDOWN:${emailJsRequests}`);
    }

    const summary = {
      status: hard.length ? "FAIL" : "PASS",
      browser: browserName,
      viewport: { width, height },
      expectedText: EXPECTED_TEXT,
      reminderVisibleMs: REMINDER_VISIBLE_MS,
      hard,
      checks,
      safety: {
        formSubmissions: submitCount,
        contactApiRequests,
        emailJsRequests,
      },
    };

    fs.writeFileSync(
      path.join(outputDir, "report.json"),
      JSON.stringify(
        { generatedAt: new Date().toISOString(), summary },
        null,
        2
      )
    );

    process.stdout.write(
      `\nContact cooldown interaction QA\n${JSON.stringify(summary, null, 2)}\n`
    );

    if (hard.length) {
      process.exitCode = 1;
    }

    await context.close();
  } finally {
    await browser.close();
    if (server.child) server.child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
