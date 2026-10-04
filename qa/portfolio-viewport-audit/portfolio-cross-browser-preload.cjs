#!/usr/bin/env node
"use strict";

/*
 * Portfolio cross-browser Playwright hardening preload.
 *
 * This is intentionally QA-only. It leaves production Portfolio code and
 * production portfolio.css untouched while bringing the Portfolio browser
 * bootstrap in line with the proven Hero/About Firefox + WebKit workflow.
 *
 * Load with:
 *   node -r qa/portfolio-viewport-audit/portfolio-cross-browser-preload.cjs ...
 */

const fs = require("fs");
const path = require("path");
const playwright = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const TOUCH_QUERY = "(hover: none), (pointer: coarse)";

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const family = argValue("family", "all");
const browserName = String(argValue("browser", "chromium")).toLowerCase();
const outputDir = path.resolve(
  ROOT,
  argValue("output-dir", "qa-results/portfolio/cross-browser-bootstrap")
);
const inputModeArg = String(argValue("input-mode", "auto")).toLowerCase();

const touchFamilies = new Set([
  "phone-portrait",
  "phone-landscape",
  "foldable",
  "tablet-portrait",
  "tablet-landscape",
]);

const touchMode =
  inputModeArg === "touch" ||
  (inputModeArg === "auto" && touchFamilies.has(family));

if (!["auto", "touch", "pointer"].includes(inputModeArg)) {
  throw new Error("--input-mode must be auto, touch, or pointer");
}

fs.mkdirSync(path.join(outputDir, "diagnostics"), { recursive: true });

const pageState = new WeakMap();

function sanitize(value) {
  return String(value)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function isSameUrlFirefoxReplacement(error, targetUrl) {
  if (browserName !== "firefox") return false;
  const message = String(error?.message || error);
  return (
    message.includes("is interrupted by another navigation") &&
    message.includes(`Navigation to \"${targetUrl}\"`)
  );
}

async function confirmFinalDocument(page, targetUrl, timeout = 15000) {
  const target = new URL(targetUrl);

  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});

  await page.waitForFunction(
    ({ origin, pathname }) => {
      const ready =
        document.readyState === "interactive" ||
        document.readyState === "complete";

      return (
        ready &&
        location.origin === origin &&
        location.pathname === pathname
      );
    },
    {
      origin: target.origin,
      pathname: target.pathname,
    },
    { timeout }
  );
}

async function collectFailureDump(page, error = null) {
  const state = pageState.get(page) || {
    runtimeErrors: [],
    consoleErrors: [],
    requestFailures: [],
    navigationEvents: [],
  };

  let documentDump = null;

  try {
    documentDump = await page.evaluate(() => {
      const inspect = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return { present: false };

        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        return {
          present: true,
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity),
          rect: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
        };
      };

      const root = document.querySelector("#root");
      const rootHtml = root?.innerHTML || "";

      return {
        href: location.href,
        readyState: document.readyState,
        title: document.title,
        root: {
          present: Boolean(root),
          childElementCount: root?.childElementCount ?? null,
          innerHTMLLength: rootHtml.length,
          htmlPreview: rootHtml.slice(0, 1200),
        },
        hero: inspect(".hero"),
        about: inspect(".about"),
        portfolio: inspect(".portfolio"),
        portfolioSection: inspect('.portfolio')?.present
          ? inspect(".portfolio")
          : { present: false },
        touchLayoutActive:
          document.querySelector(".portfolio")?.classList.contains("pTouchLayout") ?? false,
        touchMediaMatches:
          window.matchMedia("(hover: none), (pointer: coarse)").matches,
        viewport: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          visualWidth: window.visualViewport?.width ?? null,
          visualHeight: window.visualViewport?.height ?? null,
        },
      };
    });
  } catch (dumpError) {
    documentDump = {
      unavailable: true,
      error: String(dumpError?.stack || dumpError),
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    browser: browserName,
    family,
    requestedInputMode: inputModeArg,
    resolvedInputMode: touchMode ? "touch" : "pointer",
    pageUrl: (() => {
      try {
        return page.url();
      } catch {
        return null;
      }
    })(),
    error: error ? String(error?.stack || error) : null,
    document: documentDump,
    runtimeErrors: [...state.runtimeErrors],
    consoleErrors: [...state.consoleErrors],
    requestFailures: [...state.requestFailures],
    navigationEvents: [...state.navigationEvents],
  };
}

async function writeFailureDump(page, error, label = "bootstrap") {
  const dump = await collectFailureDump(page, error);
  const viewport = (() => {
    try {
      return page.viewportSize();
    } catch {
      return null;
    }
  })();

  const filename = [
    "FAIL",
    sanitize(browserName),
    sanitize(family),
    viewport ? `${viewport.width}x${viewport.height}` : "unknown-viewport",
    sanitize(label),
    Date.now(),
  ].join("__") + ".json";

  const fullPath = path.join(outputDir, "diagnostics", filename);
  fs.writeFileSync(fullPath, JSON.stringify(dump, null, 2) + "\n", "utf8");
  process.stderr.write(`[portfolio-cross-browser] diagnostic: ${path.relative(ROOT, fullPath)}\n`);
  return fullPath;
}

async function settleWebKit(page) {
  if (browserName !== "webkit") return;

  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });

  /* Same compositor grace period used by the proven About runner. */
  await page.waitForTimeout(650);
}

