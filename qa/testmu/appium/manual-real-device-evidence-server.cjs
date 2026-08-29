const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rawArgs = Object.fromEntries(
    process.argv.slice(2).map((token) => {
        const [key, ...rest] = token.replace(/^--/, "").split("=");
        return [key, rest.join("=") || true];
    })
);

const HOST = String(rawArgs.host || "0.0.0.0");
const PORT = Number(rawArgs.port || 4179);
const REGION = String(
    rawArgs.region ||
    process.env.QA_TESTMU_REGION ||
    process.env.LT_REGION ||
    "us"
).toLowerCase();
const OUT_ROOT = path.resolve(
    rawArgs["output-dir"] ||
    path.join("qa-results", "testmu", "manual-evidence")
);
const MAX_BODY_BYTES = 2 * 1024 * 1024;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error("--port must be an integer from 1 to 65535");
}

const text = (value) => String(value ?? "").trim();
const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const finiteNonNegative = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;
const round = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};
const normalizePlatform = (value) => {
    const normalized = text(value).toLowerCase();
    if (normalized.includes("android")) return "Android";
    if (normalized === "ios" || normalized.includes("iphone") || normalized.includes("ipad")) return "iOS";
    return text(value) || "Unknown";
};
const normalizeOrientation = (value) => {
    const normalized = text(value).toLowerCase();
    return ["portrait", "landscape"].includes(normalized) ? normalized : null;
};
const slug = (value) =>
    text(value)
        .replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/^-+|-+$/g, "") || "unknown";
const timestamp = (value = new Date()) =>
    value.toISOString().replace(/[:.]/g, "-");

const viewportAspect = (inner) => {
    const width = Number(inner?.width);
    const height = Number(inner?.height);
    if (!(width > 0 && height > 0)) return null;
    if (width === height) return "square";
    return width > height ? "landscape" : "portrait";
};

const normalizeInsets = (value) => {
    if (!value || !["top", "right", "bottom", "left"].every((edge) => finiteNonNegative(value[edge]))) {
        return null;
    }
    return {
        top: round(value.top),
        right: round(value.right),
        bottom: round(value.bottom),
        left: round(value.left),
    };
};

const normalizeVisual = (value) => {
    if (!value || !finitePositive(value.width) || !finitePositive(value.height)) return null;
    return {
        width: round(value.width),
        height: round(value.height),
        scale: round(value.scale),
        offsetTop: round(value.offsetTop),
        offsetLeft: round(value.offsetLeft),
        pageTop: round(value.pageTop),
        pageLeft: round(value.pageLeft),
    };
};

const normalizeScreen = (value) => {
    if (!value || !finitePositive(value.width) || !finitePositive(value.height)) return null;
    return {
        width: round(value.width),
        height: round(value.height),
        availWidth: finitePositive(value.availWidth) ? round(value.availWidth) : round(value.width),
        availHeight: finitePositive(value.availHeight) ? round(value.availHeight) : round(value.height),
        colorDepth: Number.isFinite(Number(value.colorDepth)) ? Number(value.colorDepth) : null,
        pixelDepth: Number.isFinite(Number(value.pixelDepth)) ? Number(value.pixelDepth) : null,
    };
};

const safeAreaMeasurementFrom = (measurement) => {
    const source = measurement?.safeAreaMeasurement || {};
    return {
        measured: source.measured === true,
        cssEnvSupported:
            typeof source.cssEnvSupported === "boolean"
                ? source.cssEnvSupported
                : null,
        viewportMetaContent:
            typeof source.viewportMetaContent === "string"
                ? source.viewportMetaContent
                : null,
        viewportFitCover: source.viewportFitCover === true,
        error: source.error ? String(source.error) : null,
        collectionMethod: text(source.collectionMethod) || "page-self-report",
    };
};

const manualDisplayVerificationStatus = (displayState, innerViewport) => {
    if (displayState === "unfolded-main-display") {
        const longEdge = Math.max(
            Number(innerViewport?.width || 0),
            Number(innerViewport?.height || 0)
        );
        return longEdge >= 600
            ? "VERIFIED_MAIN_DISPLAY_BY_GEOMETRY"
            : "MANUAL_DISPLAY_STATE_RECORDED";
    }
    if (displayState === "standard-main-display") {
        return "MANUAL_CONFIRMED_STANDARD_DISPLAY";
    }
    return "MANUAL_CONFIRMED_POSTURE_DISPLAY_STATE";
};

