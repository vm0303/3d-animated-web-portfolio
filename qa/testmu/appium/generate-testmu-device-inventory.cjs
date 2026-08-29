const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

/*
  TestMu candidate device inventory generator.

  PURPOSE
  -------
  Build one current inventory of the real-device catalog before we choose the
  representative devices for the responsive QA matrix.

  DEFAULT BEHAVIOR
  ----------------
  - Queries BOTH Android and iOS in the configured TestMu region.
  - Collapses duplicate device/OS records into ONE row per device model.
  - Always selects the numerically newest OS TestMu currently lists for that model.
  - Preserves every OS version TestMu currently lists for the model.
  - Uses validated existing real-device QA JSONs as a screen/spec cache.
  - Never invents screen geometry.
  - Rejects incomplete capability probes and geometry-less false positives.
  - Writes JSON, CSV, Markdown, and raw TestMu catalog payloads.

  USAGE
  -----
    node qa/testmu/appium/generate-testmu-device-inventory.cjs

    node qa/testmu/appium/generate-testmu-device-inventory.cjs --platform=android
    node qa/testmu/appium/generate-testmu-device-inventory.cjs --platform=ios
    node qa/testmu/appium/generate-testmu-device-inventory.cjs --region=us
    node qa/testmu/appium/generate-testmu-device-inventory.cjs --no-cache

  ENVIRONMENT
  -----------
    LT_USERNAME
    LT_ACCESS_KEY
    QA_TESTMU_REGION or LT_REGION
*/

const LT_USERNAME = process.env.LT_USERNAME;
const LT_ACCESS_KEY = process.env.LT_ACCESS_KEY;

const DEFAULT_REGION =
    process.env.QA_TESTMU_REGION ||
    process.env.LT_REGION ||
    "us";

const DEFAULT_OUTPUT_ROOT = path.join(
    process.cwd(),
    "qa-results",
    "testmu",
    "catalog"
);

const DEFAULT_QA_RESULTS_ROOT = path.join(
    process.cwd(),
    "qa-results",
    "testmu"
);

// =======================================================
// CLI
// =======================================================

const parseArgs = (argv) => {
    const args = {
        platform: "all",
        region: DEFAULT_REGION,
        outputDir: DEFAULT_OUTPUT_ROOT,
        useCache: true,
        includeRawRecords: false,
    };

    for (const token of argv) {
        if (token.startsWith("--platform=")) {
            args.platform = token
                .slice("--platform=".length)
                .trim()
                .toLowerCase();
        } else if (token.startsWith("--region=")) {
            args.region = token
                .slice("--region=".length)
                .trim()
                .toLowerCase();
        } else if (token.startsWith("--output-dir=")) {
            const value = token
                .slice("--output-dir=".length)
                .trim();

            args.outputDir = path.resolve(
                process.cwd(),
                value
            );
        } else if (token === "--no-cache") {
            args.useCache = false;
        } else if (token === "--include-raw-records") {
            args.includeRawRecords = true;
        } else {
            throw new Error(
                `Unknown argument: ${token}`
            );
        }
    }

    if (!["all", "android", "ios"].includes(args.platform)) {
        throw new Error(
            "--platform must be one of: all, android, ios"
        );
    }

    if (!["us", "eu", "ap"].includes(args.region)) {
        throw new Error(
            "--region must be one of: us, eu, ap"
        );
    }

    return args;
};

const requireCredentials = () => {
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

// =======================================================
// NORMALIZATION
// =======================================================

const normalizeName = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

const normalizePlatform = (value) => {
    const normalized = normalizeName(value);

    if (normalized.includes("android")) {
        return "android";
    }

    if (
        normalized === "ios" ||
        normalized.includes("iphone") ||
        normalized.includes("ipad")
    ) {
        return "ios";
    }

    return normalized || null;
};

const prettyPlatform = (value) => {
    const normalized = normalizePlatform(value);

    if (normalized === "android") {
        return "Android";
    }

    if (normalized === "ios") {
        return "iOS";
    }

    return value
        ? String(value)
        : "Unknown";
};

const normalizeVersion = (value) => {
    const match =
        String(value || "")
            .match(/\d+(?:\.\d+)*/);

    if (!match) {
        return null;
    }

    const parts =
        match[0]
            .split(".");

    // Treat semantically equivalent TestMu/Appium versions
    // as the same cache version:
    //
    // 26.0     -> 26
    // 26.0.0   -> 26
    // 18.0     -> 18
    // 15.0.1   -> 15.0.1
    //
    // This prevents a capture resolved by Appium as "26.0"
    // from being classified as a different OS from a TestMu
    // catalog entry reported as "26".
    while (
        parts.length > 1 &&
        Number(
            parts[
                parts.length - 1
            ]
        ) === 0
    ) {
        parts.pop();
    }

    return parts.join(".");
};

const compareVersions = (a, b) => {
    const left = String(a)
        .split(".")
        .map((part) => Number(part));

    const right = String(b)
        .split(".")
        .map((part) => Number(part));

    const length = Math.max(
        left.length,
        right.length
    );

    for (
        let index = 0;
        index < length;
        index += 1
    ) {
        const delta =
            (left[index] || 0) -
            (right[index] || 0);

        if (delta !== 0) {
            return delta;
        }
    }

    return 0;
};

const getFirstValue = (object, keys) => {
    for (const key of keys) {
        const value = object?.[key];

        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            return value;
        }
    }

    return null;
};

const getFirstString = (object, keys) => {
    const value = getFirstValue(
        object,
        keys
    );

    if (value === null) {
        return null;
    }

    return String(value).trim() || null;
};

const getVersionValues = (object) => {
    const keys = [
        "platformVersion",
        "platform_version",
        "osVersion",
        "os_version",
        "osVersions",
        "os_versions",
        "platformVersions",
        "platform_versions",
        "versions",
        "version",
    ];

    const versions = [];

    for (const key of keys) {
        const value = object?.[key];

        if (Array.isArray(value)) {
            for (const item of value) {
                if (
                    typeof item === "string" ||
                    typeof item === "number"
                ) {
                    const normalized =
                        normalizeVersion(item);

                    if (normalized) {
                        versions.push(normalized);
                    }
                } else if (
                    item &&
                    typeof item === "object"
                ) {
                    const nested =
                        getFirstString(
                            item,
                            [
                                "platformVersion",
                                "platform_version",
                                "osVersion",
                                "os_version",
                                "version",
                                "name",
                            ]
                        );

                    const normalized =
                        normalizeVersion(
                            nested
                        );

                    if (normalized) {
                        versions.push(
                            normalized
                        );
                    }
                }
            }
        } else if (
            typeof value === "string" ||
            typeof value === "number"
        ) {
            const normalized =
                normalizeVersion(
                    value
                );

            if (normalized) {
                versions.push(
                    normalized
                );
            }
        }
    }

    return [...new Set(versions)];
};

// =======================================================
// TESTMU CATALOG FETCH / PARSE
// =======================================================

