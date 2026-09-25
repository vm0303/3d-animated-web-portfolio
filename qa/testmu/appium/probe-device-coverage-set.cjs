const {
    remote,
} =
    require(
        "webdriverio"
    );


const {
    spawnSync,
} =
    require(
        "node:child_process"
    );


const fs =
    require(
        "node:fs"
    );


const path =
    require(
        "node:path"
    );


const {
    classifyObservedDisplay,
} =
    require(
        "./testmu-foldable-policy.cjs"
    );


// =======================================================
// ENVIRONMENT
// =======================================================

const USER =
    process.env.LT_USERNAME;


const KEY =
    process.env.LT_ACCESS_KEY;


const TUNNEL =
    process.env.LT_TUNNEL_NAME;


const BASE =
    process.env.QA_BASE_URL ||
    "http://192.168.1.233:5173";


const REGION =
    process.env.QA_TESTMU_REGION ||
    process.env.LT_REGION ||
    "us";


// =======================================================
// CLI
// =======================================================

const rawArgs =
    Object.fromEntries(
        process.argv
            .slice(2)
            .map(
                (value) => {
                    const [
                        key,
                        ...rest
                    ] =
                        value
                            .replace(
                                /^--/,
                                ""
                            )
                            .split(
                                "="
                            );


                    return [
                        key,
                        rest.join(
                            "="
                        ) ||
                        true,
                    ];
                }
            )
    );


const args = {
    region:
        String(
            rawArgs.region ||
            REGION
        )
            .toLowerCase(),


    platform:
        String(
            rawArgs.platform ||
            "all"
        )
            .toLowerCase(),


    device:
        rawArgs.device ||
        null,


    platformVersionOverride:
        rawArgs["platform-version"]
            ? String(
                rawArgs["platform-version"]
            ).trim()
            : null,


    capabilityDeviceNameOverride:
        rawArgs["capability-device-name"] ||
        null,


    allowCatalogBypass:
        Boolean(
            rawArgs["allow-catalog-bypass"]
        ),


    orientation:
        String(
            rawArgs.orientation ||
            "both"
        )
            .toLowerCase(),


    limit:
        rawArgs.limit
            ? Number(
                rawArgs.limit
            )
            : null,


    maxDevices:
        rawArgs["max-devices"]
            ? Number(
                rawArgs["max-devices"]
            )
            : null,


    concurrency:
        Number(
            rawArgs.concurrency ||
            process.env.QA_PROBE_CONCURRENCY ||
            1
        ),


    dry:
        Boolean(
            rawArgs["dry-run"]
        ),


    all:
        Boolean(
            rawArgs.all
        ),


    screenshots:
        Boolean(
            rawArgs.screenshots
        ),


    refresh:
        !rawArgs[
            "skip-catalog-refresh"
        ],


    input:
        path.resolve(
            rawArgs.input ||
            path.join(
                "qa-results",
                "testmu",
                "catalog",
                `TESTMU__candidate-coverage-set__${REGION}__latest.json`
            )
        ),


    out:
        path.resolve(
            rawArgs[
                "output-dir"
            ] ||
            path.join(
                "qa-results",
                "testmu",
                "appium",
                "capability-probes"
            )
        ),
};


if (
    ![
        "all",
        "android",
        "ios",
    ].includes(
        args.platform
    )
) {
    throw new Error(
        "--platform must be all|android|ios"
    );
}


if (
    ![
        "both",
        "portrait",
        "landscape",
    ].includes(
        args.orientation
    )
) {
    throw new Error(
        "--orientation must be both|portrait|landscape"
    );
}


if (
    !Number.isInteger(
        args.concurrency
    ) ||
    args.concurrency < 1 ||
    args.concurrency > 8
) {
    throw new Error(
        "--concurrency must be 1..8"
    );
}


if (
    args.limit !== null &&
    (
        !Number.isInteger(
            args.limit
        ) ||
        args.limit < 1
    )
) {
    throw new Error(
        "--limit must be positive"
    );
}


if (
    args.maxDevices !== null &&
    (
        !Number.isInteger(
            args.maxDevices
        ) ||
        args.maxDevices < 1
    )
) {
    throw new Error(
        "--max-devices must be a positive integer"
    );
}


if (
    args.platformVersionOverride &&
    !/^\d+(?:\.\d+)*$/.test(
        args.platformVersionOverride
    )
) {
    throw new Error(
        "--platform-version must be numeric, for example 14 or 14.0"
    );
}


if (
    (
        args.platformVersionOverride ||
        args.capabilityDeviceNameOverride ||
        args.allowCatalogBypass
    ) &&
    !args.device
) {
    throw new Error(
        "Manual capability overrides require --device=<exact model>."
    );
}


if (
    args.allowCatalogBypass &&
    !args.platformVersionOverride
) {
    throw new Error(
        "--allow-catalog-bypass requires --platform-version=<version>."
    );
}


// =======================================================
// HELPERS
// =======================================================

const norm =
    (value) =>
        String(
            value ||
            ""
        )
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                ""
            );


const platformKey =
    (value) => {
        const normalized =
            norm(
                value
            );


        if (
            normalized.includes(
                "ios"
            )
        ) {
            return "ios";
        }


        if (
            normalized.includes(
                "android"
            )
        ) {
            return "android";
        }


        return normalized;
    };


const prettyPlatform =
    (value) =>
        platformKey(
            value
        ) ===
        "ios"
            ? "iOS"
            : "Android";


const slug =
    (value) =>
        String(
            value ||
            ""
        )
            .trim()
            .replace(
                /[^a-zA-Z0-9._-]+/g,
                "-"
            )
            .replace(
                /^-+|-+$/g,
                ""
            ) ||
        "device";


const timestamp =
    () =>
        new Date()
            .toISOString()
            .replace(
                /[:.]/g,
                "-"
            );


const round =
    (value) => {
        const number =
            Number(
                value
            );


        return Number.isFinite(
            number
        )
            ? Math.round(
                number *
                100
            ) /
                100
            : null;
    };


const compareVersions =
    (
        leftValue,
        rightValue
    ) => {
        const left =
            String(
                leftValue ||
                0
            )
                .split(
                    "."
                )
                .map(
                    Number
                );


        const right =
            String(
                rightValue ||
                0
            )
                .split(
                    "."
                )
                .map(
                    Number
                );


        const length =
            Math.max(
                left.length,
                right.length
            );


        for (
            let index = 0;
            index < length;
            index += 1
        ) {
            const difference =
                (left[index] || 0) -
                (right[index] || 0);


            if (
                difference
            ) {
                return difference;
            }
        }


        return 0;
    };


const sleep =
    (milliseconds) =>
        new Promise(
            (resolve) =>
                setTimeout(
                    resolve,
                    milliseconds
                )
        );


