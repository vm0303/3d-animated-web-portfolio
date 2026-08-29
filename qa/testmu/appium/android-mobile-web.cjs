const { remote } = require("webdriverio");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BASE_URL =
    process.env.QA_BASE_URL ||
    "http://192.168.1.233:5173";

const DEFAULT_OUTPUT_ROOT = path.join(
    process.cwd(),
    "qa-results",
    "testmu",
    "appium",
    "matrix"
);

const LT_USERNAME =
    process.env.LT_USERNAME;

const LT_ACCESS_KEY =
    process.env.LT_ACCESS_KEY;

const LT_TUNNEL_NAME =
    process.env.LT_TUNNEL_NAME;


// =======================================================
// SMALL HELPERS
// =======================================================

const sleep = (milliseconds) =>
    new Promise((resolve) =>
        setTimeout(
            resolve,
            milliseconds
        )
    );


const round = (value) => {
    if (
        typeof value !== "number" ||
        !Number.isFinite(value)
    ) {
        return null;
    }


    return Math.round(
        value * 100
    ) / 100;
};


const slugify = (value) =>
    String(value)
        .trim()
        .replace(
            /[^a-zA-Z0-9._-]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            ""
        ) ||
    "unnamed-test";


const timestampForFilename = () =>
    new Date()
        .toISOString()
        .replace(
            /[:.]/g,
            "-"
        );


const normalizePlatformVersion = (value) => {
    const match =
        String(value || "")
            .match(/\d+(?:\.\d+)*/);


    return match
        ? match[0]
        : null;
};


const samePlatformVersion = (left, right) => {
    const a =
        normalizePlatformVersion(left);


    const b =
        normalizePlatformVersion(right);


    if (!a || !b) {
        return false;
    }


    const aParts =
        a.split(".")
            .map(Number);


    const bParts =
        b.split(".")
            .map(Number);


    const length =
        Math.max(
            aParts.length,
            bParts.length
        );


    for (
        let index = 0;
        index < length;
        index += 1
    ) {
        if (
            (aParts[index] || 0) !==
            (bParts[index] || 0)
        ) {
            return false;
        }
    }


    return true;
};


const parseBrowserVersion = (
    userAgent,
    browserName
) => {
    const ua =
        String(userAgent || "");


    const browser =
        String(browserName || "")
            .toLowerCase();


    const patterns =
        browser.includes("samsung")
            ? [/SamsungBrowser\/([\d.]+)/i]
            : browser.includes("firefox")
                ? [/Firefox\/([\d.]+)/i, /FxiOS\/([\d.]+)/i]
                : browser.includes("edge")
                    ? [/EdgA\/([\d.]+)/i, /EdgiOS\/([\d.]+)/i, /Edg\/([\d.]+)/i]
                    : [/Chrome\/([\d.]+)/i, /CriOS\/([\d.]+)/i];


    for (const pattern of patterns) {
        const match =
            ua.match(pattern);


        if (match?.[1]) {
            return match[1];
        }
    }


    return null;
};