const requestJson = (url) =>
    new Promise((resolve, reject) => {
        const authorization =
            Buffer.from(
                `${LT_USERNAME}:${LT_ACCESS_KEY}`
            ).toString("base64");

        const request = https.get(
            url,
            {
                headers: {
                    Accept: "application/json",
                    Authorization:
                        `Basic ${authorization}`,
                    "User-Agent":
                        "portfolio-qa-testmu-inventory/1.0",
                },
            },
            (response) => {
                let body = "";

                response.setEncoding(
                    "utf8"
                );

                response.on(
                    "data",
                    (chunk) => {
                        body += chunk;
                    }
                );

                response.on(
                    "end",
                    () => {
                        if (
                            response.statusCode < 200 ||
                            response.statusCode >= 300
                        ) {
                            reject(
                                new Error(
                                    `TestMu device-list API returned HTTP ${response.statusCode}: ${body.slice(0, 500)}`
                                )
                            );

                            return;
                        }

                        try {
                            resolve(
                                JSON.parse(body)
                            );
                        } catch (error) {
                            reject(
                                new Error(
                                    `TestMu device-list API returned invalid JSON: ${error.message}`
                                )
                            );
                        }
                    }
                );
            }
        );

        request.setTimeout(
            30000,
            () => {
                request.destroy(
                    new Error(
                        "TestMu device-list API timed out after 30 seconds."
                    )
                );
            }
        );

        request.on(
            "error",
            reject
        );
    });

const extractCatalogRecords = (payload) => {
    const records = [];
    const seen = new Set();

    const addRecord = ({
        deviceName,
        platformVersion,
        platformName,
        deviceId,
        deviceStatus,
        manufacturer,
        raw,
    }) => {
        const version =
            normalizeVersion(
                platformVersion
            );

        const platform =
            normalizePlatform(
                platformName
            );

        if (
            !deviceName ||
            !version ||
            !platform
        ) {
            return;
        }

        const key = [
            normalizeName(deviceName),
            platform,
            version,
            deviceId || "",
        ].join("|");

        if (seen.has(key)) {
            return;
        }

        seen.add(key);

        records.push({
            deviceName:
                String(deviceName).trim(),

            platformVersion:
                version,

            platformName:
                platform,

            deviceId:
                deviceId
                    ? String(deviceId)
                    : null,

            deviceStatus:
                deviceStatus
                    ? String(deviceStatus)
                    : null,

            manufacturer:
                manufacturer
                    ? String(manufacturer)
                    : null,

            raw,
        });
    };

    const visit = (
        node,
        context = {}
    ) => {
        if (Array.isArray(node)) {
            node.forEach(
                (item) =>
                    visit(
                        item,
                        context
                    )
            );

            return;
        }

        if (
            !node ||
            typeof node !== "object"
        ) {
            return;
        }

        const directName =
            getFirstString(
                node,
                [
                    "deviceName",
                    "device_name",
                    "deviceModel",
                    "device_model",
                    "model",
                ]
            );

        const directPlatform =
            getFirstString(
                node,
                [
                    "platformName",
                    "platform_name",
                    "platform",
                    "os",
                ]
            );

        const directManufacturer =
            getFirstString(
                node,
                [
                    "manufacturer",
                    "deviceManufacturer",
                    "device_manufacturer",
                    "brand",
                    "vendor",
                    "oem",
                ]
            );

        const directDeviceId =
            getFirstString(
                node,
                [
                    "deviceId",
                    "device_id",
                    "id",
                    "udid",
                    "deviceUDID",
                ]
            );

        const directStatus =
            getFirstString(
                node,
                [
                    "deviceStatus",
                    "device_status",
                    "status",
                    "availability",
                ]
            );

        const deviceName =
            directName ||
            context.deviceName ||
            null;

        const platformName =
            directPlatform ||
            context.platformName ||
            null;

        const manufacturer =
            directManufacturer ||
            context.manufacturer ||
            null;

        const deviceId =
            directDeviceId ||
            context.deviceId ||
            null;

        const deviceStatus =
            directStatus ||
            context.deviceStatus ||
            null;

        const directVersions =
            getVersionValues(node);

        const versions =
            directVersions.length
                ? directVersions
                : context.platformVersion
                    ? [
                        context.platformVersion,
                    ]
                    : [];

        for (const version of versions) {
            addRecord({
                deviceName,
                platformVersion:
                    version,
                platformName,
                deviceId,
                deviceStatus,
                manufacturer,
                raw: node,
            });
        }

        for (
            const [key, value] of
            Object.entries(node)
        ) {
            if (
                !value ||
                (
                    typeof value !== "object" &&
                    !Array.isArray(value)
                )
            ) {
                continue;
            }

            const childContext = {
                deviceName:
                    deviceName ||
                    context.deviceName ||
                    null,

                platformName:
                    platformName ||
                    context.platformName ||
                    null,

                manufacturer:
                    manufacturer ||
                    context.manufacturer ||
                    null,

                deviceId:
                    deviceId ||
                    context.deviceId ||
                    null,

                deviceStatus:
                    deviceStatus ||
                    context.deviceStatus ||
                    null,

                platformVersion:
                    context.platformVersion ||
                    null,
            };

            const versionFromKey =
                /^(?:(?:android|ios)\s*)?\d+(?:\.\d+)*$/i
                    .test(
                        key.trim()
                    )
                    ? normalizeVersion(key)
                    : null;

            if (versionFromKey) {
                childContext
                    .platformVersion =
                    versionFromKey;
            }

            visit(
                value,
                childContext
            );
        }
    };

    visit(payload);

    return records;
};

const fetchPlatformCatalog =
    async (
        platform,
        region
    ) => {
        const primaryUrl =
            new URL(
                "https://mobile-api.lambdatest.com/mobile-automation/api/v1/list"
            );

        primaryUrl.searchParams.set(
            "region",
            region
        );

        primaryUrl.searchParams.set(
            "os",
            platform
        );

        const fallbackUrl =
            new URL(
                "https://manual-api.lambdatest.com/list"
            );

        fallbackUrl.searchParams.set(
            "region",
            region
        );

        const attempts = [
            primaryUrl,
            fallbackUrl,
        ];

        const errors = [];

        for (const url of attempts) {
            try {
                const payload =
                    await requestJson(
                        url
                    );

                const allRecords =
                    extractCatalogRecords(
                        payload
                    );

                const records =
                    allRecords.filter(
                        (record) =>
                            normalizePlatform(
                                record.platformName
                            ) === platform
                    );

                if (!records.length) {
                    throw new Error(
                        `API returned data, but no ${platform} device/version records could be parsed.`
                    );
                }

                return {
                    platform,

                    fetchedAt:
                        new Date()
                            .toISOString(),

                    region,

                    sourceUrl:
                        url.toString(),

                    payload,

                    recordCount:
                        records.length,

                    records,
                };
            } catch (error) {
                errors.push(
                    `${url.toString()} -> ${error.message}`
                );
            }
        }

        throw new Error(
            `Could not resolve the TestMu ${platform} real-device catalog. ` +
            errors.join(" | ")
        );
    };

