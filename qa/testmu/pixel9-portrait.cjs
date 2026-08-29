const { chromium } = require("playwright");

const fs = require("node:fs");
const path = require("node:path");


// =======================================================
// CONFIG
// =======================================================

const DEVICE_NAME =
    "Pixel 9";

const QA_LABEL =
    "Pixel-9-Chrome-Portrait";

const BASE_URL =
    process.env.QA_BASE_URL ||
    "http://192.168.1.233:5173";

const PLAYWRIGHT_VERSION =
    "1.59.0";


// =======================================================
// REQUIRED ENVIRONMENT VARIABLES
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
// OUTPUT DIRECTORY
// =======================================================

const OUTPUT_DIR =
    path.join(
        process.cwd(),
        "qa-results",
        "testmu"
    );


fs.mkdirSync(
    OUTPUT_DIR,
    {
        recursive: true,
    }
);


// =======================================================
// HELPERS
// =======================================================

const timestampForFilename =
    () =>
        new Date()
            .toISOString()
            .replace(/[:.]/g, "-");


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
                    "Pixel-9-Chrome-Portrait__latest.json"
                ),

            latestScreenshot:
                path.join(
                    OUTPUT_DIR,
                    "Pixel-9-Chrome-Portrait__latest.png"
                ),
        };
    };


const setTestMuStatus =
    async (
        page,
        status,
        remark
    ) => {
        try {
            await page.evaluate(
                () => { },

                `lambdatest_action: ${JSON.stringify({
                    action:
                        "setTestStatus",

                    arguments: {
                        status,
                        remark,
                    },
                })}`
            );
        } catch (
        error
        ) {
            /*
              We do not want failure to update
              the TestMu badge to destroy the
              actual QA run.
            */

            console.warn(
                "Could not update TestMu test status:",
                error.message
            );
        }
    };


// =======================================================
// RESULT ANALYSIS
// =======================================================

const analyzeReport =
    (report) => {
        const reasons = [];


        // -----------------------------------
        // Orientation
        // -----------------------------------

        if (
            report.viewport.layoutMode !==
            "portrait"
        ) {
            reasons.push(
                `Expected portrait but received ${report.viewport.layoutMode}.`
            );
        }


        // -----------------------------------
        // Horizontal overflow
        // -----------------------------------

        if (
            report.summary
                .horizontalOverflow
        ) {
            reasons.push(
                "Horizontal document overflow detected."
            );
        }


        // -----------------------------------
        // Missing tracked elements
        // -----------------------------------

        if (
            report.summary
                .missingElementCount >
            0
        ) {
            reasons.push(
                `Missing tracked elements: ${report.summary.missingElements.join(", ")}`
            );
        }


        // -----------------------------------
        // Viewport clipping
        // -----------------------------------

        if (
            report.summary
                .viewportClipping
                .failureCount >
            0
        ) {
            const names =
                report.summary
                    .viewportClipping
                    .failures
                    .map(
                        (item) =>
                            item.name
                    )
                    .join(", ");

            reasons.push(
                `Viewport clipping failures: ${names}`
            );
        }


        // -----------------------------------
        // Bubble placement
        // -----------------------------------

        const bubble =
            report.relationships
                ?.bubblePlacement;


        if (
            bubble?.evaluated &&
            bubble.status !==
            "PASS"
        ) {
            const recommendation =
                bubble.recommendation;

            let message =
                `Bubble placement: ${bubble.status}.`;


            if (
                recommendation
            ) {
                message +=
                    ` Recommended movement: ` +
                    `${recommendation.direction} ` +
                    `${recommendation.pixels}px.`;
            }


            reasons.push(
                message
            );
        }


        return {
            passed:
                reasons.length ===
                0,

            reasons,
        };
    };


// =======================================================
// TERMINAL SUMMARY
// =======================================================

