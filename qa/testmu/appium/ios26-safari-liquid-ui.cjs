const { remote } = require("webdriverio");
const fs = require("node:fs");
const path = require("node:path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) =>
    Number.isFinite(Number(value))
        ? Math.round(Number(value) * 100) / 100
        : null;

const slug = (value) =>
    String(value ?? "")
        .trim()
        .replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/^-+|-+$/g, "") || "unknown";

const timestamp = () =>
    new Date().toISOString().replace(/[:.]/g, "-");

const LT_USERNAME = process.env.LT_USERNAME;
const LT_ACCESS_KEY = process.env.LT_ACCESS_KEY;
const LT_TUNNEL_NAME = process.env.LT_TUNNEL_NAME;

const DEFAULT_BASE_URL =
    process.env.QA_BASE_URL ||
    "http://192.168.1.233:5173";

const OUTPUT_ROOT = path.join(
    process.cwd(),
    "qa-results",
    "testmu",
    "appium",
    "ios26-safari"
);

const requireEnvironment = () => {
    if (!LT_USERNAME) {
        throw new Error("LT_USERNAME environment variable is missing.");
    }
    if (!LT_ACCESS_KEY) {
        throw new Error("LT_ACCESS_KEY environment variable is missing.");
    }
};

const buildUrl = (baseUrl, testCase) => {
    const url = new URL(
        baseUrl.endsWith("/")
            ? baseUrl
            : `${baseUrl}/`
    );

    url.searchParams.set("qa", "1");
    url.searchParams.set("qaOverlay", "0");
    url.searchParams.set("qaLabel", testCase.id);
    url.searchParams.set("qaDevice", testCase.deviceName);
    url.searchParams.set("qaManufacturer", "Apple");
    url.searchParams.set("qaPlatform", "iOS");
    url.searchParams.set("qaOs", "26");
    url.searchParams.set("qaBrowser", "Safari");

    return url.toString();
};

const viewportSnapshotScript = () => {
    const r2 = (value) =>
        Number.isFinite(Number(value))
            ? Math.round(Number(value) * 100) / 100
            : null;

    const measureUnit = (unit) => {
        const el = document.createElement("div");
        Object.assign(el.style, {
            position: "fixed",
            visibility: "hidden",
            pointerEvents: "none",
            width: "1px",
            height: `100${unit}`,
        });
        document.documentElement.appendChild(el);
        const value = r2(el.getBoundingClientRect().height);
        el.remove();
        return value;
    };

    const visual = window.visualViewport || null;
    const visualPageTop = r2(visual?.pageTop ?? window.scrollY);
    const visualHeight = r2(visual?.height ?? window.innerHeight);
    const visualPageBottom =
        visualPageTop != null && visualHeight != null
            ? r2(visualPageTop + visualHeight)
            : null;

    const svh = measureUnit("svh");
    const dvh = measureUnit("dvh");
    const lvh = measureUnit("lvh");
    const delta =
        lvh != null && dvh != null
            ? r2(lvh - dvh)
            : null;
    const liquidGuard =
        delta != null
            ? r2(Math.min(128, Math.max(88, 3 * delta)))
            : null;

    const sections = [
        ...document.querySelectorAll(".container > section"),
    ].map((section, index) => {
        const rect = section.getBoundingClientRect();
        const style = getComputedStyle(section);
        const first = section.firstElementChild;
        const firstRect = first?.getBoundingClientRect() || null;

        const pageTop = r2(rect.top + window.scrollY);
        const pageBottom = r2(rect.bottom + window.scrollY);
        const contentPageTop = firstRect
            ? r2(firstRect.top + window.scrollY)
            : null;

        return {
            index,
            id: section.id || null,
            top: r2(rect.top),
            bottom: r2(rect.bottom),
            pageTop,
            pageBottom,
            height: r2(rect.height),
            scrollSnapAlign: style.scrollSnapAlign || null,
            scrollSnapStop: style.scrollSnapStop || null,
            paddingTop: r2(Number.parseFloat(style.paddingTop) || 0),
            firstContentTop: firstRect ? r2(firstRect.top) : null,
            firstContentPageTop: contentPageTop,
            firstContentOffsetFromSectionTop:
                contentPageTop != null && pageTop != null
                    ? r2(contentPageTop - pageTop)
                    : null,
            topRelativeToVisual:
                pageTop != null && visualPageTop != null
                    ? r2(pageTop - visualPageTop)
                    : null,
            visibleIntersectionPx:
                visualPageTop != null &&
                visualPageBottom != null &&
                pageTop != null &&
                pageBottom != null
                    ? r2(
                        Math.max(
                            0,
                            Math.min(pageBottom, visualPageBottom) -
                            Math.max(pageTop, visualPageTop)
                        )
                    )
                    : null,
        };
    });

    return JSON.stringify({
        capturedAt: new Date().toISOString(),
        href: location.href,
        userAgent: navigator.userAgent,
        liquidClassActive:
            document.documentElement.classList.contains(
                "ios-safari-liquid-ui"
            ),
        inner: {
            width: r2(window.innerWidth),
            height: r2(window.innerHeight),
        },
        visual: visual
            ? {
                width: r2(visual.width),
                height: r2(visual.height),
                offsetTop: r2(visual.offsetTop),
                offsetLeft: r2(visual.offsetLeft),
                pageTop: r2(visual.pageTop),
                pageLeft: r2(visual.pageLeft),
                scale: r2(visual.scale),
            }
            : null,
        screen: {
            width: r2(screen.width),
            height: r2(screen.height),
        },
        scroll: {
            x: r2(window.scrollX),
            y: r2(window.scrollY),
        },
        viewportUnits: {
            svh,
            dvh,
            lvh,
            lvhMinusDvh: delta,
            liquidContentGuard: liquidGuard,
        },
        document: {
            scrollWidth: r2(document.documentElement.scrollWidth),
            clientWidth: r2(document.documentElement.clientWidth),
            scrollHeight: r2(document.documentElement.scrollHeight),
            horizontalOverflow:
                document.documentElement.scrollWidth >
                document.documentElement.clientWidth + 1,
        },
        sections,
    });
};

