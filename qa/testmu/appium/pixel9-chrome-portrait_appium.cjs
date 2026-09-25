const { remote } = require("webdriverio");

const fs = require("node:fs");
const path = require("node:path");


// =======================================================
// CONFIG
// =======================================================

const DEVICE_NAME =
    "Pixel 9";

const QA_LABEL =
    "Pixel-9-Chrome-Portrait-Appium";

const BASE_URL =
    process.env.QA_BASE_URL ||
    "http://192.168.1.233:5173";


// =======================================================
// TESTMU CREDENTIALS
// =======================================================

const LT_USERNAME =
    process.env.LT_USERNAME;

const LT_ACCESS_KEY =
    process.env.LT_ACCESS_KEY;

const LT_TUNNEL_NAME =
    process.env.LT_TUNNEL_NAME;


if (!LT_USERNAME) {
    throw new Error(
        "LT_USERNAME environment variable is missing."
    );
}


if (!LT_ACCESS_KEY) {
    throw new Error(
        "LT_ACCESS_KEY environment variable is missing."
    );
}


// =======================================================
// OUTPUT
// =======================================================

const OUTPUT_DIR =
    path.join(
        process.cwd(),
        "qa-results",
        "testmu",
        "appium"
    );


fs.mkdirSync(
    OUTPUT_DIR,
    {
        recursive: true,
    }
);


const timestampForFilename =
    () =>
        new Date()
            .toISOString()
            .replace(
                /[:.]/g,
                "-"
            );


const makeOutputPaths =
    () => {
        const timestamp =
            timestampForFilename();

        const base =
            `${QA_LABEL}__${timestamp}`;


        return {
            json:
                path.join(
                    OUTPUT_DIR,
                    `${base}.json`
                ),

            screenshot:
                path.join(
                    OUTPUT_DIR,
                    `${base}.png`
                ),

            latestJson:
                path.join(
                    OUTPUT_DIR,
                    `${QA_LABEL}__latest.json`
                ),

            latestScreenshot:
                path.join(
                    OUTPUT_DIR,
                    `${QA_LABEL}__latest.png`
                ),

            errorScreenshot:
                path.join(
                    OUTPUT_DIR,
                    `${QA_LABEL}__ERROR.png`
                ),
        };
    };


// =======================================================
// SMALL HELPERS
// =======================================================

const sleep =
    (
        milliseconds
    ) =>
        new Promise(
            (
                resolve
            ) =>
                setTimeout(
                    resolve,
                    milliseconds
                )
        );


const round =
    (
        value
    ) => {
        if (
            typeof value !==
            "number" ||
            !Number.isFinite(
                value
            )
        ) {
            return null;
        }


        return Math.round(
            value * 100
        ) / 100;
    };


// =======================================================
// VIEWPORT SAMPLING
// =======================================================

const getViewportSample =
    async (
        browser
    ) =>
        browser.execute(
            () => ({
                innerWidth:
                    window.innerWidth,

                innerHeight:
                    window.innerHeight,

                visualWidth:
                    window
                        .visualViewport
                        ?.width ??
                    null,

                visualHeight:
                    window
                        .visualViewport
                        ?.height ??
                    null,

                screenWidth:
                    window.screen.width,

                screenHeight:
                    window.screen.height,

                clientWidth:
                    document
                        .documentElement
                        .clientWidth,

                clientHeight:
                    document
                        .documentElement
                        .clientHeight,

                orientation:
                    window.screen
                        ?.orientation
                        ?.type ??
                    null,

                dpr:
                    window.devicePixelRatio,
            })
        );


const sameViewport =
    (
        a,
        b
    ) => {
        if (
            !a ||
            !b
        ) {
            return false;
        }


        return (
            a.innerWidth ===
            b.innerWidth &&
            a.innerHeight ===
            b.innerHeight &&
            Math.abs(
                (
                    a.visualWidth ??
                    a.innerWidth
                ) -
                (
                    b.visualWidth ??
                    b.innerWidth
                )
            ) <
            0.5 &&
            Math.abs(
                (
                    a.visualHeight ??
                    a.innerHeight
                ) -
                (
                    b.visualHeight ??
                    b.innerHeight
                )
            ) <
            0.5
        );
    };