const buildDeviceSpecifications = ({
    testCase,
    browserCapabilities,
    reportViewport,
    preflight,
    sessionId,
    appiumOrientation,
    region,
}) => {
    const capabilities =
        browserCapabilities ||
        {};


    const desired =
        capabilities.desired ||
        {};


    const resolvedPlatformVersion =
        capabilities.platformVersion ||
        desired.platformVersion ||
        null;


    const userAgent =
        reportViewport?.userAgent ||
        preflight?.page?.userAgent ||
        null;


    return {
        requested: {
            deviceName:
                testCase.deviceName,


            platformName:
                "Android",


            platformVersionPolicy:
                "latest-available-for-device",


            platformVersion:
                testCase.platformVersion ||
                null,


            browserName:
                testCase.browserName,


            orientation:
                testCase.orientation,


            region:
                region ||
                null,
        },


        resolved: {
            manufacturer:
                capabilities.deviceManufacturer ||
                null,


            model:
                capabilities.deviceModel ||
                desired.deviceName ||
                testCase.deviceName,


            cloudDeviceName:
                capabilities.deviceName ||
                null,


            udid:
                capabilities.deviceUDID ||
                capabilities.udid ||
                desired.udid ||
                null,


            platformName:
                capabilities.platformName ||
                desired.platformName ||
                "android",


            platformVersion:
                resolvedPlatformVersion,


            apiLevel:
                capabilities.deviceApiLevel ??
                null,


            browserName:
                capabilities.browserName ||
                desired.browserName ||
                testCase.browserName,


            browserVersion:
                parseBrowserVersion(
                    userAgent,
                    testCase.browserName
                ),


            requestedOrientation:
                testCase.orientation,


            appiumOrientation:
                appiumOrientation ||
                capabilities.orientation ||
                desired.orientation ||
                null,


            browserOrientation:
                reportViewport?.orientation ||
                preflight?.page?.orientation ||
                null,


            deviceScreenSize:
                capabilities.deviceScreenSize ||
                null,


            deviceScreenDensity:
                capabilities.deviceScreenDensity ??
                null,


            pixelRatioCapability:
                capabilities.pixelRatio ??
                null,


            devicePixelRatio:
                reportViewport?.devicePixelRatio ??
                null,


            statusBarHeight:
                capabilities.statBarHeight ??
                null,


            viewportRect:
                capabilities.viewportRect ||
                null,


            screen:
                reportViewport?.screen ||
                null,


            innerViewport:
                reportViewport?.inner ||
                null,


            visualViewport:
                reportViewport?.visual ||
                null,


            document:
                reportViewport?.document ||
                null,


            userAgent,


            sessionId:
                sessionId ||
                null,
        },


        latestOsSelection:
            testCase.latestOsSelection ||
            null,


        resolvedCapabilities:
            browserCapabilities ||
            null,
    };
};


const assertResolvedLatestOs = (
    testCase,
    browserCapabilities
) => {
    const requested =
        testCase.platformVersion;


    const resolved =
        browserCapabilities?.platformVersion ||
        browserCapabilities?.desired?.platformVersion ||
        null;


    if (!requested) {
        throw new Error(
            `Latest OS was not resolved before starting ${testCase.id}. Wildcard OS selection is disabled.`
        );
    }


    if (
        String(requested).toLowerCase() ===
            "latest" ||
        requested ===
            ".*"
    ) {
        throw new Error(
            `Matrix case ${testCase.id} reached Appium without an exact latest OS. Wildcard/latest capabilities are not allowed at session time.`
        );
    }


    if (!resolved) {
        throw new Error(
            `TestMu did not report a resolved platformVersion for ${testCase.deviceName}.`
        );
    }


    if (
        !samePlatformVersion(
            requested,
            resolved
        )
    ) {
        throw new Error(
            `Latest OS mismatch for ${testCase.deviceName}: requested Android ${requested}, but TestMu allocated Android ${resolved}.`
        );
    }
};


// =======================================================
// VALIDATION
// =======================================================

const validateEnvironment =
    () => {
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
    };


const normalizeOrientation =
    (value) => {
        const normalized =
            String(
                value ||
                ""
            )
                .trim()
                .toLowerCase();


        if (
            normalized !==
            "portrait" &&
            normalized !==
            "landscape"
        ) {
            throw new Error(
                `Unsupported orientation: ${value}. Use portrait or landscape.`
            );
        }


        return normalized;
    };


const validateTestCase =
    (testCase) => {
        if (
            !testCase ||
            typeof testCase !==
            "object"
        ) {
            throw new Error(
                "Matrix test case must be an object."
            );
        }


        if (!testCase.id) {
            throw new Error(
                "Matrix test case is missing id."
            );
        }


        if (!testCase.deviceName) {
            throw new Error(
                `Matrix test ${testCase.id} is missing deviceName.`
            );
        }


        if (!testCase.browserName) {
            throw new Error(
                `Matrix test ${testCase.id} is missing browserName.`
            );
        }


        normalizeOrientation(
            testCase.orientation
        );


        if (
            !testCase.platformVersion ||
            String(testCase.platformVersion).toLowerCase() ===
                "latest" ||
            testCase.platformVersion ===
                ".*"
        ) {
            throw new Error(
                `Matrix test ${testCase.id} must receive an exact TestMu latest OS version before Appium starts.`
            );
        }
    };