const waitForPortfolioApp = async (
    browser,
    { timeout = 90000 } = {}
) => {
    let lastProbe = null;

    await browser.waitUntil(
        async () => {
            try {
                lastProbe = await browser.execute(() => {
                    const readyState = document.readyState;
                    const root = document.querySelector("#root");
                    const hero = document.querySelector(".hero");
                    const heroTitle = document.querySelector(".heroTitle");

                    return {
                        readyState,
                        href: location.href,
                        title: document.title,
                        rootExists: Boolean(root),
                        rootChildCount: root?.childElementCount ?? 0,
                        heroExists: Boolean(hero),
                        heroTitleExists: Boolean(heroTitle),
                        bodyTextPreview:
                            document.body?.innerText
                                ?.replace(/\s+/g, " ")
                                .trim()
                                .slice(0, 180) || "",
                    };
                });

                const stateReady =
                    lastProbe?.readyState === "interactive" ||
                    lastProbe?.readyState === "complete";

                return Boolean(
                    stateReady &&
                    lastProbe?.rootExists &&
                    lastProbe?.rootChildCount > 0 &&
                    lastProbe?.heroExists &&
                    lastProbe?.heroTitleExists
                );
            } catch {
                return false;
            }
        },
        {
            timeout,
            interval: 750,
            timeoutMsg:
                `Portfolio app did not become render-ready within ` +
                `${Math.round(timeout / 1000)} seconds.`,
        }
    );

    return lastProbe;
};

const waitForHeroVisualAssets = async (
    browser,
    { timeout = 60000 } = {}
) => {
    let lastProbe = null;

    await browser.waitUntil(
        async () => {
            try {
                lastProbe = await browser.execute(() => {
                    const heroImage =
                        document.querySelector(".hImg img");

                    const certificationImages = [
                        ...document.querySelectorAll(
                            ".certificationsImages img"
                        ),
                    ];

                    const heroImageReady = Boolean(
                        heroImage &&
                        heroImage.complete &&
                        heroImage.naturalWidth > 0 &&
                        heroImage.naturalHeight > 0
                    );

                    const certificationsReady =
                        certificationImages.length === 0 ||
                        certificationImages.every(
                            (img) =>
                                img.complete &&
                                img.naturalWidth > 0 &&
                                img.naturalHeight > 0
                        );

                    return {
                        heroImageReady,
                        heroImageNaturalWidth:
                            heroImage?.naturalWidth ?? 0,
                        heroImageNaturalHeight:
                            heroImage?.naturalHeight ?? 0,
                        certificationImageCount:
                            certificationImages.length,
                        certificationsReady,
                    };
                });

                return Boolean(
                    lastProbe?.heroImageReady &&
                    lastProbe?.certificationsReady
                );
            } catch {
                return false;
            }
        },
        {
            timeout,
            interval: 750,
            timeoutMsg:
                `Hero visual assets did not become ready within ` +
                `${Math.round(timeout / 1000)} seconds.`,
        }
    );

    return lastProbe;
};