// =======================================================
// MANUFACTURER / TYPE HINTS
// =======================================================

const inferManufacturer = (deviceName) => {
    const name =
        String(deviceName || "")
            .trim();

    const lower =
        name.toLowerCase();

    const rules = [
        [/^(iphone|ipad|ipod)\b/, "Apple"],
        [/^(google\s+)?pixel\b|^nexus\b/, "Google"],
        [/^samsung\b|^galaxy\b/, "Samsung"],
        [/^motorola\b|^moto\b|^razr\b/, "Motorola"],
        [/^oneplus\b/, "OnePlus"],
        [/^xiaomi\b|^redmi\b|^poco\b/, "Xiaomi"],
        [/^oppo\b/, "OPPO"],
        [/^vivo\b|^iqoo\b/, "vivo"],
        [/^huawei\b|^mate\b|^p\d{2}\b/, "Huawei"],
        [/^honor\b/, "HONOR"],
        [/^nokia\b/, "Nokia"],
        [/^lg\b/, "LG"],
        [/^sony\b|^xperia\b/, "Sony"],
        [/^asus\b|^rog\b|^zenfone\b/, "ASUS"],
        [/^nothing\b/, "Nothing"],
        [/^realme\b/, "realme"],
        [/^zte\b|^nubia\b/, "ZTE"],
        [/^lenovo\b/, "Lenovo"],
        [/^surface\s+duo\b/, "Microsoft"],
        [/^htc\b/, "HTC"],
        [/^fairphone\b/, "Fairphone"],
        [/^tecno\b/, "TECNO"],
        [/^infinix\b/, "Infinix"],
        [/^blackberry\b/, "BlackBerry"],
        [/^fire\b/, "Amazon"],
    ];

    for (
        const [
            pattern,
            manufacturer,
        ] of rules
    ) {
        if (pattern.test(lower)) {
            return manufacturer;
        }
    }

    return null;
};

const inferDeviceType = (deviceName) => {
    const lower =
        String(deviceName || "")
            .toLowerCase();

    // Surface Duo is a dual-screen hinged device. Treat it as a
    // foldable/special-form-factor target so discovery does not group it
    // with ordinary tablets and so it receives the same later posture/
    // hinge review policy as other foldable hardware.
    if (
        /surface\s+duo|fold|flip|razr/
            .test(lower)
    ) {
        return "foldable";
    }

    if (
        /ipad|tablet|tab\b|matepad/
            .test(lower)
    ) {
        return "tablet";
    }

    return "phone";
};

// =======================================================
// SCREEN INFORMATION FROM CATALOG RAW RECORD
// =======================================================

const parseMaybeNumber = (value) => {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : null;
};

const extractScreenInfoFromRaw = (raw) => {
    if (
        !raw ||
        typeof raw !== "object"
    ) {
        return null;
    }

    const deviceScreenSize =
        getFirstString(
            raw,
            [
                "deviceScreenSize",
                "device_screen_size",
                "screenSize",
                "screen_size",
                "screenResolution",
                "screen_resolution",
                "deviceResolution",
                "device_resolution",
                "resolution",
                "displayResolution",
                "display_resolution",
            ]
        );

    const deviceScreenDensity =
        parseMaybeNumber(
            getFirstValue(
                raw,
                [
                    "deviceScreenDensity",
                    "device_screen_density",
                    "screenDensity",
                    "screen_density",
                    "density",
                    "dpi",
                ]
            )
        );

    const pixelRatio =
        getFirstString(
            raw,
            [
                "pixelRatio",
                "pixel_ratio",
                "devicePixelRatio",
                "device_pixel_ratio",
                "dpr",
            ]
        );

    const width =
        parseMaybeNumber(
            getFirstValue(
                raw,
                [
                    "screenWidth",
                    "screen_width",
                    "width",
                    "deviceWidth",
                    "device_width",
                ]
            )
        );

    const height =
        parseMaybeNumber(
            getFirstValue(
                raw,
                [
                    "screenHeight",
                    "screen_height",
                    "height",
                    "deviceHeight",
                    "device_height",
                ]
            )
        );

    if (
        !deviceScreenSize &&
        deviceScreenDensity === null &&
        !pixelRatio &&
        width === null &&
        height === null
    ) {
        return null;
    }

    return {
        source:
            "testmu-catalog",

        deviceScreenSize,

        deviceScreenDensity,

        pixelRatioCapability:
            pixelRatio,

        width,

        height,
    };
};

// =======================================================
// EXISTING REAL-DEVICE CAPABILITY CACHE
// =======================================================

const walkJsonFiles = (root) => {
    const files = [];

    if (!fs.existsSync(root)) {
        return files;
    }

    const visit = (current) => {
        let entries;

        try {
            entries =
                fs.readdirSync(
                    current,
                    {
                        withFileTypes:
                            true,
                    }
                );
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath =
                path.join(
                    current,
                    entry.name
                );

            if (entry.isDirectory()) {
                visit(fullPath);
            } else if (
                entry.isFile() &&
                entry.name
                    .toLowerCase()
                    .endsWith(".json")
            ) {
                files.push(fullPath);
            }
        }
    };

    visit(root);

    return files;
};

const makeCacheKey = (
    platformName,
    deviceName,
    platformVersion
) =>
    [
        normalizePlatform(platformName),
        normalizeName(deviceName),
        normalizeVersion(platformVersion),
    ].join("|");

const makeModelKey = (
    platformName,
    deviceName
) =>
    [
        normalizePlatform(platformName),
        normalizeName(deviceName),
    ].join("|");

const finitePositive = (value) => {
    const number =
        Number(value);

    return (
        Number.isFinite(number) &&
        number > 0
    );
};

const hasValidCssGeometry = (capture) => {
    if (!capture) {
        return false;
    }

    return (
        finitePositive(
            capture
                .innerViewport
                ?.width
        ) &&
        finitePositive(
            capture
                .innerViewport
                ?.height
        ) &&
        finitePositive(
            capture
                .screen
                ?.width
        ) &&
        finitePositive(
            capture
                .screen
                ?.height
        )
    );
};

const hasPhysicalScreenInfo = (capture) => {
    if (!capture) {
        return false;
    }

    return Boolean(
        capture.deviceScreenSize ||
        capture.deviceScreenDensity !== null ||
        capture.pixelRatioCapability !== null ||
        capture.viewportRect
    );
};

const captureTimeValue = (capture) => {
    const timestamp =
        Date.parse(
            capture?.capturedAt ||
            ""
        );

    return Number.isFinite(timestamp)
        ? timestamp
        : 0;
};

const isManualEvidenceArtifact = (artifactType) =>
    artifactType === "testmu-manual-real-device-evidence";

const manualEvidenceApproved = (metadata) =>
    isManualEvidenceArtifact(metadata.artifactType) &&
    metadata.status === "MANUAL_CERTIFIED" &&
    metadata.manualEvidence?.approvedForPrimaryDiscovery === true &&
    metadata.manualEvidence?.automationDerived === false &&
    metadata.manualEvidence?.appiumDerived === false;