const readJson =
    (filePath) =>
        JSON.parse(
            fs.readFileSync(
                filePath,
                "utf8"
            )
        );


const saveJson =
    (
        filePath,
        data
    ) => {
        fs.mkdirSync(
            path.dirname(
                filePath
            ),
            {
                recursive:
                    true,
            }
        );


        fs.writeFileSync(
            filePath,
            JSON.stringify(
                data,
                null,
                2
            ) +
            "\n"
        );
    };


const browserFor =
    (platform) =>
        platformKey(
            platform
        ) ===
        "ios"
            ? "Safari"
            : "Chrome";


const currentInventoryPath =
    () =>
        path.join(
            process.cwd(),
            "qa-results",
            "testmu",
            "catalog",
            `TESTMU__candidate-device-inventory__${args.region}__latest.json`
        );


// =======================================================
// REFRESH LIVE TESTMU AUTOMATION CATALOG
// =======================================================

function refreshCatalog() {
    const script =
        path.join(
            process.cwd(),
            "qa",
            "testmu",
            "appium",
            "generate-testmu-device-inventory.cjs"
        );


    if (
        !fs.existsSync(
            script
        )
    ) {
        throw new Error(
            `Missing inventory generator: ${script}`
        );
    }


    console.log("");
    console.log(
        "Refreshing the TestMu automation catalog before probes..."
    );


    const result =
        spawnSync(
            process.execPath,
            [
                script,
                `--region=${args.region}`,
            ],
            {
                cwd:
                    process.cwd(),

                env:
                    process.env,

                stdio:
                    "inherit",
            }
        );


    if (
        result.error
    ) {
        throw result.error;
    }


    if (
        result.status !==
        0
    ) {
        throw new Error(
            `Catalog refresh exited ${result.status}`
        );
    }
}


// =======================================================
// RECONCILE CANDIDATE AGAINST REFRESHED CATALOG
// =======================================================

function findCurrentDevice(
    inventory,
    candidate
) {
    return (
        inventory.devices ||
        []
    )
        .find(
            (device) =>
                platformKey(
                    device.platformName
                ) ===
                    platformKey(
                        candidate.platformName
                    ) &&
                norm(
                    device.deviceName
                ) ===
                    norm(
                        candidate.deviceName
                    )
        ) ||
        null;
}


function orientationsFor(
    candidate
) {
    const wanted =
        args.orientation ===
        "both"
            ? [
                "portrait",
                "landscape",
            ]
            : [
                args.orientation,
            ];


    if (
        args.all
    ) {
        return wanted;
    }


    const needed =
        new Set(
            candidate
                .probe
                ?.requiredOrientations ||
            []
        );


    return wanted.filter(
        (orientation) =>
            needed.has(
                orientation
            )
    );
}


function buildCases(
    coverage,
    inventory
) {
    let list =
        [
            ...(
                coverage.candidates ||
                []
            ),
        ];


    if (
        args.platform !==
        "all"
    ) {
        list =
            list.filter(
                (candidate) =>
                    platformKey(
                        candidate.platformName
                    ) ===
                    args.platform
            );
    }


    if (
        args.device
    ) {
        list =
            list.filter(
                (candidate) =>
                    norm(
                        candidate.deviceName
                    ) ===
                    norm(
                        args.device
                    )
            );
    }


    // Diagnostic recovery path for a device that was previously seen by
    // TestMu but disappeared from the automation catalog before we could
    // capture valid geometry. This path is opt-in and requires an explicit
    // platform version; it never changes normal broad-discovery selection.
    if (
        args.device &&
        args.allowCatalogBypass &&
        list.length === 0
    ) {
        const historical =
            [
                ...(
                    coverage
                        .historicalUnmeasuredNotCurrentCatalog ||
                    []
                ),
                ...(
                    coverage
                        .historicalMeasuredNotCurrentCatalog ||
                    []
                ),
            ].find(
                (item) =>
                    norm(
                        item.deviceName
                    ) ===
                    norm(
                        args.device
                    )
            );


        if (
            historical
        ) {
            list = [
                {
                    selectionRank:
                        null,

                    selectionBucket:
                        "manual-catalog-bypass",

                    selectionReason:
                        "Explicit one-device recovery probe using manually verified TestMu capability metadata.",

                    deviceName:
                        historical.deviceName,

                    manufacturer:
                        historical.manufacturer ||
                        null,

                    platformName:
                        historical.platformName,

                    latestOsVersion:
                        historical
                            .latestOsVersionAtLastSeen ||
                        args.platformVersionOverride,

                    probe: {
                        required:
                            true,

                        requiredOrientations: [
                            "portrait",
                            "landscape",
                        ],

                        primaryBrowser:
                            browserFor(
                                historical.platformName
                            ),

                        safeAreaRequired:
                            true,

                        displayScope:
                            "standard-main-display",
                    },
                },
            ];
        }
    }


    // Build work at the DEVICE level first. This prevents a session limit
    // from splitting portrait/landscape across different batches.
    //
    // --max-devices=6 means "take the next six devices that actually need
    // work", then run every required orientation for those six devices.
    // The older --limit flag remains available as a final session-level cap
    // for diagnostics, but normal discovery batches should use --max-devices.
    let work =
        list
            .map(
                (candidate) => ({
                    candidate,
                    orientations:
                        orientationsFor(
                            candidate
                        ),
                })
            )
            .filter(
                (item) =>
                    item.orientations.length >
                    0
            );


    const eligibleWorkDeviceCount =
        work.length;


    if (
        args.maxDevices !==
        null
    ) {
        work =
            work.slice(
                0,
                args.maxDevices
            );
    }


    const cases = [];
    const unavailable = [];


    for (
        const item of
        work
    ) {
        const candidate =
            item.candidate;


        const catalogCurrent =
            findCurrentDevice(
                inventory,
                candidate
            );


        let current =
            catalogCurrent;

        let catalogBypassed =
            false;


        if (
            !current &&
            args.allowCatalogBypass &&
            args.platformVersionOverride &&
            args.device &&
            norm(
                candidate.deviceName
            ) ===
            norm(
                args.device
            )
        ) {
            current = {
                deviceName:
                    candidate.deviceName,

                manufacturer:
                    candidate.manufacturer ||
                    null,

                platformName:
                    candidate.platformName,

                latestOsVersion:
                    args.platformVersionOverride,

                availableOsVersions: [
                    args.platformVersionOverride,
                ],
            };

            catalogBypassed =
                true;
        }


        if (
            !current
        ) {
            unavailable.push({
                candidate,

                plannedOrientations:
                    item.orientations,

                status:
                    "UNAVAILABLE_IN_CURRENT_AUTOMATION_CATALOG",
            });

            continue;
        }


        const selectedPlatformVersion =
            args.platformVersionOverride &&
            args.device &&
            norm(
                candidate.deviceName
            ) ===
            norm(
                args.device
            )
                ? args.platformVersionOverride
                : current.latestOsVersion;


        const capabilityDeviceName =
            args.capabilityDeviceNameOverride &&
            args.device &&
            norm(
                candidate.deviceName
            ) ===
            norm(
                args.device
            )
                ? String(
                    args.capabilityDeviceNameOverride
                )
                : current.deviceName;


        for (
            const orientation of
            item.orientations
        ) {
            cases.push({
                candidate,

                current,

                orientation,

                platformKey:
                    platformKey(
                        current.platformName
                    ),

                platformName:
                    prettyPlatform(
                        current.platformName
                    ),

                browserName:
                    browserFor(
                        current.platformName
                    ),

                platformVersion:
                    selectedPlatformVersion,

                capabilityDeviceName,

                manualCapabilityOverride:
                    args.platformVersionOverride ||
                    args.capabilityDeviceNameOverride ||
                    catalogBypassed
                        ? {
                            platformVersion:
                                selectedPlatformVersion,

                            capabilityDeviceName,

                            catalogBypassed,

                            catalogLatestOsVersion:
                                catalogCurrent
                                    ?.latestOsVersion ||
                                null,
                        }
                        : null,

                osChanged:
                    compareVersions(
                        selectedPlatformVersion,
                        candidate.latestOsVersion
                    ) !==
                    0,
            });
        }
    }


    return {
        cases:
            args.limit
                ? cases.slice(
                    0,
                    args.limit
                )
                : cases,

        unavailable,

        selectedDeviceCount:
            work.length,

        eligibleWorkDeviceCount,
    };
}


