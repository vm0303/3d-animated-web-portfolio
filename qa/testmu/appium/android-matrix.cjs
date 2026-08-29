/*
  Android real-device mobile-web matrix.

  PIPELINE RULES
  - Every active case uses TestMu's latest OS available for that exact phone.
  - The runner resolves that OS from TestMu's real-device list API before any
    Appium session starts. "latest" is a policy, not an Appium wildcard.
  - Devices run as a batch. A failure on one case never stops the remaining cases.
  - Device discovery is completed before CSS changes are made.
  - Chrome is the current device-discovery browser. Additional Android browsers
    stay disabled until the browser-expansion phase.
*/

const ANDROID_MATRIX = [
    // ===================================================
    // GOOGLE PIXEL 9 — REFERENCE DEVICE
    // ===================================================
    {
        id: "pixel9-chrome-portrait",
        enabled: true,
        deviceName: "Pixel 9",
        browserName: "Chrome",
        platformVersion: "latest",
        orientation: "portrait",
        description: "Pixel 9 Chrome portrait — Appium reference case.",
        tags: ["google", "phone", "chrome", "portrait", "reference"],
        baselinePlatformVersion: "15",
        baseline: {
            screenWidth: 412,
            screenHeight: 924,
            innerWidth: 411,
            innerHeight: 765,
            visualWidth: 411.43,
            visualHeight: 765.33,
            dpr: 2.63,
            matchingMediaQueries: 18,
            overallFailureCount: 1,
        },
    },
    {
        id: "pixel9-chrome-landscape",
        enabled: true,
        deviceName: "Pixel 9",
        browserName: "Chrome",
        platformVersion: "latest",
        orientation: "landscape",
        description: "Pixel 9 Chrome landscape — Appium reference case.",
        tags: ["google", "phone", "chrome", "landscape", "reference"],
        baselinePlatformVersion: "15",
        baseline: {
            screenWidth: 924,
            screenHeight: 412,
            innerWidth: 821,
            innerHeight: 303,
            visualWidth: 821.33,
            visualHeight: 303.24,
            dpr: 2.63,
            matchingMediaQueries: 23,
            overallFailureCount: 5,
        },
    },

    // ===================================================
    // GOOGLE PIXEL 8 PRO
    // ===================================================
    {
        id: "pixel8pro-chrome-portrait",
        enabled: true,
        deviceName: "Pixel 8 Pro",
        browserName: "Chrome",
        platformVersion: "latest",
        orientation: "portrait",
        description: "Pixel 8 Pro Chrome portrait — batch discovery case.",
        tags: ["google", "phone", "chrome", "portrait", "discovery"],
    },
    {
        id: "pixel8pro-chrome-landscape",
        enabled: true,
        deviceName: "Pixel 8 Pro",
        browserName: "Chrome",
        platformVersion: "latest",
        orientation: "landscape",
        description: "Pixel 8 Pro Chrome landscape — batch discovery case.",
        tags: ["google", "phone", "chrome", "landscape", "discovery"],
    },

    // ===================================================
    // GOOGLE PIXEL 9 PRO XL
    // ===================================================
    {
        id: "pixel9proxl-chrome-portrait",
        enabled: true,
        deviceName: "Pixel 9 Pro XL",
        browserName: "Chrome",
        platformVersion: "latest",
        orientation: "portrait",
        description: "Pixel 9 Pro XL Chrome portrait — batch discovery case.",
        tags: ["google", "phone", "chrome", "portrait", "discovery"],
    },
    {
        id: "pixel9proxl-chrome-landscape",
        enabled: true,
        deviceName: "Pixel 9 Pro XL",
        browserName: "Chrome",
        platformVersion: "latest",
        orientation: "landscape",
        description: "Pixel 9 Pro XL Chrome landscape — batch discovery case.",
        tags: ["google", "phone", "chrome", "landscape", "discovery"],
    },

    // ===================================================
    // MULTI-BROWSER PHASE — DISABLED UNTIL DEVICE BATCH ENDS
    // ===================================================
    {
        id: "pixel9-firefox-portrait-template",
        enabled: false,
        deviceName: "Pixel 9",
        browserName: "REPLACE_WITH_TESTMU_FIREFOX_BROWSER_NAME",
        platformVersion: "latest",
        orientation: "portrait",
        description: "Firefox template for the later Android browser-expansion phase.",
        tags: ["template", "firefox", "portrait", "browser-expansion"],
    },
    {
        id: "pixel9-edge-portrait-template",
        enabled: false,
        deviceName: "Pixel 9",
        browserName: "REPLACE_WITH_TESTMU_EDGE_BROWSER_NAME",
        platformVersion: "latest",
        orientation: "portrait",
        description: "Edge template for the later Android browser-expansion phase.",
        tags: ["template", "edge", "portrait", "browser-expansion"],
    },
    {
        id: "pixel9-opera-portrait-template",
        enabled: false,
        deviceName: "Pixel 9",
        browserName: "REPLACE_WITH_TESTMU_OPERA_BROWSER_NAME",
        platformVersion: "latest",
        orientation: "portrait",
        description: "Opera template for the later Android browser-expansion phase.",
        tags: ["template", "opera", "portrait", "browser-expansion"],
    },
    {
        id: "samsung-internet-portrait-template",
        enabled: false,
        deviceName: "REPLACE_WITH_TESTMU_SAMSUNG_DEVICE_NAME",
        browserName: "REPLACE_WITH_TESTMU_SAMSUNG_INTERNET_BROWSER_NAME",
        platformVersion: "latest",
        orientation: "portrait",
        description: "Samsung Internet template for the later Android browser-expansion phase.",
        tags: ["template", "samsung", "samsung-internet", "portrait", "browser-expansion"],
    },
];

module.exports = {
    ANDROID_MATRIX,
};