const normalizeCapture = (
    deviceSpecifications,
    sourcePath,
    metadata = {}
) => {
    const requested =
        deviceSpecifications
            ?.requested ||
        {};

    const resolved =
        deviceSpecifications
            ?.resolved ||
        {};

    const requestedDeviceName =
        requested.deviceName ||
        null;

    const resolvedModel =
        resolved.model ||
        null;

    // Use the exact TestMu-requested catalog name as the cache identity.
    // Some Appium providers return an internal hardware model in
    // resolved.model (for example, a manufacturer model code), which
    // should be preserved for audit purposes but must not replace the
    // catalog model name used by coverage selection and cache lookup.
    const deviceName =
        requestedDeviceName ||
        resolvedModel ||
        null;

    const platformName =
        resolved.platformName ||
        requested.platformName ||
        null;

    const platformVersion =
        resolved.platformVersion ||
        requested.platformVersion ||
        null;

    if (
        !deviceName ||
        !platformName ||
        !platformVersion
    ) {
        return null;
    }

    const capture = {
        sourcePath,

        sourceArtifactType:
            metadata.artifactType ||
            null,

        sourceStatus:
            metadata.status ||
            null,

        evidenceSource:
            metadata.evidenceSource ||
            (isManualEvidenceArtifact(metadata.artifactType)
                ? "testmu-manual-real-device"
                : "testmu-automation-or-qa"),

        captureMethod:
            metadata.captureMethod ||
            (isManualEvidenceArtifact(metadata.artifactType)
                ? "manual-real-device"
                : "automated-or-qa"),

        manualCertification:
            isManualEvidenceArtifact(metadata.artifactType)
                ? {
                    approvedForPrimaryDiscovery:
                        metadata.manualEvidence?.approvedForPrimaryDiscovery === true,
                    automationDerived:
                        metadata.manualEvidence?.automationDerived === true,
                    appiumDerived:
                        metadata.manualEvidence?.appiumDerived === true,
                    automationIssue:
                        metadata.manualEvidence?.automationIssue || null,
                    automationProvisioningStatus:
                        metadata.manualEvidence?.automationProvisioningStatus || null,
                }
                : null,

        deviceName,

        requestedDeviceName,

        resolvedModel,

        platformName:
            normalizePlatform(
                platformName
            ),

        platformVersion:
            normalizeVersion(
                platformVersion
            ),

        manufacturer:
            resolved.manufacturer ||
            requested.manufacturer ||
            null,

        deviceScreenSize:
            resolved.deviceScreenSize ||
            null,

        deviceScreenDensity:
            resolved.deviceScreenDensity ??
            null,

        pixelRatioCapability:
            resolved.pixelRatioCapability ??
            null,

        devicePixelRatio:
            resolved.devicePixelRatio ??
            null,

        viewportRect:
            resolved.viewportRect ||
            null,

        screen:
            resolved.screen ||
            null,

        innerViewport:
            resolved.innerViewport ||
            null,

        visualViewport:
            resolved.visualViewport ||
            null,

        safeAreaInsets:
            resolved.safeAreaInsets ||
            null,

        safeAreaMeasurement:
            resolved.safeAreaMeasurement ||
            null,

        displayState:
            resolved.displayState ||
            requested.displayState ||
            null,

        foldState:
            resolved.foldState ||
            requested.foldState ||
            null,

        posture:
            resolved.posture ||
            requested.posture ||
            null,

        displayVerificationStatus:
            resolved.displayVerificationStatus ||
            null,

        requestedOrientation:
            resolved.requestedOrientation ||
            requested.orientation ||
            null,

        browserOrientation:
            resolved.browserOrientation ||
            resolved.screenOrientation ||
            null,

        screenOrientation:
            resolved.screenOrientation ||
            resolved.browserOrientation ||
            null,

        cssMediaOrientation:
            resolved.cssMediaOrientation ||
            null,

        viewportAspectOrientation:
            resolved.viewportAspectOrientation ||
            null,

        orientationMediaQueries:
            resolved.orientationMediaQueries ||
            null,

        browserName:
            resolved.browserName ||
            requested.browserName ||
            null,

        browserVersion:
            resolved.browserVersion ||
            null,

        apiLevel:
            resolved.apiLevel ??
            null,

        capturedAt:
            deviceSpecifications
                ?.capturedAt ||
            metadata.capturedAt ||
            null,
    };

    const isCapabilityProbe =
        metadata.artifactType ===
        "testmu-device-capability-probe";

    const isManualEvidence =
        isManualEvidenceArtifact(
            metadata.artifactType
        );

    if (
        isManualEvidence &&
        (
            !manualEvidenceApproved(metadata) ||
            !hasValidCssGeometry(capture)
        )
    ) {
        return null;
    }

    if (isCapabilityProbe) {
        if (
            !String(
                metadata.status ||
                ""
            ).startsWith("PASS") ||
            !hasValidCssGeometry(
                capture
            )
        ) {
            return null;
        }
    } else if (
        !hasValidCssGeometry(
            capture
        ) &&
        !hasPhysicalScreenInfo(
            capture
        )
    ) {
        return null;
    }

    return capture;
};

const collectDeviceSpecificationsFromDocument = (
    document,
    sourcePath
) => {
    const captures = [];

    if (document?.deviceSpecifications) {
        const capture =
            normalizeCapture(
                document.deviceSpecifications,
                sourcePath,
                {
                    artifactType:
                        document.artifactType ||
                        null,

                    status:
                        document.status ||
                        null,

                    capturedAt:
                        document.finishedAt ||
                        document.createdAt ||
                        null,

                    evidenceSource:
                        document.evidenceSource ||
                        null,

                    captureMethod:
                        document.captureMethod ||
                        null,

                    manualEvidence:
                        document.manualEvidence ||
                        null,
                }
            );

        if (capture) {
            captures.push(capture);
        }
    }

    if (Array.isArray(document?.results)) {
        for (
            const result of
            document.results
        ) {
            if (
                !result
                    ?.deviceSpecifications
            ) {
                continue;
            }

            const capture =
                normalizeCapture(
                    result.deviceSpecifications,
                    sourcePath,
                    {
                        artifactType:
                            result.artifactType ||
                            document.artifactType ||
                            null,

                        status:
                            result.status ||
                            document.status ||
                            null,

                        capturedAt:
                            result.finishedAt ||
                            document.createdAt ||
                            null,

                        evidenceSource:
                            result.evidenceSource ||
                            document.evidenceSource ||
                            null,

                        captureMethod:
                            result.captureMethod ||
                            document.captureMethod ||
                            null,

                        manualEvidence:
                            result.manualEvidence ||
                            document.manualEvidence ||
                            null,
                    }
                );

            if (capture) {
                captures.push(capture);
            }
        }
    }

    return captures;
};