// =======================================================
// BROWSER GEOMETRY
// =======================================================

const GEOMETRY_SCRIPT = String.raw`
return JSON.stringify((() => {
    const visual = window.visualViewport || null;
    const root = document.documentElement;

    const viewportMetaContent =
        document
            .querySelector('meta[name="viewport"]')
            ?.getAttribute("content") ||
        null;

    const viewportFitCover =
        typeof viewportMetaContent === "string"
            ? /viewport-fit\s*=\s*cover/i.test(viewportMetaContent)
            : false;

    const cssEnvSupported =
        typeof window.CSS !== "undefined" &&
        typeof window.CSS.supports === "function"
            ? window.CSS.supports(
                "padding-top",
                "env(safe-area-inset-top, 0px)"
            )
            : null;

    const measureSafeArea = () => {
        const host = document.body || root;

        if (!host) {
            return {
                insets: null,
                error: "NO_DOCUMENT_HOST",
            };
        }

        const probe = document.createElement("div");

        try {
            probe.setAttribute(
                "data-portfolio-safe-area-probe",
                ""
            );

            probe.style.cssText = [
                "position:fixed",
                "top:0",
                "left:0",
                "width:0",
                "height:0",
                "box-sizing:border-box",
                "visibility:hidden",
                "pointer-events:none",
                "z-index:-2147483648",
                "padding-top:env(safe-area-inset-top, 0px)",
                "padding-right:env(safe-area-inset-right, 0px)",
                "padding-bottom:env(safe-area-inset-bottom, 0px)",
                "padding-left:env(safe-area-inset-left, 0px)",
            ].join(";");

            host.appendChild(probe);

            const computed = window.getComputedStyle(probe);

            const px = (value) => {
                const number = Number.parseFloat(value);

                return Number.isFinite(number) && number >= 0
                    ? number
                    : null;
            };

            const insets = {
                top: px(computed.paddingTop),
                right: px(computed.paddingRight),
                bottom: px(computed.paddingBottom),
                left: px(computed.paddingLeft),
            };

            const measured =
                Object.values(insets).every(
                    (value) => Number.isFinite(value)
                );

            return {
                insets: measured
                    ? insets
                    : null,
                error: measured
                    ? null
                    : "SAFE_AREA_COMPUTED_VALUE_INVALID",
            };
        } catch (error) {
            return {
                insets: null,
                error:
                    error?.message ||
                    String(error),
            };
        } finally {
            probe.remove();
        }
    };

    const safeArea = measureSafeArea();

    const portraitMedia =
        typeof window.matchMedia === "function"
            ? window.matchMedia("(orientation: portrait)").matches
            : null;

    const landscapeMedia =
        typeof window.matchMedia === "function"
            ? window.matchMedia("(orientation: landscape)").matches
            : null;

    const cssMediaOrientation =
        portraitMedia === true
            ? "portrait"
            : landscapeMedia === true
                ? "landscape"
                : null;

    const viewportAspectOrientation =
        window.innerWidth === window.innerHeight
            ? "square"
            : window.innerWidth > window.innerHeight
                ? "landscape"
                : "portrait";

    return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        userAgent: navigator.userAgent,
        navigatorPlatform: navigator.platform,
        devicePixelRatio: window.devicePixelRatio,

        orientation: screen.orientation
            ? {
                type: screen.orientation.type,
                angle: screen.orientation.angle,
            }
            : null,

        cssMediaOrientation,

        viewportAspectOrientation,

        orientationMediaQueries: {
            portrait: portraitMedia,
            landscape: landscapeMedia,
        },

        screen: {
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight,
        },

        innerViewport: {
            width: window.innerWidth,
            height: window.innerHeight,
        },

        visualViewport: visual
            ? {
                width: visual.width,
                height: visual.height,
                scale: visual.scale,
                offsetTop: visual.offsetTop,
                offsetLeft: visual.offsetLeft,
                pageTop: visual.pageTop,
                pageLeft: visual.pageLeft,
            }
            : null,

        safeAreaInsets: safeArea.insets,

        safeAreaMeasurement: {
            measured: Boolean(safeArea.insets),
            cssEnvSupported,
            viewportMetaContent,
            viewportFitCover,
            error: safeArea.error,
        },

        document: {
            clientWidth: root.clientWidth,
            clientHeight: root.clientHeight,
            scrollWidth: root.scrollWidth,
            scrollHeight: root.scrollHeight,
            horizontalOverflow:
                root.scrollWidth >
                root.clientWidth + 1,
        },
    };
})());
`;


const finitePositive =
    (value) => {
        const number =
            Number(value);

        return (
            Number.isFinite(number) &&
            number > 0
        );
    };


const safePreview =
    (value) => {
        try {
            if (
                typeof value ===
                "string"
            ) {
                return value.slice(
                    0,
                    500
                );
            }

            return JSON.stringify(
                value
            ).slice(
                0,
                500
            );
        } catch {
            return String(
                value
            ).slice(
                0,
                500
            );
        }
    };


