const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
    resolveReleaseYear,
} = require("./testmu-device-years.cjs");

const {
    foldablePolicyFor,
    registryStateMatchesDisplayPolicy,
} = require("./testmu-foldable-policy.cjs");

/*
  TestMu 2020+ discovery-universe generator.

  PURPOSE
  -------
  Discovery is intentionally BROAD. Every TestMu automation device that is
  confidently known to be from the configured release-year cutoff (2020 by
  default) or newer belongs in the discovery universe.

  This is different from the later FAST REGRESSION MATRIX. We first measure and
  certify broad hardware/browser geometry. After that, exact/nearby geometry
  families can be used to reduce repeated regression cost without pretending
  that untested devices were covered.

  IMPORTANT
  ---------
  - No 20-25 device ceiling.
  - No category filler logic.
  - No device is removed merely because another device probably has similar
    geometry.
  - Unknown release years go to UNKNOWN_YEAR_REVIEW instead of being guessed.
  - The probe runner controls per-run cost with --max-devices=N.
*/

const REGION =
    process.env.QA_TESTMU_REGION ||
    process.env.LT_REGION ||
    "us";

const rawArgs = Object.fromEntries(
    process.argv.slice(2).map((token) => {
        const [key, ...rest] = token
            .replace(/^--/, "")
            .split("=");

        return [
            key,
            rest.join("=") || true,
        ];
    })
);

const args = {
    sinceYear: Number(
        rawArgs["since-year"] ||
        process.env.QA_DEVICE_SINCE_YEAR ||
        2020
    ),

    includeUnknownYear: Boolean(
        rawArgs["include-unknown-year"]
    ),

    input: path.resolve(
        rawArgs.input ||
        path.join(
            "qa-results",
            "testmu",
            "catalog",
            `TESTMU__candidate-device-inventory__${REGION}__latest.json`
        )
    ),

    registry: path.resolve(
        rawArgs.registry ||
        path.join(
            "qa-results",
            "testmu",
            "catalog",
            `TESTMU__geometry-registry__${REGION}__latest.json`
        )
    ),

    outDir: path.resolve(
        rawArgs["output-dir"] ||
        path.join(
            "qa-results",
            "testmu",
            "catalog"
        )
    ),

    refreshCatalog:
        !rawArgs.input &&
        !rawArgs["skip-catalog-refresh"],

    refreshRegistry:
        !rawArgs["skip-registry-refresh"],
};

if (
    !Number.isInteger(args.sinceYear) ||
    args.sinceYear < 2000 ||
    args.sinceYear > new Date().getUTCFullYear() + 1
) {
    throw new Error(
        "--since-year must be a valid release year."
    );
}

if (rawArgs.target || rawArgs.min) {
    console.warn(
        "NOTE: --target/--min are ignored by the 2020+ discovery-universe generator. " +
        "Use probe-device-coverage-set.cjs --max-devices=N to control batch size."
    );
}

// =======================================================
// REFRESH LIVE CATALOG + HISTORICAL REGISTRY
// =======================================================

const runNodeScript = (
    relativePath,
    scriptArgs,
    label
) => {
    const script = path.join(
        process.cwd(),
        ...relativePath
    );

    if (!fs.existsSync(script)) {
        throw new Error(
            `Missing ${label}: ${script}`
        );
    }

    console.log("");
    console.log(label);

    const result = spawnSync(
        process.execPath,
        [script, ...scriptArgs],
        {
            cwd: process.cwd(),
            env: process.env,
            stdio: "inherit",
        }
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(
            `${label} exited ${result.status}`
        );
    }
};

if (args.refreshCatalog) {
    runNodeScript(
        [
            "qa",
            "testmu",
            "appium",
            "generate-testmu-device-inventory.cjs",
        ],
        [],
        "Refreshing TestMu automation catalog before discovery selection..."
    );
}

if (args.refreshRegistry) {
    runNodeScript(
        [
            "qa",
            "testmu",
            "appium",
            "generate-geometry-registry.cjs",
        ],
        [`--region=${REGION}`],
        "Refreshing persistent historical geometry registry..."
    );
}

// =======================================================
// HELPERS
// =======================================================

const readJson = (filePath) =>
    JSON.parse(
        fs.readFileSync(filePath, "utf8")
    );

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

const normalizeVersion = (value) => {
    const match = String(value || "")
        .match(/\d+(?:\.\d+)*/);

    if (!match) {
        return null;
    }

    const parts = match[0].split(".");

    while (
        parts.length > 1 &&
        Number(parts[parts.length - 1]) === 0
    ) {
        parts.pop();
    }

    return parts.join(".");
};

const compareVersions = (a, b) => {
    const left = String(normalizeVersion(a) || 0)
        .split(".")
        .map(Number);

    const right = String(normalizeVersion(b) || 0)
        .split(".")
        .map(Number);

    const length = Math.max(
        left.length,
        right.length
    );

    for (let index = 0; index < length; index += 1) {
        const difference =
            (left[index] || 0) -
            (right[index] || 0);

        if (difference) {
            return difference;
        }
    }

    return 0;
};

const numberFrom = (value, regex) => {
    const match = String(value || "")
        .match(regex);

    return match
        ? Number(match[1])
        : null;
};

const timestamp = () =>
    new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

const primaryBrowserFor = (platformName) =>
    normalizePlatform(platformName) === "ios"
        ? "Safari"
        : "Chrome";

const currentDeviceKey = (platformName, deviceName) => [
    normalizePlatform(platformName),
    normalizeName(deviceName),
].join("|");

// =======================================================
// DEVICE TRAITS
// =======================================================