function instrumentPage(page) {
  const state = {
    runtimeErrors: [],
    consoleErrors: [],
    requestFailures: [],
    navigationEvents: [],
  };
  pageState.set(page, state);

  page.on("pageerror", (error) => {
    state.runtimeErrors.push(String(error?.stack || error));
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      state.consoleErrors.push(message.text());
    }
  });

  page.on("requestfailed", (request) => {
    state.requestFailures.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText || null,
    });
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      state.navigationEvents.push({
        type: "framenavigated",
        at: new Date().toISOString(),
        url: frame.url(),
      });
    }
  });

  page.on("domcontentloaded", () => {
    state.navigationEvents.push({
      type: "domcontentloaded",
      at: new Date().toISOString(),
      url: page.url(),
    });
  });

  page.on("load", () => {
    state.navigationEvents.push({
      type: "load",
      at: new Date().toISOString(),
      url: page.url(),
    });
  });

  return new Proxy(page, {
    get(target, prop, receiver) {
      if (prop === "goto") {
        return async (url, options = {}) => {
          const gotoOptions = {
            ...options,
            waitUntil:
              browserName === "webkit"
                ? "networkidle"
                : (options.waitUntil || "domcontentloaded"),
            timeout: options.timeout ?? 30000,
          };

          try {
            const response = await target.goto(url, gotoOptions);
            await confirmFinalDocument(target, url, 15000);
            return response;
          } catch (error) {
            if (isSameUrlFirefoxReplacement(error, url)) {
              state.navigationEvents.push({
                type: "firefox-same-url-replacement",
                at: new Date().toISOString(),
                url,
                message: String(error?.message || error),
              });

              try {
                await confirmFinalDocument(target, url, 15000);
                return null;
              } catch (settleError) {
                await writeFailureDump(
                  target,
                  settleError,
                  "firefox-replacement-navigation-did-not-settle"
                );
                throw settleError;
              }
            }

            await writeFailureDump(target, error, "navigation-error");
            throw error;
          }
        };
      }

      if (prop === "waitForSelector") {
        return async (selector, options = {}) => {
          if (selector !== ".portfolio") {
            return target.waitForSelector(selector, options);
          }

          const timeout = Math.min(options.timeout ?? 15000, 15000);

          try {
            await target.waitForSelector("#root", {
              state: "attached",
              timeout,
            });

            await target.waitForFunction(
              () => {
                const root = document.querySelector("#root");
                return Boolean(root && root.childElementCount > 0);
              },
              null,
              { timeout }
            );

            const handle = await target.waitForSelector(".portfolio", {
              state: "attached",
              timeout,
            });

            await target.waitForFunction(
              () => {
                const portfolio = document.querySelector(".portfolio");
                if (!portfolio) return false;
                const rect = portfolio.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              },
              null,
              { timeout }
            );

            await settleWebKit(target);
            return handle;
          } catch (error) {
            await writeFailureDump(target, error, "portfolio-not-attached");
            throw error;
          }
        };
      }

      if (prop === "evaluate") {
        return async (...args) => {
          const result = await target.evaluate(...args);

          if (
            result &&
            typeof result === "object" &&
            Object.prototype.hasOwnProperty.call(result, "expectedIndex") &&
            Object.prototype.hasOwnProperty.call(result, "portfolio")
          ) {
            const qaInput = await target.evaluate(() => ({
              touchLayoutActive:
                document.querySelector(".portfolio")?.classList.contains("pTouchLayout") ?? false,
              touchMediaMatches:
                window.matchMedia("(hover: none), (pointer: coarse)").matches,
              maxTouchPoints: navigator.maxTouchPoints ?? null,
            }));

            return {
              ...result,
              qaInput,
            };
          }

          return result;
        };
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function installTouchInit(context) {
  if (!touchMode) return;

  await context.addInitScript((touchQuery) => {
    const nativeMatchMedia = window.matchMedia.bind(window);

    window.matchMedia = (query) => {
      if (String(query).replace(/\s+/g, " ").trim() === touchQuery) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return true; },
        };
      }

      return nativeMatchMedia(query);
    };
  }, TOUCH_QUERY);
}

function wrapBrowserType(name) {
  const browserType = playwright[name];
  if (!browserType || browserType.__portfolioCrossBrowserWrapped) return;

  const originalLaunch = browserType.launch.bind(browserType);

  browserType.launch = async (...args) => {
    const browser = await originalLaunch(...args);

    return new Proxy(browser, {
      get(target, prop, receiver) {
        if (prop === "newContext") {
          return async (options = {}) => {
            const context = await target.newContext({
              deviceScaleFactor: 1,
              ...options,
              hasTouch: touchMode,
            });

            await installTouchInit(context);

            return new Proxy(context, {
              get(contextTarget, contextProp, contextReceiver) {
                if (contextProp === "newPage") {
                  return async (...pageArgs) => {
                    const page = await contextTarget.newPage(...pageArgs);
                    return instrumentPage(page);
                  };
                }

                const contextValue = Reflect.get(
                  contextTarget,
                  contextProp,
                  contextReceiver
                );

                return typeof contextValue === "function"
                  ? contextValue.bind(contextTarget)
                  : contextValue;
              },
            });
          };
        }

        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };

  Object.defineProperty(browserType, "__portfolioCrossBrowserWrapped", {
    value: true,
    configurable: true,
  });
}

for (const name of ["chromium", "firefox", "webkit"]) {
  wrapBrowserType(name);
}

process.stdout.write(
  `[portfolio-cross-browser] ${browserName} / ${family} / input=${touchMode ? "touch" : "pointer"}\n`
);