const parseGeometryPayload =
    (raw) => {
        let value =
            raw;

        if (
            value &&
            typeof value ===
                "object" &&
            Object.prototype.hasOwnProperty.call(
                value,
                "value"
            )
        ) {
            value =
                value.value;
        }

        if (
            typeof value ===
            "string"
        ) {
            try {
                value =
                    JSON.parse(
                        value
                    );
            } catch (
                error
            ) {
                const failure =
                    new Error(
                        `GEOMETRY_JSON_PARSE_FAILED: ${error.message}; raw=${safePreview(raw)}`
                    );

                failure.code =
                    "GEOMETRY_COLLECTION_FAILED";

                throw failure;
            }
        }

        if (
            !value ||
            typeof value !==
                "object" ||
            Array.isArray(value)
        ) {
            const failure =
                new Error(
                    `GEOMETRY_PAYLOAD_INVALID: expected object; raw=${safePreview(raw)}`
                );

            failure.code =
                "GEOMETRY_COLLECTION_FAILED";

            throw failure;
        }

        return value;
    };


const validateGeometry =
    (geometry) => {
        const errors = [];

        if (
            !finitePositive(
                geometry
                    ?.innerViewport
                    ?.width
            )
        ) {
            errors.push(
                "innerViewport.width"
            );
        }

        if (
            !finitePositive(
                geometry
                    ?.innerViewport
                    ?.height
            )
        ) {
            errors.push(
                "innerViewport.height"
            );
        }

        if (
            !finitePositive(
                geometry
                    ?.screen
                    ?.width
            )
        ) {
            errors.push(
                "screen.width"
            );
        }

        if (
            !finitePositive(
                geometry
                    ?.screen
                    ?.height
            )
        ) {
            errors.push(
                "screen.height"
            );
        }

        if (
            geometry
                ?.visualViewport &&
            (
                !finitePositive(
                    geometry
                        .visualViewport
                        .width
                ) ||
                !finitePositive(
                    geometry
                        .visualViewport
                        .height
                )
            )
        ) {
            errors.push(
                "visualViewport"
            );
        }

        return {
            valid:
                errors.length ===
                0,

            errors,
        };
    };


const isValidGeometry =
    (geometry) =>
        validateGeometry(
            geometry
        ).valid;


async function captureGeometry(
    browser
) {
    const raw =
        await browser.execute(
            GEOMETRY_SCRIPT
        );

    const geometry =
        parseGeometryPayload(
            raw
        );

    const validation =
        validateGeometry(
            geometry
        );

    if (
        !validation.valid
    ) {
        const failure =
            new Error(
                "GEOMETRY_COLLECTION_FAILED: missing/invalid " +
                validation.errors.join(
                    ", "
                ) +
                `; raw=${safePreview(raw)}`
            );

        failure.code =
            "GEOMETRY_COLLECTION_FAILED";

        throw failure;
    }

    return geometry;
}


const geometryKey =
    (geometry) =>
        [
            geometry
                ?.innerViewport
                ?.width,

            geometry
                ?.innerViewport
                ?.height,

            round(
                geometry
                    ?.visualViewport
                    ?.width
            ),

            round(
                geometry
                    ?.visualViewport
                    ?.height
            ),

            geometry
                ?.orientation
                ?.type,

            geometry
                ?.cssMediaOrientation,

            geometry
                ?.viewportAspectOrientation,

            round(
                geometry
                    ?.safeAreaInsets
                    ?.top
            ),

            round(
                geometry
                    ?.safeAreaInsets
                    ?.right
            ),

            round(
                geometry
                    ?.safeAreaInsets
                    ?.bottom
            ),

            round(
                geometry
                    ?.safeAreaInsets
                    ?.left
            ),
        ].join(
            "|"
        );


async function waitForStableGeometry(
    browser
) {
    const samples = [];
    const errors = [];

    let previous =
        null;

    let stableCount =
        0;

    let lastValid =
        null;


    for (
        let index = 1;
        index <= 12;
        index += 1
    ) {
        let geometry;

        try {
            geometry =
                await captureGeometry(
                    browser
                );
        } catch (
            error
        ) {
            const message =
                error?.message ||
                String(error);

            errors.push(
                message
            );

            samples.push({
                captureValid:
                    false,

                error:
                    message,
            });

            console.log(
                `  sample ${index}: INVALID GEOMETRY | ${message}`
            );

            stableCount =
                0;

            previous =
                null;

            await sleep(
                650
            );

            continue;
        }


        const key =
            geometryKey(
                geometry
            );


        samples.push({
            captureValid:
                true,

            ...geometry,
        });


        lastValid =
            geometry;


        console.log(
            `  sample ${index}: ` +
            `inner ${geometry.innerViewport.width}x${geometry.innerViewport.height}, ` +
            `visual ${round(geometry.visualViewport?.width)}x${round(geometry.visualViewport?.height)}, ` +
            `screenOrientation=${geometry.orientation?.type || "unknown"}, ` +
            `cssOrientation=${geometry.cssMediaOrientation || "unknown"}, ` +
            `aspect=${geometry.viewportAspectOrientation || "unknown"}, ` +
            `safeArea=${[
                geometry.safeAreaInsets?.top,
                geometry.safeAreaInsets?.right,
                geometry.safeAreaInsets?.bottom,
                geometry.safeAreaInsets?.left,
            ].map((value) => value ?? "na").join("/")}`
        );


        stableCount =
            key ===
            previous
                ? stableCount +
                    1
                : 1;


        previous =
            key;


        if (
            stableCount >=
            3
        ) {
            return {
                valid:
                    true,

                stable:
                    true,

                samples,

                errors,

                final:
                    geometry,
            };
        }


        await sleep(
            650
        );
    }


    return {
        valid:
            Boolean(
                lastValid &&
                isValidGeometry(
                    lastValid
                )
            ),

        stable:
            false,

        samples,

        errors,

        final:
            lastValid,
    };
}


// =======================================================
// BROWSER VERSION
// =======================================================

function browserVersionFromUserAgent(
    userAgent,
    browserName
) {
    let match =
        null;


    const browser =
        String(
            browserName ||
            ""
        )
            .toLowerCase();


    if (
        browser.includes(
            "chrome"
        )
    ) {
        match =
            String(
                userAgent ||
                ""
            )
                .match(
                    /(?:Chrome|CriOS)\/([\d.]+)/i
                );
    }


    if (
        browser.includes(
            "safari"
        )
    ) {
        match =
            String(
                userAgent ||
                ""
            )
                .match(
                    /Version\/([\d.]+)/i
                );
    }


    return match
        ? match[1]
        : null;
}


// =======================================================
// ORIENTATION / TESTMU STATUS
// =======================================================

async function getAppiumOrientation(
    browser
) {
    try {
        return await browser
            .getOrientation();
    } catch {
        return null;
    }
}


async function setTestMuStatus(
    browser,
    passed
) {
    try {
        await browser.execute(
            `lambda-status=${passed ? "passed" : "failed"}`
        );
    } catch {
        // Probe result is still authoritative.
    }
}