function traits(device) {
    const name = device.deviceName;
    const platform = device.platformName;
    const manufacturer = String(
        device.manufacturer || ""
    ).toLowerCase();
    const type = device.deviceTypeHint || "phone";

    const result = {
        family: "other",
        variant: "standard",
        generation: null,
    };

    if (
        platform === "iOS" &&
        /^iPhone\b/i.test(name)
    ) {
        result.family = "iphone";
        result.generation = numberFrom(
            name,
            /^iPhone\s+(\d+)/i
        );
        result.variant =
            /pro max/i.test(name)
                ? "pro-max"
                : /\bpro\b/i.test(name)
                    ? "pro"
                    : /\bplus\b/i.test(name)
                        ? "plus"
                        : /\bmini\b/i.test(name)
                            ? "mini"
                            : /\bse\b/i.test(name)
                                ? "se"
                                : /\bair\b/i.test(name)
                                    ? "air"
                                    : "standard";

        return result;
    }

    if (
        platform === "iOS" &&
        /^iPad\b/i.test(name)
    ) {
        result.family = "ipad";
        result.variant =
            /\bmini\b/i.test(name)
                ? "mini"
                : /\bpro\b/i.test(name) && /(13|12\.9)/.test(name)
                    ? "pro-large"
                    : /\bpro\b/i.test(name)
                        ? "pro"
                        : /\bair\b/i.test(name)
                            ? "air"
                            : "standard";

        return result;
    }

    if (
        manufacturer === "samsung" &&
        /^Galaxy S\d+/i.test(name)
    ) {
        result.family = "galaxy-s";
        result.generation = numberFrom(
            name,
            /^Galaxy S(\d+)/i
        );
        result.variant =
            /ultra/i.test(name)
                ? "ultra"
                : /\+|\bplus\b/i.test(name)
                    ? "plus"
                    : "standard";

        return result;
    }

    if (
        manufacturer === "samsung" &&
        /Galaxy Z/i.test(name)
    ) {
        result.family = "galaxy-z";
        result.generation = numberFrom(
            name,
            /(?:Fold|Flip)(\d+)/i
        );
        result.variant =
            /flip/i.test(name)
                ? "flip"
                : /ultra/i.test(name)
                    ? "fold-ultra"
                    : "fold";

        return result;
    }

    if (
        manufacturer === "samsung" &&
        type === "tablet"
    ) {
        result.family = "galaxy-tab";
        return result;
    }

    if (
        manufacturer === "google" &&
        /^Pixel\b/i.test(name)
    ) {
        result.family = /tablet/i.test(name)
            ? "pixel-tablet"
            : "pixel";
        result.generation = numberFrom(
            name,
            /^Pixel\s+(\d+)/i
        );
        result.variant =
            /fold/i.test(name)
                ? "fold"
                : /pro xl/i.test(name)
                    ? "pro-xl"
                    : /\bpro\b/i.test(name)
                        ? "pro"
                        : /\bxl\b/i.test(name)
                            ? "xl"
                            : "standard";

        return result;
    }

    if (type === "foldable") {
        result.family = "foldable";
        result.variant = /flip|razr/i.test(name)
            ? "flip"
            : "fold";
        return result;
    }

    if (type === "tablet") {
        result.family = "tablet";
    }

    return result;
}

// =======================================================
// LOAD LIVE INVENTORY + HISTORICAL REGISTRY
// =======================================================

if (!fs.existsSync(args.input)) {
    throw new Error(
        `Missing inventory: ${args.input}\n` +
        "Run generate-testmu-device-inventory.cjs first."
    );
}

const inventory = readJson(args.input);
const registry = fs.existsSync(args.registry)
    ? readJson(args.registry)
    : {
        generatedAt: null,
        devices: [],
        captures: [],
    };

const inventoryDevices = inventory.devices || [];
const registryDevices = registry.devices || [];

const loadHistoricalCoverageCandidates = () => {
    if (!fs.existsSync(args.outDir)) {
        return [];
    }

    const prefix =
        `TESTMU__candidate-coverage-set__${REGION}__`;

    const snapshots = [];

    for (const fileName of fs.readdirSync(args.outDir)) {
        if (
            !fileName.startsWith(prefix) ||
            !fileName.endsWith(".json") ||
            fileName.endsWith("__latest.json")
        ) {
            continue;
        }

        const filePath = path.join(
            args.outDir,
            fileName
        );

        try {
            const report = readJson(filePath);

            if (
                report?.artifactType !==
                    "testmu-device-discovery-universe" ||
                !Array.isArray(report?.candidates)
            ) {
                continue;
            }

            const seenAt =
                report.generatedAt ||
                fs.statSync(filePath).mtime.toISOString();

            for (const candidate of report.candidates) {
                if (
                    !candidate?.deviceName ||
                    !candidate?.platformName
                ) {
                    continue;
                }

                snapshots.push({
                    candidate,
                    seenAt,
                    sourcePath: filePath,
                });
            }
        } catch {
            // Historical discovery reports are audit input only.
            // A malformed/stale report must not block current discovery.
        }
    }

    return snapshots;
};

const historicalCoverageCandidates =
    loadHistoricalCoverageCandidates();

const registryByDevice = new Map(
    registryDevices.map((device) => [
        currentDeviceKey(
            device.platformName,
            device.deviceName
        ),
        device,
    ])
);

// =======================================================
// MEASUREMENT STATUS
// =======================================================

const hasValidViewport = (state) =>
    Number(state?.innerViewport?.width) > 0 &&
    Number(state?.innerViewport?.height) > 0;

const isManualEvidenceState = (state) =>
    state?.evidenceSource === "testmu-manual-real-device" ||
    state?.artifactType === "testmu-manual-real-device-evidence";

const evidenceApprovedForCoverage = (state) =>
    !isManualEvidenceState(state) ||
    (
        state?.manualCertification?.approvedForPrimaryDiscovery === true &&
        state?.manualCertification?.automationDerived !== true &&
        state?.manualCertification?.appiumDerived !== true
    );

const hasValidSafeAreaMeasurement = (state) => {
    const insets = state?.safeAreaInsets;

    return (
        state?.safeAreaMeasurement?.measured === true &&
        state?.safeAreaMeasurement?.viewportFitCover === true &&
        ["top", "right", "bottom", "left"].every((edge) => {
            const value = Number(insets?.[edge]);

            return Number.isFinite(value) && value >= 0;
        })
    );
};

const requiresSafeAreaMeasurement = (
    device,
    browserName
) => {
    const platform = normalizePlatform(
        device.platformName
    );
    const browser = normalizeName(browserName);

    return (
        (platform === "ios" && browser === "safari") ||
        (platform === "android" && browser === "chrome")
    );
};