const loadExistingCapabilityCache = (root) => {
    const byExactVersion =
        new Map();

    const byModel =
        new Map();

    const jsonFiles =
        walkJsonFiles(root);

    let parsedFiles =
        0;

    let acceptedCaptures =
        0;

    for (const filePath of jsonFiles) {
        let document;

        try {
            document =
                JSON.parse(
                    fs.readFileSync(
                        filePath,
                        "utf8"
                    )
                );
        } catch {
            continue;
        }

        parsedFiles += 1;

        const captures =
            collectDeviceSpecificationsFromDocument(
                document,
                filePath
            );

        for (const capture of captures) {
            acceptedCaptures += 1;

            const exactKey =
                makeCacheKey(
                    capture.platformName,
                    capture.deviceName,
                    capture.platformVersion
                );

            const modelKey =
                makeModelKey(
                    capture.platformName,
                    capture.deviceName
                );

            if (
                !byExactVersion
                    .has(exactKey)
            ) {
                byExactVersion.set(
                    exactKey,
                    []
                );
            }

            if (
                !byModel
                    .has(modelKey)
            ) {
                byModel.set(
                    modelKey,
                    []
                );
            }

            byExactVersion
                .get(exactKey)
                .push(capture);

            byModel
                .get(modelKey)
                .push(capture);
        }
    }

    for (
        const captures of
        byExactVersion.values()
    ) {
        captures.sort(
            (a, b) =>
                captureTimeValue(b) -
                captureTimeValue(a)
        );
    }

    for (
        const captures of
        byModel.values()
    ) {
        captures.sort(
            (a, b) =>
                captureTimeValue(b) -
                captureTimeValue(a)
        );
    }

    return {
        root,

        scannedJsonFiles:
            jsonFiles.length,

        parsedJsonFiles:
            parsedFiles,

        acceptedCaptures,

        byExactVersion,

        byModel,
    };
};

const chooseScreenCapture = (captures) => {
    if (!captures?.length) {
        return null;
    }

    const sorted =
        [...captures].sort(
            (a, b) =>
                captureTimeValue(b) -
                captureTimeValue(a)
        );

    return (
        sorted.find(
            (capture) =>
                hasValidCssGeometry(
                    capture
                ) &&
                hasPhysicalScreenInfo(
                    capture
                )
        ) ||
        sorted.find(
            hasValidCssGeometry
        ) ||
        sorted.find(
            hasPhysicalScreenInfo
        ) ||
        null
    );
};

const observedViewportsFromCaptures =
    (captures) => {
        const results = [];
        const seen = new Set();

        const sorted =
            [...(captures || [])]
                .sort(
                    (a, b) =>
                        captureTimeValue(b) -
                        captureTimeValue(a)
                );

        for (const capture of sorted) {
            if (
                !hasValidCssGeometry(
                    capture
                )
            ) {
                continue;
            }

            const orientation =
                capture.requestedOrientation ||
                capture.cssMediaOrientation ||
                capture.viewportAspectOrientation ||
                capture.browserOrientation ||
                "unknown";

            const innerWidth =
                capture
                    .innerViewport
                    .width;

            const innerHeight =
                capture
                    .innerViewport
                    .height;

            const key = [
                orientation,
                innerWidth,
                innerHeight,
                capture.browserName || "",
                capture.browserVersion || "",
                capture.cssMediaOrientation || "",
                capture.evidenceSource || "",
            ].join("|");

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            results.push({
                orientation,

                requestedOrientation:
                    capture.requestedOrientation ||
                    null,

                browserOrientation:
                    capture.browserOrientation ||
                    null,

                screenOrientation:
                    capture.screenOrientation ||
                    null,

                cssMediaOrientation:
                    capture.cssMediaOrientation ||
                    null,

                viewportAspectOrientation:
                    capture.viewportAspectOrientation ||
                    null,

                orientationMediaQueries:
                    capture.orientationMediaQueries ||
                    null,

                browserName:
                    capture.browserName ||
                    null,

                browserVersion:
                    capture.browserVersion ||
                    null,

                screen:
                    capture.screen,

                innerViewport:
                    capture.innerViewport,

                visualViewport:
                    capture.visualViewport ||
                    null,

                safeAreaInsets:
                    capture.safeAreaInsets ||
                    null,

                safeAreaMeasurement:
                    capture.safeAreaMeasurement ||
                    null,

                devicePixelRatio:
                    capture.devicePixelRatio ??
                    null,

                evidenceSource:
                    capture.evidenceSource ||
                    null,

                captureMethod:
                    capture.captureMethod ||
                    null,

                manualCertification:
                    capture.manualCertification ||
                    null,

                displayState:
                    capture.displayState ||
                    null,

                foldState:
                    capture.foldState ||
                    null,

                posture:
                    capture.posture ||
                    null,

                displayVerificationStatus:
                    capture.displayVerificationStatus ||
                    null,

                sourcePath:
                    capture.sourcePath,
            });
        }

        return results;
    };

// =======================================================
// INVENTORY BUILD
// =======================================================

const catalogManufacturer = (records) => {
    for (const record of records) {
        if (record.manufacturer) {
            return record.manufacturer;
        }

        const rawManufacturer =
            getFirstString(
                record.raw,
                [
                    "manufacturer",
                    "deviceManufacturer",
                    "device_manufacturer",
                    "brand",
                    "vendor",
                    "oem",
                ]
            );

        if (rawManufacturer) {
            return rawManufacturer;
        }
    }

    return null;
};

const catalogScreenInfo = (records) => {
    for (const record of records) {
        const screen =
            extractScreenInfoFromRaw(
                record.raw
            );

        if (screen) {
            return screen;
        }
    }

    return null;
};