const printReportSummary =
    (
        report,
        analysis
    ) => {
        const viewport =
            report.viewport;

        const bubble =
            report.relationships
                ?.bubblePlacement;

        const lastRule =
            report.summary
                .lastMatchingMediaQuery;


        console.log("");
        console.log(
            "============================================"
        );

        console.log(
            "PIXEL 9 — REAL DEVICE QA"
        );

        console.log(
            "============================================"
        );


        console.log(
            `Label:       ${report.qaLabel}`
        );

        console.log(
            `Mode:        ${viewport.layoutMode}`
        );

        console.log(
            `Orientation: ${viewport.orientation}`
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
            `DPR:    ${viewport.devicePixelRatio}`
        );


        console.log("");
        console.log(
            "CSS"
        );


        console.log(
            `Matching media queries: ${report.summary.matchingMediaQueryCount}`
        );


        console.log(
            `Last matching rule: ${lastRule
                ?.condition ||
            "NONE"
            }`
        );


        console.log("");
        console.log(
            "LAYOUT"
        );


        console.log(
            `Horizontal overflow: ${report.summary
                .horizontalOverflow
                ? "YES"
                : "NO"
            }`
        );


        console.log(
            `Viewport clipping failures: ${report.summary
                .viewportClipping
                .failureCount
            }`
        );


        if (
            bubble?.evaluated
        ) {
            console.log(
                `Bubble status: ${bubble.status}`
            );


            if (
                bubble.recommendation
            ) {
                console.log(
                    `Bubble movement: ${bubble.recommendation.direction} ${bubble.recommendation.pixels}px`
                );

                console.log(
                    `Suggested translateY: ${bubble.recommendation.suggestedTranslateY}px`
                );
            }
        }


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


            analysis.reasons.forEach(
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
// MAIN TEST
// =======================================================

(async () => {
    let browser = null;

    let page = null;


    try {
        // -----------------------------------
        // TestMu capabilities
        // -----------------------------------

        const ltOptions = {
            platformName:
                "android",

            deviceName:
                DEVICE_NAME,

            platformVersion:
                ".*",

            isRealMobile:
                true,

            build:
                "Portfolio Hero Real Device QA",

            name:
                QA_LABEL,

            projectName:
                "3D Portfolio Hero QA",

            user:
                LT_USERNAME,

            accessKey:
                LT_ACCESS_KEY,

            network:
                true,

            video:
                true,

            console:
                true,

            tunnel:
                true,

            playwrightClientVersion:
                PLAYWRIGHT_VERSION,
        };


        /*
          Only attach tunnelName if you
          actually started a named tunnel.
        */

        if (
            LT_TUNNEL_NAME
        ) {
            ltOptions.tunnelName =
                LT_TUNNEL_NAME;
        }


        const capabilities = {
            "LT:Options":
                ltOptions,
        };


        const cdpUrl =
            `wss://cdp.lambdatest.com/playwright?capabilities=` +
            encodeURIComponent(
                JSON.stringify(
                    capabilities
                )
            );


        console.log(
            "Connecting to TestMu Pixel 9..."
        );


        browser =
            await chromium.connect(
                cdpUrl
            );


        const context =
            browser.contexts()[0] ||
            await browser.newContext();


        context.setDefaultTimeout(
            120000
        );


        page =
            context.pages()[0] ||
            await context.newPage();


        // -----------------------------------
        // Open portfolio
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


        await page.goto(
            qaUrl,
            {
                waitUntil:
                    "domcontentloaded",

                timeout:
                    120000,
            }
        );

        // =======================================================
        // DEBUG WHAT TESTMU ACTUALLY LOADED
        // =======================================================

        console.log("");
        console.log("PAGE LOADED");

        console.log(
            "Current URL:",
            page.url()
        );

        console.log(
            "Title:",
            await page.title()
        );

        console.log(
            "HTTP location:",
            await page.evaluate(
                () => window.location.href
            )
        );

        console.log(
            "Document readyState:",
            await page.evaluate(
                () => document.readyState
            )
        );

        console.log(
            "QA dataset:",
            await page.evaluate(
                () =>
                    document
                        .documentElement
                        .dataset
                        .qa ??
                    "NOT SET"
            )
        );

        console.log(
            "QA global exists:",
            await page.evaluate(
                () =>
                    Boolean(
                        window
                            .__PORTFOLIO_QA__
                    )
            )
        );

        console.log(
            "Hero exists:",
            await page.evaluate(
                () =>
                    Boolean(
                        document
                            .querySelector(
                                ".hero"
                            )
                    )
            )
        );

        console.log(
            "Body preview:",
            await page.evaluate(
                () =>
                    document
                        .body
                        ?.innerText
                        ?.slice(
                            0,
                            500
                        ) ||
                    "(empty body)"
            )
        );


        // Save an immediate diagnostic screenshot.

        await page.screenshot({
            path:
                path.join(
                    OUTPUT_DIR,
                    "Pixel-9-DIAGNOSTIC.png"
                ),

            fullPage:
                false,
        });


        console.log(
            "Diagnostic screenshot saved."
        );

        console.log("");


        // -----------------------------------
        // Wait until heroQa.js is ready
        // -----------------------------------

        await page.waitForFunction(
            () =>
                Boolean(
                    window
                        .__PORTFOLIO_QA__
                        ?.capture
                ),

            null,

            {
                timeout:
                    120000,
            }
        );


        /*
          Give fonts/images/Three.js enough
          time to settle.

          QA stabilization is already active.
        */

        await page.waitForTimeout(
            3000
        );


        // -----------------------------------
        // Capture QA report
        // -----------------------------------

        const report =
            await page.evaluate(
                () =>
                    window
                        .__PORTFOLIO_QA__
                        .capture()
            );


        const analysis =
            analyzeReport(
                report
            );


        const paths =
            makeOutputPaths();


        // -----------------------------------
        // Save JSON locally
        // -----------------------------------

        const json =
            JSON.stringify(
                report,
                null,
                2
            );


        fs.writeFileSync(
            paths.json,
            json,
            "utf8"
        );


        fs.writeFileSync(
            paths.latestJson,
            json,
            "utf8"
        );


        // -----------------------------------
        // Save screenshot locally
        // -----------------------------------

        await page.screenshot({
            path:
                paths.screenshot,

            fullPage:
                false,
        });


        fs.copyFileSync(
            paths.screenshot,
            paths.latestScreenshot
        );


        // -----------------------------------
        // Terminal output
        // -----------------------------------

        printReportSummary(
            report,
            analysis
        );


        console.log(
            `JSON saved to:`
        );

        console.log(
            paths.json
        );


        console.log("");

        console.log(
            `Screenshot saved to:`
        );

        console.log(
            paths.screenshot
        );


        // -----------------------------------
        // TestMu dashboard status
        // -----------------------------------

        await setTestMuStatus(
            page,

            analysis.passed
                ? "passed"
                : "failed",

            analysis.passed
                ? "Portfolio Hero QA passed."
                : analysis.reasons.join(
                    " | "
                )
        );


        // -----------------------------------
        // Exit code
        // -----------------------------------

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
            "TEST EXECUTION FAILED"
        );

        console.error(
            error
        );


        if (
            page
        ) {
            await setTestMuStatus(
                page,
                "failed",
                error.message
            );
        }


        process.exitCode =
            1;
    } finally {
        try {
            await page?.close();
        } catch {
            // ignore
        }


        try {
            await browser?.close();
        } catch {
            // ignore
        }
    }
})();