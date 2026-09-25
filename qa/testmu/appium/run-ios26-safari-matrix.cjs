const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
    runIos26SafariCase,
} = require("./ios26-safari-liquid-ui.cjs");

const timestamp = () =>
    new Date().toISOString().replace(/[:.]/g, "-");

const normVersion = (value) => {
    const match = String(value ?? "").match(/\d+(?:\.\d+)*/);
    if (!match) return null;
    const parts = match[0].split(".");
    while (parts.length > 1 && Number(parts.at(-1)) === 0) {
        parts.pop();
    }
    return parts.join(".");
};

const parseArgs = () => {
    const args = {
        list: false,
        refreshInventory: false,
        maxDevices: null,
        device: null,
        region:
            process.env.QA_TESTMU_REGION ||
            process.env.LT_REGION ||
            "us",
    };

    for (const token of process.argv.slice(2)) {
        if (token === "--list") {
            args.list = true;
        } else if (token === "--refresh-inventory") {
            args.refreshInventory = true;
        } else if (token.startsWith("--max-devices=")) {
            args.maxDevices = Number(
                token.slice("--max-devices=".length)
            );
        } else if (token.startsWith("--device=")) {
            args.device = token.slice("--device=".length).trim();
        } else if (token.startsWith("--region=")) {
            args.region = token.slice("--region=".length).trim();
        } else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }

    return args;
};

const inventoryPath = (region) =>
    path.resolve(
        process.cwd(),
        "qa-results",
        "testmu",
        "catalog",
        `TESTMU__candidate-device-inventory__${region}__latest.json`
    );

const refreshInventory = (region) => {
    console.log(
        `Refreshing TestMu iOS inventory in region ${region}...`
    );

    const result = spawnSync(
        process.execPath,
        [
            path.join(
                "qa",
                "testmu",
                "appium",
                "generate-testmu-device-inventory.cjs"
            ),
            "--platform=ios",
            `--region=${region}`,
        ],
        {
            stdio: "inherit",
            env: process.env,
        }
    );

    if (result.status !== 0) {
        throw new Error(
            `Inventory refresh failed with exit code ${result.status}.`
        );
    }
};

const loadCandidates = (region) => {
    const file = inventoryPath(region);

    if (!fs.existsSync(file)) {
        throw new Error(
            `Missing inventory: ${file}\n` +
            `Run with --refresh-inventory first.`
        );
    }

    const inventory = JSON.parse(
        fs.readFileSync(file, "utf8")
    );

    const candidates = (inventory.devices || [])
        .filter((device) => {
            const platform =
                String(device.platformName || "").toLowerCase();
            const name =
                String(device.deviceName || "");
            const versions =
                device.availableOsVersions || [];

            return (
                platform === "ios" &&
                /^iphone\b/i.test(name) &&
                versions.some(
                    (version) => normVersion(version) === "26"
                )
            );
        })
        .map((device) => ({
            id:
                `ios26-safari-${device.deviceName}`.replace(
                    /[^a-z0-9._-]+/gi,
                    "-"
                ),
            deviceName: device.deviceName,
            platformVersion: "26",
            browserName: "Safari",
            orientation: "portrait",
            inventory: {
                availableOsVersions:
                    device.availableOsVersions || [],
                latestOsVersion:
                    device.latestOsVersion || null,
                deviceTypeHint:
                    device.deviceTypeHint || null,
            },
        }))
        .sort((a, b) =>
            a.deviceName.localeCompare(b.deviceName)
        );

    return {
        inventory,
        candidates,
        file,
    };
};

const main = async () => {
    const args = parseArgs();

    if (args.refreshInventory) {
        refreshInventory(args.region);
    }

    const loaded = loadCandidates(args.region);
    let cases = loaded.candidates;

    if (args.device) {
        const wanted = args.device.toLowerCase();

        const exactMatches = cases.filter(
            (item) => item.deviceName.toLowerCase() === wanted
        );

        cases =
            exactMatches.length > 0
                ? exactMatches
                : cases.filter((item) =>
                    item.deviceName.toLowerCase().includes(wanted)
                );
    }

    if (
        Number.isFinite(args.maxDevices) &&
        args.maxDevices > 0
    ) {
        cases = cases.slice(0, args.maxDevices);
    }

    console.log("");
    console.log("TESTMU iOS 26 SAFARI PHONE MATRIX");
    console.log("====================================================");
    console.log(`Inventory: ${loaded.file}`);
    console.log(
        `Eligible iOS 26 iPhones: ${loaded.candidates.length}`
    );

    for (const item of loaded.candidates) {
        console.log(
            `  - ${item.deviceName} | available OS: ` +
            `${item.inventory.availableOsVersions.join(", ")}`
        );
    }

    if (args.list) {
        return;
    }

    if (cases.length === 0) {
        throw new Error("No matching iOS 26 iPhone cases.");
    }

    const runId = `ios26-safari-matrix-${timestamp()}`;
    const results = [];

    for (let index = 0; index < cases.length; index += 1) {
        console.log("");
        console.log(
            `[${index + 1}/${cases.length}] ${cases[index].deviceName}`
        );

        results.push(
            await runIos26SafariCase(
                cases[index],
                {
                    runId,
                    buildName:
                        "Portfolio iOS 26 Safari Liquid UI Matrix",
                }
            )
        );
    }

    const summary = {
        total: results.length,
        passGeometryVisualReviewRequired:
            results.filter(
                (item) =>
                    item.status ===
                    "PASS_GEOMETRY_VISUAL_REVIEW_REQUIRED"
            ).length,
        fail:
            results.filter(
                (item) => item.status === "FAIL"
            ).length,
        error:
            results.filter(
                (item) => item.status === "ERROR"
            ).length,
    };

    const outputDir = path.resolve(
        process.cwd(),
        "qa-results",
        "testmu",
        "appium",
        "ios26-safari",
        runId
    );
    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(
        path.join(outputDir, "matrix-summary.json"),
        `${JSON.stringify(
            {
                artifactType:
                    "testmu-ios26-safari-liquid-ui-matrix",
                generatedAt: new Date().toISOString(),
                region: args.region,
                inventoryFile: loaded.file,
                summary,
                results,
            },
            null,
            2
        )}\n`,
        "utf8"
    );

    console.log("");
    console.log("MATRIX COMPLETE");
    console.log("====================================================");
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Output: ${outputDir}`);

    if (summary.fail > 0 || summary.error > 0) {
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
});