const buildInventory = ({
    catalogs,
    cache,
    includeRawRecords,
}) => {
    const groups =
        new Map();

    for (const catalog of catalogs) {
        for (const record of catalog.records) {
            const key =
                makeModelKey(
                    record.platformName,
                    record.deviceName
                );

            if (!groups.has(key)) {
                groups.set(
                    key,
                    {
                        platformName:
                            record.platformName,

                        deviceName:
                            record.deviceName,

                        records:
                            [],

                        sourceCatalogs:
                            new Set(),
                    }
                );
            }

            const group =
                groups.get(key);

            group.records.push(
                record
            );

            group.sourceCatalogs.add(
                catalog.sourceUrl
            );
        }
    }

    const devices = [];

    for (const group of groups.values()) {
        const versions =
            [...new Set(
                group.records
                    .map(
                        (record) =>
                            record.platformVersion
                    )
                    .filter(Boolean)
            )]
                .sort(compareVersions)
                .reverse();

        if (!versions.length) {
            continue;
        }

        const latestOsVersion =
            versions[0];

        const latestRecords =
            group.records.filter(
                (record) =>
                    compareVersions(
                        record.platformVersion,
                        latestOsVersion
                    ) === 0
            );

        const exactCacheKey =
            makeCacheKey(
                group.platformName,
                group.deviceName,
                latestOsVersion
            );

        const modelCacheKey =
            makeModelKey(
                group.platformName,
                group.deviceName
            );

        const exactCaptures =
            cache
                ?.byExactVersion
                .get(exactCacheKey) ||
            [];

        const anyOsCaptures =
            cache
                ?.byModel
                .get(modelCacheKey) ||
            [];

        const exactScreenCapture =
            chooseScreenCapture(
                exactCaptures
            );

        const anyScreenCapture =
            chooseScreenCapture(
                anyOsCaptures
            );

        const cachedScreenCapture =
            exactScreenCapture ||
            anyScreenCapture;

        const fromCatalog =
            catalogScreenInfo(
                latestRecords
            );

        let screenInformation;

        if (fromCatalog) {
            screenInformation = {
                status:
                    "AVAILABLE",

                source:
                    "testmu-catalog",

                capturedPlatformVersion:
                    latestOsVersion,

                ...fromCatalog,

                viewportRect:
                    exactScreenCapture
                        ?.viewportRect ||
                    null,

                screen:
                    exactScreenCapture
                        ?.screen ||
                    null,

                devicePixelRatio:
                    exactScreenCapture
                        ?.devicePixelRatio ??
                    null,

                observedCssViewports:
                    observedViewportsFromCaptures(
                        exactCaptures
                    ),
            };
        } else if (
            cachedScreenCapture
        ) {
            screenInformation = {
                status:
                    exactScreenCapture
                        ? "AVAILABLE"
                        : "PHYSICAL_INFO_FROM_OTHER_OS",

                source:
                    exactScreenCapture
                        ? "real-device-qa-cache"
                        : "real-device-qa-cache-other-os",

                capturedPlatformVersion:
                    cachedScreenCapture
                        .platformVersion,

                deviceScreenSize:
                    cachedScreenCapture
                        .deviceScreenSize,

                deviceScreenDensity:
                    cachedScreenCapture
                        .deviceScreenDensity,

                pixelRatioCapability:
                    cachedScreenCapture
                        .pixelRatioCapability,

                viewportRect:
                    cachedScreenCapture
                        .viewportRect,

                screen:
                    cachedScreenCapture
                        .screen,

                devicePixelRatio:
                    cachedScreenCapture
                        .devicePixelRatio,

                observedCssViewports:
                    observedViewportsFromCaptures(
                        exactCaptures
                    ),

                sourcePath:
                    cachedScreenCapture
                        .sourcePath,
            };
        } else {
            screenInformation = {
                status:
                    "NEEDS_CAPABILITY_PROBE",

                source:
                    null,

                capturedPlatformVersion:
                    null,

                deviceScreenSize:
                    null,

                deviceScreenDensity:
                    null,

                pixelRatioCapability:
                    null,

                viewportRect:
                    null,

                screen:
                    null,

                devicePixelRatio:
                    null,

                observedCssViewports:
                    [],

                note:
                    "TestMu's device-list catalog did not expose screen data for this model and no prior validated real-device capture exists. Exact screen data must be obtained from a real-device session; it is intentionally not guessed.",
            };
        }

        const manufacturerFromCatalog =
            catalogManufacturer(
                latestRecords
            );

        const manufacturerFromCache =
            exactCaptures.find(
                (capture) =>
                    capture.manufacturer
            )
                ?.manufacturer ||
            anyOsCaptures.find(
                (capture) =>
                    capture.manufacturer
            )
                ?.manufacturer ||
            null;

        const inferredManufacturer =
            inferManufacturer(
                group.deviceName
            );

        const manufacturer =
            manufacturerFromCatalog ||
            manufacturerFromCache ||
            inferredManufacturer ||
            "Unknown";

        const manufacturerSource =
            manufacturerFromCatalog
                ? "testmu-catalog"
                : manufacturerFromCache
                    ? "real-device-qa-cache"
                    : inferredManufacturer
                        ? "derived-from-device-name"
                        : "unknown";

        const statuses =
            [...new Set(
                group.records
                    .map(
                        (record) =>
                            record.deviceStatus
                    )
                    .filter(Boolean)
            )]
                .sort();

        const deviceIds =
            [...new Set(
                latestRecords
                    .map(
                        (record) =>
                            record.deviceId
                    )
                    .filter(Boolean)
            )];

        const device = {
            platformName:
                prettyPlatform(
                    group.platformName
                ),

            platformKey:
                group.platformName,

            manufacturer,

            manufacturerSource,

            deviceName:
                group.deviceName,

            deviceTypeHint:
                inferDeviceType(
                    group.deviceName
                ),

            latestOsVersion,

            availableOsVersions:
                versions,

            latestOsPolicy:
                "latest-available-for-device",

            catalogDeviceStatuses:
                statuses,

            latestCatalogDeviceIds:
                deviceIds,

            sourceCatalogs:
                [
                    ...group.sourceCatalogs,
                ],

            screenInformation,
        };

        if (includeRawRecords) {
            device.latestCatalogRecords =
                latestRecords.map(
                    (record) => ({
                        deviceName:
                            record.deviceName,

                        platformName:
                            record.platformName,

                        platformVersion:
                            record.platformVersion,

                        deviceId:
                            record.deviceId,

                        deviceStatus:
                            record.deviceStatus,

                        manufacturer:
                            record.manufacturer,

                        raw:
                            record.raw,
                    })
                );
        }

        devices.push(device);
    }

    devices.sort(
        (a, b) => {
            const platformDelta =
                a.platformName
                    .localeCompare(
                        b.platformName
                    );

            if (platformDelta !== 0) {
                return platformDelta;
            }

            const manufacturerDelta =
                a.manufacturer
                    .localeCompare(
                        b.manufacturer
                    );

            if (
                manufacturerDelta !== 0
            ) {
                return manufacturerDelta;
            }

            return a.deviceName
                .localeCompare(
                    b.deviceName,
                    undefined,
                    {
                        numeric:
                            true,

                        sensitivity:
                            "base",
                    }
                );
        }
    );

    return devices;
};

// =======================================================
// OUTPUT FORMATTERS
// =======================================================

const csvEscape = (value) => {
    const text =
        value === null ||
        value === undefined
            ? ""
            : String(value);

    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
};

const firstObservedViewport = (
    device,
    orientation
) => {
    const capture =
        device
            .screenInformation
            .observedCssViewports
            .find(
                (item) =>
                    String(
                        item.orientation ||
                        ""
                    )
                        .toLowerCase()
                        .includes(
                            orientation
                        )
            );

    if (!capture?.innerViewport) {
        return "";
    }

    return (
        `${capture.innerViewport.width}` +
        `x${capture.innerViewport.height}`
    );
};

