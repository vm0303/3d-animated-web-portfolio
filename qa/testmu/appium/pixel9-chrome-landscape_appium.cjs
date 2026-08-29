const { remote } = require("webdriverio");

const fs = require("node:fs");
const path = require("node:path");


// =======================================================
// CONFIG
// =======================================================

const DEVICE_NAME =
    "Pixel 9";

const BROWSER_NAME =
    "Chrome";

const ORIENTATION =
    "landscape";

const QA_LABEL =
    "Pixel-9-Chrome-Landscape-Appium";

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
// HELPERS
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
            "Waiting for landscape viewport to stabilize..."
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
                `visual ${round(current.visualWidth)} x ${round(current.visualHeight)}, ` +
                `${current.orientation}`
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
              Three matching observations:

              previous
              current
              next

              = stable viewport.
            */

            if (
                consecutiveMatches >=
                2
            ) {
                console.log(
                    "Landscape viewport stable."
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
// IMAGE LOAD / DECODE / PAINT
// =======================================================

const waitForHeroImages =
    async (
        browser
    ) => {
        console.log(
            "Waiting for Hero images to decode..."
        );


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
                                                  Hero QA V4.1
                                                  handles broken images.
                                                */
                                            }
                                        }
                                    }
                                )
                            );


                            /*
                              Allow two full browser
                              paint frames.
                            */

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

                                imageCount:
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
          Small final settling period.
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
            "landscape"
        ) {
            reasons.push(
                `Expected landscape but received ${report?.viewport?.layoutMode ?? "unknown"}.`
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
// KNOWN PLAYWRIGHT LANDSCAPE BASELINE
// =======================================================

const PLAYWRIGHT_BASELINE = {
    screenWidth:
        924,

    screenHeight:
        412,

    innerWidth:
        821,

    innerHeight:
        303,

    visualWidth:
        821.33,

    visualHeight:
        303.24,

    dpr:
        2.63,

    expectedFailureCount:
        5,
};


// =======================================================
// BASELINE COMPARISON
// =======================================================

const printBaselineComparison =
    (
        report
    ) => {
        const viewport =
            report.viewport;


        console.log("");
        console.log(
            "PLAYWRIGHT LANDSCAPE BASELINE"
        );

        console.log(
            "--------------------------------------------"
        );


        console.log(
            `Screen: Appium ${viewport.screen.width} x ${viewport.screen.height}` +
            ` | Playwright ${PLAYWRIGHT_BASELINE.screenWidth} x ${PLAYWRIGHT_BASELINE.screenHeight}`
        );


        console.log(
            `Inner:  Appium ${viewport.inner.width} x ${viewport.inner.height}` +
            ` | Playwright ${PLAYWRIGHT_BASELINE.innerWidth} x ${PLAYWRIGHT_BASELINE.innerHeight}`
        );


        console.log(
            `Visual: Appium ${viewport.visual?.width} x ${viewport.visual?.height}` +
            ` | Playwright ${PLAYWRIGHT_BASELINE.visualWidth} x ${PLAYWRIGHT_BASELINE.visualHeight}`
        );


        console.log(
            `DPR:    Appium ${viewport.devicePixelRatio}` +
            ` | Playwright ${PLAYWRIGHT_BASELINE.dpr}`
        );


        console.log(
            `Failures: Appium ${report.summary.overall.failureCount}` +
            ` | known Playwright ${PLAYWRIGHT_BASELINE.expectedFailureCount}`
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
        viewportStability,
        appiumOrientation
    ) => {
        const viewport =
            report.viewport;


        const summary =
            report.summary;


        const visibility =
            summary
                .visibilityPolicy;


        const imageLoading =
            summary
                .imageLoadingPolicy;


        const cropPolicy =
            summary
                .cropPolicy;


        const heroImage =
            report.elements
                ?.heroImage;


        const scrollSvg =
            report.elements
                ?.scrollSvg;


        const hero =
            report.elements
                ?.hero;


        const contactLink =
            report.elements
                ?.contactLink;


        const contactButton =
            report.elements
                ?.contactButton;


        console.log("");
        console.log(
            "============================================"
        );

        console.log(
            "PIXEL 9 — APPIUM — CHROME — LANDSCAPE"
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
            `JS orientation: ${viewport.orientation}`
        );


        console.log(
            `Appium orientation: ${appiumOrientation}`
        );


        console.log(
            `Viewport stable: ${
                viewportStability.stable
                    ? "YES"
                    : "NO"
            }`
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
            `Last matching rule: ${
                summary
                    .lastMatchingMediaQuery
                    ?.condition ||
                "NONE"
            }`
        );


        // -----------------------------------
        // Images
        // -----------------------------------

        console.log("");
        console.log(
            "IMAGES"
        );


        if (
            imageLoading
        ) {
            console.log(
                `Certification images: expected ${imageLoading.certificationImages.expectedCount}, ` +
                `found ${imageLoading.certificationImages.foundCount}, ` +
                `loaded ${imageLoading.certificationImages.loadedCount}, ` +
                `visible ${imageLoading.certificationImages.visibleCount}`
            );


            console.log(
                `Image-loading failures: ${imageLoading.failureCount}`
            );
        }


        // -----------------------------------
        // Visibility
        // -----------------------------------

        console.log("");
        console.log(
            "VISIBILITY"
        );


        console.log(
            `Visibility failures: ${
                visibility
                    ?.failureCount ??
                "N/A"
            }`
        );


        if (
            visibility
                ?.failures
                ?.length
        ) {
            for (
                const item of
                visibility.failures
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
        }


        if (
            scrollSvg
                ?.found
        ) {
            console.log(
                `Scroll SVG rendered: ${
                    scrollSvg
                        .visibility
                        ?.rendered
                        ? "YES"
                        : "NO"
                }`
            );


            if (
                !scrollSvg
                    .visibility
                    ?.rendered
            ) {
                console.log(
                    `Scroll SVG reason: ${
                        scrollSvg
                            .visibility
                            ?.reasons
                            ?.join(", ") ||
                        "unknown"
                    }`
                );
            }
        }


        // -----------------------------------
        // Clipping
        // -----------------------------------

        console.log("");
        console.log(
            "CLIPPING"
        );


        console.log(
            `Viewport clipping failures: ${summary.viewportClipping.failureCount}`
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


        if (
            hero?.found
        ) {
            console.log(
                `Hero bottom clipping: ${hero.viewportClipping?.bottom ?? 0}px`
            );
        }


        if (
            contactLink?.found
        ) {
            console.log(
                `Contact link bottom clipping: ${contactLink.viewportClipping?.bottom ?? 0}px`
            );
        }


        if (
            contactButton?.found
        ) {
            console.log(
                `Contact button bottom clipping: ${contactButton.viewportClipping?.bottom ?? 0}px`
            );
        }


        // -----------------------------------
        // Crop
        // -----------------------------------

        console.log("");
        console.log(
            "IMAGE CROP"
        );


        const crop =
            heroImage
                ?.imageCrop;


        if (
            crop
                ?.loaded
        ) {
            console.log(
                `Hero image cropped: ${
                    crop.cropped
                        ? "YES"
                        : "NO"
                }`
            );


            console.log(
                `Horizontal crop: ${crop.crop.horizontalTotal}px ` +
                `(${crop.crop.percentOfDrawn?.horizontal ?? 0}%)`
            );


            console.log(
                `Vertical crop:   ${crop.crop.verticalTotal}px ` +
                `(${crop.crop.percentOfDrawn?.vertical ?? 0}%)`
            );
        }


        if (
            cropPolicy
        ) {
            console.log(
                `Crop policy: ${
                    cropPolicy.passed
                        ? "PASS"
                        : "FAIL"
                }`
            );


            console.log(
                `Crop failures: ${cropPolicy.failureCount}`
            );
        }


        // -----------------------------------
        // Overall
        // -----------------------------------

        console.log("");
        console.log(
            "HERO QA V4.1 OVERALL"
        );


        console.log(
            `Hero QA overall: ${
                summary
                    .overall
                    .passed
                    ? "PASS"
                    : "FAIL"
            }`
        );


        console.log(
            `Hero QA overall failures: ${
                summary
                    .overall
                    .failureCount
            }`
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
        passed
    ) => {
        if (!browser) {
            return;
        }


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
                "Could not update TestMu status:",
                error.message
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
        // TestMu capabilities
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

            /*
              TestMu supports this capability
              on real devices.
            */

            deviceOrientation:
                "landscape",

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
                BROWSER_NAME,

            "LT:Options":
                ltOptions,
        };


        // -----------------------------------
        // Connect Appium
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

                /*
                  Keep WebdriverIO quiet.
                  We already learned that INFO
                  makes waitUntil look like an
                  endless loop.
                */

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
        // Explicitly enforce landscape
        // -----------------------------------

        /*
          We already requested landscape in
          the TestMu capabilities.

          This is a second verification layer.
          WebdriverIO exposes Appium's
          setOrientation command.
        */

        try {
            console.log(
                "Explicitly setting Appium orientation to LANDSCAPE..."
            );


            await browser.setOrientation(
                "LANDSCAPE"
            );


            await sleep(
                2000
            );
        } catch (
            error
        ) {
            console.warn(
                "Explicit setOrientation was not accepted; continuing with TestMu deviceOrientation capability:",
                error.message
            );
        }


        let appiumOrientation =
            "UNKNOWN";


        try {
            appiumOrientation =
                await browser.getOrientation();


            console.log(
                `Appium reports orientation: ${appiumOrientation}`
            );
        } catch (
            error
        ) {
            console.warn(
                "Could not read Appium orientation:",
                error.message
            );
        }


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


        await browser.url(
            qaUrl
        );


        // -----------------------------------
        // PREFLIGHT
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

                    innerWidth:
                        window.innerWidth,

                    innerHeight:
                        window.innerHeight,

                    orientation:
                        window.screen
                            ?.orientation
                            ?.type ??
                        null,

                    bodyPreview:
                        document
                            .body
                            ?.innerText
                            ?.slice(
                                0,
                                300
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
            `Initial viewport: ${preflight.innerWidth} x ${preflight.innerHeight}`
        );


        console.log(
            "Initial orientation:",
            preflight.orientation
        );


        console.log(
            "--------------------------------------------"
        );


        // -----------------------------------
        // Wait for document
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
                    30000,

                interval:
                    1000,

                timeoutMsg:
                    "Document did not reach readyState=complete after 30 seconds.",
            }
        );


        // -----------------------------------
        // Wait for QA V4.1
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
                    15000,

                interval:
                    1000,

                timeoutMsg:
                    "window.__PORTFOLIO_QA__.capture did not become available after 15 seconds.",
            }
        );


        console.log(
            "Hero QA V4.1 detected."
        );


        // -----------------------------------
        // Confirm browser is actually landscape
        // -----------------------------------

        await browser.waitUntil(
            async () => {
                try {
                    return await browser.execute(
                        () =>
                            window.innerWidth >
                            window.innerHeight
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
                    "Browser viewport did not become landscape after 15 seconds.",
            }
        );


        console.log(
            "Browser viewport confirmed landscape."
        );


        // -----------------------------------
        // Stable viewport
        // -----------------------------------

        const viewportStability =
            await waitForStableViewport(
                browser
            );


        // -----------------------------------
        // Image decode / paint
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


        // -----------------------------------
        // Add automation metadata
        // -----------------------------------

        report.automation = {
            framework:
                "Appium",

            client:
                "WebdriverIO",

            device:
                DEVICE_NAME,

            browser:
                BROWSER_NAME,

            requestedOrientation:
                ORIENTATION,

            appiumOrientation,

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
            "Saving Appium landscape screenshot..."
        );


        await browser.saveScreenshot(
            outputPaths.screenshot
        );


        fs.copyFileSync(
            outputPaths.screenshot,
            outputPaths.latestScreenshot
        );


        // -----------------------------------
        // Terminal output
        // -----------------------------------

        printReportSummary(
            report,
            analysis,
            viewportStability,
            appiumOrientation
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
            analysis.passed
        );


        /*
          A Hero QA failure does NOT mean
          Appium failed to connect.

          Pixel 9 landscape is currently
          expected to fail its CSS/layout QA.
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
            "APPIUM LANDSCAPE TEST EXECUTION FAILED"
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
                    false
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