const writeErrorDiagnostics = async ({
    browser,
    testCase,
    runId,
    error,
}) => {
    const dir = path.join(
        OUTPUT_ROOT,
        slug(runId),
        slug(testCase.deviceName)
    );
    fs.mkdirSync(dir, { recursive: true });

    const stem = [
        slug(testCase.deviceName),
        "iOS-26",
        "Safari",
        "portrait",
        "ERROR",
        timestamp(),
    ].join("__");

    const screenshotPath = path.join(dir, `${stem}.png`);
    const jsonPath = path.join(dir, `${stem}.json`);
    const sourcePath = path.join(dir, `${stem}.html`);

    const diagnostic = {
        artifactType: "testmu-ios26-safari-error-diagnostic",
        generatedAt: new Date().toISOString(),
        testCase,
        error: error?.stack || error?.message || String(error),
        currentUrl: null,
        page: null,
        screenshot: null,
        pageSource: null,
    };

    try {
        diagnostic.currentUrl = await browser.getUrl();
    } catch {
        // no-op
    }

    try {
        diagnostic.page = await browser.execute(() => ({
            readyState: document.readyState,
            href: location.href,
            title: document.title,
            rootExists: Boolean(document.querySelector("#root")),
            rootChildCount:
                document.querySelector("#root")?.childElementCount ?? 0,
            heroExists: Boolean(document.querySelector(".hero")),
            heroTitleExists: Boolean(document.querySelector(".heroTitle")),
            bodyTextPreview:
                document.body?.innerText
                    ?.replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 500) || "",
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            userAgent: navigator.userAgent,
        }));
    } catch {
        // no-op
    }

    try {
        await browser.saveScreenshot(screenshotPath);
        diagnostic.screenshot =
            path.relative(process.cwd(), screenshotPath);
    } catch {
        // no-op
    }

    try {
        const source = await browser.getPageSource();
        fs.writeFileSync(sourcePath, source, "utf8");
        diagnostic.pageSource =
            path.relative(process.cwd(), sourcePath);
    } catch {
        // no-op
    }

    fs.writeFileSync(
        jsonPath,
        `${JSON.stringify(diagnostic, null, 2)}\n`,
        "utf8"
    );

    return {
        label: "error-diagnostic",
        json: path.relative(process.cwd(), jsonPath),
        screenshot: diagnostic.screenshot,
        pageSource: diagnostic.pageSource,
    };
};

const parseViewportSnapshotResult = (raw) => {
    let parsed = raw;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch (error) {
            throw new Error(
                `Viewport snapshot returned invalid JSON: ` +
                `${error?.message || error}`
            );
        }
    }

    /*
     * Safari/WebKit remote automation can serialize a complex script result
     * as a remote WINDOW reference instead of the object returned by the
     * page. Treat that as a transport problem, never as a CSS/layout failure.
     */
    if (
        parsed &&
        typeof parsed === "object" &&
        ("WINDOW" in parsed || "window-fcc6-11e5-b4f8-330a88ab9d7f" in parsed)
    ) {
        throw new Error(
            "WebKit serialized the viewport snapshot as a remote window " +
            "reference instead of snapshot data."
        );
    }

    if (
        !parsed ||
        typeof parsed !== "object" ||
        !parsed.inner ||
        !parsed.viewportUnits ||
        !Array.isArray(parsed.sections)
    ) {
        const preview = (() => {
            try {
                return JSON.stringify(parsed).slice(0, 500);
            } catch {
                return String(parsed).slice(0, 500);
            }
        })();

        throw new Error(
            `Viewport snapshot is structurally invalid. Raw preview: ${preview}`
        );
    }

    return parsed;
};