const inventoryHasExactOrientation = (
    device,
    browserName,
    orientation,
    foldablePolicy = null,
    requireSafeArea = true
) => {
    // Legacy inventory states do not carry verified foldable display/posture
    // metadata. Never use them to certify a posture-sensitive device.
    if (foldablePolicy) {
        return false;
    }

    const screen = device.screenInformation;

    if (
        screen?.status !== "AVAILABLE" ||
        compareVersions(
            screen?.capturedPlatformVersion,
            device.latestOsVersion
        ) !== 0
    ) {
        return false;
    }

    return (
        screen.observedCssViewports || []
    ).some((capture) => {
        const captureOrientation = String(
            capture.requestedOrientation ||
            capture.orientation ||
            ""
        ).toLowerCase();

        const browserMatches =
            !capture.browserName ||
            normalizeName(capture.browserName) ===
                normalizeName(browserName);

        const safeAreaMatches =
            !requireSafeArea ||
            !requiresSafeAreaMeasurement(
                device,
                browserName
            ) ||
            hasValidSafeAreaMeasurement(capture);

        return (
            evidenceApprovedForCoverage(capture) &&
            captureOrientation === orientation &&
            browserMatches &&
            hasValidViewport(capture) &&
            safeAreaMatches
        );
    });
};

const registryStatesFor = (device) => {
    const record = registryByDevice.get(
        currentDeviceKey(
            device.platformName,
            device.deviceName
        )
    );

    return record?.states || [];
};

const stateIsAtOrAboveCatalogOs = (device, state) =>
    compareVersions(
        state?.platformVersion,
        device.latestOsVersion
    ) >= 0;

const highestVersion = (versions) =>
    versions
        .map(normalizeVersion)
        .filter(Boolean)
        .reduce(
            (highest, version) =>
                !highest || compareVersions(version, highest) > 0
                    ? version
                    : highest,
            null
        );

const highestMeasuredPrimaryBrowserOsFor = (
    device,
    browserName
) =>
    highestVersion(
        registryStatesFor(device)
            .filter((state) =>
                evidenceApprovedForCoverage(state) &&
                normalizeName(state.browserName) ===
                    normalizeName(browserName) &&
                hasValidViewport(state)
            )
            .map((state) => state.platformVersion)
    );

const registryHasExactOrientation = (
    device,
    browserName,
    orientation,
    foldablePolicy = null,
    requireSafeArea = true
) =>
    registryStatesFor(device)
        .some((state) =>
            evidenceApprovedForCoverage(state) &&
            compareVersions(
                state.platformVersion,
                device.latestOsVersion
            ) === 0 &&
            normalizeName(state.browserName) ===
                normalizeName(browserName) &&
            String(
                state.requestedOrientation || ""
            ).toLowerCase() === orientation &&
            hasValidViewport(state) &&
            (
                !requireSafeArea ||
                !requiresSafeAreaMeasurement(
                    device,
                    browserName
                ) ||
                hasValidSafeAreaMeasurement(state)
            ) &&
            registryStateMatchesDisplayPolicy(
                foldablePolicy,
                state
            )
        );

const registryHasCurrentOrNewerOrientation = (
    device,
    browserName,
    orientation,
    foldablePolicy = null,
    requireSafeArea = true
) =>
    registryStatesFor(device)
        .some((state) =>
            evidenceApprovedForCoverage(state) &&
            stateIsAtOrAboveCatalogOs(device, state) &&
            normalizeName(state.browserName) ===
                normalizeName(browserName) &&
            String(
                state.requestedOrientation || ""
            ).toLowerCase() === orientation &&
            hasValidViewport(state) &&
            (
                !requireSafeArea ||
                !requiresSafeAreaMeasurement(
                    device,
                    browserName
                ) ||
                hasValidSafeAreaMeasurement(state)
            ) &&
            registryStateMatchesDisplayPolicy(
                foldablePolicy,
                state
            )
        );

const hasCurrentOrientation = (
    device,
    browserName,
    orientation,
    foldablePolicy = null
) =>
    registryHasCurrentOrNewerOrientation(
        device,
        browserName,
        orientation,
        foldablePolicy
    ) ||
    inventoryHasExactOrientation(
        device,
        browserName,
        orientation,
        foldablePolicy
    );

const hasCurrentOrientationGeometryOnly = (
    device,
    browserName,
    orientation,
    foldablePolicy = null
) =>
    registryHasCurrentOrNewerOrientation(
        device,
        browserName,
        orientation,
        foldablePolicy,
        false
    ) ||
    inventoryHasExactOrientation(
        device,
        browserName,
        orientation,
        foldablePolicy,
        false
    );

const hasExactCurrentOrientation = (
    device,
    browserName,
    orientation,
    foldablePolicy = null
) =>
    registryHasExactOrientation(
        device,
        browserName,
        orientation,
        foldablePolicy
    ) ||
    inventoryHasExactOrientation(
        device,
        browserName,
        orientation,
        foldablePolicy
    );

const requiredOrientationsFor = (
    device,
    foldablePolicy = null
) => {
    if (
        foldablePolicy &&
        !foldablePolicy.allowNormalOrientationProbe
    ) {
        return [];
    }

    const browserName = primaryBrowserFor(
        device.platformName
    );

    return [
        "portrait",
        "landscape",
    ].filter((orientation) =>
        !hasCurrentOrientation(
            device,
            browserName,
            orientation,
            foldablePolicy
        )
    );
};