const buildCsv = (devices) => {
    const headers = [
        "platform",
        "manufacturer",
        "manufacturerSource",
        "deviceName",
        "deviceTypeHint",
        "latestOsVersion",
        "availableOsVersions",
        "screenInfoStatus",
        "screenInfoSource",
        "deviceScreenSize",
        "deviceScreenDensity",
        "pixelRatioCapability",
        "portraitInnerViewport",
        "landscapeInnerViewport",
        "catalogStatuses",
    ];

    const rows = [
        headers,
    ];

    for (const device of devices) {
        rows.push([
            device.platformName,
            device.manufacturer,
            device.manufacturerSource,
            device.deviceName,
            device.deviceTypeHint,
            device.latestOsVersion,
            device.availableOsVersions
                .join(" | "),
            device.screenInformation.status,
            device.screenInformation.source || "",
            device.screenInformation.deviceScreenSize || "",
            device.screenInformation.deviceScreenDensity ?? "",
            device.screenInformation.pixelRatioCapability || "",
            firstObservedViewport(
                device,
                "portrait"
            ),
            firstObservedViewport(
                device,
                "landscape"
            ),
            device.catalogDeviceStatuses
                .join(" | "),
        ]);
    }

    return (
        rows
            .map(
                (row) =>
                    row
                        .map(csvEscape)
                        .join(",")
            )
            .join("\n") +
        "\n"
    );
};

const buildMarkdown = (report) => {
    const lines = [];

    lines.push(
        "# TestMu Candidate Device Inventory"
    );

    lines.push("");

    lines.push(
        `Generated: ${report.generatedAt}`
    );

    lines.push(
        `Region: ${report.region}`
    );

    lines.push(
        `Platforms: ${report.platforms.join(", ")}`
    );

    lines.push(
        `Unique models: ${report.summary.uniqueModels}`
    );

    lines.push(
        `Models with screen data: ${report.summary.modelsWithScreenData}`
    );

    lines.push(
        `Models needing capability probe: ${report.summary.modelsNeedingCapabilityProbe}`
    );

    lines.push("");

    lines.push(
        "> Latest OS is selected independently for every model. Missing screen data is not guessed; invalid/incomplete capability probes are ignored."
    );

    lines.push("");

    const byPlatform =
        new Map();

    for (const device of report.devices) {
        if (
            !byPlatform.has(
                device.platformName
            )
        ) {
            byPlatform.set(
                device.platformName,
                new Map()
            );
        }

        const byManufacturer =
            byPlatform.get(
                device.platformName
            );

        if (
            !byManufacturer.has(
                device.manufacturer
            )
        ) {
            byManufacturer.set(
                device.manufacturer,
                []
            );
        }

        byManufacturer
            .get(device.manufacturer)
            .push(device);
    }

    for (
        const [
            platform,
            byManufacturer,
        ] of byPlatform.entries()
    ) {
        lines.push(
            `## ${platform}`
        );

        lines.push("");

        for (
            const [
                manufacturer,
                devices,
            ] of byManufacturer.entries()
        ) {
            lines.push(
                `### ${manufacturer}`
            );

            lines.push("");

            lines.push(
                "| Device | Latest OS | All catalog OS versions | Type | Screen | DPR/density | Observed CSS viewport(s) |"
            );

            lines.push(
                "| --- | --- | --- | --- | --- | --- | --- |"
            );

            for (const device of devices) {
                const screen =
                    device.screenInformation;

                const physical =
                    screen.deviceScreenSize ||
                    screen.status;

                const ratioDensity =
                    [
                        screen.pixelRatioCapability
                            ? `DPR ${screen.pixelRatioCapability}`
                            : null,

                        screen.deviceScreenDensity !==
                            null &&
                        screen.deviceScreenDensity !==
                            undefined
                            ? `${screen.deviceScreenDensity} dpi`
                            : null,
                    ]
                        .filter(Boolean)
                        .join(" / ") ||
                    "—";

                const observed =
                    screen
                        .observedCssViewports
                        .map(
                            (item) => {
                                const inner =
                                    item.innerViewport
                                        ? `${item.innerViewport.width}×${item.innerViewport.height}`
                                        : "unknown";

                                const css =
                                    item.cssMediaOrientation
                                        ? ` [CSS ${item.cssMediaOrientation}]`
                                        : "";

                                return (
                                    `${item.orientation}: ${inner}${css}`
                                );
                            }
                        )
                        .join("; ") ||
                    "—";

                lines.push(
                    `| ${device.deviceName} | ${device.latestOsVersion} | ${device.availableOsVersions.join(", ")} | ${device.deviceTypeHint} | ${physical} | ${ratioDensity} | ${observed} |`
                );
            }

            lines.push("");
        }
    }

    if (
        report
            .needsCapabilityProbe
            .length
    ) {
        lines.push(
            "## Models still needing exact TestMu screen capabilities"
        );

        lines.push("");

        lines.push(
            "These models are present in the TestMu catalog, but neither the catalog response nor the validated QA-results cache supplied exact usable screen/browser geometry."
        );

        lines.push("");

        for (
            const item of
            report.needsCapabilityProbe
        ) {
            lines.push(
                `- ${item.platformName} — ${item.manufacturer} ${item.deviceName} — latest OS ${item.latestOsVersion}`
            );
        }

        lines.push("");
    }

    return (
        lines.join("\n") +
        "\n"
    );
};

const makeTimestamp = () =>
    new Date()
        .toISOString()
        .replace(
            /[:.]/g,
            "-"
        );

// =======================================================
// MAIN
// =======================================================