const forceSectionStart = async (
    browser,
    sectionIndex,
    {
        timeout = 15000,
        settleMs = 700,
    } = {}
) => {
    const startedAt = Date.now();
    let lastProbe = null;

    /*
     * IMPORTANT FOR SAFARI 26:
     *
     * window.scrollY is the layout-page scroll position, while
     * visualViewport.pageTop can differ as the Liquid Glass UI expands or
     * collapses. Our QA evaluator judges section alignment against the
     * VISUAL viewport, so this helper must use the exact same coordinate
     * system.
     *
     * The previous helper compared:
     *
     *   window.scrollY === sectionPageTop
     *
     * which can time out even when the section is visibly aligned.
     */

    await browser.execute(() => {
        try {
            history.scrollRestoration = "manual";
        } catch {
            // no-op
        }

        const html = document.documentElement;

        html.dataset.qaOriginalScrollSnapType =
            html.style.scrollSnapType || "";
        html.dataset.qaOriginalScrollBehavior =
            html.style.scrollBehavior || "";

        html.style.setProperty(
            "scroll-snap-type",
            "none",
            "important"
        );
        html.style.setProperty(
            "scroll-behavior",
            "auto",
            "important"
        );
    });

    while (Date.now() - startedAt < timeout) {
        try {
            lastProbe = await browser.execute((index) => {
                const sections = [
                    ...document.querySelectorAll(
                        ".container > section"
                    ),
                ];
                const target = sections[index];

                if (!target) {
                    return {
                        ok: false,
                        reason: "missing-section",
                    };
                }

                const rect = target.getBoundingClientRect();

                const sectionPageTop =
                    rect.top + window.scrollY;

                const visualPageTop =
                    window.visualViewport?.pageTop ??
                    window.scrollY;

                /*
                 * This is the same relationship used later by
                 * evaluateSnapshot():
                 *
                 *   topRelativeToVisual =
                 *       sectionPageTop - visualPageTop
                 */
                const visualDelta =
                    sectionPageTop - visualPageTop;

                if (Math.abs(visualDelta) > 1.5) {
                    const scrollingElement =
                        document.scrollingElement ||
                        document.documentElement;

                    const nextScrollTop =
                        scrollingElement.scrollTop +
                        visualDelta;

                    scrollingElement.scrollTop =
                        Math.max(0, nextScrollTop);

                    window.scrollTo(
                        0,
                        Math.max(0, nextScrollTop)
                    );
                }

                return {
                    ok: Math.abs(visualDelta) <= 1.5,
                    scrollY: window.scrollY,
                    visualPageTop,
                    sectionPageTop,
                    topRelativeToVisual: visualDelta,
                    visualOffsetTop:
                        window.visualViewport?.offsetTop ?? 0,
                };
            }, sectionIndex);

            if (lastProbe?.ok) {
                break;
            }
        } catch (error) {
            lastProbe = {
                ok: false,
                reason: "execute-error",
                error:
                    error?.message || String(error),
            };
        }

        await sleep(450);
    }

    /*
     * Restore normal scrolling even if Safari refused to settle. Failing to
     * reach the exact target is NOT a harness ERROR; the subsequent stable
     * snapshot/evaluator decides whether the real geometry is PASS or FAIL.
     */
    await browser.execute(() => {
        const html = document.documentElement;

        const originalSnap =
            html.dataset.qaOriginalScrollSnapType ?? "";
        const originalBehavior =
            html.dataset.qaOriginalScrollBehavior ?? "";

        if (originalSnap) {
            html.style.scrollSnapType = originalSnap;
        } else {
            html.style.removeProperty("scroll-snap-type");
        }

        if (originalBehavior) {
            html.style.scrollBehavior = originalBehavior;
        } else {
            html.style.removeProperty("scroll-behavior");
        }

        delete html.dataset.qaOriginalScrollSnapType;
        delete html.dataset.qaOriginalScrollBehavior;
    });

    await sleep(settleMs);

    /*
     * Measure once more using visualViewport coordinates. This result is
     * informational; it intentionally does not throw.
     */
    try {
        lastProbe = await browser.execute((index) => {
            const sections = [
                ...document.querySelectorAll(
                    ".container > section"
                ),
            ];
            const target = sections[index];

            if (!target) {
                return {
                    ok: false,
                    reason: "missing-section",
                };
            }

            const rect = target.getBoundingClientRect();
            const sectionPageTop =
                rect.top + window.scrollY;
            const visualPageTop =
                window.visualViewport?.pageTop ??
                window.scrollY;
            const visualDelta =
                sectionPageTop - visualPageTop;

            return {
                ok: Math.abs(visualDelta) <= 3,
                scrollY: window.scrollY,
                visualPageTop,
                sectionPageTop,
                topRelativeToVisual: visualDelta,
                visualOffsetTop:
                    window.visualViewport?.offsetTop ?? 0,
            };
        }, sectionIndex);
    } catch {
        // Preserve the previous probe.
    }

    return lastProbe;
};


const stableSnapshot = async (browser) => {
    let previous = null;
    let stableCount = 0;
    const samples = [];

    let lastSnapshotError = null;

    for (let attempt = 1; attempt <= 16; attempt += 1) {
        let current;

        try {
            const currentRaw =
                await browser.execute(viewportSnapshotScript);

            current =
                parseViewportSnapshotResult(currentRaw);

            lastSnapshotError = null;
        } catch (snapshotError) {
            lastSnapshotError = snapshotError;

            samples.push({
                attempt,
                snapshotTransportError:
                    snapshotError?.message || String(snapshotError),
            });

            await sleep(900);
            continue;
        }

        /*
         * Some iOS Safari/Appium sessions have intermittently omitted the
         * nested `scroll` object even though the rest of the snapshot
         * serializes correctly. Never crash the matrix because of that.
         * visualViewport.pageTop is an equivalent fallback for our stability
         * purposes.
         */
        const currentScrollY =
            current?.scroll?.y ??
            current?.visual?.pageTop ??
            0;

        samples.push({
            attempt,
            inner: current?.inner ?? null,
            visual: current?.visual ?? null,
            viewportUnits: current?.viewportUnits ?? null,
            scrollY: currentScrollY,
            hadScrollObject: Boolean(current?.scroll),
        });

        const currentWidth = current?.inner?.width ?? null;
        const currentHeight = current?.inner?.height ?? null;
        const previousWidth = previous?.inner?.width ?? null;
        const previousHeight = previous?.inner?.height ?? null;

        const same =
            previous &&
            currentWidth != null &&
            currentHeight != null &&
            previousWidth === currentWidth &&
            previousHeight === currentHeight &&
            Math.abs(
                (previous?.viewportUnits?.dvh ?? 0) -
                (current?.viewportUnits?.dvh ?? 0)
            ) < 0.5 &&
            Math.abs(
                (
                    previous?.scroll?.y ??
                    previous?.visual?.pageTop ??
                    0
                ) - currentScrollY
            ) < 1;

        stableCount = same ? stableCount + 1 : 0;

        if (stableCount >= 2) {
            return {
                stable: true,
                snapshot: current,
                samples,
            };
        }

        previous = current;
        await sleep(650);
    }

    if (!previous && lastSnapshotError) {
        throw new Error(
            "Unable to obtain a valid Safari viewport snapshot after retries. " +
            `${lastSnapshotError?.message || lastSnapshotError}`
        );
    }

    return {
        stable: false,
        snapshot: previous,
        samples,
    };
};