const postureRequirementsFor = (
    device,
    foldablePolicy
) => {
    if (
        !foldablePolicy ||
        foldablePolicy.allowNormalOrientationProbe
    ) {
        return [];
    }

    const browserName = primaryBrowserFor(
        device.platformName
    );
    const states = registryStatesFor(device);

    return foldablePolicy.requiredDisplayStates
        .map((displayState) => {
            const missingOrientations =
                foldablePolicy.orientationsPerRequiredDisplay
                    .filter((orientation) =>
                        !states.some((state) =>
                            evidenceApprovedForCoverage(state) &&
                            stateIsAtOrAboveCatalogOs(
                                device,
                                state
                            ) &&
                            normalizeName(state.browserName) ===
                                normalizeName(browserName) &&
                            state.displayState === displayState &&
                            String(
                                state.requestedOrientation || ""
                            ).toLowerCase() === orientation &&
                            hasValidViewport(state)
                        )
                    );

            return {
                displayState,
                missingOrientations,
            };
        })
        .filter((item) =>
            item.missingOrientations.length > 0
        );
};

const manualCertificationFor = (
    device,
    browserName
) => {
    const states = registryStatesFor(device)
        .filter((state) =>
            isManualEvidenceState(state) &&
            evidenceApprovedForCoverage(state) &&
            stateIsAtOrAboveCatalogOs(device, state) &&
            normalizeName(state.browserName) ===
                normalizeName(browserName) &&
            hasValidViewport(state)
        );

    const orientations = [...new Set(
        states
            .map((state) =>
                String(state.requestedOrientation || "").toLowerCase()
            )
            .filter((orientation) =>
                orientation === "portrait" || orientation === "landscape"
            )
    )].sort();

    return {
        hasApprovedManualEvidence: states.length > 0,
        approvedStateCount: states.length,
        orientations,
        coversPortraitAndLandscape:
            orientations.includes("portrait") &&
            orientations.includes("landscape"),
        captureMethods: [...new Set(
            states.map((state) => state.captureMethod).filter(Boolean)
        )],
        automationIssues: [...new Set(
            states
                .map((state) => state.manualCertification?.automationIssue)
                .filter(Boolean)
        )],
        automationProvisioningStatuses: [...new Set(
            states
                .map((state) =>
                    state.manualCertification?.automationProvisioningStatus
                )
                .filter(Boolean)
        )],
        sourcePaths: states.map((state) => state.sourcePath).filter(Boolean),
    };
};

const coverageStateFor = (
    device,
    requiredOrientations,
    foldablePolicy = null,
    postureRequirements = []
) => {
    if (postureRequirements.length) {
        return "POSTURE_DISCOVERY_REQUIRED";
    }

    const primaryBrowser = primaryBrowserFor(
        device.platformName
    );

    if (!requiredOrientations.length) {
        const exactCurrentComplete = [
            "portrait",
            "landscape",
        ].every((orientation) =>
            hasExactCurrentOrientation(
                device,
                primaryBrowser,
                orientation,
                foldablePolicy
            )
        );

        return exactCurrentComplete
            ? "COMPLETE_CURRENT_OS"
            : "COMPLETE_NEWER_OS_THAN_CATALOG";
    }

    if (
        requiresSafeAreaMeasurement(
            device,
            primaryBrowser
        ) &&
        requiredOrientations.every((orientation) =>
            hasCurrentOrientationGeometryOnly(
                device,
                primaryBrowser,
                orientation,
                foldablePolicy
            )
        )
    ) {
        return "SAFE_AREA_BACKFILL";
    }

    if (
        requiredOrientations.length === 1 &&
        requiredOrientations[0] === "portrait"
    ) {
        return "MISSING_PORTRAIT";
    }

    if (
        requiredOrientations.length === 1 &&
        requiredOrientations[0] === "landscape"
    ) {
        return "MISSING_LANDSCAPE";
    }

    const history = registryStatesFor(device);

    if (!history.length) {
        return "UNMEASURED";
    }

    const sameOs = history.filter((state) =>
        compareVersions(
            state.platformVersion,
            device.latestOsVersion
        ) === 0
    );

    if (
        sameOs.some((state) =>
            normalizeName(state.browserName) !==
                normalizeName(primaryBrowser)
        )
    ) {
        return "PRIMARY_BROWSER_UNMEASURED_CURRENT_OS";
    }

    return "OTHER_OS_ONLY";
};

const priorityFor = (candidate) => {
    const state = candidate.discoveryStatus;

    if (state === "POSTURE_DISCOVERY_REQUIRED") {
        return 0;
    }

    if (
        state === "MISSING_PORTRAIT" ||
        state === "MISSING_LANDSCAPE" ||
        state === "SAFE_AREA_BACKFILL"
    ) {
        return 1;
    }

    if (
        candidate.deviceType === "foldable" ||
        candidate.deviceType === "tablet"
    ) {
        return 2;
    }

    if (state === "OTHER_OS_ONLY") {
        return 3;
    }

    if (
        state === "PRIMARY_BROWSER_UNMEASURED_CURRENT_OS"
    ) {
        return 4;
    }

    if (state === "UNMEASURED") {
        return 5;
    }

    return 9;
};

// =======================================================
// BUILD 2020+ DISCOVERY UNIVERSE
// =======================================================

const candidates = [];
const unknownYearReview = [];
const preCutoffExcluded = [];