(async () => {
    try {
        const args =
            parseArgs(
                process.argv.slice(2)
            );

        requireCredentials();

        const requestedPlatforms =
            args.platform === "all"
                ? [
                    "android",
                    "ios",
                ]
                : [
                    args.platform,
                ];

        fs.mkdirSync(
            args.outputDir,
            {
                recursive:
                    true,
            }
        );

        console.log("");

        console.log(
            "TESTMU CANDIDATE DEVICE INVENTORY"
        );

        console.log(
            "====================================================================="
        );

        console.log(
            `Region:     ${args.region}`
        );

        console.log(
            `Platforms:  ${requestedPlatforms.join(", ")}`
        );

        console.log(
            `QA cache:   ${args.useCache ? "enabled" : "disabled"}`
        );

        console.log(
            "====================================================================="
        );

        const catalogs = [];
        const catalogErrors = [];

        for (
            const platform of
            requestedPlatforms
        ) {
            console.log("");

            console.log(
                `Fetching TestMu ${platform.toUpperCase()} real-device catalog...`
            );

            try {
                const catalog =
                    await fetchPlatformCatalog(
                        platform,
                        args.region
                    );

                catalogs.push(
                    catalog
                );

                console.log(
                    `  ${catalog.recordCount} device/version record(s) from ${new URL(catalog.sourceUrl).hostname}`
                );

                const rawPath =
                    path.join(
                        args.outputDir,
                        `TESTMU__raw-catalog__${platform}__${args.region}.json`
                    );

                fs.writeFileSync(
                    rawPath,
                    JSON.stringify(
                        {
                            fetchedAt:
                                catalog.fetchedAt,

                            region:
                                catalog.region,

                            platform,

                            sourceUrl:
                                catalog.sourceUrl,

                            payload:
                                catalog.payload,
                        },
                        null,
                        2
                    ),
                    "utf8"
                );
            } catch (error) {
                catalogErrors.push({
                    platform,

                    error:
                        error.message,
                });

                console.error(
                    `  FAILED: ${error.message}`
                );
            }
        }

        if (!catalogs.length) {
            throw new Error(
                "No TestMu platform catalog could be loaded; inventory cannot be generated."
            );
        }

        let cache = {
            root:
                DEFAULT_QA_RESULTS_ROOT,

            scannedJsonFiles:
                0,

            parsedJsonFiles:
                0,

            acceptedCaptures:
                0,

            byExactVersion:
                new Map(),

            byModel:
                new Map(),
        };

        if (args.useCache) {
            console.log("");

            console.log(
                "Scanning existing TestMu QA JSONs for resolved screen capabilities..."
            );

            cache =
                loadExistingCapabilityCache(
                    DEFAULT_QA_RESULTS_ROOT
                );

            console.log(
                `  Scanned ${cache.scannedJsonFiles} JSON file(s); parsed ${cache.parsedJsonFiles}; ` +
                `accepted ${cache.acceptedCaptures} usable capability/geometry capture(s).`
            );
        }

        const devices =
            buildInventory({
                catalogs,
                cache,
                includeRawRecords:
                    args.includeRawRecords,
            });

        const modelsWithScreenData =
            devices.filter(
                (device) =>
                    device
                        .screenInformation
                        .status !==
                    "NEEDS_CAPABILITY_PROBE"
            ).length;

        const needsCapabilityProbe =
            devices
                .filter(
                    (device) =>
                        device
                            .screenInformation
                            .status ===
                        "NEEDS_CAPABILITY_PROBE"
                )
                .map(
                    (device) => ({
                        platformName:
                            device.platformName,

                        manufacturer:
                            device.manufacturer,

                        deviceName:
                            device.deviceName,

                        latestOsVersion:
                            device.latestOsVersion,

                        deviceTypeHint:
                            device.deviceTypeHint,
                    })
                );

        const report = {
            artifactType:
                "testmu-candidate-device-inventory",

            generatedAt:
                new Date()
                    .toISOString(),

            region:
                args.region,

            platforms:
                catalogs.map(
                    (catalog) =>
                        prettyPlatform(
                            catalog.platform
                        )
                ),

            policy: {
                osSelection:
                    "latest-available-for-device",

                screenData:
                    "catalog-first, then validated real-device QA cache; capability-probe entries must contain real screen + inner viewport geometry; never guessed",

                manufacturer:
                    "catalog-first, then real-device QA cache, then clearly marked device-name derivation",
            },

            sources:
                catalogs.map(
                    (catalog) => ({
                        platform:
                            prettyPlatform(
                                catalog.platform
                            ),

                        sourceUrl:
                            catalog.sourceUrl,

                        fetchedAt:
                            catalog.fetchedAt,

                        catalogRecordCount:
                            catalog.recordCount,
                    })
                ),

            catalogErrors,

            cache: {
                enabled:
                    args.useCache,

                root:
                    cache.root,

                scannedJsonFiles:
                    cache.scannedJsonFiles,

                parsedJsonFiles:
                    cache.parsedJsonFiles,

                acceptedCaptures:
                    cache.acceptedCaptures,
            },

            summary: {
                catalogRecordCount:
                    catalogs.reduce(
                        (
                            total,
                            catalog
                        ) =>
                            total +
                            catalog.recordCount,
                        0
                    ),

                uniqueModels:
                    devices.length,

                androidModels:
                    devices.filter(
                        (device) =>
                            device.platformKey ===
                            "android"
                    ).length,

                iosModels:
                    devices.filter(
                        (device) =>
                            device.platformKey ===
                            "ios"
                    ).length,

                modelsWithScreenData,

                modelsNeedingCapabilityProbe:
                    needsCapabilityProbe.length,
            },

            devices,

            needsCapabilityProbe,
        };

        const stamp =
            makeTimestamp();

        const baseName =
            `TESTMU__candidate-device-inventory__${args.region}`;

        const jsonPath =
            path.join(
                args.outputDir,
                `${baseName}__${stamp}.json`
            );

        const latestJsonPath =
            path.join(
                args.outputDir,
                `${baseName}__latest.json`
            );

        const csvPath =
            path.join(
                args.outputDir,
                `${baseName}__${stamp}.csv`
            );

        const latestCsvPath =
            path.join(
                args.outputDir,
                `${baseName}__latest.csv`
            );

        const markdownPath =
            path.join(
                args.outputDir,
                `${baseName}__${stamp}.md`
            );

        const latestMarkdownPath =
            path.join(
                args.outputDir,
                `${baseName}__latest.md`
            );

        const jsonText =
            JSON.stringify(
                report,
                null,
                2
            );

        const csvText =
            buildCsv(
                devices
            );

        const markdownText =
            buildMarkdown(
                report
            );

        for (
            const outputPath of
            [
                jsonPath,
                latestJsonPath,
            ]
        ) {
            fs.writeFileSync(
                outputPath,
                jsonText,
                "utf8"
            );
        }

        for (
            const outputPath of
            [
                csvPath,
                latestCsvPath,
            ]
        ) {
            fs.writeFileSync(
                outputPath,
                csvText,
                "utf8"
            );
        }

        for (
            const outputPath of
            [
                markdownPath,
                latestMarkdownPath,
            ]
        ) {
            fs.writeFileSync(
                outputPath,
                markdownText,
                "utf8"
            );
        }

        console.log("");

        console.log(
            "INVENTORY SUMMARY"
        );

        console.log(
            "====================================================================="
        );

        console.log(
            `Catalog records:                ${report.summary.catalogRecordCount}`
        );

        console.log(
            `Unique device models:           ${report.summary.uniqueModels}`
        );

        console.log(
            `Android models:                 ${report.summary.androidModels}`
        );

        console.log(
            `iOS models:                     ${report.summary.iosModels}`
        );

        console.log(
            `Models with screen data:        ${report.summary.modelsWithScreenData}`
        );

        console.log(
            `Models needing screen probe:    ${report.summary.modelsNeedingCapabilityProbe}`
        );

        console.log(
            "====================================================================="
        );

        console.log("");

        console.log(
            "Saved candidate inventory:"
        );

        console.log(
            `JSON: ${jsonPath}`
        );

        console.log(
            `CSV:  ${csvPath}`
        );

        console.log(
            `MD:   ${markdownPath}`
        );

        console.log("");

        console.log(
            "Latest aliases:"
        );

        console.log(
            `JSON: ${latestJsonPath}`
        );

        console.log(
            `CSV:  ${latestCsvPath}`
        );

        console.log(
            `MD:   ${latestMarkdownPath}`
        );

        console.log("");

        if (
            needsCapabilityProbe.length
        ) {
            console.log(
                "NOTE: TestMu's catalog does not expose complete screen capabilities for every model."
            );

            console.log(
                "Models without validated real-device geometry remain NEEDS_CAPABILITY_PROBE."
            );

            console.log(
                "Old incomplete/false-positive probe JSONs are intentionally ignored."
            );
        }

        if (catalogErrors.length) {
            process.exitCode =
                1;
        }
    } catch (error) {
        console.error("");

        console.error(
            "DEVICE INVENTORY GENERATION FAILED"
        );

        console.error(error);

        process.exitCode =
            2;
    }
})();