const classifyUiState = (snapshot) => {
    const delta = Number(
        snapshot?.viewportUnits?.lvhMinusDvh ?? 0
    );

    return delta > 2
        ? "expanded"
        : "collapsed-or-large";
};

const evaluateSnapshot = (snapshot, expectedSectionIndex = 0) => {
    const issues = [];

    if (
        !snapshot ||
        !snapshot.inner ||
        !snapshot.viewportUnits ||
        !Array.isArray(snapshot.sections)
    ) {
        return {
            status: "FAIL",
            issues: [
                {
                    severity: "FAIL",
                    code: "SNAPSHOT_INVALID",
                    message:
                        "Safari viewport snapshot is missing required geometry.",
                },
            ],
        };
    }
    const guard = Number(
        snapshot?.viewportUnits?.liquidContentGuard ?? 0
    );
    const dvh = Number(
        snapshot?.viewportUnits?.dvh ?? 0
    );

    if (!snapshot?.liquidClassActive) {
        issues.push({
            severity: "FAIL",
            code: "LIQUID_CLASS_INACTIVE",
            message:
                "Safari 26+ class ios-safari-liquid-ui is not active.",
        });
    }

    if (snapshot?.document?.horizontalOverflow) {
        issues.push({
            severity: "FAIL",
            code: "HORIZONTAL_OVERFLOW",
            message: "Document has horizontal overflow.",
        });
    }

    for (const section of snapshot?.sections || []) {
        if (
            dvh > 0 &&
            Math.abs(Number(section.height || 0) - dvh) > 3
        ) {
            issues.push({
                severity: "FAIL",
                code: "SECTION_HEIGHT_MISMATCH",
                section: section.id,
                message:
                    `${section.id || section.index} height ` +
                    `${section.height}px differs from 100dvh (${dvh}px).`,
            });
        }

        if (section.scrollSnapAlign !== "start") {
            issues.push({
                severity: "FAIL",
                code: "SECTION_NOT_START_SNAPPED",
                section: section.id,
                message:
                    `${section.id || section.index} uses ` +
                    `${section.scrollSnapAlign || "none"} instead of start.`,
            });
        }

        if (
            section.index > 0 &&
            Number(section.paddingTop || 0) + 1 < guard
        ) {
            issues.push({
                severity: "FAIL",
                code: "SECTION_GUARD_TOO_SMALL",
                section: section.id,
                message:
                    `${section.id || section.index} paddingTop ` +
                    `${section.paddingTop}px is below guard ${guard}px.`,
            });
        }
    }

    const active = snapshot?.sections?.[expectedSectionIndex];
    if (
        active &&
        Math.abs(Number(active.topRelativeToVisual || 0)) > 3
    ) {
        issues.push({
            severity: "FAIL",
            code: "SECTION_SNAP_OFFSET",
            section: active.id,
            message:
                `${active.id || expectedSectionIndex} is ` +
                `${active.topRelativeToVisual}px from visual viewport start.`,
        });
    }

    const failCount =
        issues.filter((item) => item.severity === "FAIL").length;

    return {
        status:
            failCount === 0
                ? "PASS_GEOMETRY_VISUAL_REVIEW_REQUIRED"
                : "FAIL",
        issues,
    };
};

