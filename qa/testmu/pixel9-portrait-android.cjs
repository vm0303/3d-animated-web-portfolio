const { _android } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const DEVICE_NAME = "Pixel 9";
const QA_LABEL =
    "Pixel-9-Chrome-Portrait-AndroidConnect";

const BASE_URL =
    process.env.QA_BASE_URL ||
    "http://192.168.1.233:5173";

const PLAYWRIGHT_VERSION = "1.59.0";

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
        "testmu"
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
                    "Pixel-9-Chrome-Portrait-AndroidConnect__latest.json"
                ),

            latestScreenshot:
                path.join(
                    OUTPUT_DIR,
                    "Pixel-9-Chrome-Portrait-AndroidConnect__latest.png"
                ),

            diagnosticScreenshot:
                path.join(
                    OUTPUT_DIR,
                    "Pixel-9-Chrome-Portrait-AndroidConnect__DIAGNOSTIC.png"
                ),

            errorScreenshot:
                path.join(
                    OUTPUT_DIR,
                    "Pixel-9-Chrome-Portrait-AndroidConnect__ERROR.png"
                ),
        };
    };


// =======================================================
// TESTMU STATUS
// =======================================================

const setTestMuStatus =
    async (
        page,
        status,
        remark
    ) => {
        if (!page) {
            return;
        }


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
        } catch (error) {
            console.warn(
                "Could not update TestMu test status:",
                error.message
            );
        }
    };


// =======================================================
// ANDROID ORIENTATION
// =======================================================

const forcePortrait =
    async (
        device
    ) => {
        console.log(
            "Forcing physical Pixel 9 to portrait..."
        );


        await device.shell(
            "settings put system accelerometer_rotation 0"
        );


        await device.shell(
            "settings put system user_rotation 0"
        );


        await new Promise(
            (resolve) =>
                setTimeout(
                    resolve,
                    2500
                )
        );
    };


const restoreOrientation =
    async (
        device
    ) => {
        if (!device) {
            return;
        }


        try {
            await device.shell(
                "settings put system user_rotation 0"
            );


            await device.shell(
                "settings put system accelerometer_rotation 1"
            );
        } catch (error) {
            console.warn(
                "Could not restore Android orientation:",
                error.message
            );
        }
    };


// =======================================================
// RESULT ANALYSIS
// =======================================================