const waitForStableViewport =
    async (
        browser
    ) => {
        console.log(
            "Waiting for viewport to stabilize..."
        );


        const samples =
            [];


        let consecutiveMatches =
            0;


        let previous =
            null;


        for (
            let attempt = 1;
            attempt <= 15;
            attempt += 1
        ) {
            const current =
                await getViewportSample(
                    browser
                );


            samples.push({
                attempt,

                innerWidth:
                    current.innerWidth,

                innerHeight:
                    current.innerHeight,

                visualWidth:
                    round(
                        current.visualWidth
                    ),

                visualHeight:
                    round(
                        current.visualHeight
                    ),

                orientation:
                    current.orientation,
            });


            console.log(
                `  sample ${attempt}: ` +
                `inner ${current.innerWidth} x ${current.innerHeight}, ` +
                `visual ${round(current.visualWidth)} x ${round(current.visualHeight)}`
            );


            if (
                sameViewport(
                    previous,
                    current
                )
            ) {
                consecutiveMatches +=
                    1;
            } else {
                consecutiveMatches =
                    0;
            }


            /*
              previous + current + next matching
              means three consecutive stable
              observations.
            */

            if (
                consecutiveMatches >=
                2
            ) {
                console.log(
                    "Viewport stable."
                );


                return {
                    stable:
                        true,

                    sample:
                        current,

                    samples,
                };
            }


            previous =
                current;


            await sleep(
                500
            );
        }


        console.warn(
            "Viewport did not produce three identical consecutive samples."
        );


        return {
            stable:
                false,

            sample:
                previous,

            samples,
        };
    };


// =======================================================
// WAIT FOR IMAGE LOAD + DECODE + PAINT
// =======================================================

const waitForHeroImages =
    async (
        browser
    ) => {
        console.log(
            "Waiting for Hero images to decode..."
        );


        /*
          executeAsync gives the browser page
          a callback so we can genuinely wait
          for image.decode() before continuing.
        */

        await browser.executeAsync(
            (
                done
            ) => {
                const run =
                    async () => {
                        try {
                            const images = [
                                ...document.querySelectorAll(
                                    ".certificationsImages img, .hImg img"
                                ),
                            ];


                            await Promise.all(
                                images.map(
                                    async (
                                        img
                                    ) => {
                                        if (
                                            !img.complete
                                        ) {
                                            await new Promise(
                                                (
                                                    resolve
                                                ) => {
                                                    const finished =
                                                        () =>
                                                            resolve();


                                                    img.addEventListener(
                                                        "load",
                                                        finished,
                                                        {
                                                            once:
                                                                true,
                                                        }
                                                    );


                                                    img.addEventListener(
                                                        "error",
                                                        finished,
                                                        {
                                                            once:
                                                                true,
                                                        }
                                                    );
                                                }
                                            );
                                        }


                                        if (
                                            typeof img.decode ===
                                            "function"
                                        ) {
                                            try {
                                                await img.decode();
                                            } catch {
                                                /*
                                                  Hero QA V4.1 will
                                                  report the broken image.
                                                */
                                            }
                                        }
                                    }
                                )
                            );


                            await new Promise(
                                (
                                    resolve
                                ) =>
                                    requestAnimationFrame(
                                        () =>
                                            requestAnimationFrame(
                                                resolve
                                            )
                                    )
                            );


                            done({
                                ok:
                                    true,

                                count:
                                    images.length,
                            });
                        } catch (
                        error
                        ) {
                            done({
                                ok:
                                    false,

                                error:
                                    error.message,
                            });
                        }
                    };


                run();
            }
        );


        /*
          Small final settling window for
          React, browser chrome and Three.js.
        */

        await sleep(
            750
        );


        console.log(
            "Hero images decoded and paint-ready."
        );
    };