const evaluateBrowserChromeTransition = (
    expandedSnapshot,
    collapsedSnapshot
) => {
    const issues = [];

    const expandedDelta = Number(
        expandedSnapshot?.viewportUnits?.lvhMinusDvh ?? 0
    );
    const collapsedDelta = Number(
        collapsedSnapshot?.viewportUnits?.lvhMinusDvh ?? 0
    );

    const expandedDvh = Number(
        expandedSnapshot?.viewportUnits?.dvh ?? 0
    );
    const collapsedDvh = Number(
        collapsedSnapshot?.viewportUnits?.dvh ?? 0
    );

    if (expandedDelta <= 2) {
        issues.push({
            severity: "FAIL",
            code: "SAFARI_EXPANDED_STATE_NOT_OBSERVED",
            message:
                `Initial Safari state did not expose an expanded-toolbar ` +
                `viewport delta (lvh-dvh=${expandedDelta}px).`,
        });
    }

    if (collapsedDelta > 2) {
        issues.push({
            severity: "FAIL",
            code: "SAFARI_COLLAPSED_STATE_NOT_OBSERVED",
            message:
                `Post-swipe Safari state still has lvh-dvh=` +
                `${collapsedDelta}px instead of collapsing near 0px.`,
        });
    }

    if (
        expandedDvh > 0 &&
        collapsedDvh > 0 &&
        collapsedDvh <= expandedDvh + 2
    ) {
        issues.push({
            severity: "FAIL",
            code: "SAFARI_VISUAL_HEIGHT_DID_NOT_EXPAND",
            message:
                `Safari dynamic viewport did not grow after toolbar ` +
                `collapse (${expandedDvh}px -> ${collapsedDvh}px).`,
        });
    }

    return {
        status:
            issues.length === 0
                ? "PASS_GEOMETRY_VISUAL_REVIEW_REQUIRED"
                : "FAIL",
        issues,
        metrics: {
            expandedLvhMinusDvh: expandedDelta,
            collapsedLvhMinusDvh: collapsedDelta,
            expandedDvh,
            collapsedDvh,
            dvhGrowth:
                expandedDvh > 0 && collapsedDvh > 0
                    ? collapsedDvh - expandedDvh
                    : null,
        },
    };
};

const writeArtifacts = async ({
    browser,
    testCase,
    runId,
    label,
    snapshotResult,
    evaluation,
}) => {
    const dir = path.join(
        OUTPUT_ROOT,
        slug(runId),
        slug(testCase.deviceName)
    );
    fs.mkdirSync(dir, { recursive: true });

    const stem = [
        slug(testCase.deviceName),
        "iOS-26",
        "Safari",
        "portrait",
        slug(label),
        timestamp(),
    ].join("__");

    const screenshotPath = path.join(dir, `${stem}.png`);
    const jsonPath = path.join(dir, `${stem}.json`);

    await browser.saveScreenshot(screenshotPath);

    const payload = {
        artifactType: "testmu-ios26-safari-liquid-ui-check",
        generatedAt: new Date().toISOString(),
        testCase,
        label,
        uiState: classifyUiState(snapshotResult.snapshot),
        viewportStable: snapshotResult.stable,
        viewportSamples: snapshotResult.samples,
        snapshot: snapshotResult.snapshot,
        evaluation,
        screenshot: path.relative(process.cwd(), screenshotPath),
    };

    fs.writeFileSync(
        jsonPath,
        `${JSON.stringify(payload, null, 2)}\n`,
        "utf8"
    );

    return {
        jsonPath,
        screenshotPath,
        payload,
    };
};

const tryNativeSwipe = async (browser, direction) => {
    try {
        await browser.execute("mobile: swipe", {
            direction,
            velocity: 650,
        });
        await sleep(1600);
        return true;
    } catch (error) {
        console.warn(
            `mobile: swipe ${direction} unavailable: ${error.message}`
        );
        return false;
    }
};