const validateSubmission = (submission) => {
    if (submission?.artifactType !== "testmu-manual-real-device-evidence-submission") {
        return "artifactType must be testmu-manual-real-device-evidence-submission";
    }

    const context = submission?.context || {};
    const measurement = submission?.measurement || {};

    for (const [field, label] of [
        [context.deviceName, "deviceName"],
        [context.platformName, "platformName"],
        [context.platformVersion, "platformVersion"],
        [context.browserName, "browserName"],
    ]) {
        if (!text(field)) return `Missing required context.${label}`;
    }

    const orientation = normalizeOrientation(
        measurement.cssMediaOrientation || context.orientation
    );
    if (!orientation) return "Measurement must resolve to portrait or landscape";

    if (!finitePositive(measurement?.innerViewport?.width) || !finitePositive(measurement?.innerViewport?.height)) {
        return "innerViewport width/height must be positive";
    }
    if (!finitePositive(measurement?.screen?.width) || !finitePositive(measurement?.screen?.height)) {
        return "screen width/height must be positive";
    }
    if (!finitePositive(measurement.devicePixelRatio)) {
        return "devicePixelRatio must be positive";
    }

    const aspect = viewportAspect(measurement.innerViewport);
    if (aspect !== orientation) {
        return `Orientation mismatch: CSS=${orientation}, viewportAspect=${aspect}`;
    }

    if (!normalizeInsets(measurement.safeAreaInsets)) {
        return "safeAreaInsets must contain non-negative top/right/bottom/left values";
    }

    return null;
};

const buildArtifact = (submission) => {
    const context = submission.context;
    const measurement = submission.measurement;
    const browserDetected = measurement.browserDetected || {};
    const platformName = normalizePlatform(context.platformName);
    const orientation = normalizeOrientation(
        measurement.cssMediaOrientation || context.orientation
    );
    const aspect = viewportAspect(measurement.innerViewport);
    const innerViewport = {
        width: round(measurement.innerViewport.width),
        height: round(measurement.innerViewport.height),
    };
    const safeAreaInsets = normalizeInsets(measurement.safeAreaInsets);
    const safeAreaMeasurement = safeAreaMeasurementFrom(measurement);
    const browserName = text(context.browserName || browserDetected.name);
    const browserVersion = text(context.browserVersion || browserDetected.version) || null;
    const displayState = text(context.displayState) || "standard-main-display";
    const foldState = text(context.foldState) || "standard";
    const capturedAt = text(measurement.capturedAt) || new Date().toISOString();

    const approvedForPrimaryDiscovery = Boolean(
        orientation &&
        aspect === orientation &&
        safeAreaMeasurement.measured === true &&
        safeAreaMeasurement.viewportFitCover === true &&
        safeAreaInsets
    );

    const screenOrientation =
        text(measurement?.screenOrientation?.type) || null;

    const artifact = {
        artifactType: "testmu-manual-real-device-evidence",
        schemaVersion: 1,
        status: approvedForPrimaryDiscovery
            ? "MANUAL_CERTIFIED"
            : "MANUAL_CAPTURE_RECORDED_NOT_PRIMARY_CERTIFIED",
        evidenceSource: "testmu-manual-real-device",
        captureMethod: "page-self-report-direct-save",
        createdAt: new Date().toISOString(),
        region: REGION,
        manualEvidence: {
            approvedForPrimaryDiscovery,
            automationDerived: false,
            appiumDerived: false,
            testmuSessionType: text(context.testmuSessionType) || "manual-real-device",
            evidencePurpose: text(context.evidencePurpose) || "fallback-for-automation-or-provisioning-issue",
            automationIssue: text(context.automationIssue) || "other",
            automationProvisioningStatus:
                text(context.automationIssue) === "webdriver-provisioning-failure"
                    ? "AUTOMATION_PROVISIONING_FAILED"
                    : "MANUAL_FALLBACK_USED",
            testmuSessionLabel: text(context.testmuSessionLabel) || null,
            displayState,
            foldState,
            posture: text(context.posture) || null,
            notes: text(context.notes) || null,
            submittedAt: text(submission.submittedAt) || null,
            validation: {
                cssOrientationMatchesViewportAspect: aspect === orientation,
                safeAreaMeasured: safeAreaMeasurement.measured,
                viewportFitCover: safeAreaMeasurement.viewportFitCover,
            },
        },
        deviceSpecifications: {
            capturedAt,
            requested: {
                deviceName: text(context.deviceName),
                manufacturer: text(context.manufacturer) || null,
                platformName,
                platformVersion: text(context.platformVersion),
                browserName,
                orientation,
                region: REGION,
                displayScope: displayState,
                displayState,
                foldState,
                posture: text(context.posture) || null,
                collectionMethod: "manual-testmu-page-self-report",
            },
            resolved: {
                manufacturer: text(context.manufacturer) || null,
                model: text(context.deviceName),
                cloudDeviceName: text(context.testmuSessionLabel) || null,
                platformName,
                platformVersion: text(context.platformVersion),
                apiLevel: null,
                browserName,
                browserVersion,
                requestedOrientation: orientation,
                appiumOrientation: null,
                browserOrientation: screenOrientation,
                screenOrientation,
                cssMediaOrientation: orientation,
                viewportAspectOrientation: aspect,
                orientationMediaQueries: measurement.orientationMediaQueries || {
                    portrait: orientation === "portrait",
                    landscape: orientation === "landscape",
                },
                displayState,
                foldState,
                posture: text(context.posture) || null,
                displayVerificationStatus:
                    manualDisplayVerificationStatus(displayState, innerViewport),
                displayLongEdgeCssPx: Math.max(innerViewport.width, innerViewport.height),
                innerViewport,
                visualViewport: normalizeVisual(measurement.visualViewport),
                screen: normalizeScreen(measurement.screen),
                safeAreaInsets,
                safeAreaMeasurement,
                devicePixelRatio: round(measurement.devicePixelRatio),
                deviceScreenSize: null,
                deviceScreenDensity: null,
                pixelRatioCapability: null,
                viewportRect: null,
                userAgent: text(measurement.userAgent) || null,
                navigatorPlatform: text(measurement.navigatorPlatform) || null,
                userAgentData: measurement.userAgentData || null,
                maxTouchPoints:
                    Number.isFinite(Number(measurement.maxTouchPoints))
                        ? Number(measurement.maxTouchPoints)
                        : null,
                page: measurement.page || null,
                document: measurement.document || null,
                outerWindow: measurement.outerWindow || null,
            },
            evidence: {
                source: "testmu-manual-real-device",
                captureMethod: "page-self-report-direct-save",
                automationDerived: false,
                appiumDerived: false,
                approvedForPrimaryDiscovery,
            },
        },
        browserMeasurement: measurement,
    };

    return artifact;
};