// =======================================================
// HERO QA ANALYSIS
// =======================================================

const analyzeReport =
    (
        report
    ) => {
        const reasons =
            [];


        const qaVersion =
            Number(
                report
                    ?.qaVersion
            );


        if (
            !Number.isFinite(
                qaVersion
            ) ||
            qaVersion <
            4.1
        ) {
            reasons.push(
                `Hero QA V4.1 or newer is required. Received V${report?.qaVersion ?? "unknown"}.`
            );
        }


        if (
            report
                ?.viewport
                ?.layoutMode !==
            "portrait"
        ) {
            reasons.push(
                `Expected portrait but received ${report?.viewport?.layoutMode ?? "unknown"}.`
            );
        }


        const overall =
            report
                ?.summary
                ?.overall;


        if (
            !overall
        ) {
            reasons.push(
                "Hero QA summary.overall is missing."
            );
        } else {
            for (
                const failure of
                overall.failures
            ) {
                const category =
                    failure.category ||
                    "qa";


                const reason =
                    failure.reason ||
                    failure.status ||
                    "Unknown QA failure.";


                reasons.push(
                    `[${category}] ${reason}`
                );
            }
        }


        return {
            passed:
                reasons.length ===
                0,

            reasons,
        };
    };


// =======================================================
// PLAYWRIGHT BASELINE COMPARISON
// =======================================================

const PLAYWRIGHT_BASELINE = {
    screenWidth:
        412,

    screenHeight:
        924,

    innerWidth:
        411,

    innerHeight:
        765,

    visualWidth:
        411.43,

    visualHeight:
        765.33,

    dpr:
        2.63,

    matchingMediaQueries:
        18,

    bubbleSuggestedTranslateY:
        -171.16,
};


const printBaselineComparison =
    (
        report
    ) => {
        const viewport =
            report.viewport;


        const bubble =
            report
                .relationships
                ?.bubblePlacement;


        const actual = {
            screenWidth:
                viewport
                    .screen
                    .width,

            screenHeight:
                viewport
                    .screen
                    .height,

            innerWidth:
                viewport
                    .inner
                    .width,

            innerHeight:
                viewport
                    .inner
                    .height,

            visualWidth:
                viewport
                    .visual
                    ?.width,

            visualHeight:
                viewport
                    .visual
                    ?.height,

            dpr:
                viewport
                    .devicePixelRatio,

            matchingMediaQueries:
                report
                    .summary
                    .matchingMediaQueryCount,

            bubbleSuggestedTranslateY:
                bubble
                    ?.recommendation
                    ?.suggestedTranslateY ??
                null,
        };


        console.log("");
        console.log(
            "PLAYWRIGHT BASELINE COMPARISON"
        );

        console.log(
            "--------------------------------------------"
        );


        console.log(
            `Screen: Appium ${actual.screenWidth} x ${actual.screenHeight} | Playwright ${PLAYWRIGHT_BASELINE.screenWidth} x ${PLAYWRIGHT_BASELINE.screenHeight}`
        );


        console.log(
            `Inner:  Appium ${actual.innerWidth} x ${actual.innerHeight} | Playwright ${PLAYWRIGHT_BASELINE.innerWidth} x ${PLAYWRIGHT_BASELINE.innerHeight}`
        );


        console.log(
            `Visual: Appium ${actual.visualWidth} x ${actual.visualHeight} | Playwright ${PLAYWRIGHT_BASELINE.visualWidth} x ${PLAYWRIGHT_BASELINE.visualHeight}`
        );


        console.log(
            `DPR:    Appium ${actual.dpr} | Playwright ${PLAYWRIGHT_BASELINE.dpr}`
        );


        console.log(
            `Media:  Appium ${actual.matchingMediaQueries} | Playwright ${PLAYWRIGHT_BASELINE.matchingMediaQueries}`
        );


        console.log(
            `Bubble suggested translateY: Appium ${actual.bubbleSuggestedTranslateY}px | Playwright ${PLAYWRIGHT_BASELINE.bubbleSuggestedTranslateY}px`
        );


        console.log(
            "--------------------------------------------"
        );
    };