// =======================================================
// FULL DEVICE SPECIFICATIONS
// =======================================================

function buildDeviceSpecifications(
    testCase,
    capabilities,
    geometry,
    appiumOrientation,
    sessionId
) {
    const desired =
        capabilities?.desired ||
        {};


    const userAgent =
        geometry?.userAgent ||
        null;


    const displayObservation =
        classifyObservedDisplay(
            testCase.candidate.foldablePolicy || null,
            geometry?.innerViewport
        );


    return {
        capturedAt:
            new Date()
                .toISOString(),

        requested: {
            deviceName:
                testCase
                    .current
                    .deviceName,

            capabilityDeviceName:
                testCase
                    .capabilityDeviceName ||
                testCase
                    .current
                    .deviceName,

            manufacturer:
                testCase
                    .current
                    .manufacturer,

            platformName:
                testCase
                    .platformName,

            platformVersionPolicy:
                testCase
                    .manualCapabilityOverride
                    ? "explicit-manual-capability-override"
                    : "latest-available-for-device-at-probe-time",

            manualCapabilityOverride:
                testCase
                    .manualCapabilityOverride ||
                null,

            platformVersion:
                testCase
                    .platformVersion,

            browserName:
                testCase
                    .browserName,

            orientation:
                testCase
                    .orientation,

            displayScope:
                testCase
                    .candidate
                    .probe
                    ?.displayScope ||
                null,

            foldableDiscoveryMode:
                testCase
                    .candidate
                    .foldablePolicy
                    ?.discoveryMode ||
                null,

            region:
                args.region,

            selectionBucket:
                testCase
                    .candidate
                    .selectionBucket,
        },

        resolved: {
            manufacturer:
                capabilities
                    ?.deviceManufacturer ||
                testCase
                    .current
                    .manufacturer ||
                null,

            model:
                capabilities
                    ?.deviceModel ||
                desired
                    .deviceName ||
                testCase
                    .current
                    .deviceName,

            cloudDeviceName:
                capabilities
                    ?.deviceName ||
                null,

            udid:
                capabilities
                    ?.deviceUDID ||
                capabilities
                    ?.udid ||
                desired
                    .udid ||
                null,

            platformName:
                capabilities
                    ?.platformName ||
                desired
                    .platformName ||
                testCase
                    .platformName,

            platformVersion:
                capabilities
                    ?.platformVersion ||
                desired
                    .platformVersion ||
                testCase
                    .platformVersion,

            apiLevel:
                capabilities
                    ?.deviceApiLevel ??
                null,

            browserName:
                capabilities
                    ?.browserName ||
                testCase
                    .browserName,

            browserVersion:
                capabilities
                    ?.browserVersion ||
                browserVersionFromUserAgent(
                    userAgent,
                    testCase.browserName
                ),

            requestedOrientation:
                testCase
                    .orientation,

            appiumOrientation,

            browserOrientation:
                geometry
                    ?.orientation
                    ?.type ||
                null,

            screenOrientation:
                geometry
                    ?.orientation
                    ?.type ||
                null,

            cssMediaOrientation:
                geometry
                    ?.cssMediaOrientation ||
                null,

            viewportAspectOrientation:
                geometry
                    ?.viewportAspectOrientation ||
                null,

            orientationMediaQueries:
                geometry
                    ?.orientationMediaQueries ||
                null,

            requestedOrientationMatchesCssMedia:
                geometry
                    ?.cssMediaOrientation
                    ? (
                        geometry.cssMediaOrientation ===
                        testCase.orientation
                    )
                    : null,

            displayState:
                displayObservation.displayState,

            displayVerificationStatus:
                displayObservation.verificationStatus,

            displayLongEdgeCssPx:
                displayObservation.longEdgeCssPx ??
                null,

            deviceScreenSize:
                capabilities
                    ?.deviceScreenSize ||
                null,

            deviceScreenDensity:
                capabilities
                    ?.deviceScreenDensity ??
                null,

            pixelRatioCapability:
                capabilities
                    ?.pixelRatio ??
                null,

            devicePixelRatio:
                round(
                    geometry
                        ?.devicePixelRatio
                ),

            statusBarHeight:
                capabilities
                    ?.statBarHeight ??
                null,

            viewportRect:
                capabilities
                    ?.viewportRect ||
                null,

            screen:
                geometry
                    ?.screen ||
                null,

            innerViewport:
                geometry
                    ?.innerViewport ||
                null,

            visualViewport:
                geometry
                    ?.visualViewport ||
                null,

            safeAreaInsets:
                geometry
                    ?.safeAreaInsets ||
                null,

            safeAreaMeasurement:
                geometry
                    ?.safeAreaMeasurement ||
                null,

            document:
                geometry
                    ?.document ||
                null,

            userAgent,

            sessionId,
        },

        latestOsSelection: {
            policy:
                "latest-available-for-device-at-probe-time",

            selectedWhenCoverageSetWasBuilt:
                testCase
                    .candidate
                    .latestOsVersion,

            selectedAtProbeTime:
                testCase
                    .platformVersion,

            osChangedSinceCoverageSelection:
                testCase
                    .osChanged,

            availableOsVersionsAtProbeTime:
                testCase
                    .current
                    .availableOsVersions ||
                [],
        },

        resolvedCapabilities:
            capabilities ||
            null,
    };
}


// =======================================================
// ONE CAPABILITY PROBE
// =======================================================

