const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const {
    runAndroidMobileWebTest,
    slugify,
    timestampForFilename,
} = require("./android-mobile-web.cjs");

const {
    ANDROID_MATRIX,
} = require("./android-matrix.cjs");

const LT_USERNAME = process.env.LT_USERNAME;
const LT_ACCESS_KEY = process.env.LT_ACCESS_KEY;
const TESTMU_REGION =
    process.env.QA_TESTMU_REGION ||
    process.env.LT_REGION ||
    "us";

const MATRIX_OUTPUT_ROOT = path.join(
    process.cwd(),
    "qa-results",
    "testmu",
    "appium",
    "matrix"
);

// =======================================================
// CLI
// =======================================================

const parseArgs = (argv) => {
    const args = {
        list: false,
        dryRun: false,
        includeDisabled: false,
        ids: null,
        device: null,
        browser: null,
        orientation: null,
        tag: null,
        concurrency: Number(process.env.QA_MATRIX_CONCURRENCY || 1),
    };

    for (const token of argv) {
        if (token === "--list") {
            args.list = true;
        } else if (token === "--dry-run") {
            args.dryRun = true;
        } else if (token === "--include-disabled") {
            args.includeDisabled = true;
        } else if (token.startsWith("--ids=")) {
            args.ids = token
                .slice("--ids=".length)
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean);
        } else if (token.startsWith("--device=")) {
            args.device = token.slice("--device=".length).trim();
        } else if (token.startsWith("--browser=")) {
            args.browser = token.slice("--browser=".length).trim();
        } else if (token.startsWith("--orientation=")) {
            args.orientation = token
                .slice("--orientation=".length)
                .trim()
                .toLowerCase();
        } else if (token.startsWith("--tag=")) {
            args.tag = token.slice("--tag=".length).trim().toLowerCase();
        } else if (token.startsWith("--concurrency=")) {
            args.concurrency = Number(token.slice("--concurrency=".length));
        } else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
        throw new Error("Concurrency must be an integer of 1 or greater.");
    }

    return args;
};

const selectTests = (matrix, args) => {
    let selected = [...matrix];

    if (!args.includeDisabled) {
        selected = selected.filter((testCase) => testCase.enabled !== false);
    }

    if (args.ids?.length) {
        const wanted = new Set(args.ids);
        selected = selected.filter((testCase) => wanted.has(testCase.id));
    }

    if (args.device) {
        const wanted = args.device.toLowerCase();
        selected = selected.filter(
            (testCase) => testCase.deviceName.toLowerCase() === wanted
        );
    }

    if (args.browser) {
        const wanted = args.browser.toLowerCase();
        selected = selected.filter(
            (testCase) => testCase.browserName.toLowerCase() === wanted
        );
    }

    if (args.orientation) {
        selected = selected.filter(
            (testCase) =>
                String(testCase.orientation).toLowerCase() === args.orientation
        );
    }

    if (args.tag) {
        selected = selected.filter((testCase) =>
            (testCase.tags || [])
                .map((tag) => String(tag).toLowerCase())
                .includes(args.tag)
        );
    }

    return selected;
};

const printMatrix = (matrix) => {
    console.log("");
    console.log("ANDROID MOBILE-WEB MATRIX");
    console.log("===============================================================");

    for (const testCase of matrix) {
        console.log(
            `${testCase.enabled === false ? "OFF" : "ON "} | ` +
            `${testCase.id} | ${testCase.deviceName} | ` +
            `${testCase.browserName} | ${testCase.orientation} | ` +
            `OS=${testCase.platformVersion || "latest"}`
        );
    }

    console.log("===============================================================");
    console.log("");
};

// =======================================================
// TESTMU DEVICE CATALOG / LATEST OS RESOLUTION
// =======================================================

const requireCredentials = () => {
    if (!LT_USERNAME) {
        throw new Error("LT_USERNAME environment variable is missing.");
    }

    if (!LT_ACCESS_KEY) {
        throw new Error("LT_ACCESS_KEY environment variable is missing.");
    }
};

const normalizeName = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

const normalizeVersion = (value) => {
    const match = String(value || "").match(/\d+(?:\.\d+)*/);
    return match ? match[0] : null;
};

const compareVersions = (a, b) => {
    const left = String(a)
        .split(".")
        .map((part) => Number(part));
    const right = String(b)
        .split(".")
        .map((part) => Number(part));
    const length = Math.max(left.length, right.length);

    for (let index = 0; index < length; index += 1) {
        const delta = (left[index] || 0) - (right[index] || 0);
        if (delta !== 0) {
            return delta;
        }
    }

    return 0;
};