for (const device of inventoryDevices) {
    const release = resolveReleaseYear(
        device.deviceName
    );

    if (release.year === null) {
        const review = {
            deviceName: device.deviceName,
            manufacturer: device.manufacturer,
            platformName: device.platformName,
            latestOsVersion: device.latestOsVersion,
            deviceType: device.deviceTypeHint,
            reason:
                "Release year could not be inferred safely. Add an explicit override in testmu-device-years.cjs before automatic discovery, or use --include-unknown-year intentionally.",
        };

        unknownYearReview.push(review);

        if (!args.includeUnknownYear) {
            continue;
        }
    }

    if (
        release.year !== null &&
        release.year < args.sinceYear
    ) {
        preCutoffExcluded.push({
            deviceName: device.deviceName,
            manufacturer: device.manufacturer,
            platformName: device.platformName,
            latestOsVersion: device.latestOsVersion,
            releaseYear: release.year,
            releaseYearSource: release.source,
        });
        continue;
    }

    const deviceTraits = traits(device);
    const foldablePolicy = foldablePolicyFor(
        device,
        deviceTraits
    );

    const requiredOrientations =
        requiredOrientationsFor(
            device,
            foldablePolicy
        );

    const postureRequirements =
        postureRequirementsFor(
            device,
            foldablePolicy
        );

    const discoveryStatus = coverageStateFor(
        device,
        requiredOrientations,
        foldablePolicy,
        postureRequirements
    );

    const primaryBrowser = primaryBrowserFor(
        device.platformName
    );
    const highestMeasuredPrimaryBrowserOs =
        highestMeasuredPrimaryBrowserOsFor(
            device,
            primaryBrowser
        );
    const catalogVsHighestMeasured =
        highestMeasuredPrimaryBrowserOs
            ? compareVersions(
                device.latestOsVersion,
                highestMeasuredPrimaryBrowserOs
            )
            : null;

    const manualCertification =
        manualCertificationFor(
            device,
            primaryBrowser
        );

    const candidate = {
        selectionRank: null,
        selectionBucket: "discovery-universe-2020-plus",
        selectionReason:
            `All TestMu automation devices from ${args.sinceYear}+ are measured once before geometry deduplication.`,

        deviceName: device.deviceName,
        manufacturer: device.manufacturer,
        platformName: device.platformName,
        platformKey: device.platformKey,
        latestOsVersion: device.latestOsVersion,
        availableOsVersions: device.availableOsVersions,

        osCoverage: {
            catalogOsVersion: device.latestOsVersion,
            highestMeasuredPrimaryBrowserOs,
            relation:
                catalogVsHighestMeasured === null
                    ? "NO_PRIMARY_BROWSER_MEASUREMENT"
                    : catalogVsHighestMeasured < 0
                        ? "CURRENT_CATALOG_OLDER_THAN_MEASURED"
                        : catalogVsHighestMeasured > 0
                            ? "CURRENT_CATALOG_NEWER_THAN_MEASURED"
                            : "CURRENT_CATALOG_MATCHES_HIGHEST_MEASURED",
            downgradeCoveredWithoutReprobe:
                discoveryStatus ===
                    "COMPLETE_NEWER_OS_THAN_CATALOG",
        },

        releaseYear: release.year,
        releaseYearSource: release.source,
        releaseYearConfidence: release.confidence,

        deviceType: device.deviceTypeHint,
        family: deviceTraits.family,
        variant: deviceTraits.variant,
        generation: deviceTraits.generation,

        discoveryStatus,
        manualCertification,
        screenInformation: device.screenInformation,

        probe: {
            required:
                requiredOrientations.length > 0 &&
                !(
                    foldablePolicy &&
                    !foldablePolicy.allowNormalOrientationProbe
                ),
            requiredOrientations,
            primaryBrowser,
            safeAreaRequired:
                requiresSafeAreaMeasurement(
                    device,
                    primaryBrowser
                ),
            displayScope:
                foldablePolicy?.formFactor === "flip"
                    ? "unfolded-main-display"
                    : "standard-main-display",
        },

        postureProbe: foldablePolicy &&
            !foldablePolicy.allowNormalOrientationProbe
            ? {
                required: postureRequirements.length > 0,
                requirements: postureRequirements,
                primaryBrowser: primaryBrowserFor(
                    device.platformName
                ),
                automationStatus: "UNVERIFIED",
            }
            : {
                required: false,
                requirements: [],
            },

        browserCoveragePlan: {
            primaryDiscoveryBrowser:
                primaryBrowserFor(
                    device.platformName
                ),

            secondaryBrowsersLater:
                device.platformName === "iOS"
                    ? ["Chrome"]
                    : String(device.manufacturer || "").toLowerCase() === "samsung"
                        ? ["Samsung Internet", "Firefox", "Edge"]
                        : ["Firefox", "Edge"],

            browserUiStatesLater: [
                "expanded",
                "intermediate-when-observable",
                "collapsed",
            ],

            note:
                "Secondary browsers and browser-UI states are expanded after primary hardware geometry discovery, using representative geometry families and verified TestMu availability.",
        },

        regressionPolicy: {
            broadDiscoveryRequired: true,
            mayLaterBeRepresentedByGeometryFamily:
                true,
        },

        foldablePolicy,
    };

    candidate.probePriority = priorityFor(
        candidate
    );

    candidates.push(candidate);
}

candidates.sort((a, b) => {
    if (a.probePriority !== b.probePriority) {
        return a.probePriority - b.probePriority;
    }

    const yearA = a.releaseYear ?? 0;
    const yearB = b.releaseYear ?? 0;

    if (yearA !== yearB) {
        return yearB - yearA;
    }

    const typePriority = {
        foldable: 0,
        tablet: 1,
        phone: 2,
    };

    const typeDelta =
        (typePriority[a.deviceType] ?? 9) -
        (typePriority[b.deviceType] ?? 9);

    if (typeDelta) {
        return typeDelta;
    }

    const platform = a.platformName.localeCompare(
        b.platformName
    );

    if (platform) {
        return platform;
    }

    return a.deviceName.localeCompare(
        b.deviceName,
        undefined,
        {
            numeric: true,
            sensitivity: "base",
        }
    );
});

candidates.forEach((candidate, index) => {
    candidate.selectionRank = index + 1;
});

// =======================================================
// HISTORICAL MEASURED DEVICES NOT CURRENTLY IN CATALOG
// =======================================================

const currentKeys = new Set(
    inventoryDevices.map((device) =>
        currentDeviceKey(
            device.platformName,
            device.deviceName
        )
    )
);

const historicalSeenByDevice = new Map();

for (const snapshot of historicalCoverageCandidates) {
    const candidate = snapshot.candidate;
    const key = currentDeviceKey(
        candidate.platformName,
        candidate.deviceName
    );
    const existing = historicalSeenByDevice.get(key);

    if (
        !existing ||
        String(snapshot.seenAt || "") >
            String(existing.lastSeenAt || "")
    ) {
        historicalSeenByDevice.set(key, {
            deviceName: candidate.deviceName,
            manufacturer: candidate.manufacturer || null,
            platformName: candidate.platformName,
            latestOsVersionAtLastSeen:
                candidate.latestOsVersion || null,
            releaseYear: candidate.releaseYear ?? null,
            releaseYearSource:
                candidate.releaseYearSource || null,
            lastSeenAt: snapshot.seenAt || null,
            sourcePath: snapshot.sourcePath,
        });
    }
}