const writeArtifact = (artifact) => {
    const requested = artifact.deviceSpecifications.requested;
    const resolved = artifact.deviceSpecifications.resolved;
    const captured = new Date(artifact.deviceSpecifications.capturedAt || Date.now());
    const displayState = requested.displayState || "standard-main-display";
    const foldState = requested.foldState || "standard";

    const dir = path.join(
        OUT_ROOT,
        slug(requested.deviceName)
    );
    fs.mkdirSync(dir, { recursive: true });

    const browserLabel = resolved.browserVersion
        ? `${resolved.browserName}-${resolved.browserVersion}`
        : resolved.browserName;

    const fileName = [
        "TESTMU",
        "manual-evidence",
        slug(requested.deviceName),
        slug(`${requested.platformName}-${requested.platformVersion}`),
        slug(browserLabel),
        slug(displayState),
        slug(foldState),
        slug(requested.orientation),
        timestamp(Number.isNaN(captured.getTime()) ? new Date() : captured),
    ].join("__") + ".json";

    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

    return {
        fileName,
        filePath,
        relativePath: path.relative(process.cwd(), filePath),
    };
};

const cors = (res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cache-Control", "no-store");
};

const sendJson = (res, statusCode, body) => {
    cors(res);
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(`${JSON.stringify(body, null, 2)}\n`);
};

const server = http.createServer((req, res) => {
    cors(res);

    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, {
            ok: true,
            artifactType: "testmu-manual-real-device-evidence-receiver",
            port: PORT,
            outputDir: OUT_ROOT,
            region: REGION,
        });
        return;
    }

    if (req.method !== "POST" || url.pathname !== "/__qa/manual-evidence") {
        sendJson(res, 404, { error: "Not found" });
        return;
    }

    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });

    req.on("end", () => {
        if (size > MAX_BODY_BYTES) {
            sendJson(res, 413, { error: "Payload too large" });
            return;
        }

        let submission;
        try {
            submission = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch (error) {
            sendJson(res, 400, { error: `Invalid JSON: ${error.message}` });
            return;
        }

        const validationError = validateSubmission(submission);
        if (validationError) {
            sendJson(res, 422, { error: validationError });
            return;
        }

        try {
            const artifact = buildArtifact(submission);
            const saved = writeArtifact(artifact);
            sendJson(res, 201, {
                ok: true,
                status: artifact.status,
                approvedForPrimaryDiscovery:
                    artifact.manualEvidence.approvedForPrimaryDiscovery,
                ...saved,
            });
            console.log(
                `SAVED MANUAL EVIDENCE | ${artifact.deviceSpecifications.requested.deviceName} | ` +
                `${artifact.deviceSpecifications.requested.platformName} ${artifact.deviceSpecifications.requested.platformVersion} | ` +
                `${artifact.deviceSpecifications.resolved.browserName} | ` +
                `${artifact.deviceSpecifications.requested.orientation} | ` +
                `${saved.relativePath}`
            );
        } catch (error) {
            sendJson(res, 500, { error: error?.stack || error?.message || String(error) });
        }
    });
});

server.listen(PORT, HOST, () => {
    console.log("");
    console.log("TESTMU MANUAL REAL-DEVICE EVIDENCE RECEIVER");
    console.log("=====================================================================");
    console.log(`Listening:  http://${HOST}:${PORT}`);
    console.log(`POST:       /__qa/manual-evidence`);
    console.log(`Health:     /health`);
    console.log(`Output:     ${OUT_ROOT}`);
    console.log(`Region:     ${REGION}`);
    console.log("=====================================================================");
    console.log("Keep this process running while using ?qaManualEvidence=1 on a device.");
});