const namesMatch = (catalogName, requestedName) => {
    const catalog = normalizeName(catalogName);
    const requested = normalizeName(requestedName);

    if (!catalog || !requested) {
        return false;
    }

    // Exact match is preferred. endsWith also accepts catalog names such as
    // "Google Pixel 9" for a matrix request of "Pixel 9" without allowing
    // "Pixel 9 Pro XL" to match "Pixel 9".
    return (
        catalog === requested ||
        catalog.endsWith(requested) ||
        requested.endsWith(catalog)
    );
};

const getFirstString = (object, keys) => {
    for (const key of keys) {
        const value = object?.[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return null;
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
                if (typeof item === "string" || typeof item === "number") {
                    const normalized = normalizeVersion(item);
                    if (normalized) {
                        versions.push(normalized);
                    }
                } else if (item && typeof item === "object") {
                    const nested = getFirstString(item, [
                        "platformVersion",
                        "platform_version",
                        "osVersion",
                        "os_version",
                        "version",
                        "name",
                    ]);
                    const normalized = normalizeVersion(nested);
                    if (normalized) {
                        versions.push(normalized);
                    }
                }
            }
        } else if (typeof value === "string" || typeof value === "number") {
            const normalized = normalizeVersion(value);
            if (normalized) {
                versions.push(normalized);
            }
        }
    }

    return [...new Set(versions)];
};

const extractCatalogRecords = (payload) => {
    const records = [];
    const seen = new Set();

    const addRecord = (deviceName, platformVersion, platformName, raw) => {
        const version = normalizeVersion(platformVersion);
        if (!deviceName || !version) {
            return;
        }

        const key = `${normalizeName(deviceName)}|${version}|${normalizeName(platformName)}`;
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        records.push({
            deviceName: String(deviceName),
            platformVersion: version,
            platformName: platformName ? String(platformName) : null,
            raw,
        });
    };

    const visit = (node, context = {}) => {
        if (Array.isArray(node)) {
            node.forEach((item) => visit(item, context));
            return;
        }

        if (!node || typeof node !== "object") {
            return;
        }

        const directName = getFirstString(node, [
            "deviceName",
            "device_name",
            "deviceModel",
            "device_model",
            "model",
            "name",
        ]);

        const directPlatform = getFirstString(node, [
            "platformName",
            "platform_name",
            "platform",
            "os",
        ]);

        const deviceName = directName || context.deviceName || null;
        const platformName = directPlatform || context.platformName || null;
        const directVersions = getVersionValues(node);
        const versions = directVersions.length
            ? directVersions
            : context.platformVersion
                ? [context.platformVersion]
                : [];

        for (const version of versions) {
            addRecord(deviceName, version, platformName, node);
        }

        for (const [key, value] of Object.entries(node)) {
            if (!value || (typeof value !== "object" && !Array.isArray(value))) {
                continue;
            }

            const childContext = {
                deviceName: deviceName || context.deviceName || null,
                platformName: platformName || context.platformName || null,
                platformVersion: context.platformVersion || null,
            };

            // Some catalog responses group devices beneath an OS-version key.
            const versionFromKey =
                /^(?:android\s*)?\d+(?:\.\d+)*$/i.test(key.trim())
                    ? normalizeVersion(key)
                    : null;

            if (versionFromKey) {
                childContext.platformVersion = versionFromKey;
            }

            visit(value, childContext);
        }
    };

    visit(payload);
    return records;
};

const requestJson = (url) =>
    new Promise((resolve, reject) => {
        const authorization = Buffer.from(
            `${LT_USERNAME}:${LT_ACCESS_KEY}`
        ).toString("base64");

        const request = https.get(
            url,
            {
                headers: {
                    Accept: "application/json",
                    Authorization: `Basic ${authorization}`,
                    "User-Agent": "portfolio-qa-testmu-matrix/1.0",
                },
            },
            (response) => {
                let body = "";

                response.setEncoding("utf8");
                response.on("data", (chunk) => {
                    body += chunk;
                });

                response.on("end", () => {
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
                        resolve(JSON.parse(body));
                    } catch (error) {
                        reject(
                            new Error(
                                `TestMu device-list API returned invalid JSON: ${error.message}`
                            )
                        );
                    }
                });
            }
        );

        request.setTimeout(30000, () => {
            request.destroy(
                new Error("TestMu device-list API timed out after 30 seconds.")
            );
        });

        request.on("error", reject);
    });

