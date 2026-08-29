/*
  Shared posture/display policy for TestMu foldable and dual-screen devices.

  POLICY
  ------
  - Book-style folds (Galaxy Z Fold, Pixel Fold/Pro Fold) require BOTH:
      folded / outer display
      unfolded / inner display
    Each display state ultimately needs portrait + landscape geometry.

  - Galaxy Z Flip / flip-style phones intentionally IGNORE the closed cover
    display for this project. Only the OPEN / UNFOLDED MAIN DISPLAY matters,
    and that main display needs portrait + landscape geometry.

  - Surface Duo remains posture/display-sensitive and is not treated as a
    normal tablet/phone orientation-only device.

  IMPORTANT
  ---------
  Orientation is never treated as proof of posture. Book folds and dual-screen
  devices are deferred from the normal orientation-only probe queue until a
  posture/display-specific allocation mechanism is verified.
*/

const normalize = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

const isFlipName = (name) =>
    /\bgalaxy z flip\b|\bz flip\b|\brazr\b/i.test(String(name || ""));

const isSurfaceDuoName = (name) =>
    /\bsurface duo\b/i.test(String(name || ""));

const isBookFoldName = (name) =>
    /\bgalaxy z fold\b|\bz fold\b|\bpixel(?: \d+)?(?: pro)? fold\b|\bpixel fold\b/i.test(
        String(name || "")
    );

function foldablePolicyFor(device = {}, traits = {}) {
    const name = String(device.deviceName || traits.deviceName || "");
    const type = String(device.deviceTypeHint || traits.deviceType || "").toLowerCase();
    const variant = String(traits.variant || "").toLowerCase();
    const family = String(traits.family || "").toLowerCase();

    const looksFoldable =
        type === "foldable" ||
        variant.includes("fold") ||
        variant === "flip" ||
        family === "galaxy-z" ||
        isBookFoldName(name) ||
        isFlipName(name) ||
        isSurfaceDuoName(name);

    if (!looksFoldable) {
        return null;
    }

    if (isFlipName(name) || variant === "flip") {
        return {
            formFactor: "flip",
            discoveryMode: "UNFOLDED_MAIN_DISPLAY_ONLY",
            coverDisplayRequired: false,
            requiredDisplayStates: ["unfolded-main-display"],
            ignoredDisplayStates: ["closed-cover-display"],
            orientationsPerRequiredDisplay: ["portrait", "landscape"],
            allowNormalOrientationProbe: true,
            postureAutomationRequiredForCompletion: false,
            mainDisplayVerification: "geometry-consistency-check",
            // Open/main Flip browsers are expected to have a long CSS edge well
            // above the small cover-display range. This is a guardrail only;
            // the exact viewport dimensions are still stored as measured.
            minMainDisplayLongEdgeCssPx: 600,
            note:
                "Closed/cover display is intentionally out of scope. Only the open/unfolded main display is certified in portrait and landscape.",
        };
    }

    if (isSurfaceDuoName(name) || family === "surface-duo") {
        return {
            formFactor: "dual-screen",
            discoveryMode: "POSTURE_SPECIFIC_REQUIRED",
            coverDisplayRequired: null,
            requiredDisplayStates: [
                "single-display-or-unspanned",
                "dual-display-or-spanned",
            ],
            ignoredDisplayStates: [],
            orientationsPerRequiredDisplay: ["portrait", "landscape"],
            allowNormalOrientationProbe: false,
            postureAutomationRequiredForCompletion: true,
            note:
                "Surface Duo display/spanning state must be verified separately; orientation-only sessions cannot mark it complete.",
        };
    }

    // Default posture-sensitive book fold: Galaxy Z Fold, Pixel Fold/Pro Fold,
    // and future book-style foldables.
    return {
        formFactor: "book-fold",
        discoveryMode: "FOLDED_OUTER_AND_UNFOLDED_INNER_REQUIRED",
        coverDisplayRequired: true,
        requiredDisplayStates: [
            "folded-outer-display",
            "unfolded-inner-display",
        ],
        ignoredDisplayStates: [],
        orientationsPerRequiredDisplay: ["portrait", "landscape"],
        allowNormalOrientationProbe: false,
        postureAutomationRequiredForCompletion: true,
        note:
            "Both folded/outer and unfolded/inner displays are required. Orientation-only sessions cannot mark a book fold complete.",
    };
}

function classifyObservedDisplay(policy, innerViewport) {
    if (!policy) {
        return {
            displayState: "standard-main-display",
            verificationStatus: "NOT_APPLICABLE",
        };
    }

    const width = Number(innerViewport?.width);
    const height = Number(innerViewport?.height);

    if (!(width > 0 && height > 0)) {
        return {
            displayState: "unverified",
            verificationStatus: "INVALID_GEOMETRY",
        };
    }

    if (policy.formFactor === "flip") {
        const longEdge = Math.max(width, height);
        const verified =
            longEdge >= Number(policy.minMainDisplayLongEdgeCssPx || 600);

        return {
            displayState: verified
                ? "unfolded-main-display"
                : "cover-display-or-unverified",
            verificationStatus: verified
                ? "VERIFIED_MAIN_DISPLAY_BY_GEOMETRY"
                : "MAIN_DISPLAY_NOT_VERIFIED",
            longEdgeCssPx: longEdge,
        };
    }

    return {
        displayState: "posture-unverified",
        verificationStatus: "POSTURE_AUTOMATION_REQUIRED",
    };
}

function registryStateMatchesDisplayPolicy(policy, state) {
    if (!policy) {
        return true;
    }

    if (policy.formFactor === "flip") {
        return (
            state?.displayState === "unfolded-main-display" &&
            state?.displayVerificationStatus ===
                "VERIFIED_MAIN_DISPLAY_BY_GEOMETRY"
        );
    }

    // Book folds / Duo must be matched by an explicit display/posture state.
    return policy.requiredDisplayStates.includes(
        state?.displayState
    );
}

module.exports = {
    normalizeFoldableName: normalize,
    foldablePolicyFor,
    classifyObservedDisplay,
    registryStateMatchesDisplayPolicy,
};