// =======================================================
// TERMINAL SUMMARY
// =======================================================

const printReportSummary =
    (
        report,
        analysis,
        viewportStability
    ) => {
        const viewport =
            report.viewport;


        const summary =
            report.summary;


        const bubble =
            report
                .relationships
                ?.bubblePlacement;


        const imageLoading =
            summary
                .imageLoadingPolicy;


        const cropPolicy =
            summary
                .cropPolicy;


        const lastRule =
            summary
                .lastMatchingMediaQuery;


        console.log("");
        console.log(
            "============================================"
        );

        console.log(
            "PIXEL 9 — APPIUM — CHROME — PORTRAIT"
        );

        console.log(
            "============================================"
        );


        console.log(
            `Label:       ${report.qaLabel}`
        );

        console.log(
            `Hero QA:     V${report.qaVersion}`
        );

        console.log(
            `Mode:        ${viewport.layoutMode}`
        );

        console.log(
            `Orientation: ${viewport.orientation}`
        );

        console.log(
            `Viewport stable: ${viewportStability.stable
                ? "YES"
                : "NO"
            }`
        );


        console.log("");
        console.log(
            "VIEWPORT"
        );


        console.log(
            `Screen: ${viewport.screen.width} x ${viewport.screen.height}`
        );

        console.log(
            `Inner:  ${viewport.inner.width} x ${viewport.inner.height}`
        );


        if (
            viewport.visual
        ) {
            console.log(
                `Visual: ${viewport.visual.width} x ${viewport.visual.height}`
            );
        }


        console.log(
            `Client: ${viewport.document.clientWidth} x ${viewport.document.clientHeight}`
        );


        console.log(
            `DPR:    ${viewport.devicePixelRatio}`
        );


        console.log("");
        console.log(
            "CSS"
        );


        console.log(
            `Matching media queries: ${summary.matchingMediaQueryCount}`
        );


        console.log(
            `Last matching rule: ${lastRule
                ?.condition ||
            "NONE"
            }`
        );


        console.log("");
        console.log(
            "IMAGES"
        );


        if (
            imageLoading
        ) {
            console.log(
                `Certification images: expected ${imageLoading.certificationImages.expectedCount}, found ${imageLoading.certificationImages.foundCount}, loaded ${imageLoading.certificationImages.loadedCount}, visible ${imageLoading.certificationImages.visibleCount}`
            );


            console.log(
                `Image-loading failures: ${imageLoading.failureCount}`
            );
        }


        console.log("");
        console.log(
            "VISIBILITY"
        );


        console.log(
            `Visibility failures: ${summary
                .visibilityPolicy
                ?.failureCount ??
            "N/A"
            }`
        );


        console.log("");
        console.log(
            "CLIPPING"
        );


        console.log(
            `Viewport clipping failures: ${summary.viewportClipping.failureCount}`
        );


        console.log("");
        console.log(
            "IMAGE CROP"
        );


        if (
            cropPolicy
        ) {
            console.log(
                `Crop policy: ${cropPolicy.passed
                    ? "PASS"
                    : "FAIL"
                }`
            );


            console.log(
                `Crop failures: ${cropPolicy.failureCount}`
            );
        }


        console.log("");
        console.log(
            "BUBBLE"
        );


        if (
            bubble
                ?.evaluated
        ) {
            console.log(
                `Bubble status: ${bubble.status}`
            );


            console.log(
                `Current translateY: ${bubble.currentBubble?.translateY}px`
            );


            console.log(
                `Movement: ${bubble.recommendation?.direction} ${bubble.recommendation?.pixels}px`
            );


            console.log(
                `Suggested translateY: ${bubble.recommendation?.suggestedTranslateY}px`
            );
        } else {
            console.log(
                `Not evaluated: ${bubble?.reason ?? "unknown"}`
            );
        }


        console.log("");
        console.log(
            "HERO QA V4.1 OVERALL"
        );


        console.log(
            `Hero QA overall: ${summary
                .overall
                .passed
                ? "PASS"
                : "FAIL"
            }`
        );


        console.log(
            `Hero QA overall failures: ${summary.overall.failureCount}`
        );


        console.log("");
        console.log(
            analysis.passed
                ? "RESULT: PASS"
                : "RESULT: FAIL"
        );


        if (
            !analysis.passed
        ) {
            console.log("");
            console.log(
                "Failure reasons:"
            );


            analysis
                .reasons
                .forEach(
                    (
                        reason,
                        index
                    ) => {
                        console.log(
                            `${index + 1}. ${reason}`
                        );
                    }
                );
        }


        console.log(
            "============================================"
        );

        console.log("");
    };