// =======================================================
// QA URL
// =======================================================

const buildQaUrl = (
    baseUrl,
    qaLabel,
    qaParams = {}
) => {
    const url =
        new URL(
            baseUrl.endsWith("/")
                ? baseUrl
                : `${baseUrl}/`
        );


    url.searchParams.set(
        "qa",
        "1"
    );


    url.searchParams.set(
        "qaOverlay",
        "0"
    );


    url.searchParams.set(
        "qaLabel",
        qaLabel
    );


    for (
        const [
            key,
            value,
        ] of Object.entries(
            qaParams ||
            {}
        )
    ) {
        if (
            value === undefined ||
            value === null ||
            value === false
        ) {
            continue;
        }


        if (
            Array.isArray(
                value
            )
        ) {
            url.searchParams.set(
                key,
                value.join(",")
            );
        } else {
            url.searchParams.set(
                key,
                String(value)
            );
        }
    }


    return url.toString();
};


// =======================================================
// OUTPUT PATHS
// =======================================================

const makeOutputPaths = (
    testCase,
    matrixRunId
) => {
    const deviceSlug =
        slugify(
            testCase.deviceName
        );


    const osSlug =
        slugify(
            testCase.platformVersion ||
            "UNKNOWN"
        );


    const browserSlug =
        slugify(
            testCase.browserName
        );


    const orientationSlug =
        slugify(
            testCase.orientation
        );


    const artifactStem =
        `${deviceSlug}__Android-${osSlug}__${browserSlug}__${orientationSlug}`;


    const runDirectory =
        path.join(
            DEFAULT_OUTPUT_ROOT,
            slugify(
                matrixRunId
            )
        );


    fs.mkdirSync(
        runDirectory,
        {
            recursive: true,
        }
    );


    const timestamp =
        timestampForFilename();


    const base =
        `${artifactStem}__${timestamp}`;


    return {
        artifactStem,


        runDirectory,


        json:
            path.join(
                runDirectory,
                `${base}.json`
            ),


        screenshot:
            path.join(
                runDirectory,
                `${base}.png`
            ),


        latestJson:
            path.join(
                runDirectory,
                `${artifactStem}__latest.json`
            ),


        latestScreenshot:
            path.join(
                runDirectory,
                `${artifactStem}__latest.png`
            ),


        errorScreenshot:
            path.join(
                runDirectory,
                `${artifactStem}__ERROR.png`
            ),
    };
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
                    window
                        .devicePixelRatio,
            })
        );