const fetchAndroidDeviceCatalog = async () => {
    requireCredentials();

    const primaryUrl = new URL(
        "https://mobile-api.lambdatest.com/mobile-automation/api/v1/list"
    );
    primaryUrl.searchParams.set("region", TESTMU_REGION);
    primaryUrl.searchParams.set("os", "android");

    const fallbackUrl = new URL(
        "https://manual-api.lambdatest.com/list"
    );
    fallbackUrl.searchParams.set("region", TESTMU_REGION);

    console.log("");
    console.log("Resolving latest Android OS versions from TestMu...");
    console.log(`Region: ${TESTMU_REGION}`);

    const attempts = [primaryUrl, fallbackUrl];
    const errors = [];

    for (const url of attempts) {
        try {
            const payload = await requestJson(url);
            const records = extractCatalogRecords(payload);

            if (!records.length) {
                throw new Error(
                    "API returned data, but no device/version records could be parsed."
                );
            }

            console.log(
                `Parsed ${records.length} device/version record(s) from ${url.hostname}.`
            );

            return {
                fetchedAt: new Date().toISOString(),
                region: TESTMU_REGION,
                sourceUrl: url.toString(),
                recordCount: records.length,
                records,
            };
        } catch (error) {
            errors.push(`${url.toString()} -> ${error.message}`);
            console.warn(
                `Device catalog source failed: ${url.hostname}`
            );
        }
    }

    throw new Error(
        "Could not resolve the TestMu real-device catalog from either supported endpoint. " +
        "No wildcard OS fallback is allowed. " +
        errors.join(" | ")
    );
};

const resolveLatestOsForDevice = (catalog, requestedDeviceName) => {
    const matches = catalog.records.filter((record) => {
        if (!namesMatch(record.deviceName, requestedDeviceName)) {
            return false;
        }

        if (!record.platformName) {
            return true;
        }

        return normalizeName(record.platformName).includes("android");
    });

    if (!matches.length) {
        throw new Error(
            `No Android device catalog entry matched "${requestedDeviceName}" in TestMu region ${catalog.region}.`
        );
    }

    const availableVersions = [...new Set(
        matches.map((record) => record.platformVersion)
    )].sort(compareVersions).reverse();

    const selectedPlatformVersion = availableVersions[0];
    const selectedRecords = matches.filter(
        (record) =>
            compareVersions(record.platformVersion, selectedPlatformVersion) === 0
    );

    return {
        policy: "latest-available-for-device",
        resolvedAt: new Date().toISOString(),
        region: catalog.region,
        sourceUrl: catalog.sourceUrl,
        requestedDeviceName,
        matchedDeviceNames: [...new Set(matches.map((record) => record.deviceName))],
        availableVersions,
        selectedPlatformVersion,
        selectedCatalogRecords: selectedRecords.map((record) => ({
            deviceName: record.deviceName,
            platformName: record.platformName,
            platformVersion: record.platformVersion,
            raw: record.raw,
        })),
    };
};

const prepareLatestOsCases = async (selected) => {
    let catalog = null;
    let catalogError = null;

    try {
        catalog = await fetchAndroidDeviceCatalog();
    } catch (error) {
        catalogError = error;
        console.error("");
        console.error("LATEST OS DISCOVERY FAILED");
        console.error(error.message);
        console.error(
            "No Appium case will fall back to .* or an older hard-coded OS."
        );
    }

    const cache = new Map();

    return selected.map((testCase) => {
        if (catalogError) {
            return {
                ...testCase,
                preparationError: catalogError,
                latestOsSelection: {
                    policy: "latest-available-for-device",
                    resolvedAt: new Date().toISOString(),
                    region: TESTMU_REGION,
                    requestedDeviceName: testCase.deviceName,
                    selectedPlatformVersion: null,
                    error: catalogError.message,
                },
            };
        }

        try {
            if (!cache.has(testCase.deviceName)) {
                cache.set(
                    testCase.deviceName,
                    resolveLatestOsForDevice(catalog, testCase.deviceName)
                );
            }

            const latestOsSelection = cache.get(testCase.deviceName);

            return {
                ...testCase,
                platformVersion: latestOsSelection.selectedPlatformVersion,
                latestOsSelection,
            };
        } catch (error) {
            return {
                ...testCase,
                preparationError: error,
                latestOsSelection: {
                    policy: "latest-available-for-device",
                    resolvedAt: new Date().toISOString(),
                    region: TESTMU_REGION,
                    requestedDeviceName: testCase.deviceName,
                    selectedPlatformVersion: null,
                    error: error.message,
                },
            };
        }
    });
};