async function probeOne(
    testCase,
    runId,
    runDir,
    buildName
) {
    const startedAt =
        new Date()
            .toISOString();


    const osLabel =
        testCase.platformKey ===
        "ios"
            ? "iOS"
            : "Android";


    const baseName =
        `${slug(testCase.current.deviceName)}` +
        `__${osLabel}-${slug(testCase.platformVersion)}` +
        `__${testCase.browserName}` +
        `__${testCase.orientation}` +
        `__capability-probe` +
        `__${timestamp()}`;


    const jsonPath =
        path.join(
            runDir,
            `${baseName}.json`
        );


    const screenshotPath =
        path.join(
            runDir,
            `${baseName}.png`
        );


    let browser =
        null;

    let capabilities =
        null;

    let sessionId =
        null;

    let appiumOrientation =
        null;

    let viewport =
        null;


    console.log("");
    console.log(
        "############################################"
    );

    console.log(
        `${testCase.current.deviceName} | ` +
        `${testCase.platformName} ${testCase.platformVersion} | ` +
        `${testCase.browserName} | ` +
        `${testCase.orientation}`
    );

    console.log(
        "############################################"
    );


    if (
        testCase.osChanged
    ) {
        console.log(
            `OS changed since selection: ` +
            `${testCase.candidate.latestOsVersion} -> ` +
            `${testCase.platformVersion}. ` +
            (
                testCase.manualCapabilityOverride
                    ? "Using explicit capability override."
                    : "Using refreshed latest."
            )
        );
    }


    if (
        testCase.manualCapabilityOverride
    ) {
        console.log(
            `Manual capability override: deviceName="` +
            `${testCase.capabilityDeviceName}", ` +
            `platformVersion=${testCase.platformVersion}, ` +
            `catalogBypassed=${testCase.manualCapabilityOverride.catalogBypassed}`
        );
    }


    try {
        const ltOptions = {
            deviceName:
                testCase
                    .capabilityDeviceName ||
                testCase
                    .current
                    .deviceName,

            platformName:
                testCase
                    .platformName,

            platformVersion:
                testCase
                    .platformVersion,

            isRealMobile:
                true,

            deviceOrientation:
                testCase
                    .orientation,

            build:
                buildName,

            name:
                `${testCase.current.deviceName}-` +
                `${osLabel}-` +
                `${testCase.platformVersion}-` +
                `${testCase.browserName}-` +
                `${testCase.orientation}-` +
                "CapabilityProbe",

            project:
                "3D Portfolio Device Capability Probe",

            w3c:
                true,

            video:
                false,

            network:
                false,

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
            TUNNEL
        ) {
            ltOptions.tunnelName =
                TUNNEL;
        }


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
                    USER,

                key:
                    KEY,

                logLevel:
                    "warn",

                connectionRetryTimeout:
                    180000,

                connectionRetryCount:
                    1,

                capabilities: {
                    platformName:
                        testCase
                            .platformName,

                    browserName:
                        testCase
                            .browserName,

                    "LT:Options":
                        ltOptions,
                },
            });


        sessionId =
            browser.sessionId ||
            null;


        capabilities =
            browser.capabilities ||
            null;


        const resolvedVersion =
            capabilities
                ?.platformVersion ||
            capabilities
                ?.desired
                ?.platformVersion ||
            null;


        if (
            !resolvedVersion ||
            compareVersions(
                resolvedVersion,
                testCase.platformVersion
            ) !==
            0
        ) {
            throw new Error(
                `LATEST_OS_MISMATCH: ` +
                `requested ${testCase.platformVersion}, ` +
                `resolved ${resolvedVersion || "unknown"}`
            );
        }


        try {
            await browser
                .setOrientation(
                    testCase
                        .orientation
                        .toUpperCase()
                );
        } catch (
            error
        ) {
            console.log(
                `Orientation warning: ${error.message}`
            );
        }


        appiumOrientation =
            await getAppiumOrientation(
                browser
            );


        const url =
            new URL(
                BASE
            );


        url.searchParams.set(
            "qaProbe",
            "1"
        );


        console.log(
            `Opening ${url}`
        );


        await browser.url(
            url.toString()
        );


        await sleep(
            1200
        );


        console.log(
            "Waiting for stable browser geometry..."
        );


        viewport =
            await waitForStableGeometry(
                browser
            );


        if (
            !viewport.valid ||
            !isValidGeometry(
                viewport.final
            )
        ) {
            const failure =
                new Error(
                    "GEOMETRY_COLLECTION_FAILED: no valid browser geometry was captured after 12 attempts." +
                    (
                        viewport.errors?.length
                            ? ` Last error: ${viewport.errors[viewport.errors.length - 1]}`
                            : ""
                    )
                );

            failure.code =
                "GEOMETRY_COLLECTION_FAILED";

            throw failure;
        }


        const displayObservation =
            classifyObservedDisplay(
                testCase.candidate.foldablePolicy || null,
                viewport.final?.innerViewport
            );


        if (
            testCase.candidate.foldablePolicy?.formFactor === "flip" &&
            displayObservation.verificationStatus !==
                "VERIFIED_MAIN_DISPLAY_BY_GEOMETRY"
        ) {
            const failure = new Error(
                `FOLDABLE_DISPLAY_SCOPE_FAILED: Flip main display was not verified. ` +
                `Observed inner viewport ${viewport.final?.innerViewport?.width}x${viewport.final?.innerViewport?.height}. ` +
                "Closed/cover display is intentionally out of scope for this project."
            );

            failure.code =
                "FOLDABLE_DISPLAY_SCOPE_FAILED";

            throw failure;
        }


        const report = {
            artifactType:
                "testmu-device-capability-probe",

            probeRunId:
                runId,

            status:
                viewport.stable
                    ? "PASS"
                    : "PASS_UNSTABLE_VIEWPORT",

            infrastructurePassed:
                true,

            dataCollectionPassed:
                true,

            viewportStable:
                viewport.stable,

            deviceName:
                testCase
                    .current
                    .deviceName,

            manufacturer:
                testCase
                    .current
                    .manufacturer,

            platformName:
                testCase
                    .platformName,

            platformVersion:
                testCase
                    .platformVersion,

            browserName:
                testCase
                    .browserName,

            orientation:
                testCase
                    .orientation,

            selectionBucket:
                testCase
                    .candidate
                    .selectionBucket,

            foldable:
                testCase
                    .current
                    .deviceTypeHint ===
                "foldable"
                    ? {
                        isFoldable:
                            true,

                        policy:
                            testCase.candidate.foldablePolicy || null,

                        displayState:
                            displayObservation.displayState,

                        displayVerificationStatus:
                            displayObservation.verificationStatus,

                        postureControlVerified:
                            false,

                        note:
                            testCase.candidate.foldablePolicy?.formFactor === "flip"
                                ? "Only the open/unfolded main display is in scope; the closed cover display is intentionally ignored."
                                : "Orientation-only allocation does not prove folded/outer versus unfolded/inner posture coverage.",
                    }
                    : {
                        isFoldable:
                            false,
                    },

            deviceSpecifications:
                buildDeviceSpecifications(
                    testCase,
                    capabilities,
                    viewport.final,
                    appiumOrientation,
                    sessionId
                ),

            viewportSamples:
                viewport.samples,

            jsonPath,

            screenshotPath:
                args.screenshots
                    ? screenshotPath
                    : null,

            startedAt,

            finishedAt:
                new Date()
                    .toISOString(),
        };


        if (
            args.screenshots
        ) {
            await browser
                .saveScreenshot(
                    screenshotPath
                );
        }


        saveJson(
            jsonPath,
            report
        );


        await setTestMuStatus(
            browser,
            true
        );


        console.log(
            `PASS | ` +
            `inner ${viewport.final?.innerViewport?.width}x${viewport.final?.innerViewport?.height} | ` +
            `screen ${viewport.final?.screen?.width}x${viewport.final?.screen?.height} | ` +
            `DPR ${round(viewport.final?.devicePixelRatio)}`
        );


        return report;
    } catch (
        error
    ) {
        const message =
            error?.stack ||
            error?.message ||
            String(
                error
            );


        const geometryFailure =
            error?.code ===
                "GEOMETRY_COLLECTION_FAILED" ||
            error?.code ===
                "FOLDABLE_DISPLAY_SCOPE_FAILED" ||
            String(
                error?.message ||
                ""
            ).includes(
                "GEOMETRY_COLLECTION_FAILED"
            ) ||
            String(
                error?.message ||
                ""
            ).includes(
                "FOLDABLE_DISPLAY_SCOPE_FAILED"
            );


        const report = {
            artifactType:
                "testmu-device-capability-probe",

            probeRunId:
                runId,

            status:
                geometryFailure
                    ? "GEOMETRY_FAIL"
                    : "INFRA_FAIL",

            infrastructurePassed:
                geometryFailure
                    ? true
                    : false,

            dataCollectionPassed:
                false,

            viewportStable:
                false,

            deviceName:
                testCase
                    .current
                    .deviceName,

            manufacturer:
                testCase
                    .current
                    .manufacturer,

            platformName:
                testCase
                    .platformName,

            platformVersion:
                testCase
                    .platformVersion,

            browserName:
                testCase
                    .browserName,

            orientation:
                testCase
                    .orientation,

            selectionBucket:
                testCase
                    .candidate
                    .selectionBucket,

            error:
                message,

            deviceSpecifications:
                capabilities
                    ? buildDeviceSpecifications(
                        testCase,
                        capabilities,
                        viewport?.final,
                        appiumOrientation,
                        sessionId
                    )
                    : {
                        capturedAt:
                            new Date()
                                .toISOString(),

                        requested: {
                            deviceName:
                                testCase
                                    .current
                                    .deviceName,

                            manufacturer:
                                testCase
                                    .current
                                    .manufacturer,

                            platformName:
                                testCase
                                    .platformName,

                            platformVersion:
                                testCase
                                    .platformVersion,

                            browserName:
                                testCase
                                    .browserName,

                            orientation:
                                testCase
                                    .orientation,

                            region:
                                args.region,
                        },

                        resolved:
                            null,

                        latestOsSelection: {
                            selectedAtProbeTime:
                                testCase
                                    .platformVersion,
                        },

                        resolvedCapabilities:
                            null,
                    },

            viewportSamples:
                viewport?.samples ||
                [],

            geometryErrors:
                viewport?.errors ||
                (
                    geometryFailure
                        ? [
                            error?.message ||
                            String(error),
                        ]
                        : []
                ),

            jsonPath,

            startedAt,

            finishedAt:
                new Date()
                    .toISOString(),
        };


        saveJson(
            jsonPath,
            report
        );


        if (
            browser
        ) {
            await setTestMuStatus(
                browser,
                false
            );
        }


        console.log(
            `${report.status} | ` +
            `${testCase.current.deviceName} | ` +
            `${testCase.orientation}`
        );

        console.log(
            message
        );


        return report;
    } finally {
        if (
            browser
        ) {
            try {
                await browser
                    .deleteSession();
            } catch {
                // Continue batch.
            }
        }
    }
}