const runIos26SafariCase = async (
    testCase,
    options = {}
) => {
    requireEnvironment();

    const runId =
        options.runId ||
        `ios26-safari-${timestamp()}`;

    const qaUrl = buildUrl(
        testCase.baseUrl ||
        options.baseUrl ||
        DEFAULT_BASE_URL,
        testCase
    );

    const ltOptions = {
        deviceName: testCase.deviceName,
        platformName: "iOS",
        platformVersion: "26",
        isRealMobile: true,
        deviceOrientation: "portrait",
        build:
            options.buildName ||
            "Portfolio iOS 26 Safari Liquid UI",
        name: testCase.id,
        project: "3D Portfolio Hero QA",
        w3c: true,
        video: true,
        network: true,
        console: true,
        devicelog: true,
        newCommandTimeout: 300,
        queueTimeout: 600,
        tunnel: true,
    };

    if (LT_TUNNEL_NAME) {
        ltOptions.tunnelName = LT_TUNNEL_NAME;
    }

    let browser = null;
    const artifacts = [];

    try {
        console.log("");
        console.log("====================================================");
        console.log(
            `${testCase.deviceName} | iOS 26 | Safari | portrait`
        );
        console.log("====================================================");

        browser = await remote({
            protocol: "https",
            hostname: "mobile-hub.lambdatest.com",
            port: 443,
            path: "/wd/hub",
            user: LT_USERNAME,
            key: LT_ACCESS_KEY,
            logLevel: options.logLevel || "warn",
            connectionRetryTimeout: 180000,
            connectionRetryCount: 1,
            capabilities: {
                platformName: "iOS",
                browserName: "Safari",
                "LT:Options": ltOptions,
            },
        });

        console.log(`Session: ${browser.sessionId}`);
        console.log(`Opening ${qaUrl}`);

        try {
            await browser.setOrientation("PORTRAIT");
        } catch (error) {
            console.warn(
                `setOrientation(PORTRAIT) not accepted: ${error.message}`
            );
        }

        await browser.url(qaUrl);

        let appProbe;

        try {
            appProbe = await waitForPortfolioApp(
                browser,
                { timeout: 90000 }
            );
        } catch (initialReadyError) {
            console.warn(
                "Initial Safari load did not render the portfolio in 90s; " +
                "refreshing once before marking the device as an error."
            );

            try {
                await browser.refresh();
            } catch {
                await browser.url(qaUrl);
            }

            appProbe = await waitForPortfolioApp(
                browser,
                { timeout: 60000 }
            );
        }

        console.log(
            `App ready: readyState=${appProbe?.readyState || "unknown"} ` +
            `hero=${Boolean(appProbe?.heroExists)}`
        );

        const assetProbe = await waitForHeroVisualAssets(
            browser,
            { timeout: 60000 }
        );

        console.log(
            `Hero assets ready: image=${Boolean(assetProbe?.heroImageReady)} ` +
            `certifications=${Boolean(assetProbe?.certificationsReady)}`
        );

        await sleep(1200);

        // Safari may restore the previous section after a slow refresh.
        // Explicitly establish Hero as the initial checkpoint before measuring.
        const heroPosition = await forceSectionStart(
            browser,
            0,
            {
                timeout: 15000,
                settleMs: 800,
            }
        );

        console.log(
            `Hero checkpoint positioning: ` +
            `ok=${Boolean(heroPosition?.ok)} ` +
            `scrollY=${heroPosition?.scrollY ?? "unknown"} ` +
            `visualPageTop=${heroPosition?.visualPageTop ?? "unknown"} ` +
            `topRelativeToVisual=` +
            `${heroPosition?.topRelativeToVisual ?? "unknown"}`
        );

        // State A: initial / normally expanded Safari toolbar.
        const heroExpanded = await stableSnapshot(browser);
        console.log(
            `Safari snapshot: ${heroExpanded.snapshot.inner.width}x` +
            `${heroExpanded.snapshot.inner.height} ` +
            `dvh=${heroExpanded.snapshot.viewportUnits?.dvh} ` +
            `lvh=${heroExpanded.snapshot.viewportUnits?.lvh} ` +
            `liquidClass=${Boolean(heroExpanded.snapshot.liquidClassActive)}`
        );
        console.log(
            `UA: ${heroExpanded.snapshot.userAgent || "unknown"}`
        );

        let heroSnapshotResult = heroExpanded;
        let heroEval = evaluateSnapshot(
            heroSnapshotResult.snapshot,
            0
        );

        if (
            heroEval.issues?.some(
                (issue) =>
                    issue.code === "SECTION_SNAP_OFFSET" &&
                    issue.section === "#hero"
            )
        ) {
            console.warn(
                "Hero checkpoint drifted after Safari restoration; " +
                "realigning once and recapturing."
            );

            await forceSectionStart(
                browser,
                0,
                {
                    timeout: 15000,
                    settleMs: 900,
                }
            );

            heroSnapshotResult =
                await stableSnapshot(browser);

            heroEval = evaluateSnapshot(
                heroSnapshotResult.snapshot,
                0
            );
        }

        artifacts.push(
            await writeArtifacts({
                browser,
                testCase,
                runId,
                label: "hero-initial",
                snapshotResult: heroSnapshotResult,
                evaluation: heroEval,
            })
        );

        // State B: native swipe to About, normally collapsing the Safari UI.
        const swiped = await tryNativeSwipe(browser, "up");

        if (!swiped) {
            await browser.execute(() => {
                const sections = document.querySelectorAll(
                    ".container > section"
                );
                sections[1]?.scrollIntoView({
                    block: "start",
                    behavior: "instant",
                });
            });
            await sleep(1200);
        }

        const aboutPosition = await forceSectionStart(
            browser,
            1,
            {
                timeout: 15000,
                settleMs: 800,
            }
        );

        console.log(
            `About checkpoint positioning: ` +
            `ok=${Boolean(aboutPosition?.ok)} ` +
            `topRelativeToVisual=` +
            `${aboutPosition?.topRelativeToVisual ?? "unknown"}`
        );

        const aboutCollapsed = await stableSnapshot(browser);

        const chromeTransitionEval =
            evaluateBrowserChromeTransition(
                heroSnapshotResult.snapshot,
                aboutCollapsed.snapshot
            );

        console.log(
            `Safari chrome transition: ` +
            `expandedDelta=` +
            `${chromeTransitionEval.metrics.expandedLvhMinusDvh}px ` +
            `collapsedDelta=` +
            `${chromeTransitionEval.metrics.collapsedLvhMinusDvh}px ` +
            `dvhGrowth=` +
            `${chromeTransitionEval.metrics.dvhGrowth}px`
        );

        const aboutEval = evaluateSnapshot(
            aboutCollapsed.snapshot,
            1
        );

        if (chromeTransitionEval.status === "FAIL") {
            aboutEval.status = "FAIL";
            aboutEval.issues.push(
                ...chromeTransitionEval.issues
            );
        }
        artifacts.push(
            await writeArtifacts({
                browser,
                testCase,
                runId,
                label: "about-after-collapse",
                snapshotResult: aboutCollapsed,
                evaluation: aboutEval,
            })
        );

        // State C: one more section transition verifies the same boundary
        // protection is not Hero-only.
        const swipedAgain = await tryNativeSwipe(browser, "up");

        if (!swipedAgain) {
            await browser.execute(() => {
                const sections = document.querySelectorAll(
                    ".container > section"
                );
                sections[2]?.scrollIntoView({
                    block: "start",
                    behavior: "instant",
                });
            });
            await sleep(1200);
        }

        const portfolioPosition = await forceSectionStart(
            browser,
            2,
            {
                timeout: 15000,
                settleMs: 800,
            }
        );

        console.log(
            `Portfolio checkpoint positioning: ` +
            `ok=${Boolean(portfolioPosition?.ok)} ` +
            `topRelativeToVisual=` +
            `${portfolioPosition?.topRelativeToVisual ?? "unknown"}`
        );

        const portfolioState = await stableSnapshot(browser);
        const portfolioEval = evaluateSnapshot(
            portfolioState.snapshot,
            2
        );
        artifacts.push(
            await writeArtifacts({
                browser,
                testCase,
                runId,
                label: "portfolio-boundary",
                snapshotResult: portfolioState,
                evaluation: portfolioEval,
            })
        );

        // State D: explicitly validate the Contact section too.
        const swipedToContact = await tryNativeSwipe(
            browser,
            "up"
        );

        if (!swipedToContact) {
            await browser.execute(() => {
                const sections = document.querySelectorAll(
                    ".container > section"
                );
                sections[3]?.scrollIntoView({
                    block: "start",
                    behavior: "instant",
                });
            });
            await sleep(1200);
        }

        const contactPosition = await forceSectionStart(
            browser,
            3,
            {
                timeout: 15000,
                settleMs: 800,
            }
        );

        console.log(
            `Contact checkpoint positioning: ` +
            `ok=${Boolean(contactPosition?.ok)} ` +
            `topRelativeToVisual=` +
            `${contactPosition?.topRelativeToVisual ?? "unknown"}`
        );

        const contactState =
            await stableSnapshot(browser);

        const contactEval = evaluateSnapshot(
            contactState.snapshot,
            3
        );

        artifacts.push(
            await writeArtifacts({
                browser,
                testCase,
                runId,
                label: "contact-boundary",
                snapshotResult: contactState,
                evaluation: contactEval,
            })
        );

        const failures = artifacts.filter(
            (item) => item.payload.evaluation.status === "FAIL"
        );

        return {
            testCase,
            status:
                failures.length === 0
                    ? "PASS_GEOMETRY_VISUAL_REVIEW_REQUIRED"
                    : "FAIL",
            artifacts: artifacts.map((item) => ({
                label: item.payload.label,
                uiState: item.payload.uiState,
                status: item.payload.evaluation.status,
                json: path.relative(process.cwd(), item.jsonPath),
                screenshot: path.relative(
                    process.cwd(),
                    item.screenshotPath
                ),
                issues: item.payload.evaluation.issues,
            })),
        };
    } catch (error) {
        let diagnosticArtifacts = [];

        if (browser) {
            try {
                diagnosticArtifacts = [
                    await writeErrorDiagnostics({
                        browser,
                        testCase,
                        runId,
                        error,
                    }),
                ];
            } catch (diagnosticError) {
                console.warn(
                    `Could not write error diagnostics: ` +
                    `${diagnosticError?.message || diagnosticError}`
                );
            }
        }

        return {
            testCase,
            status: "ERROR",
            error: error?.stack || error?.message || String(error),
            artifacts: diagnosticArtifacts,
        };
    } finally {
        if (browser) {
            try {
                await browser.deleteSession();
            } catch {
                // no-op
            }
        }
    }
};

module.exports = {
    runIos26SafariCase,
};