// =======================================================
// BATCH EXECUTION
// =======================================================

const runWithConcurrency = async (tests, concurrency, runner) => {
    const results = new Array(tests.length);
    let nextIndex = 0;

    const worker = async () => {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;

            if (index >= tests.length) {
                return;
            }

            const testCase = tests[index];

            try {
                results[index] = await runner(testCase, index);
            } catch (error) {
                results[index] = {
                    id: testCase.id,
                    status: "INFRA_FAIL",
                    infrastructurePassed: false,
                    qaPassed: false,
                    deviceName: testCase.deviceName,
                    browserName: testCase.browserName,
                    orientation: testCase.orientation,
                    platformVersion: testCase.platformVersion || null,
                    reasons: [error.message],
                    errorName: error.name,
                    errorMessage: error.message,
                    errorStack: error.stack,
                };
            }
        }
    };

    const workerCount = Math.min(concurrency, tests.length);
    await Promise.all(
        Array.from({ length: workerCount }, () => worker())
    );

    return results;
};

const buildArtifactStem = (testCase, osVersion) => {
    const version = osVersion || "LATEST-UNRESOLVED";
    return [
        slugify(testCase.deviceName),
        `Android-${slugify(version)}`,
        slugify(testCase.browserName),
        slugify(testCase.orientation),
    ].join("__");
};

const writePreparationFailure = (
    testCase,
    matrixRunId,
    buildName
) => {
    const outputDirectory = path.join(
        MATRIX_OUTPUT_ROOT,
        slugify(matrixRunId)
    );
    fs.mkdirSync(outputDirectory, { recursive: true });

    const stem = buildArtifactStem(testCase, null);
    const timestamp = timestampForFilename();
    const jsonPath = path.join(
        outputDirectory,
        `${stem}__${timestamp}.json`
    );
    const latestJsonPath = path.join(
        outputDirectory,
        `${stem}__latest.json`
    );

    const error = testCase.preparationError || new Error("Unknown preparation error.");
    const document = {
        artifactType: "device-result",
        status: "INFRA_FAIL",
        matrixRunId,
        buildName,
        createdAt: new Date().toISOString(),
        matrixCase: {
            id: testCase.id,
            deviceName: testCase.deviceName,
            browserName: testCase.browserName,
            orientation: testCase.orientation,
        },
        latestOsSelection: testCase.latestOsSelection || null,
        deviceSpecifications: {
            requested: {
                deviceName: testCase.deviceName,
                manufacturer: null,
                platformName: "Android",
                platformVersionPolicy: "latest-available-for-device",
                platformVersion: null,
                browserName: testCase.browserName,
                orientation: testCase.orientation,
                region: TESTMU_REGION,
            },
            resolved: null,
        },
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
        },
    };

    const text = JSON.stringify(document, null, 2);
    fs.writeFileSync(jsonPath, text, "utf8");
    fs.writeFileSync(latestJsonPath, text, "utf8");

    console.error("");
    console.error(`SKIPPING SESSION — ${testCase.id}`);
    console.error(error.message);
    console.error(`Failure JSON: ${jsonPath}`);

    return {
        id: testCase.id,
        status: "INFRA_FAIL",
        infrastructurePassed: false,
        qaPassed: false,
        deviceName: testCase.deviceName,
        browserName: testCase.browserName,
        orientation: testCase.orientation,
        platformVersion: null,
        latestOsSelection: testCase.latestOsSelection || null,
        reasons: [error.message],
        jsonPath,
        screenshotPath: null,
    };
};

// =======================================================
// SUMMARY
// =======================================================

const printRunSummary = (results) => {
    const passCount = results.filter((result) => result.status === "PASS").length;
    const qaFailCount = results.filter((result) => result.status === "QA_FAIL").length;
    const infraFailCount = results.filter((result) => result.status === "INFRA_FAIL").length;

    console.log("");
    console.log("#####################################################################");
    console.log("ANDROID REAL-DEVICE BATCH SUMMARY");
    console.log("#####################################################################");
    console.log(`Total:       ${results.length}`);
    console.log(`PASS:        ${passCount}`);
    console.log(`QA_FAIL:     ${qaFailCount}`);
    console.log(`INFRA_FAIL:  ${infraFailCount}`);
    console.log("");

    for (const result of results) {
        const viewport = result.viewport?.inner
            ? `${result.viewport.inner.width}x${result.viewport.inner.height}`
            : "no viewport";
        const os = result.platformVersion
            ? `Android ${result.platformVersion}`
            : "Android OS unresolved";

        console.log(
            `${result.status.padEnd(10)} | ` +
            `${result.deviceName} | ${os} | ${result.browserName} | ` +
            `${result.orientation} | ${viewport}`
        );
    }

    console.log("#####################################################################");
    console.log("");

    return { passCount, qaFailCount, infraFailCount };
};

