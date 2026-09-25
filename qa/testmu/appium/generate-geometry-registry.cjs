const fs = require("node:fs");
const path = require("node:path");

const {
    resolveReleaseYear,
} = require("./testmu-device-years.cjs");

/*
  Persistent TestMu geometry registry.

  PURPOSE
  -------
  The live TestMu inventory answers: "what can TestMu allocate right now?"
  This registry answers: "what real browser geometry have we successfully
  measured at any point in our QA history?"

  The distinction matters because devices appear/disappear from TestMu's live
  automation catalog. Historical measurements must remain available for
  discovery bookkeeping and later geometry-family regression work.

  This script does NOT edit CSS and does NOT decide that nearby viewport sizes
  are equivalent. It stores exact measured browser geometry first. Conservative
  family merging can happen later from evidence instead of assumptions.
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
    region: String(rawArgs.region || REGION).toLowerCase(),

    root: path.resolve(
        rawArgs.root ||
        path.join(
            "qa-results",
            "testmu"
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
};

const normalizePlatform = (value) => {
    const normalized = String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

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

const prettyPlatform = (value) =>
    normalizePlatform(value) === "ios"
        ? "iOS"
        : normalizePlatform(value) === "android"
            ? "Android"
            : String(value || "Unknown");

const normalizeName = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

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

const finitePositive = (value) => {
    const number = Number(value);

    return Number.isFinite(number) && number > 0;
};

const finiteNonNegative = (value) => {
    const number = Number(value);

    return Number.isFinite(number) && number >= 0;
};

const normalizeSafeAreaInsets = (value) => {
    if (
        !value ||
        !["top", "right", "bottom", "left"].every(
            (edge) => finiteNonNegative(value[edge])
        )
    ) {
        return null;
    }

    return {
        top: round(value.top),
        right: round(value.right),
        bottom: round(value.bottom),
        left: round(value.left),
    };
};

const round = (value) => {
    const number = Number(value);

    return Number.isFinite(number)
        ? Math.round(number * 100) / 100
        : null;
};

const timestamp = () =>
    new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

const walkJsonFiles = (root) => {
    const files = [];

    if (!fs.existsSync(root)) {
        return files;
    }

    const visit = (current) => {
        let entries;

        try {
            entries = fs.readdirSync(
                current,
                { withFileTypes: true }
            );
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(
                current,
                entry.name
            );

            if (entry.isDirectory()) {
                visit(fullPath);
            } else if (
                entry.isFile() &&
                entry.name.toLowerCase().endsWith(".json")
            ) {
                files.push(fullPath);
            }
        }
    };

    visit(root);
    return files;
};

const viewportAspect = (innerViewport) => {
    const width = Number(innerViewport?.width);
    const height = Number(innerViewport?.height);

    if (!finitePositive(width) || !finitePositive(height)) {
        return null;
    }

    if (width === height) {
        return "square";
    }

    return width > height
        ? "landscape"
        : "portrait";
};

const validGeometry = (resolved) =>
    finitePositive(resolved?.innerViewport?.width) &&
    finitePositive(resolved?.innerViewport?.height) &&
    finitePositive(resolved?.screen?.width) &&
    finitePositive(resolved?.screen?.height);

const isManualEvidenceArtifact = (artifactType) =>
    artifactType === "testmu-manual-real-device-evidence";

const manualEvidenceApproved = (metadata) =>
    isManualEvidenceArtifact(metadata.artifactType) &&
    metadata.status === "MANUAL_CERTIFIED" &&
    metadata.manualEvidence?.approvedForPrimaryDiscovery === true &&
    metadata.manualEvidence?.automationDerived === false &&
    metadata.manualEvidence?.appiumDerived === false;

const evidenceAuthority = (capture) => {
    if (capture.evidenceSource === "testmu-manual-real-device") {
        return 1;
    }

    // Automated/TestMu QA captures remain preferred whenever an automated
    // state and a manual state exist for the same device/browser/orientation.
    return 2;
};

const captureFromSpecifications = (
    specifications,
    sourcePath,
    metadata = {}
) => {
    const requested = specifications?.requested || {};
    const resolved = specifications?.resolved || {};

    if (!validGeometry(resolved)) {
        return null;
    }

    if (
        metadata.artifactType === "testmu-device-capability-probe" &&
        !String(metadata.status || "").startsWith("PASS")
    ) {
        return null;
    }

    if (
        isManualEvidenceArtifact(metadata.artifactType) &&
        !manualEvidenceApproved(metadata)
    ) {
        return null;
    }

    if (
        metadata.infrastructurePassed === false &&
        !String(metadata.status || "").includes("QA_FAIL")
    ) {
        return null;
    }

    const deviceName =
        requested.deviceName ||
        resolved.model ||
        resolved.cloudDeviceName ||
        null;

    const platformName =
        resolved.platformName ||
        requested.platformName ||
        null;

    const platformVersion = normalizeVersion(
        resolved.platformVersion ||
        requested.platformVersion
    );

    const browserName =
        resolved.browserName ||
        requested.browserName ||
        null;

    if (
        !deviceName ||
        !platformName ||
        !platformVersion ||
        !browserName
    ) {
        return null;
    }

    const requestedOrientation = String(
        resolved.requestedOrientation ||
        requested.orientation ||
        "unknown"
    ).toLowerCase();

    const aspectOrientation =
        resolved.viewportAspectOrientation ||
        viewportAspect(resolved.innerViewport);

    const cssMediaOrientation =
        resolved.cssMediaOrientation ||
        aspectOrientation ||
        null;

    const release = resolveReleaseYear(deviceName);

    return {
        deviceName,
        resolvedModel: resolved.model || null,
        manufacturer:
            resolved.manufacturer ||
            requested.manufacturer ||
            null,

        platformName: prettyPlatform(platformName),
        platformKey: normalizePlatform(platformName),
        platformVersion,

        browserName,
        browserVersion: resolved.browserVersion || null,

        requestedOrientation,
        requestedDisplayScope:
            requested.displayScope ||
            null,
        foldableDiscoveryMode:
            requested.foldableDiscoveryMode ||
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
        displayLongEdgeCssPx:
            round(resolved.displayLongEdgeCssPx),
        appiumOrientation: resolved.appiumOrientation || null,
        screenOrientation:
            resolved.screenOrientation ||
            resolved.browserOrientation ||
            null,
        cssMediaOrientation,
        viewportAspectOrientation: aspectOrientation,
        orientationMediaQueries:
            resolved.orientationMediaQueries ||
            null,

        innerViewport: {
            width: round(resolved.innerViewport.width),
            height: round(resolved.innerViewport.height),
        },

        visualViewport: resolved.visualViewport
            ? {
                width: round(resolved.visualViewport.width),
                height: round(resolved.visualViewport.height),
                scale: round(resolved.visualViewport.scale),
                offsetTop: round(resolved.visualViewport.offsetTop),
                offsetLeft: round(resolved.visualViewport.offsetLeft),
                pageTop: round(resolved.visualViewport.pageTop),
                pageLeft: round(resolved.visualViewport.pageLeft),
            }
            : null,

        safeAreaInsets:
            normalizeSafeAreaInsets(
                resolved.safeAreaInsets
            ),

        safeAreaMeasurement:
            resolved.safeAreaMeasurement &&
            typeof resolved.safeAreaMeasurement === "object"
                ? {
                    measured:
                        resolved.safeAreaMeasurement.measured === true,
                    cssEnvSupported:
                        typeof resolved.safeAreaMeasurement.cssEnvSupported === "boolean"
                            ? resolved.safeAreaMeasurement.cssEnvSupported
                            : null,
                    viewportMetaContent:
                        typeof resolved.safeAreaMeasurement.viewportMetaContent === "string"
                            ? resolved.safeAreaMeasurement.viewportMetaContent
                            : null,
                    viewportFitCover:
                        typeof resolved.safeAreaMeasurement.viewportFitCover === "boolean"
                            ? resolved.safeAreaMeasurement.viewportFitCover
                            : null,
                    error:
                        resolved.safeAreaMeasurement.error
                            ? String(resolved.safeAreaMeasurement.error)
                            : null,
                }
                : null,

        screen: resolved.screen || null,
        devicePixelRatio: round(resolved.devicePixelRatio),
        deviceScreenSize: resolved.deviceScreenSize || null,
        deviceScreenDensity: resolved.deviceScreenDensity ?? null,
        pixelRatioCapability: resolved.pixelRatioCapability ?? null,
        viewportRect: resolved.viewportRect || null,
        userAgent: resolved.userAgent || null,
        navigatorPlatform: resolved.navigatorPlatform || null,
        userAgentData: resolved.userAgentData || null,
        maxTouchPoints: resolved.maxTouchPoints ?? null,
        page: resolved.page || null,
        document: resolved.document || null,
        outerWindow: resolved.outerWindow || null,

        releaseYear: release.year,
        releaseYearSource: release.source,
        releaseYearConfidence: release.confidence,

        artifactType: metadata.artifactType || null,
        sourceStatus: metadata.status || null,
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
                    testmuSessionType:
                        metadata.manualEvidence?.testmuSessionType || null,
                    testmuSessionLabel:
                        metadata.manualEvidence?.testmuSessionLabel || null,
                    notes:
                        metadata.manualEvidence?.notes || null,
                }
                : null,
        capturedAt:
            specifications.capturedAt ||
            metadata.capturedAt ||
            null,
        sourcePath,
    };
};

const collectFromDocument = (document, sourcePath) => {
    const captures = [];

    if (document?.deviceSpecifications) {
        const capture = captureFromSpecifications(
            document.deviceSpecifications,
            sourcePath,
            {
                artifactType: document.artifactType || null,
                status: document.status || null,
                infrastructurePassed:
                    document.infrastructurePassed,
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
        for (const result of document.results) {
            if (!result?.deviceSpecifications) {
                continue;
            }

            const capture = captureFromSpecifications(
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
                    infrastructurePassed:
                        result.infrastructurePassed ??
                        document.infrastructurePassed,
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

const captureTime = (capture) => {
    const value = Date.parse(capture.capturedAt || "");
    return Number.isFinite(value) ? value : 0;
};

const captureIdentityKey = (capture) => [
    capture.platformKey,
    normalizeName(capture.deviceName),
    capture.platformVersion,
    normalizeName(capture.browserName),
    capture.browserVersion || "unknown-browser-version",
    capture.requestedDisplayScope || "standard-main-display",
    capture.displayState || "unknown-display-state",
    capture.requestedOrientation,
    `${capture.innerViewport.width}x${capture.innerViewport.height}`,
    `${capture.visualViewport?.width ?? "na"}x${capture.visualViewport?.height ?? "na"}`,
    `safe-${capture.safeAreaInsets?.top ?? "na"}-${capture.safeAreaInsets?.right ?? "na"}-${capture.safeAreaInsets?.bottom ?? "na"}-${capture.safeAreaInsets?.left ?? "na"}`,
    capture.cssMediaOrientation || "unknown-css-orientation",
    capture.evidenceSource || "unknown-evidence-source",
].join("|");

const exactGeometryKey = (capture) => [
    capture.platformKey,
    normalizeName(capture.browserName),
    capture.cssMediaOrientation ||
        capture.viewportAspectOrientation ||
        capture.requestedOrientation,
    `${capture.innerViewport.width}x${capture.innerViewport.height}`,
].join("|");

const deviceKey = (capture) => [
    capture.platformKey,
    normalizeName(capture.deviceName),
].join("|");

const stateKey = (capture) => [
    capture.platformVersion,
    normalizeName(capture.browserName),
    capture.displayState ||
        capture.requestedDisplayScope ||
        "standard-main-display",
    capture.requestedOrientation,
].join("|");

const buildRegistry = () => {
    const files = walkJsonFiles(args.root);
    const deduped = new Map();

    let parsedFiles = 0;
    let rawAcceptedCaptures = 0;

    for (const filePath of files) {
        let document;

        try {
            document = JSON.parse(
                fs.readFileSync(filePath, "utf8")
            );
        } catch {
            continue;
        }

        parsedFiles += 1;

        for (const capture of collectFromDocument(document, filePath)) {
            rawAcceptedCaptures += 1;
            const key = captureIdentityKey(capture);
            const previous = deduped.get(key);

            if (
                !previous ||
                captureTime(capture) > captureTime(previous)
            ) {
                deduped.set(key, capture);
            }
        }
    }

    const captures = [...deduped.values()]
        .sort((a, b) => {
            const platform = a.platformName.localeCompare(b.platformName);
            if (platform) return platform;

            const device = a.deviceName.localeCompare(
                b.deviceName,
                undefined,
                { numeric: true, sensitivity: "base" }
            );
            if (device) return device;

            const os = a.platformVersion.localeCompare(
                b.platformVersion,
                undefined,
                { numeric: true }
            );
            if (os) return os;

            return a.requestedOrientation.localeCompare(
                b.requestedOrientation
            );
        });

    const deviceGroups = new Map();

    for (const capture of captures) {
        const key = deviceKey(capture);

        if (!deviceGroups.has(key)) {
            deviceGroups.set(key, []);
        }

        deviceGroups.get(key).push(capture);
    }

    const devices = [...deviceGroups.values()]
        .map((group) => {
            const first = group[0];
            const states = new Map();

            for (const capture of group) {
                const key = stateKey(capture);
                const previous = states.get(key);

                if (
                    !previous ||
                    evidenceAuthority(capture) > evidenceAuthority(previous) ||
                    (
                        evidenceAuthority(capture) === evidenceAuthority(previous) &&
                        captureTime(capture) > captureTime(previous)
                    )
                ) {
                    states.set(key, capture);
                }
            }

            const platformVersions = [...new Set(
                group.map((capture) => capture.platformVersion)
            )]
                .sort((a, b) =>
                    b.localeCompare(a, undefined, { numeric: true })
                );

            const browsers = [...new Set(
                group.map((capture) => capture.browserName)
            )].sort();

            const manualCaptures = group.filter(
                (capture) =>
                    capture.evidenceSource === "testmu-manual-real-device" &&
                    capture.manualCertification?.approvedForPrimaryDiscovery === true
            );

            return {
                deviceName: first.deviceName,
                manufacturer: first.manufacturer,
                platformName: first.platformName,
                platformKey: first.platformKey,
                releaseYear: first.releaseYear,
                releaseYearSource: first.releaseYearSource,
                releaseYearConfidence: first.releaseYearConfidence,
                platformVersions,
                browsers,
                manualCertification: {
                    hasApprovedManualEvidence: manualCaptures.length > 0,
                    approvedManualCaptureCount: manualCaptures.length,
                    automationProvisioningStatuses: [...new Set(
                        manualCaptures
                            .map((capture) =>
                                capture.manualCertification?.automationProvisioningStatus
                            )
                            .filter(Boolean)
                    )],
                },
                stateCount: states.size,
                states: [...states.values()]
                    .sort((a, b) => {
                        const version = b.platformVersion.localeCompare(
                            a.platformVersion,
                            undefined,
                            { numeric: true }
                        );
                        if (version) return version;

                        const browser = a.browserName.localeCompare(b.browserName);
                        if (browser) return browser;

                        return a.requestedOrientation.localeCompare(
                            b.requestedOrientation
                        );
                    }),
            };
        })
        .sort((a, b) => {
            const platform = a.platformName.localeCompare(b.platformName);
            if (platform) return platform;

            return a.deviceName.localeCompare(
                b.deviceName,
                undefined,
                { numeric: true, sensitivity: "base" }
            );
        });

    const geometryGroups = new Map();

    for (const capture of captures) {
        const key = exactGeometryKey(capture);

        if (!geometryGroups.has(key)) {
            geometryGroups.set(key, []);
        }

        geometryGroups.get(key).push(capture);
    }

    const exactGeometryFamilies = [...geometryGroups.entries()]
        .map(([key, members]) => {
            const first = members[0];

            return {
                geometryKey: key,
                platformName: first.platformName,
                browserName: first.browserName,
                cssOrientation:
                    first.cssMediaOrientation ||
                    first.viewportAspectOrientation ||
                    first.requestedOrientation,
                innerViewport: first.innerViewport,
                memberCount: members.length,
                members: members.map((capture) => ({
                    deviceName: capture.deviceName,
                    platformVersion: capture.platformVersion,
                    browserVersion: capture.browserVersion,
                    requestedOrientation: capture.requestedOrientation,
                    requestedDisplayScope: capture.requestedDisplayScope,
                    displayState: capture.displayState,
                    displayVerificationStatus:
                        capture.displayVerificationStatus,
                    screenOrientation: capture.screenOrientation,
                    safeAreaInsets: capture.safeAreaInsets,
                    safeAreaMeasurement: capture.safeAreaMeasurement,
                    evidenceSource: capture.evidenceSource,
                    captureMethod: capture.captureMethod,
                    manualCertification: capture.manualCertification,
                    sourcePath: capture.sourcePath,
                })),
            };
        })
        .sort((a, b) => {
            const platform = a.platformName.localeCompare(b.platformName);
            if (platform) return platform;

            const browser = a.browserName.localeCompare(b.browserName);
            if (browser) return browser;

            const width = a.innerViewport.width - b.innerViewport.width;
            if (width) return width;

            return a.innerViewport.height - b.innerViewport.height;
        });

    return {
        scannedJsonFiles: files.length,
        parsedJsonFiles: parsedFiles,
        rawAcceptedCaptures,
        captures,
        devices,
        exactGeometryFamilies,
        safeAreaMeasuredCaptures:
            captures.filter(
                (capture) => capture.safeAreaInsets !== null
            ).length,
        manualCertifiedCaptures:
            captures.filter(
                (capture) =>
                    capture.evidenceSource === "testmu-manual-real-device" &&
                    capture.manualCertification?.approvedForPrimaryDiscovery === true
            ).length,
        manualCertifiedModels:
            new Set(
                captures
                    .filter(
                        (capture) =>
                            capture.evidenceSource === "testmu-manual-real-device" &&
                            capture.manualCertification?.approvedForPrimaryDiscovery === true
                    )
                    .map(deviceKey)
            ).size,
    };
};

const buildMarkdown = (report) => {
    const lines = [];

    lines.push("# TestMu Historical Geometry Registry");
    lines.push("");
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Region: ${report.region}`);
    lines.push(`Validated unique captures: ${report.summary.uniqueCaptures}`);
    lines.push(`Measured device models: ${report.summary.measuredDeviceModels}`);
    lines.push(`Exact CSS viewport families: ${report.summary.exactGeometryFamilies}`);
    lines.push(`Captures with safe-area measurements: ${report.summary.safeAreaMeasuredCaptures}`);
    lines.push(`Manual TestMu certified captures: ${report.summary.manualCertifiedCaptures}`);
    lines.push(`Models with approved manual evidence: ${report.summary.manualCertifiedModels}`);
    lines.push("");
    lines.push("> Geometry families in this file are exact width×height groups only. Nearby dimensions are intentionally not merged yet.");
    lines.push("");
    lines.push("| Device | OS versions measured | Browser(s) | Release year | Measured states |");
    lines.push("| --- | --- | --- | ---: | ---: |");

    for (const device of report.devices) {
        lines.push(
            `| ${device.deviceName} | ${device.platformVersions.join(", ")} | ${device.browsers.join(", ")} | ${device.releaseYear ?? "review"} | ${device.stateCount} |`
        );
    }

    lines.push("");
    return `${lines.join("\n")}\n`;
};

try {
    const registry = buildRegistry();

    const report = {
        artifactType: "testmu-historical-geometry-registry",
        generatedAt: new Date().toISOString(),
        region: args.region,
        sourceRoot: args.root,
        policy: {
            purpose:
                "Persist validated real-device browser geometry even when a device disappears from the current TestMu automation catalog.",
            geometrySourceOfTruth:
                "Actual browser innerViewport width + height, with visualViewport/screen/orientation and measured CSS safe-area inset metadata retained when available.",
            familyMerging:
                "Exact geometry only in this registry. Do not merge nearby dimensions until the later evidence-based geometry-family analysis.",
            manualEvidence:
                "Explicit testmu-manual-real-device-evidence artifacts may certify geometry only when status=MANUAL_CERTIFIED, approvedForPrimaryDiscovery=true, automationDerived=false, and appiumDerived=false. Automated evidence remains preferred when both exist for the same state.",
        },
        summary: {
            scannedJsonFiles: registry.scannedJsonFiles,
            parsedJsonFiles: registry.parsedJsonFiles,
            rawAcceptedCaptures: registry.rawAcceptedCaptures,
            uniqueCaptures: registry.captures.length,
            measuredDeviceModels: registry.devices.length,
            exactGeometryFamilies: registry.exactGeometryFamilies.length,
            safeAreaMeasuredCaptures: registry.safeAreaMeasuredCaptures,
            manualCertifiedCaptures: registry.manualCertifiedCaptures,
            manualCertifiedModels: registry.manualCertifiedModels,
        },
        devices: registry.devices,
        exactGeometryFamilies: registry.exactGeometryFamilies,
        captures: registry.captures,
    };

    fs.mkdirSync(args.outDir, { recursive: true });

    const stamp = timestamp();
    const base = `TESTMU__geometry-registry__${args.region}`;

    const jsonPath = path.join(
        args.outDir,
        `${base}__${stamp}.json`
    );
    const latestJsonPath = path.join(
        args.outDir,
        `${base}__latest.json`
    );
    const markdownPath = path.join(
        args.outDir,
        `${base}__${stamp}.md`
    );
    const latestMarkdownPath = path.join(
        args.outDir,
        `${base}__latest.md`
    );

    const json = `${JSON.stringify(report, null, 2)}\n`;
    const markdown = buildMarkdown(report);

    fs.writeFileSync(jsonPath, json, "utf8");
    fs.writeFileSync(latestJsonPath, json, "utf8");
    fs.writeFileSync(markdownPath, markdown, "utf8");
    fs.writeFileSync(latestMarkdownPath, markdown, "utf8");

    console.log("");
    console.log("TESTMU HISTORICAL GEOMETRY REGISTRY");
    console.log("=====================================================================");
    console.log(`Scanned JSON files:        ${report.summary.scannedJsonFiles}`);
    console.log(`Accepted raw captures:     ${report.summary.rawAcceptedCaptures}`);
    console.log(`Unique geometry captures:  ${report.summary.uniqueCaptures}`);
    console.log(`Measured device models:    ${report.summary.measuredDeviceModels}`);
    console.log(`Exact viewport families:   ${report.summary.exactGeometryFamilies}`);
    console.log(`Manual certified captures: ${report.summary.manualCertifiedCaptures}`);
    console.log(`Manual certified models:   ${report.summary.manualCertifiedModels}`);
    console.log("=====================================================================");
    console.log("");
    console.log(`JSON: ${jsonPath}`);
    console.log(`MD:   ${markdownPath}`);
    console.log("");
    console.log(`Latest JSON: ${latestJsonPath}`);
    console.log(`Latest MD:   ${latestMarkdownPath}`);
} catch (error) {
    console.error("");
    console.error("GEOMETRY REGISTRY GENERATION FAILED");
    console.error(error?.stack || error);
    process.exitCode = 2;
}