const historicalMeasuredNotCurrentCatalog =
    registryDevices
        .filter((device) => {
            const release = resolveReleaseYear(
                device.deviceName
            );

            return (
                release.year !== null &&
                release.year >= args.sinceYear &&
                !currentKeys.has(
                    currentDeviceKey(
                        device.platformName,
                        device.deviceName
                    )
                )
            );
        })
        .map((device) => ({
            deviceName: device.deviceName,
            manufacturer: device.manufacturer,
            platformName: device.platformName,
            releaseYear: resolveReleaseYear(
                device.deviceName
            ).year,
            platformVersionsMeasured:
                device.platformVersions || [],
            browsersMeasured:
                device.browsers || [],
            measuredStateCount:
                device.stateCount ||
                device.states?.length ||
                0,
            manualCertification:
                device.manualCertification ||
                null,
            status:
                "HISTORICALLY_MEASURED_NOT_IN_CURRENT_CATALOG",
        }))
        .sort((a, b) => {
            if (a.releaseYear !== b.releaseYear) {
                return b.releaseYear - a.releaseYear;
            }

            return a.deviceName.localeCompare(
                b.deviceName,
                undefined,
                { numeric: true, sensitivity: "base" }
            );
        });

const historicalUnmeasuredNotCurrentCatalog =
    [...historicalSeenByDevice.values()]
        .filter((device) => {
            const key = currentDeviceKey(
                device.platformName,
                device.deviceName
            );
            const release = resolveReleaseYear(
                device.deviceName
            );

            return (
                release.year !== null &&
                release.year >= args.sinceYear &&
                !currentKeys.has(key) &&
                !registryByDevice.has(key)
            );
        })
        .map((device) => ({
            deviceName: device.deviceName,
            manufacturer: device.manufacturer,
            platformName: device.platformName,
            releaseYear: resolveReleaseYear(
                device.deviceName
            ).year,
            latestOsVersionAtLastSeen:
                device.latestOsVersionAtLastSeen,
            lastSeenAt: device.lastSeenAt,
            status:
                "HISTORICALLY_SEEN_UNMEASURED_NOT_IN_CURRENT_CATALOG",
        }))
        .sort((a, b) => {
            if (a.releaseYear !== b.releaseYear) {
                return b.releaseYear - a.releaseYear;
            }

            return a.deviceName.localeCompare(
                b.deviceName,
                undefined,
                { numeric: true, sensitivity: "base" }
            );
        });

// =======================================================
// REPORT
// =======================================================

const requiringProbe = candidates.filter(
    (candidate) => candidate.probe.required
);

const postureDeferred = candidates.filter(
    (candidate) => candidate.postureProbe?.required
);

const complete = candidates.filter(
    (candidate) =>
        !candidate.probe.required &&
        !candidate.postureProbe?.required
);

const requiredSessions = requiringProbe.reduce(
    (total, candidate) =>
        total + candidate.probe.requiredOrientations.length,
    0
);