// =======================================================
// CONCURRENCY
// =======================================================

async function runPool(
    cases,
    concurrency,
    worker
) {
    const results =
        new Array(
            cases.length
        );


    let next =
        0;


    async function runWorker() {
        while (
            true
        ) {
            const index =
                next++;


            if (
                index >=
                cases.length
            ) {
                return;
            }


            results[index] =
                await worker(
                    cases[index],
                    index
                );
        }
    }


    await Promise.all(
        Array.from(
            {
                length:
                    Math.min(
                        concurrency,
                        cases.length ||
                        1
                    ),
            },

            runWorker
        )
    );


    return results;
}


// =======================================================
// MAIN
// =======================================================

(
    async () => {
        if (
            !fs.existsSync(
                args.input
            )
        ) {
            throw new Error(
                `Missing coverage set: ${args.input}\n` +
                "Run generate-device-coverage-set.cjs first."
            );
        }


        if (
            !args.dry &&
            (
                !USER ||
                !KEY
            )
        ) {
            throw new Error(
                "LT_USERNAME / LT_ACCESS_KEY missing."
            );
        }


        if (
            args.refresh &&
            !args.dry
        ) {
            refreshCatalog();
        }


        const inventoryPath =
            currentInventoryPath();


        if (
            !fs.existsSync(
                inventoryPath
            )
        ) {
            throw new Error(
                `Missing current inventory: ${inventoryPath}`
            );
        }


        const coverage =
            readJson(
                args.input
            );


        const inventory =
            readJson(
                inventoryPath
            );


        const {
            cases,
            unavailable,
            selectedDeviceCount,
            eligibleWorkDeviceCount,
        } =
            buildCases(
                coverage,
                inventory
            );


        console.log("");
        console.log(
            "TESTMU CAPABILITY PROBE PLAN"
        );

        console.log(
            "====================================================================="
        );

        console.log(
            `Devices in this batch: ${selectedDeviceCount}`
        );

        console.log(
            `Devices still pending: ${eligibleWorkDeviceCount}`
        );

        console.log(
            `Posture-deferred:      ${(coverage.postureDiscoveryQueue || []).length}`
        );

        console.log(
            `Sessions:              ${cases.length}`
        );

        console.log(
            `Unavailable:           ${unavailable.length}`
        );

        console.log(
            `Concurrency:           ${args.concurrency}`
        );

        console.log(
            "====================================================================="
        );


        for (
            const testCase of
            cases
        ) {
            console.log(
                `- ${testCase.current.deviceName} | ` +
                `${testCase.platformName} ${testCase.platformVersion} | ` +
                `${testCase.browserName} | ` +
                `${testCase.orientation}` +
                (
                    testCase.osChanged
                        ? " [OS UPDATED]"
                        : ""
                ) +
                (
                    testCase.manualCapabilityOverride
                        ? ` [MANUAL OVERRIDE: deviceName="${testCase.capabilityDeviceName}"]`
                        : ""
                )
            );
        }


        for (
            const item of
            unavailable
        ) {
            console.log(
                `- UNAVAILABLE NOW: ` +
                `${item.candidate.deviceName}`
            );
        }


        if (
            args.dry
        ) {
            console.log("");
            console.log(
                "Dry run only. No TestMu sessions created."
            );

            return;
        }


        const runId =
            `capability-probe-${timestamp()}`;


        const runDir =
            path.join(
                args.out,
                runId
            );


        const buildName =
            `Portfolio Device Capability Probe ` +
            new Date()
                .toISOString();


        fs.mkdirSync(
            runDir,
            {
                recursive:
                    true,
            }
        );


        const missingReports =
            unavailable.map(
                (item) => {
                    const filePath =
                        path.join(
                            runDir,

                            `${slug(item.candidate.deviceName)}` +
                            `__${slug(item.candidate.platformName)}` +
                            `__UNAVAILABLE` +
                            `__${timestamp()}.json`
                        );


                    const report = {
                        artifactType:
                            "testmu-device-capability-probe",

                        probeRunId:
                            runId,

                        status:
                            item.status,

                        infrastructurePassed:
                            false,

                        reason:
                            "Device disappeared from refreshed TestMu automation catalog.",

                        deviceName:
                            item
                                .candidate
                                .deviceName,

                        platformName:
                            item
                                .candidate
                                .platformName,

                        selectedPlatformVersion:
                            item
                                .candidate
                                .latestOsVersion,

                        deviceSpecifications: {
                            capturedAt:
                                new Date()
                                    .toISOString(),

                            requested: {
                                deviceName:
                                    item
                                        .candidate
                                        .deviceName,

                                platformName:
                                    item
                                        .candidate
                                        .platformName,

                                platformVersion:
                                    item
                                        .candidate
                                        .latestOsVersion,

                                region:
                                    args.region,
                            },

                            resolved:
                                null,

                            latestOsSelection: {
                                availableNow:
                                    false,
                            },

                            resolvedCapabilities:
                                null,
                        },

                        jsonPath:
                            filePath,
                    };


                    saveJson(
                        filePath,
                        report
                    );


                    return report;
                }
            );


        const results =
            await runPool(
                cases,
                args.concurrency,

                (
                    testCase
                ) =>
                    probeOne(
                        testCase,
                        runId,
                        runDir,
                        buildName
                    )
            );


        const allResults =
            [
                ...missingReports,
                ...results,
            ];


        const summary = {
            artifactType:
                "testmu-capability-probe-batch-summary",

            probeRunId:
                runId,

            createdAt:
                new Date()
                    .toISOString(),

            region:
                args.region,

            sourceCoverageSet:
                args.input,

            refreshedInventory: {
                path:
                    inventoryPath,

                generatedAt:
                    inventory.generatedAt ||
                    null,
            },

            policy: {
                catalog:
                    "Refreshed before probe",

                os:
                    "Latest available for exact device",

                heroQa:
                    "Not run",

                foldables:
                    "Book folds/dual-screen devices are deferred until posture-specific control is verified. Flip phones certify only the open/unfolded main display; cover display is out of scope.",

                geometryCollection:
                    "Serialized JSON payload + strict validation; malformed WebDriver WINDOW/reference payloads are rejected",

                cssOrientation:
                    "Records requested Appium orientation, screen.orientation, CSS matchMedia orientation, and viewport aspect separately",

                batching:
                    args.maxDevices
                        ? `Device-level batch cap: ${args.maxDevices}`
                        : "No device-level batch cap",
            },

            counts: {
                selectedDevices:
                    selectedDeviceCount,

                eligiblePendingDevices:
                    eligibleWorkDeviceCount,

                total:
                    allResults.length,

                pass:
                    allResults.filter(
                        (result) =>
                            String(
                                result.status
                            )
                                .startsWith(
                                    "PASS"
                                )
                    ).length,

                geometryFail:
                    allResults.filter(
                        (result) =>
                            result.status ===
                            "GEOMETRY_FAIL"
                    ).length,

                infraFail:
                    allResults.filter(
                        (result) =>
                            result.status ===
                            "INFRA_FAIL"
                    ).length,

                unavailable:
                    allResults.filter(
                        (result) =>
                            result.status ===
                            "UNAVAILABLE_IN_CURRENT_AUTOMATION_CATALOG"
                    ).length,
            },

            results:
                allResults.map(
                    (result) => ({
                        status:
                            result.status,

                        deviceName:
                            result.deviceName,

                        manufacturer:
                            result.manufacturer ||
                            null,

                        platformName:
                            result.platformName,

                        platformVersion:
                            result.platformVersion ||
                            result.selectedPlatformVersion ||
                            null,

                        browserName:
                            result.browserName ||
                            null,

                        orientation:
                            result.orientation ||
                            null,

                        screenOrientation:
                            result
                                .deviceSpecifications
                                ?.resolved
                                ?.screenOrientation ||
                            null,

                        cssMediaOrientation:
                            result
                                .deviceSpecifications
                                ?.resolved
                                ?.cssMediaOrientation ||
                            null,

                        viewportAspectOrientation:
                            result
                                .deviceSpecifications
                                ?.resolved
                                ?.viewportAspectOrientation ||
                            null,

                        innerViewport:
                            result
                                .deviceSpecifications
                                ?.resolved
                                ?.innerViewport ||
                            null,

                        screen:
                            result
                                .deviceSpecifications
                                ?.resolved
                                ?.screen ||
                            null,

                        deviceScreenSize:
                            result
                                .deviceSpecifications
                                ?.resolved
                                ?.deviceScreenSize ||
                            null,

                        deviceScreenDensity:
                            result
                                .deviceSpecifications
                                ?.resolved
                                ?.deviceScreenDensity ??
                            null,

                        devicePixelRatio:
                            result
                                .deviceSpecifications
                                ?.resolved
                                ?.devicePixelRatio ??
                            null,

                        jsonPath:
                            result.jsonPath ||
                            null,
                    })
                ),
        };


        const summaryPath =
            path.join(
                runDir,
                "TESTMU__capability-probe__summary.json"
            );


        const latestSummaryPath =
            path.join(
                args.out,
                "TESTMU__capability-probe__latest.json"
            );


        saveJson(
            summaryPath,
            summary
        );


        saveJson(
            latestSummaryPath,
            summary
        );


        console.log("");
        console.log(
            "CAPABILITY PROBE SUMMARY"
        );

        console.log(
            "====================================================================="
        );

        console.log(
            `Total:       ${summary.counts.total}`
        );

        console.log(
            `PASS:        ${summary.counts.pass}`
        );

        console.log(
            `GEOM_FAIL:   ${summary.counts.geometryFail}`
        );

        console.log(
            `INFRA_FAIL:  ${summary.counts.infraFail}`
        );

        console.log(
            `UNAVAILABLE: ${summary.counts.unavailable}`
        );

        console.log(
            "====================================================================="
        );

        console.log(
            summaryPath
        );


        console.log("");
        console.log(
            "Next: rerun generate-testmu-device-inventory.cjs."
        );

        console.log(
            "Its QA-cache scan will ingest only validated geometry/capability results."
        );


        process.exitCode =
            summary.counts.geometryFail ||
            summary.counts.infraFail ||
            summary.counts.unavailable
                ? 2
                : 0;
    }
)()
    .catch(
        (error) => {
            console.error("");
            console.error(
                "Capability probe failed:"
            );

            console.error(
                error?.stack ||
                error
            );

            process.exitCode =
                2;
        }
    );