const sameViewport = (
    a,
    b
) => {
    if (!a || !b) {
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
        browser,
        {
            maxSamples = 15,
            intervalMs = 500,
            requiredConsecutiveMatches = 2,
        } = {}
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
            attempt <= maxSamples;
            attempt += 1
        ) {
            const current =
                await getViewportSample(
                    browser
                );


            const normalized = {
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


                screenWidth:
                    current.screenWidth,


                screenHeight:
                    current.screenHeight,


                orientation:
                    current.orientation,


                dpr:
                    round(
                        current.dpr
                    ),
            };


            samples.push(
                normalized
            );


            console.log(
                `  sample ${attempt}: ` +
                `inner ${normalized.innerWidth} x ${normalized.innerHeight}, ` +
                `visual ${normalized.visualWidth} x ${normalized.visualHeight}, ` +
                `${normalized.orientation}`
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
              previous + current + next

              gives us three matching
              observations.
            */

            if (
                consecutiveMatches >=
                requiredConsecutiveMatches
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
                intervalMs
            );
        }


        console.warn(
            "Viewport did not produce three stable consecutive observations."
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


        const result =
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
                                                      Hero QA V4.1 records
                                                      broken image assets.
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


        if (
            !result?.ok
        ) {
            throw new Error(
                `Image decode stabilization failed: ${result?.error || "unknown error"}`
            );
        }


        await sleep(
            750
        );


        console.log(
            `Hero images decoded and paint-ready (${result.imageCount} images).`
        );


        return result;
    };


// =======================================================
// PAGE / QA WAITS
// =======================================================

const waitForDocumentReady =
    async (
        browser
    ) => {
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
    };


const waitForHeroQa =
    async (
        browser
    ) => {
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
    };


const waitForRequestedOrientation =
    async (
        browser,
        orientation
    ) => {
        const expected =
            normalizeOrientation(
                orientation
            );


        await browser.waitUntil(
            async () => {
                try {
                    return await browser.execute(
                        (
                            expectedMode
                        ) => {
                            if (
                                expectedMode ===
                                "portrait"
                            ) {
                                return (
                                    window.innerHeight >
                                    window.innerWidth
                                );
                            }


                            return (
                                window.innerWidth >
                                window.innerHeight
                            );
                        },

                        expected
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
                    `Browser viewport did not become ${expected} after 15 seconds.`,
            }
        );
    };


// =======================================================
// PREFLIGHT
// =======================================================

const capturePreflight =
    async (
        browser
    ) => {
        const webdriverTitle =
    await browser.getTitle();


        const page =
            await browser.execute(
                () => ({
                    href:
                        window
                            .location
                            .href,


                    search:
                        window
                            .location
                            .search,


                    readyState:
                        document.readyState,


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


                    qaVersion:
                        window
                            .__PORTFOLIO_QA__
                            ?.version ??
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


                    orientation:
                        window.screen
                            ?.orientation
                            ?.type ??
                        null,


                    userAgent:
                        navigator.userAgent,


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


        return {
            webdriverUrl:page.href,

            webdriverTitle,

            page,
        };
    };


const printPreflight =
    (
        preflight
    ) => {
        console.log("");


        console.log(
            "APPIUM PREFLIGHT"
        );


        console.log(
            "WebDriver URL:",
            preflight.webdriverUrl
        );


        console.log(
            "WebDriver title:",
            preflight.webdriverTitle
        );


        console.log(
            "JS href:",
            preflight.page.href
        );


        console.log(
            "readyState:",
            preflight.page.readyState
        );


        console.log(
            "QA version:",
            preflight.page.qaVersion
        );


        console.log(
            "QA global:",
            preflight
                .page
                .qaGlobalExists
        );


        console.log(
            "QA capture:",
            preflight
                .page
                .qaCaptureExists
        );


        console.log(
            "Hero exists:",
            preflight
                .page
                .heroExists
        );


        console.log(
            `Initial viewport: ${preflight.page.innerWidth} x ${preflight.page.innerHeight}`
        );


        console.log(
            "Initial orientation:",
            preflight
                .page
                .orientation
        );


        console.log(
            "--------------------------------------------"
        );
    };


// =======================================================
// HERO QA ANALYSIS
// =======================================================

const analyzeReport = (
    report,
    testCase,
    viewportStability
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


    const expectedOrientation =
        normalizeOrientation(
            testCase.orientation
        );


    if (
        report
            ?.viewport
            ?.layoutMode !==
        expectedOrientation
    ) {
        reasons.push(
            `Expected ${expectedOrientation} but received ${report?.viewport?.layoutMode ?? "unknown"}.`
        );
    }


    if (
        !viewportStability
            .stable
    ) {
        reasons.push(
            "Viewport did not stabilize before capture."
        );
    }


    const overall =
        report
            ?.summary
            ?.overall;


    if (!overall) {
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
// OPTIONAL GOLDEN BASELINE COMPARISON
// =======================================================

const compareBaseline = (
    report,
    baseline,
    testCase
) => {
    if (!baseline) {
        return null;
    }


    if (
        testCase?.baselinePlatformVersion &&
        !samePlatformVersion(
            testCase.baselinePlatformVersion,
            testCase.platformVersion
        )
    ) {
        return {
            skipped: true,
            reason:
                `Baseline belongs to Android ${testCase.baselinePlatformVersion}; latest TestMu OS for this run is Android ${testCase.platformVersion}.`,
            baselinePlatformVersion:
                testCase.baselinePlatformVersion,
            actualPlatformVersion:
                testCase.platformVersion,
        };
    }


    const viewport =
        report.viewport;


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
                ?.width ??
            null,


        visualHeight:
            viewport
                .visual
                ?.height ??
            null,


        dpr:
            viewport
                .devicePixelRatio,


        matchingMediaQueries:
            report
                .summary
                .matchingMediaQueryCount,


        overallFailureCount:
            report
                .summary
                .overall
                .failureCount,
    };


    const differences =
        {};


    for (
        const [
            key,
            expected,
        ] of Object.entries(
            baseline
        )
    ) {
        const actualValue =
            actual[key];


        if (
            actualValue ===
            undefined
        ) {
            continue;
        }


        if (
            typeof expected ===
            "number" &&
            typeof actualValue ===
            "number"
        ) {
            differences[key] =
                round(
                    actualValue -
                    expected
                );
        } else {
            differences[key] =
                actualValue ===
                    expected
                    ? 0
                    : {
                        expected,

                        actual:
                            actualValue,
                    };
        }
    }


    return {
        expected:
            baseline,

        actual,

        differences,
    };
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
// TERMINAL CASE SUMMARY
// =======================================================

const printCaseSummary = (
    report,
    analysis,
    viewportStability,
    testCase,
    appiumOrientation,
    baselineComparison
) => {
    const viewport =
        report.viewport;


    const summary =
        report.summary;


    console.log("");


    console.log(
        "============================================"
    );


    console.log(
        `${testCase.id}`
    );


    console.log(
        "============================================"
    );


    console.log(
        `Device:      ${testCase.deviceName}`
    );


    console.log(
        `Browser:     ${testCase.browserName}`
    );


    console.log(
        `Requested:   ${testCase.orientation}`
    );


    console.log(
        `Appium:      ${appiumOrientation}`
    );


    console.log(
        `Hero QA:     V${report.qaVersion}`
    );


    console.log(
        `Stable:      ${viewportStability.stable
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
        `DPR:    ${viewport.devicePixelRatio}`
    );


    console.log("");
    console.log(
        "QA"
    );


    console.log(
        `Matching media queries: ${summary.matchingMediaQueryCount}`
    );


    console.log(
        `Last matching rule: ${summary
            .lastMatchingMediaQuery
            ?.condition ||
        "NONE"
        }`
    );


    console.log(
        `Viewport clipping failures: ${summary.viewportClipping.failureCount}`
    );


    console.log(
        `Visibility failures: ${summary
            .visibilityPolicy
            ?.failureCount ??
        "N/A"
        }`
    );


    console.log(
        `Image-loading failures: ${summary
            .imageLoadingPolicy
            ?.failureCount ??
        "N/A"
        }`
    );


    console.log(
        `Crop failures: ${summary
            .cropPolicy
            ?.failureCount ??
        "N/A"
        }`
    );


    console.log(
        `Hero QA failures: ${summary.overall.failureCount}`
    );


    console.log("");


    console.log(
        analysis.passed
            ? "CASE RESULT: PASS"
            : "CASE RESULT: QA_FAIL"
    );


    if (
        !analysis.passed
    ) {
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


    if (
        baselineComparison
    ) {
        console.log("");


        if (
            baselineComparison.skipped
        ) {
            console.log(
                "BASELINE COMPARISON SKIPPED"
            );


            console.log(
                baselineComparison.reason
            );
        } else {
            console.log(
                "BASELINE DIFFERENCES"
            );


            console.log(
                JSON.stringify(
                    baselineComparison
                        .differences,
                    null,
                    2
                )
            );
        }
    }


    console.log(
        "============================================"
    );


    console.log("");
};


// =======================================================
// REUSABLE SINGLE-CASE RUNNER
// =======================================================

const runAndroidMobileWebTest =
    async (
        testCase,
        options = {}
    ) => {
        validateEnvironment();


        validateTestCase(
            testCase
        );


        const orientation =
            normalizeOrientation(
                testCase.orientation
            );


        const matrixRunId =
            options.matrixRunId ||
            `android-matrix-${timestampForFilename()}`;


        const buildName =
            options.buildName ||
            "Portfolio Android Mobile Web Matrix";


        const qaLabel =
            testCase.qaLabel ||
            `${testCase.deviceName}-Android-${testCase.platformVersion}-${testCase.browserName}-${orientation}-Appium`;


        const outputPaths =
            makeOutputPaths(
                testCase,
                matrixRunId
            );


        const baseUrl =
            testCase.baseUrl ||
            options.baseUrl ||
            DEFAULT_BASE_URL;


        const qaUrl =
            buildQaUrl(
                baseUrl,
                qaLabel,
                testCase.qaParams
            );


        let browser =
            null;


        let sessionConnected =
            false;


        let appiumOrientation =
            "UNKNOWN";


        let preflight =
            null;


        let viewportStability =
            null;


        const startedAt =
            new Date()
                .toISOString();


        try {
            // -----------------------------------
            // TestMu capabilities
            // -----------------------------------

            const ltOptions = {
                deviceName:
                    testCase.deviceName,


                platformName:
                    "Android",


                platformVersion:
                    testCase.platformVersion,


                isRealMobile:
                    true,


                deviceOrientation:
                    orientation,


                build:
                    buildName,


                name:
                    qaLabel,


                project:
                    testCase.project ||
                    options.project ||
                    "3D Portfolio Hero QA",


                w3c:
                    true,


                video:
                    testCase.video ??
                    true,


                network:
                    testCase.network ??
                    true,


                console:
                    testCase.console ??
                    true,


                devicelog:
                    testCase.devicelog ??
                    true,


                newCommandTimeout:
                    testCase.newCommandTimeout ||
                    300,


                queueTimeout:
                    testCase.queueTimeout ||
                    600,


                tunnel:
                    testCase.tunnel ??
                    true,


                ...(
                    testCase.ltOptions ||
                    {}
                ),
            };


            if (
                LT_TUNNEL_NAME &&
                ltOptions.tunnel !==
                false
            ) {
                ltOptions.tunnelName =
                    LT_TUNNEL_NAME;
            }


            const capabilities = {
                platformName:
                    "Android",


                browserName:
                    testCase.browserName,


                "LT:Options":
                    ltOptions,


                ...(
                    testCase.capabilities ||
                    {}
                ),
            };


            console.log("");


            console.log(
                "############################################"
            );


            console.log(
                `STARTING ${testCase.id}`
            );


            console.log(
                `${testCase.deviceName} | ${testCase.browserName} | ${orientation}`
            );


            console.log(
                "############################################"
            );


            console.log(
                "Connecting to TestMu Appium real device..."
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
                      Keep output readable.
                    */

                    logLevel:
                        options.logLevel ||
                        "warn",


                    connectionRetryTimeout:
                        180000,


                    connectionRetryCount:
                        1,


                    capabilities,
                });


            sessionConnected =
                true;


            console.log(
                `Session connected: ${browser.sessionId}`
            );

            console.log(
                "Resolved TestMu capabilities:"
            );

            console.log(
                JSON.stringify(
                    browser.capabilities,
                    null,
                    2
                )
            );


            assertResolvedLatestOs(
                testCase,
                browser.capabilities
            );


            console.log(
                `Latest OS verified: Android ${testCase.platformVersion}`
            );


            // -----------------------------------
            // Explicit orientation enforcement
            // -----------------------------------

            try {
                await browser.setOrientation(
                    orientation
                        .toUpperCase()
                );


                await sleep(
                    1500
                );
            } catch (
            error
            ) {
                console.warn(
                    `setOrientation(${orientation.toUpperCase()}) was not accepted:`,
                    error.message
                );
            }


            try {
                appiumOrientation =
                    await browser.getOrientation();
            } catch (
            error
            ) {
                console.warn(
                    "Could not read Appium orientation:",
                    error.message
                );
            }


            console.log(
                `Appium orientation: ${appiumOrientation}`
            );


            // -----------------------------------
            // Open QA URL
            // -----------------------------------

            console.log(
                `Opening: ${qaUrl}`
            );


            await browser.url(
                qaUrl
            );


            // -----------------------------------
            // Page + QA readiness
            // -----------------------------------

            await waitForDocumentReady(
                browser
            );


            preflight =
                await capturePreflight(
                    browser
                );


            printPreflight(
                preflight
            );


            await waitForHeroQa(
                browser
            );


            await waitForRequestedOrientation(
                browser,
                orientation
            );


            // -----------------------------------
            // Stable real browser viewport
            // -----------------------------------

            viewportStability =
                await waitForStableViewport(
                    browser,
                    testCase
                        .viewportStability
                );


            // -----------------------------------
            // Image decode + paint
            // -----------------------------------

            await waitForHeroImages(
                browser
            );


            // -----------------------------------
            // Hero QA V4.1
            // -----------------------------------

            const report =
                await browser.execute(
                    () =>
                        window
                            .__PORTFOLIO_QA__
                            .capture()
                );


            const baselineComparison =
                compareBaseline(
                    report,
                    testCase.baseline,
                    testCase
                );


            const analysis =
                analyzeReport(
                    report,
                    testCase,
                    viewportStability
                );


            const finishedAt =
                new Date()
                    .toISOString();


            // -----------------------------------
            // Device specifications + automation metadata
            // -----------------------------------

            const deviceSpecifications =
                buildDeviceSpecifications({
                    testCase,
                    browserCapabilities:
                        browser.capabilities,
                    reportViewport:
                        report.viewport,
                    preflight,
                    sessionId:
                        browser.sessionId,
                    appiumOrientation,
                    region:
                        options.region ||
                        testCase.latestOsSelection?.region ||
                        null,
                });


            report.deviceSpecifications =
                deviceSpecifications;


            report.latestOsSelection =
                testCase.latestOsSelection ||
                null;


            report.automation = {
                framework:
                    "Appium",


                client:
                    "WebdriverIO",


                matrixRunId,


                testCaseId:
                    testCase.id,


                device:
                    testCase.deviceName,


                browser:
                    testCase.browserName,


                platformVersionRequested:
                    testCase.platformVersion,


                platformVersionPolicy:
                    "latest-available-for-device",

                resolvedCapabilities:
                    browser.capabilities,


                requestedOrientation:
                    orientation,


                appiumOrientation,


                sessionId:
                    browser.sessionId,


                viewportStable:
                    viewportStability
                        .stable,


                viewportSamples:
                    viewportStability
                        .samples,


                startedAt,


                finishedAt,


                baselineComparison,
            };


            report.matrixCase = {
                id:
                    testCase.id,


                platformVersion:
                    testCase.platformVersion,


                description:
                    testCase.description ||
                    null,


                tags:
                    testCase.tags ||
                    [],


                profileHint:
                    testCase.profileHint ||
                    null,
            };


            report.runnerAnalysis =
                analysis;


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

            printCaseSummary(
                report,
                analysis,
                viewportStability,
                testCase,
                appiumOrientation,
                baselineComparison
            );


            await setTestMuStatus(
                browser,
                analysis.passed
            );


            /*
              IMPORTANT:

              QA_FAIL means Appium worked and
              found a real CSS/layout failure.

              INFRA_FAIL is reserved for
              TestMu/Appium/Tunnel/session
              failures.
            */

            return {
                id:
                    testCase.id,


                status:
                    analysis.passed
                        ? "PASS"
                        : "QA_FAIL",


                infrastructurePassed:
                    true,


                qaPassed:
                    analysis.passed,


                reasons:
                    analysis.reasons,


                deviceName:
                    testCase.deviceName,


                browserName:
                    testCase.browserName,


                platformVersion:
                    testCase.platformVersion,


                latestOsSelection:
                    testCase.latestOsSelection ||
                    null,


                deviceSpecifications,


                orientation,


                sessionId:
                    browser.sessionId,


                viewportStable:
                    viewportStability
                        .stable,


                viewport: {
                    screen:
                        report
                            .viewport
                            .screen,


                    inner:
                        report
                            .viewport
                            .inner,


                    visual:
                        report
                            .viewport
                            .visual,


                    dpr:
                        report
                            .viewport
                            .devicePixelRatio,
                },


                matchingMediaQueryCount:
                    report
                        .summary
                        .matchingMediaQueryCount,


                lastMatchingMediaQuery:
                    report
                        .summary
                        .lastMatchingMediaQuery
                        ?.condition ||
                    null,


                heroQaFailureCount:
                    report
                        .summary
                        .overall
                        .failureCount,


                heroQaFailures:
                    report
                        .summary
                        .overall
                        .failures,


                jsonPath:
                    outputPaths.json,


                screenshotPath:
                    outputPaths.screenshot,


                baselineComparison,


                startedAt,


                finishedAt,
            };
        } catch (
        error
        ) {
            const finishedAt =
                new Date()
                    .toISOString();


            console.error("");


            console.error(
                `INFRASTRUCTURE FAILURE — ${testCase.id}`
            );


            console.error(
                error
            );


            if (
                browser
            ) {
                try {
                    await browser.saveScreenshot(
                        outputPaths
                            .errorScreenshot
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
                    // Ignore status-update failure.
                }
            }


            const failureDeviceSpecifications =
                buildDeviceSpecifications({
                    testCase,
                    browserCapabilities:
                        browser?.capabilities ||
                        null,
                    reportViewport:
                        null,
                    preflight,
                    sessionId:
                        browser?.sessionId ||
                        null,
                    appiumOrientation,
                    region:
                        options.region ||
                        testCase.latestOsSelection?.region ||
                        null,
                });


            const failureDocument = {
                artifactType:
                    "device-result",


                status:
                    "INFRA_FAIL",


                matrixRunId,


                createdAt:
                    finishedAt,


                matrixCase: {
                    id:
                        testCase.id,


                    deviceName:
                        testCase.deviceName,


                    platformVersion:
                        testCase.platformVersion,


                    browserName:
                        testCase.browserName,


                    orientation,
                },


                latestOsSelection:
                    testCase.latestOsSelection ||
                    null,


                deviceSpecifications:
                    failureDeviceSpecifications,


                automation: {
                    framework:
                        "Appium",


                    client:
                        "WebdriverIO",


                    sessionConnected,


                    sessionId:
                        browser?.sessionId ||
                        null,


                    resolvedCapabilities:
                        browser?.capabilities ||
                        null,


                    preflight,


                    viewportStability,


                    startedAt,


                    finishedAt,
                },


                error: {
                    name:
                        error.name,


                    message:
                        error.message,


                    stack:
                        error.stack,
                },
            };


            try {
                const failureJson =
                    JSON.stringify(
                        failureDocument,
                        null,
                        2
                    );


                fs.writeFileSync(
                    outputPaths.json,
                    failureJson,
                    "utf8"
                );


                fs.writeFileSync(
                    outputPaths.latestJson,
                    failureJson,
                    "utf8"
                );
            } catch (
            jsonError
            ) {
                console.error(
                    "Could not save infrastructure-failure JSON:",
                    jsonError.message
                );
            }


            return {
                id:
                    testCase.id,


                status:
                    "INFRA_FAIL",


                infrastructurePassed:
                    false,


                qaPassed:
                    false,


                reasons: [
                    error.message,
                ],


                deviceName:
                    testCase.deviceName,


                browserName:
                    testCase.browserName,


                platformVersion:
                    testCase.platformVersion,


                latestOsSelection:
                    testCase.latestOsSelection ||
                    null,


                deviceSpecifications:
                    failureDeviceSpecifications,


                orientation,


                sessionConnected,


                errorName:
                    error.name,


                errorMessage:
                    error.message,


                errorStack:
                    error.stack,


                errorScreenshotPath:
                    fs.existsSync(
                        outputPaths
                            .errorScreenshot
                    )
                        ? outputPaths
                            .errorScreenshot
                        : null,


                jsonPath:
                    outputPaths.json,


                screenshotPath:
                    fs.existsSync(
                        outputPaths
                            .errorScreenshot
                    )
                        ? outputPaths
                            .errorScreenshot
                        : null,


                startedAt,


                finishedAt,
            };
        } finally {
            // -----------------------------------
            // Always release TestMu real device
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
    };


module.exports = {
    runAndroidMobileWebTest,

    slugify,

    timestampForFilename,
};