const report = {
    artifactType: "testmu-device-discovery-universe",
    generatedAt: new Date().toISOString(),
    region: inventory.region || REGION,

    sinceYear: args.sinceYear,
    targetDeviceCount: null,
    targetDeviceCountMeaning:
        "No device-count ceiling during broad discovery. Every confidently identified TestMu automation device from the cutoff year onward belongs in the universe. Probe --max-devices controls each batch.",
    minimumDeviceCount: null,
    maximumDeviceCount: null,

    sourceInventory: {
        path: args.input,
        generatedAt: inventory.generatedAt || null,
    },

    sourceGeometryRegistry: {
        path: args.registry,
        generatedAt: registry.generatedAt || null,
    },

    policy: {
        stage: "BROAD_HARDWARE_GEOMETRY_DISCOVERY",
        releaseYearCutoff: args.sinceYear,
        deviceSelection:
            `Include every current TestMu automation device confidently resolved to ${args.sinceYear}+; do not deduplicate hardware before its first real measurement.`,
        unknownReleaseYear:
            args.includeUnknownYear
                ? "Included intentionally because --include-unknown-year was supplied."
                : "Held in UNKNOWN_YEAR_REVIEW until release year can be resolved safely.",
        latestOs:
            "Use the latest TestMu-available OS for the exact device and revalidate again at probe time.",
        osDowngradeHandling:
            "Hardware discovery is monotonic: an orientation already measured successfully on the primary browser at an OS newer than the currently exposed TestMu catalog OS remains complete. Catalog downgrades are recorded but are not re-probed. Genuine catalog OS upgrades still require fresh measurement.",
        primaryBrowserDiscovery:
            "Android Chrome; iOS Safari. Secondary-browser expansion happens after primary hardware geometry discovery.",
        orientation:
            "Measure portrait and landscape independently. CSS viewport geometry is the responsive source of truth.",
        safeAreas:
            "For primary discovery browsers (iOS Safari and Android Chrome), a portrait/landscape state is not complete until CSS safe-area insets are measured with viewport-fit=cover. A measured all-zero inset is valid. Existing geometry without valid safe-area metadata is scheduled once for SAFE_AREA_BACKFILL.",
        foldables:
            "Book folds require verified folded/outer + unfolded/inner display states and are deferred from orientation-only probing until posture control is verified. Flip phones intentionally ignore the closed cover display and certify only the open/unfolded main display in portrait + landscape.",
        historicalGeometry:
            "Previously validated geometry remains in the persistent registry even if a device disappears from today's TestMu catalog.",
        historicalUnmeasuredCandidates:
            "An eligible device seen in a prior discovery snapshot but never successfully measured remains in an audit backlog if it disappears from the live catalog. It is not scheduled while absent; if it reappears, normal live-catalog discovery automatically schedules it again.",
        manualRealDeviceEvidence:
            "Manual TestMu evidence is a narrow fallback for automation/provisioning failures. It counts only when the registry marks it approvedForPrimaryDiscovery and explicitly non-Appium/non-automation-derived. Automated evidence remains preferred when both exist; this does not relax normal automated rules for other devices.",
        regression:
            "After broad discovery, exact/nearby geometry families can form a smaller fast regression matrix. This does not erase one-time device certification history.",
        heroQa:
            "Not run by this generator. Hero.jsx remains the first visual certification target after geometry discovery is complete enough.",
    },

    counts: {
        liveCatalogModels: inventoryDevices.length,
        discoveryUniverse: candidates.length,
        completeCurrentOs: complete.filter(
            (candidate) =>
                candidate.discoveryStatus ===
                    "COMPLETE_CURRENT_OS"
        ).length,
        completeCurrentOrNewerOs: complete.length,
        catalogOsDowngradeCovered: complete.filter(
            (candidate) =>
                candidate.discoveryStatus ===
                    "COMPLETE_NEWER_OS_THAN_CATALOG"
        ).length,
        requiringProbe: requiringProbe.length,
        requiredSessions,
        safeAreaBackfill: candidates.filter(
            (candidate) =>
                candidate.discoveryStatus === "SAFE_AREA_BACKFILL"
        ).length,
        iosSafeAreaBackfill: candidates.filter(
            (candidate) =>
                candidate.platformName === "iOS" &&
                candidate.discoveryStatus === "SAFE_AREA_BACKFILL"
        ).length,
        androidSafeAreaBackfill: candidates.filter(
            (candidate) =>
                candidate.platformName === "Android" &&
                candidate.discoveryStatus === "SAFE_AREA_BACKFILL"
        ).length,
        postureDeferred: postureDeferred.length,
        incompleteTotal:
            requiringProbe.length + postureDeferred.length,
        android: candidates.filter(
            (candidate) => candidate.platformName === "Android"
        ).length,
        ios: candidates.filter(
            (candidate) => candidate.platformName === "iOS"
        ).length,
        phones: candidates.filter(
            (candidate) => candidate.deviceType === "phone"
        ).length,
        foldables: candidates.filter(
            (candidate) => candidate.deviceType === "foldable"
        ).length,
        tablets: candidates.filter(
            (candidate) => candidate.deviceType === "tablet"
        ).length,
        unknownYearReview: unknownYearReview.length,
        preCutoffExcluded: preCutoffExcluded.length,
        historicalMeasuredNotCurrentCatalog:
            historicalMeasuredNotCurrentCatalog.length,
        historicalManuallyCertifiedNotCurrentCatalog:
            historicalMeasuredNotCurrentCatalog.filter(
                (device) =>
                    device.manualCertification?.hasApprovedManualEvidence === true
            ).length,
        historicalUnmeasuredNotCurrentCatalog:
            historicalUnmeasuredNotCurrentCatalog.length,
        manuallyCertifiedModels:
            candidates.filter(
                (candidate) =>
                    candidate.manualCertification?.hasApprovedManualEvidence === true
            ).length,
        manuallyCertifiedCompleteModels:
            complete.filter(
                (candidate) =>
                    candidate.manualCertification?.hasApprovedManualEvidence === true
            ).length,
        auditIncompleteIncludingUnavailableHistorical:
            requiringProbe.length +
            postureDeferred.length +
            historicalUnmeasuredNotCurrentCatalog.length,
    },

    discoveryQueue: requiringProbe.map((candidate) => ({
        selectionRank: candidate.selectionRank,
        deviceName: candidate.deviceName,
        manufacturer: candidate.manufacturer,
        platformName: candidate.platformName,
        latestOsVersion: candidate.latestOsVersion,
        osCoverage: candidate.osCoverage,
        releaseYear: candidate.releaseYear,
        deviceType: candidate.deviceType,
        family: candidate.family,
        variant: candidate.variant,
        discoveryStatus: candidate.discoveryStatus,
        manualCertification: candidate.manualCertification,
        requiredOrientations:
            candidate.probe.requiredOrientations,
        primaryBrowser:
            candidate.probe.primaryBrowser,
        safeAreaRequired:
            candidate.probe.safeAreaRequired,
        displayScope:
            candidate.probe.displayScope,
        probePriority:
            candidate.probePriority,
    })),

    postureDiscoveryQueue: postureDeferred.map((candidate) => ({
        selectionRank: candidate.selectionRank,
        deviceName: candidate.deviceName,
        manufacturer: candidate.manufacturer,
        platformName: candidate.platformName,
        latestOsVersion: candidate.latestOsVersion,
        osCoverage: candidate.osCoverage,
        releaseYear: candidate.releaseYear,
        deviceType: candidate.deviceType,
        family: candidate.family,
        variant: candidate.variant,
        discoveryStatus: candidate.discoveryStatus,
        manualCertification: candidate.manualCertification,
        foldablePolicy: candidate.foldablePolicy,
        postureRequirements:
            candidate.postureProbe.requirements,
        automationStatus:
            candidate.postureProbe.automationStatus,
    })),

    unknownYearReview,
    preCutoffExcluded,
    historicalMeasuredNotCurrentCatalog,
    historicalUnmeasuredNotCurrentCatalog,

    // Kept as "candidates" for compatibility with probe-device-coverage-set.cjs.
    // Unlike the old generator, this is the complete current 2020+ discovery
    // universe, not a 20-25 representative shortlist.
    candidates,
};

// =======================================================
// SAVE
// =======================================================

fs.mkdirSync(
    args.outDir,
    { recursive: true }
);

const stamp = timestamp();
const base = `TESTMU__candidate-coverage-set__${report.region}`;

const named = path.join(
    args.outDir,
    `${base}__${stamp}.json`
);

const latest = path.join(
    args.outDir,
    `${base}__latest.json`
);

fs.writeFileSync(
    named,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
);

fs.writeFileSync(
    latest,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
);

// =======================================================
// CONSOLE
// =======================================================