// =======================================================
// MAIN
// =======================================================

(async () => {
    try {
        const args = parseArgs(process.argv.slice(2));

        if (args.list) {
            printMatrix(ANDROID_MATRIX);
            return;
        }

        const selected = selectTests(ANDROID_MATRIX, args);

        if (!selected.length) {
            throw new Error("No matrix tests matched the selected filters.");
        }

        console.log("");
        console.log(`Selected ${selected.length} test(s).`);
        console.log(`Concurrency: ${args.concurrency}`);
        console.log("OS policy: latest TestMu OS available for each phone");

        selected.forEach((testCase, index) => {
            console.log(
                `${index + 1}. ${testCase.id} — ` +
                `${testCase.deviceName} / ${testCase.browserName} / ` +
                `${testCase.orientation} / OS=latest`
            );
        });

        if (args.dryRun) {
            console.log("");
            console.log(
                "Dry run complete. Latest OS versions will be resolved from TestMu during a real batch; no sessions were started."
            );
            return;
        }

        const matrixRunId = `android-matrix-${timestampForFilename()}`;
        const buildName = `Portfolio Android Matrix ${new Date().toISOString()}`;
        const prepared = await prepareLatestOsCases(selected);

        console.log("");
        console.log("LATEST OS PLAN");
        console.log("===============================================================");
        for (const testCase of prepared) {
            console.log(
                `${testCase.deviceName} | ` +
                `${testCase.preparationError ? "UNRESOLVED" : `Android ${testCase.platformVersion}`} | ` +
                `${testCase.browserName} | ${testCase.orientation}`
            );
        }
        console.log("===============================================================");

        const results = await runWithConcurrency(
            prepared,
            args.concurrency,
            async (testCase) => {
                if (testCase.preparationError) {
                    return writePreparationFailure(
                        testCase,
                        matrixRunId,
                        buildName
                    );
                }

                return runAndroidMobileWebTest(testCase, {
                    matrixRunId,
                    buildName,
                    project: "3D Portfolio Hero QA",
                    logLevel: "warn",
                    region: TESTMU_REGION,
                });
            }
        );

        const counts = printRunSummary(results);
        const outputDirectory = path.join(
            MATRIX_OUTPUT_ROOT,
            slugify(matrixRunId)
        );
        fs.mkdirSync(outputDirectory, { recursive: true });

        const summary = {
            artifactType: "multi-device-batch-summary",
            matrixRunId,
            buildName,
            createdAt: new Date().toISOString(),
            platform: "Android",
            region: TESTMU_REGION,
            osPolicy: "latest-available-for-device",
            filters: {
                ids: args.ids,
                device: args.device,
                browser: args.browser,
                orientation: args.orientation,
                tag: args.tag,
                includeDisabled: args.includeDisabled,
                concurrency: args.concurrency,
            },
            counts: {
                total: results.length,
                pass: counts.passCount,
                qaFail: counts.qaFailCount,
                infraFail: counts.infraFailCount,
            },
            results,
        };

        const summaryPath = path.join(
            outputDirectory,
            "MULTI-DEVICE__matrix-summary.json"
        );
        const latestSummaryPath = path.join(
            MATRIX_OUTPUT_ROOT,
            "MULTI-DEVICE__latest-matrix-summary.json"
        );
        const summaryText = JSON.stringify(summary, null, 2);

        fs.writeFileSync(summaryPath, summaryText, "utf8");
        fs.writeFileSync(latestSummaryPath, summaryText, "utf8");

        console.log("Batch summary saved to:");
        console.log(summaryPath);
        console.log("");
        console.log(
            "Exit codes: 0 = all pass, 1 = QA failures, 2 = one or more infrastructure failures. The batch always attempts every selected case."
        );

        if (counts.infraFailCount > 0) {
            process.exitCode = 2;
        } else if (counts.qaFailCount > 0) {
            process.exitCode = 1;
        }
    } catch (error) {
        console.error("");
        console.error("MATRIX RUNNER FAILED");
        console.error(error);
        process.exitCode = 2;
    }
})();