// =======================================================
// TESTMU STATUS
// =======================================================

const setTestMuStatus =
    async (
        browser,
        passed,
        reasons
    ) => {
        if (
            !browser
        ) {
            return;
        }


        /*
          TestMu documents the lambda-status
          executor for Appium sessions.
        */

        try {
            await browser.execute(
                passed
                    ? "lambda-status=passed"
                    : "lambda-status=failed"
            );
        } catch (
        error
        ) {
            console.warn(
                "Could not update TestMu test status:",
                error.message
            );
        }


        /*
          Keep the reasons in our local JSON/
          terminal output. That avoids relying
          on vendor-specific remark syntax for
          the proof-of-concept.
        */

        if (
            !passed &&
            reasons?.length
        ) {
            console.log(
                "TestMu status marked failed."
            );
        }
    };


// =======================================================
// MAIN
// =======================================================

(async () => {
    let browser =
        null;


    const outputPaths =
        makeOutputPaths();


    try {
        // -----------------------------------
        // Capabilities
        // -----------------------------------

        const ltOptions = {
            deviceName:
                DEVICE_NAME,

            platformName:
                "Android",

            platformVersion:
                "15",

            isRealMobile:
                true,

            deviceOrientation:
                "PORTRAIT",

            build:
                "Portfolio Hero Appium Proof",

            name:
                QA_LABEL,

            project:
                "3D Portfolio Hero QA",

            w3c:
                true,

            video:
                true,

            network:
                true,

            console:
                true,

            devicelog:
                true,

            newCommandTimeout:
                300,

            queueTimeout:
                600,

            tunnel:
                true,
        };


        if (
            LT_TUNNEL_NAME
        ) {
            ltOptions.tunnelName =
                LT_TUNNEL_NAME;
        }


        const capabilities = {
            platformName:
                "Android",

            browserName:
                "Chrome",

            "LT:Options":
                ltOptions,
        };


        // -----------------------------------
        // Connect
        // -----------------------------------

        console.log(
            "Connecting to TestMu Pixel 9 using Appium/WebdriverIO..."
        );


        browser =
            await remote({
                protocol:
                    "https",

                hostname:
                    "mobile-hub.lambdatest.com",

                port:
                    443,

                path:
                    "/wd/hub",

                user:
                    LT_USERNAME,

                key:
                    LT_ACCESS_KEY,

                logLevel:
                    "warn",

                connectionRetryTimeout:
                    180000,

                connectionRetryCount:
                    1,

                capabilities,
            });


        console.log(
            "Appium session connected."
        );


        console.log(
            `Session ID: ${browser.sessionId}`
        );


        // -----------------------------------
        // Open local QA site
        // -----------------------------------

        const qaUrl =
            `${BASE_URL}/` +
            `?qa=1` +
            `&qaOverlay=0` +
            `&qaLabel=${encodeURIComponent(
                QA_LABEL
            )}`;


        console.log(
            `Opening: ${qaUrl}`
        );


        await browser.url(
            qaUrl
        );

        // -----------------------------------
        // APPIUM PREFLIGHT DIAGNOSTIC
        // -----------------------------------

        console.log("");
        console.log(
            "APPIUM PREFLIGHT"
        );

        console.log(
            "Requested URL:",
            qaUrl
        );


        const webdriverUrl =
            await browser.getUrl();


        const webdriverTitle =
            await browser.getTitle();


        console.log(
            "WebDriver URL:",
            webdriverUrl
        );


        console.log(
            "WebDriver title:",
            webdriverTitle
        );


        const preflight =
            await browser.execute(
                () => ({
                    href:
                        window.location.href,

                    origin:
                        window.location.origin,

                    pathname:
                        window.location.pathname,

                    search:
                        window.location.search,

                    readyState:
                        document.readyState,

                    qaDataset:
                        document
                            .documentElement
                            .dataset
                            .qa ??
                        null,

                    qaGlobalExists:
                        Boolean(
                            window
                                .__PORTFOLIO_QA__
                        ),

                    qaCaptureExists:
                        Boolean(
                            window
                                .__PORTFOLIO_QA__
                                ?.capture
                        ),

                    heroExists:
                        Boolean(
                            document.querySelector(
                                ".hero"
                            )
                        ),

                    bodyPreview:
                        document
                            .body
                            ?.innerText
                            ?.slice(
                                0,
                                500
                            ) ??
                        "",
                })
            );


        console.log(
            "JS href:",
            preflight.href
        );


        console.log(
            "JS search:",
            preflight.search
        );


        console.log(
            "readyState:",
            preflight.readyState
        );


        console.log(
            "QA dataset:",
            preflight.qaDataset
        );


        console.log(
            "QA global:",
            preflight.qaGlobalExists
        );


        console.log(
            "QA capture:",
            preflight.qaCaptureExists
        );


        console.log(
            "Hero exists:",
            preflight.heroExists
        );


        console.log(
            "Body preview:"
        );

        console.log(
            preflight.bodyPreview
        );


        console.log(
            "--------------------------------------------"
        );

        console.log("");


        // -----------------------------------
        // Wait for page
        // -----------------------------------

        await browser.waitUntil(
            async () => {
                try {
                    return await browser.execute(
                        () =>
                            document.readyState ===
                            "complete"
                    );
                } catch {
                    return false;
                }
            },

            {
                timeout:
                    15000,

                interval:
                    1000,

                timeoutMsg:
                    "Document did not reach readyState=complete.",
            }
        );


        console.log(
            "Document loaded."
        );


        // -----------------------------------
        // Verify QA engine
        // -----------------------------------

        await browser.waitUntil(
            async () => {
                try {
                    return await browser.execute(
                        () =>
                            Boolean(
                                window
                                    .__PORTFOLIO_QA__
                                    ?.capture
                            )
                    );
                } catch {
                    return false;
                }
            },

            {
                timeout:
                    120000,

                interval:
                    500,

                timeoutMsg:
                    "window.__PORTFOLIO_QA__.capture did not become available.",
            }
        );


        console.log(
            "Hero QA detected."
        );


        // -----------------------------------
        // Initial diagnostics
        // -----------------------------------

        const diagnostic =
            await browser.execute(
                () => ({
                    href:
                        window.location.href,

                    title:
                        document.title,

                    readyState:
                        document.readyState,

                    qaVersion:
                        window
                            .__PORTFOLIO_QA__
                            ?.version ??
                        null,

                    qaDataset:
                        document
                            .documentElement
                            .dataset
                            .qa ??
                        null,

                    qaStable:
                        document
                            .documentElement
                            .dataset
                            .qaStable ??
                        null,

                    heroExists:
                        Boolean(
                            document.querySelector(
                                ".hero"
                            )
                        ),

                    userAgent:
                        navigator.userAgent,
                })
            );


        console.log("");
        console.log(
            "PAGE LOADED"
        );


        console.log(
            "Current URL:",
            diagnostic.href
        );


        console.log(
            "Title:",
            diagnostic.title
        );


        console.log(
            "Document readyState:",
            diagnostic.readyState
        );


        console.log(
            "QA version:",
            diagnostic.qaVersion
        );


        console.log(
            "QA dataset:",
            diagnostic.qaDataset
        );


        console.log(
            "QA stable:",
            diagnostic.qaStable
        );


        console.log(
            "Hero exists:",
            diagnostic.heroExists
        );


        console.log(
            "User agent:",
            diagnostic.userAgent
        );


        // -----------------------------------
        // Viewport stabilization
        // -----------------------------------

        const viewportStability =
            await waitForStableViewport(
                browser
            );


        // -----------------------------------
        // Images
        // -----------------------------------

        await waitForHeroImages(
            browser
        );


        // -----------------------------------
        // Capture Hero QA V4.1
        // -----------------------------------

        const report =
            await browser.execute(
                () =>
                    window
                        .__PORTFOLIO_QA__
                        .capture()
            );


        /*
          Add runner metadata.

          heroQa.js remains browser-framework
          independent.
        */

        report.automation = {
            framework:
                "Appium",

            client:
                "WebdriverIO",

            device:
                DEVICE_NAME,

            browser:
                "Chrome",

            requestedOrientation:
                "portrait",

            sessionId:
                browser.sessionId,

            viewportStable:
                viewportStability.stable,

            viewportSamples:
                viewportStability.samples,
        };


        // -----------------------------------
        // Analyze
        // -----------------------------------

        const analysis =
            analyzeReport(
                report
            );


        // -----------------------------------
        // Save JSON
        // -----------------------------------

        const json =
            JSON.stringify(
                report,
                null,
                2
            );


        fs.writeFileSync(
            outputPaths.json,
            json,
            "utf8"
        );


        fs.writeFileSync(
            outputPaths.latestJson,
            json,
            "utf8"
        );


        // -----------------------------------
        // Screenshot
        // -----------------------------------

        console.log(
            "Saving Appium screenshot..."
        );


        await browser.saveScreenshot(
            outputPaths.screenshot
        );


        fs.copyFileSync(
            outputPaths.screenshot,
            outputPaths.latestScreenshot
        );


        // -----------------------------------
        // Output
        // -----------------------------------

        printReportSummary(
            report,
            analysis,
            viewportStability
        );


        printBaselineComparison(
            report
        );


        console.log("");
        console.log(
            "JSON saved to:"
        );

        console.log(
            outputPaths.json
        );


        console.log("");
        console.log(
            "Screenshot saved to:"
        );

        console.log(
            outputPaths.screenshot
        );


        // -----------------------------------
        // Dashboard status
        // -----------------------------------

        await setTestMuStatus(
            browser,
            analysis.passed,
            analysis.reasons
        );


        /*
          IMPORTANT:

          The current Pixel 9 portrait CSS
          has a known bubble-placement failure.

          Therefore RESULT: FAIL is expected.

          That does NOT mean Appium failed.
          If we reach this point, the Appium
          connection itself succeeded.
        */

        console.log("");
        console.log(
            "APPIUM CONNECTION: PASS"
        );


        if (
            !analysis.passed
        ) {
            process.exitCode =
                1;
        }
    } catch (
    error
    ) {
        console.error("");
        console.error(
            "APPIUM TEST EXECUTION FAILED"
        );


        console.error(
            error
        );


        if (
            browser
        ) {
            try {
                await browser.saveScreenshot(
                    outputPaths.errorScreenshot
                );


                console.error(
                    `Error screenshot saved to: ${outputPaths.errorScreenshot}`
                );
            } catch (
            screenshotError
            ) {
                console.error(
                    "Could not save error screenshot:",
                    screenshotError.message
                );
            }


            try {
                await setTestMuStatus(
                    browser,
                    false,
                    [
                        error.message,
                    ]
                );
            } catch {
                // Ignore dashboard-status failure.
            }
        }


        process.exitCode =
            1;
    } finally {
        // -----------------------------------
        // Release real device
        // -----------------------------------

        if (
            browser
        ) {
            try {
                await browser.deleteSession();
            } catch (
            error
            ) {
                console.warn(
                    "Could not cleanly delete Appium session:",
                    error.message
                );
            }
        }
    }
})();