console.log("");
console.log("TESTMU 2020+ DISCOVERY UNIVERSE");
console.log("=====================================================================");
console.log(`Release-year cutoff:                 ${args.sinceYear}+`);
console.log(`Live catalog models:                 ${report.counts.liveCatalogModels}`);
console.log(`Eligible discovery models:           ${report.counts.discoveryUniverse}`);
console.log(`Complete at exact current OS/browser:${String(report.counts.completeCurrentOs).padStart(6)}`);
console.log(`Complete at current/newer OS:         ${report.counts.completeCurrentOrNewerOs}`);
console.log(`Covered catalog OS downgrades:        ${report.counts.catalogOsDowngradeCovered}`);
console.log(`Models requiring standard probe:      ${report.counts.requiringProbe}`);
console.log(`Required portrait/landscape sessions:${String(report.counts.requiredSessions).padStart(6)}`);
console.log(`Primary safe-area backfill models:    ${report.counts.safeAreaBackfill}`);
console.log(`  iOS Safari backfills:               ${report.counts.iosSafeAreaBackfill}`);
console.log(`  Android Chrome backfills:           ${report.counts.androidSafeAreaBackfill}`);
console.log(`Posture-deferred fold/dual-screen:    ${report.counts.postureDeferred}`);
console.log(`Incomplete models total:              ${report.counts.incompleteTotal}`);
console.log(`Unknown-year manual review:          ${report.counts.unknownYearReview}`);
console.log(`Pre-${args.sinceYear} excluded:                    ${report.counts.preCutoffExcluded}`);
console.log(`Measured but absent from live catalog:${String(report.counts.historicalMeasuredNotCurrentCatalog).padStart(6)}`);
console.log(`  Manual-certified among absent:      ${String(report.counts.historicalManuallyCertifiedNotCurrentCatalog).padStart(6)}`);
console.log(`Unmeasured but absent from live catalog:${String(report.counts.historicalUnmeasuredNotCurrentCatalog).padStart(4)}`);
console.log(`Models with approved manual evidence:  ${report.counts.manuallyCertifiedModels}`);
console.log(`Complete models using manual evidence: ${report.counts.manuallyCertifiedCompleteModels}`);
console.log(`Audit incomplete incl. unavailable:   ${report.counts.auditIncompleteIncludingUnavailableHistorical}`);
console.log("=====================================================================");

if (requiringProbe.length) {
    console.log("");
    console.log("PENDING DISCOVERY QUEUE");

    for (const candidate of requiringProbe) {
        console.log(
            `${String(candidate.selectionRank).padStart(2)}. ` +
            `${candidate.deviceName} | ` +
            `${candidate.platformName} ${candidate.latestOsVersion} | ` +
            `year ${candidate.releaseYear ?? "review"} | ` +
            `${candidate.deviceType} | ` +
            `${candidate.discoveryStatus} | ` +
            candidate.probe.requiredOrientations.join("+")
        );
    }
}

if (postureDeferred.length) {
    console.log("");
    console.log("POSTURE/DISPLAY DISCOVERY REQUIRED (not scheduled by normal probe)");

    for (const candidate of postureDeferred) {
        const requirements = candidate.postureProbe.requirements
            .map((item) =>
                `${item.displayState}:${item.missingOrientations.join("+")}`
            )
            .join(", ");

        console.log(
            `- ${candidate.deviceName} | ` +
            `${candidate.platformName} ${candidate.latestOsVersion} | ` +
            `${candidate.foldablePolicy.formFactor} | ${requirements}`
        );
    }
}

if (complete.length) {
    console.log("");
    console.log("ALREADY COMPLETE FOR HARDWARE DISCOVERY");

    for (const candidate of complete) {
        const measuredSuffix =
            candidate.discoveryStatus ===
                "COMPLETE_NEWER_OS_THAN_CATALOG"
                ? ` | measured newer OS ${candidate.osCoverage.highestMeasuredPrimaryBrowserOs}`
                : "";

        const manualSuffix =
            candidate.manualCertification?.hasApprovedManualEvidence
                ? ` | manual TestMu evidence ${candidate.manualCertification.orientations.join("+")}`
                : "";

        console.log(
            `- ${candidate.deviceName} | ` +
            `${candidate.platformName} ${candidate.latestOsVersion} | ` +
            `year ${candidate.releaseYear ?? "review"} | cached` +
            measuredSuffix +
            manualSuffix
        );
    }
}

if (unknownYearReview.length) {
    console.log("");
    console.log("UNKNOWN_YEAR_REVIEW (not automatically scheduled)");

    for (const device of unknownYearReview) {
        console.log(
            `- ${device.platformName} | ${device.deviceName} | ${device.latestOsVersion}`
        );
    }
}

if (historicalMeasuredNotCurrentCatalog.length) {
    console.log("");
    console.log("HISTORICALLY MEASURED BUT NOT IN CURRENT AUTOMATION CATALOG");

    for (const device of historicalMeasuredNotCurrentCatalog) {
        const manualSuffix =
            device.manualCertification?.hasApprovedManualEvidence
                ? ` | manual TestMu evidence ${device.manualCertification.approvedManualCaptureCount} capture(s)`
                : "";

        console.log(
            `- ${device.platformName} | ${device.deviceName} | ` +
            `year ${device.releaseYear} | ` +
            `${device.measuredStateCount} measured state(s)` +
            manualSuffix
        );
    }
}

if (historicalUnmeasuredNotCurrentCatalog.length) {
    console.log("");
    console.log("HISTORICALLY SEEN BUT UNMEASURED AND NOT IN CURRENT AUTOMATION CATALOG");

    for (const device of historicalUnmeasuredNotCurrentCatalog) {
        const osSuffix =
            device.latestOsVersionAtLastSeen
                ? ` | last-seen OS ${device.latestOsVersionAtLastSeen}`
                : "";
        const seenSuffix =
            device.lastSeenAt
                ? ` | last seen ${device.lastSeenAt}`
                : "";

        console.log(
            `- ${device.platformName} | ${device.deviceName} | ` +
            `year ${device.releaseYear}` +
            osSuffix +
            seenSuffix
        );
    }
}

console.log("");
console.log("Saved:");
console.log(named);
console.log(latest);
console.log("");
console.log(
    "Next dry run example: node qa/testmu/appium/probe-device-coverage-set.cjs --max-devices=6 --dry-run"
);