const analyzeReport =
    (
        report
    ) => {
        const reasons =
            [];


        // -----------------------------------
        // Require Hero QA V4
        // -----------------------------------

        const qaVersion =
            Number(
                report.qaVersion
            );


        if (
            !Number.isFinite(
                qaVersion
            ) ||
            qaVersion < 4
        ) {
            reasons.push(
                `Hero QA V4 or newer is required. Received V${report.qaVersion ?? "unknown"}.`
            );
        }


        // -----------------------------------
        // Verify requested orientation
        // -----------------------------------

        if (
            report.viewport.layoutMode !==
            "portrait"
        ) {
            reasons.push(
                `Expected portrait but received ${report.viewport.layoutMode}.`
            );
        }


        /*
          Hero QA V4 is now the source of truth.

          summary.overall includes:

          - horizontal overflow
          - viewport clipping
          - visibility failures
          - image crop failures
          - portrait bubble placement
        */

        const overall =
            report.summary
                ?.overall;


        if (overall) {
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
        } else {
            /*
              Compatibility fallback if an
              older heroQa.js somehow loaded.
            */

            if (
                report.summary
                    ?.horizontalOverflow
            ) {
                reasons.push(
                    "Horizontal document overflow detected."
                );
            }


            if (
                report.summary
                    ?.missingElementCount >
                0
            ) {
                reasons.push(
                    `Missing tracked elements: ${report.summary
                        .missingElements
                        .join(", ")
                    }`
                );
            }


            if (
                report.summary
                    ?.viewportClipping
                    ?.failureCount >
                0
            ) {
                const descriptions =
                    report.summary
                        .viewportClipping
                        .failures
                        .map(
                            (item) =>
                                `${item.name} (${item.clipping.max}px)`
                        );


                reasons.push(
                    `Viewport clipping failures: ${descriptions.join(", ")}`
                );
            }


            /*
              Old V3 fallback for bubble placement.
            */

            const bubble =
                report.relationships
                    ?.bubblePlacement;


            if (
                bubble?.evaluated &&
                bubble.status !==
                "PASS"
            ) {
                let message =
                    `Bubble placement: ${bubble.status}.`;


                if (
                    bubble.recommendation
                ) {
                    message +=
                        ` Recommended movement: ` +
                        `${bubble.recommendation.direction} ` +
                        `${bubble.recommendation.pixels}px.`;
                }


                reasons.push(
                    message
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
// TERMINAL SUMMARY
// =======================================================

const printReportSummary =
    (
        report,
        analysis
    ) => {
        const viewport =
            report.viewport;


        const summary =
            report.summary;


        const bubble =
            report.relationships
                ?.bubblePlacement;


        const lastRule =
            summary
                .lastMatchingMediaQuery;


        const visibilityPolicy =
            summary
                .visibilityPolicy;


        const cropPolicy =
            summary
                .cropPolicy;


        const overall =
            summary
                .overall;


        const scrollSvg =
            report.elements
                ?.scrollSvg;


        const heroImage =
            report.elements
                ?.heroImage;


        console.log("");
        console.log(
            "============================================"
        );

        console.log(
            "PIXEL 9 — ANDROID.CONNECT — PORTRAIT"
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


        // -----------------------------------
        // Viewport
        // -----------------------------------

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


        // -----------------------------------
        // CSS
        // -----------------------------------

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


        // -----------------------------------
        // Layout
        // -----------------------------------

        console.log("");
        console.log(
            "LAYOUT"
        );


        console.log(
            `Horizontal overflow: ${summary.horizontalOverflow
                ? "YES"
                : "NO"
            }`
        );


        console.log(
            `Viewport clipping failures: ${summary
                .viewportClipping
                .failureCount
            }`
        );


        for (
            const item of
            summary
                .viewportClipping
                .failures
        ) {
            console.log(
                `  FAIL ${item.name}: ${item.clipping.max}px`
            );
        }


        // -----------------------------------
        // Visibility
        // -----------------------------------

        console.log("");
        console.log(
            "VISIBILITY"
        );


        if (
            visibilityPolicy
        ) {
            console.log(
                `Visibility policy failures: ${visibilityPolicy.failureCount}`
            );


            for (
                const item of
                visibilityPolicy
                    .failures
            ) {
                console.log(
                    `  FAIL ${item.name}: expected ${item.expected}, actual ${item.actual}`
                );


                if (
                    item.reasons
                        ?.length
                ) {
                    console.log(
                        `       reason: ${item.reasons.join(", ")}`
                    );
                }
            }
        } else {
            console.log(
                "Visibility policy: NOT AVAILABLE"
            );
        }


        if (
            scrollSvg
                ?.found
        ) {
            console.log(
                `Scroll SVG rendered: ${scrollSvg
                    .visibility
                    ?.rendered
                    ? "YES"
                    : "NO"
                }`
            );
        }


        // -----------------------------------
        // Image crop
        // -----------------------------------

        console.log("");
        console.log(
            "IMAGE CROP"
        );


        const heroCrop =
            heroImage
                ?.imageCrop;


        if (
            heroCrop
                ?.loaded
        ) {
            console.log(
                `Hero image cropped: ${heroCrop.cropped
                    ? "YES"
                    : "NO"
                }`
            );


            console.log(
                `Horizontal crop: ${heroCrop
                    .crop
                    .horizontalTotal
                }px (${heroCrop
                    .crop
                    .percentOfDrawn
                    ?.horizontal ??
                0
                }%)`
            );


            console.log(
                `Vertical crop:   ${heroCrop
                    .crop
                    .verticalTotal
                }px (${heroCrop
                    .crop
                    .percentOfDrawn
                    ?.vertical ??
                0
                }%)`
            );
        } else {
            console.log(
                "Hero image crop data unavailable."
            );
        }


        if (
            cropPolicy
        ) {
            console.log(
                `Allowed crop: H <= ${cropPolicy
                    .limits
                    .maxHorizontalPercent
                }%, V <= ${cropPolicy
                    .limits
                    .maxVerticalPercent
                }%`
            );


            console.log(
                `Crop policy failures: ${cropPolicy.failureCount}`
            );


            for (
                const item of
                cropPolicy
                    .failures
            ) {
                if (
                    item.axis
                ) {
                    console.log(
                        `  FAIL ${item.name} ${item.axis}: ${item.actualPercent}% > ${item.maxPercent}%`
                    );
                } else {
                    console.log(
                        `  FAIL ${item.name}: ${item.reason}`
                    );
                }
            }
        }


        // -----------------------------------
        // Bubble
        // -----------------------------------

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


            if (
                bubble.currentBubble
            ) {
                console.log(
                    `Current bubble translateY: ${bubble.currentBubble.translateY}px`
                );
            }


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
        } else {
            console.log(
                `Bubble placement not evaluated: ${bubble?.reason ?? "unknown"}`
            );
        }


        // -----------------------------------
        // Hero QA overall
        // -----------------------------------

        console.log("");
        console.log(
            "HERO QA V4 OVERALL"
        );


        if (
            overall
        ) {
            console.log(
                `Hero QA overall: ${overall.passed
                    ? "PASS"
                    : "FAIL"
                }`
            );


            console.log(
                `Hero QA overall failures: ${overall.failureCount}`
            );
        } else {
            console.log(
                "Hero QA overall: NOT AVAILABLE"
            );
        }


        // -----------------------------------
        // Runner result
        // -----------------------------------

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
// MAIN
// =======================================================

(async () => {
    let device =
        null;

    let context =
        null;

    let page =
        null;


    const outputPaths =
        makeOutputPaths();


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
            "wss://cdp.lambdatest.com/playwright?capabilities=" +
            encodeURIComponent(
                JSON.stringify(
                    capabilities
                )
            );


        // -----------------------------------
        // Connect Android
        // -----------------------------------

        console.log(
            "Connecting to TestMu Pixel 9 using _android.connect()..."
        );


        device =
            await _android.connect(
                cdpUrl
            );


        console.log(
            "Connected."
        );


        console.log(
            `Model: ${device.model()}`
        );


        console.log(
            `Serial: ${device.serial()}`
        );


        // -----------------------------------
        // Force portrait
        // -----------------------------------

        await forcePortrait(
            device
        );


        /*
          Restart Chrome after setting
          the physical orientation.
        */

        try {
            await device.shell(
                "am force-stop com.android.chrome"
            );


            console.log(
                "Existing Chrome process stopped."
            );
        } catch (error) {
            console.warn(
                "Could not force-stop Chrome:",
                error.message
            );
        }


        console.log(
            "Launching Chrome in portrait..."
        );


        context =
            await device.launchBrowser();


        context.setDefaultTimeout(
            120000
        );


        page =
            await context.newPage();


        // -----------------------------------
        // QA URL
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


        // -----------------------------------
        // Verify portrait
        // -----------------------------------

        console.log(
            "Waiting for portrait viewport..."
        );


        try {
            await page.waitForFunction(
                () =>
                    window.innerHeight >
                    window.innerWidth,

                null,

                {
                    timeout:
                        20000,
                }
            );
        } catch {
            console.log(
                "Portrait not detected yet. Forcing portrait again..."
            );


            await forcePortrait(
                device
            );


            await page.waitForFunction(
                () =>
                    window.innerHeight >
                    window.innerWidth,

                null,

                {
                    timeout:
                        30000,
                }
            );
        }


        // -----------------------------------
        // Wait for Hero QA
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


        // -----------------------------------
        // Wait for Hero images to fully load,
        // decode, and become paint-ready
        // -----------------------------------

        console.log(
            "Waiting for Hero images to decode..."
        );

        await page.evaluate(
            async () => {
                const images = [
                    ...document.querySelectorAll(
                        ".certificationsImages img, .hImg img"
                    ),
                ];


                await Promise.all(
                    images.map(
                        async (img) => {
                            // Wait for network load/error first.
                            if (!img.complete) {
                                await new Promise(
                                    (resolve) => {
                                        const done =
                                            () =>
                                                resolve();


                                        img.addEventListener(
                                            "load",
                                            done,
                                            {
                                                once: true,
                                            }
                                        );


                                        img.addEventListener(
                                            "error",
                                            done,
                                            {
                                                once: true,
                                            }
                                        );
                                    }
                                );
                            }


                            // Then wait for browser decode.
                            if (
                                typeof img.decode ===
                                "function"
                            ) {
                                try {
                                    await img.decode();
                                } catch {
                                    /*
                                      V4.1 will report the
                                      image-loading failure.
                                    */
                                }
                            }
                        }
                    )
                );


                /*
                  Give the browser two paint frames
                  after decoding completes.
                */

                await new Promise(
                    (resolve) =>
                        requestAnimationFrame(
                            () =>
                                requestAnimationFrame(
                                    resolve
                                )
                        )
                );
            }
        );


        /*
          Small settling period for the stabilized
          React / Three.js composition.
        
          This is not being used to wait for images.
        */

        await page.waitForTimeout(
            750
        );


        console.log(
            "Hero images decoded and paint-ready."
        );


        // -----------------------------------
        // Diagnostics
        // -----------------------------------

        console.log("");
        console.log(
            "PAGE LOADED"
        );


        console.log(
            "Current URL:",
            page.url()
        );


        console.log(
            "Title:",
            await page.title()
        );


        const diagnostic =
            await page.evaluate(
                () => ({
                    href:
                        window.location.href,

                    readyState:
                        document.readyState,

                    qaDataset:
                        document
                            .documentElement
                            .dataset
                            .qa ??
                        "NOT SET",

                    qaStable:
                        document
                            .documentElement
                            .dataset
                            .qaStable ??
                        "NOT SET",

                    qaVersion:
                        window
                            .__PORTFOLIO_QA__
                            ?.version ??
                        null,

                    qaGlobal:
                        Boolean(
                            window
                                .__PORTFOLIO_QA__
                        ),

                    qaCapture:
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

                    clientWidth:
                        document
                            .documentElement
                            .clientWidth,

                    clientHeight:
                        document
                            .documentElement
                            .clientHeight,

                    screenWidth:
                        window.screen.width,

                    screenHeight:
                        window.screen.height,

                    orientation:
                        window.screen
                            ?.orientation
                            ?.type ??
                        null,

                    dpr:
                        window.devicePixelRatio,
                })
            );


        console.log(
            "HTTP location:",
            diagnostic.href
        );


        console.log(
            "Document readyState:",
            diagnostic.readyState
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
            "QA version:",
            diagnostic.qaVersion
        );


        console.log(
            "QA global exists:",
            diagnostic.qaGlobal
        );


        console.log(
            "QA capture exists:",
            diagnostic.qaCapture
        );


        console.log(
            "Hero exists:",
            diagnostic.heroExists
        );


        console.log(
            `Current inner viewport: ${diagnostic.innerWidth} x ${diagnostic.innerHeight}`
        );


        console.log(
            `Current visual viewport: ${diagnostic.visualWidth} x ${diagnostic.visualHeight}`
        );


        console.log(
            `Current client viewport: ${diagnostic.clientWidth} x ${diagnostic.clientHeight}`
        );


        console.log(
            `Current screen: ${diagnostic.screenWidth} x ${diagnostic.screenHeight}`
        );


        console.log(
            "Current screen orientation:",
            diagnostic.orientation
        );


        console.log(
            "Current DPR:",
            diagnostic.dpr
        );


        // -----------------------------------
        // Diagnostic screenshot
        // -----------------------------------

        await page.screenshot({
            path:
                outputPaths
                    .diagnosticScreenshot,

            fullPage:
                false,
        });


        console.log(
            "Diagnostic screenshot saved."
        );


        // -----------------------------------
        // Capture Hero QA V4
        // -----------------------------------

        const report =
            await page.evaluate(
                () =>
                    window
                        .__PORTFOLIO_QA__
                        .capture()
            );


        if (
            report.viewport.layoutMode !==
            "portrait"
        ) {
            throw new Error(
                `Device did not enter portrait mode. ` +
                `QA reported ${report.viewport.layoutMode} ` +
                `with inner viewport ` +
                `${report.viewport.inner.width}x${report.viewport.inner.height}.`
            );
        }


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
        // Final screenshot
        // -----------------------------------

        await page.screenshot({
            path:
                outputPaths.screenshot,

            fullPage:
                false,
        });


        fs.copyFileSync(
            outputPaths.screenshot,
            outputPaths.latestScreenshot
        );


        // -----------------------------------
        // Terminal summary
        // -----------------------------------

        printReportSummary(
            report,
            analysis
        );


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
        // TestMu dashboard status
        // -----------------------------------

        await setTestMuStatus(
            page,

            analysis.passed
                ? "passed"
                : "failed",

            analysis.passed
                ? "Pixel 9 Android-connect portrait QA passed."
                : analysis.reasons.join(
                    " | "
                )
        );


        /*
          Non-zero process exit code whenever
          Hero QA V4 fails.
        */

        if (
            !analysis.passed
        ) {
            process.exitCode =
                1;
        }
    } catch (error) {
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
            try {
                await page.screenshot({
                    path:
                        outputPaths
                            .errorScreenshot,

                    fullPage:
                        false,
                });


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


            await setTestMuStatus(
                page,
                "failed",
                error.message
            );
        }


        process.exitCode =
            1;
    } finally {
        // -----------------------------------
        // Cleanup
        // -----------------------------------

        try {
            await page?.close();
        } catch {
            // Ignore cleanup failure.
        }


        try {
            await context?.close();
        } catch {
            // Ignore cleanup failure.
        }


        await restoreOrientation(
            device
        );


        try {
            await device?.close();
        } catch {
            // Ignore cleanup failure.
        }
    }
})();