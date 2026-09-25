/*
  Portfolio Hero QA
  Phase 1 - Version 4.1

  V4.1 adds:
  - Individual certification-image verification
  - Expected certification-image count
  - Image load/error detection using complete + natural dimensions
  - Per-image src/currentSrc/alt/natural/rendered/visibility data
  - Main Hero image load verification
  - Image-loading failures included in summary.overall

  V4 behavior retained:
  - Rendered visibility checks
  - Expected-visible / expected-hidden policy checks
  - Unexpected hidden/visible failures
  - Hidden elements excluded from meaningless clipping checks
  - Image crop percentages and configurable crop limits
  - Portrait bubble-placement analysis
  - Media-query capture
  - JSON save + clipboard support

  Normal:
    http://localhost:5173/

  QA:
    http://localhost:5173/?qa=1

  QA without overlay:
    http://localhost:5173/?qa=1&qaOverlay=0

  Optional policy overrides:
    &qaExpectVisible=scrollSvg,bubble
    &qaExpectHidden=bubble
    &qaOptional=scrollSvg
    &qaExpectedCertificationImages=3
    &qaHeroImageMaxHorizontalCropPct=15
    &qaHeroImageMaxVerticalCropPct=15

  Console:
    window.__PORTFOLIO_QA__.capture()
*/

// =======================================================
// CONFIG
// =======================================================

const QA_VERSION = 4.1;

const NEGLIGIBLE_CLIP_MAX = 2;
const WARNING_CLIP_MAX = 8;
const BUBBLE_MIN_GAP = 8;

const DEFAULT_EXPECTED_CERTIFICATION_IMAGE_COUNT = 3;

const DEFAULT_HERO_IMAGE_MAX_HORIZONTAL_CROP_PERCENT =
    15;

const DEFAULT_HERO_IMAGE_MAX_VERTICAL_CROP_PERCENT =
    15;

const VISIBILITY_SIZE_EPSILON =
    0.5;

const VISIBILITY_OPACITY_EPSILON =
    0.001;

const QA_STABILIZER_STYLE_ID =
    "portfolio-qa-stabilizer";


// =======================================================
// QA STABILIZATION
// =======================================================

const installQaStabilizer =
    () => {

        document
            .getElementById(
                QA_STABILIZER_STYLE_ID
            )
            ?.remove();


        const style =
            document.createElement(
                "style"
            );


        style.id =
            QA_STABILIZER_STYLE_ID;


        style.textContent = `
            html[data-qa="true"] .heroTitle,
            html[data-qa="true"] .certifications,
            html[data-qa="true"] .certificationsImages img,
            html[data-qa="true"] .socials,
            html[data-qa="true"] .socials a,
            html[data-qa="true"] .contactButtonLink {
                opacity: 1 !important;
                transform: none !important;
                animation: none !important;
                transition: none !important;
            }


            /*
              Preserve responsive translateY()
              on the bubble.
            */

            html[data-qa="true"] .bubbleContainer {
                opacity: 1 !important;
                animation: none !important;
                transition: none !important;
            }


            /*
              Preserve the real .bg layout.
            */

            html[data-qa="true"] .bg {
                opacity: 1 !important;
                animation: none !important;
                transition: none !important;
            }


            /*
              Freeze the Motion wrapper,
              but preserve .scroll > svg transform.
            */

            html[data-qa="true"] .scroll {
                opacity: 1 !important;
                transform: none !important;
                animation: none !important;
                transition: none !important;
            }


            html[data-qa="true"] .scroll svg path {
                transform: none !important;
                animation: none !important;
                transition: none !important;
            }


            /*
              Freeze the rotating contact control.
            */

            html[data-qa="true"] .contactButton {
                transform: rotate(0deg) !important;
                animation: none !important;
                transition: none !important;
            }
        `;


        document.head.appendChild(
            style
        );


        document
            .documentElement
            .dataset
            .qaStable =
            "true";


        return () => {

            style.remove();


            delete document
                .documentElement
                .dataset
                .qaStable;

        };

    };


// =======================================================
// BASIC HELPERS
// =======================================================

const round =
    (
        value
    ) => {

        if (
            typeof value !==
                "number" ||
            !Number.isFinite(
                value
            )
        ) {

            return null;

        }


        return Math.round(
            value * 100
        ) / 100;

    };


const maxNumber =
    (
        values
    ) => {

        const valid =
            values.filter(
                (
                    value
                ) =>
                    typeof value ===
                        "number" &&
                    Number.isFinite(
                        value
                    )
            );


        return valid.length
            ? Math.max(
                ...valid
            )
            : 0;

    };


const getOrientation =
    () => {

        const screenOrientation =
            window
                .screen
                ?.orientation
                ?.type;


        if (
            screenOrientation
        ) {

            return screenOrientation;

        }


        return (
            window.innerWidth >
            window.innerHeight
        )
            ? "landscape"
            : "portrait";

    };


const isPortraitOrientation =
    (
        orientation
    ) =>
        String(
            orientation
        ).startsWith(
            "portrait"
        );


const describeElement =
    (
        element
    ) => {

        if (
            !element
        ) {

            return null;

        }


        let name =
            element
                .tagName
                ?.toLowerCase?.() ||
            "element";


        if (
            element.id
        ) {

            name +=
                `#${element.id}`;

        }


        if (
            element
                .classList
                ?.length
        ) {

            name +=
                `.${[
                    ...element.classList,
                ].join(".")}`;

        }


        return name;

    };


const rectToObject =
    (
        rect
    ) => ({

        x:
            round(
                rect.x
            ),

        y:
            round(
                rect.y
            ),

        top:
            round(
                rect.top
            ),

        right:
            round(
                rect.right
            ),

        bottom:
            round(
                rect.bottom
            ),

        left:
            round(
                rect.left
            ),

        width:
            round(
                rect.width
            ),

        height:
            round(
                rect.height
            ),

    });


const getTransformTranslation =
    (
        transform
    ) => {

        if (
            !transform ||
            transform ===
                "none"
        ) {

            return {
                x: 0,
                y: 0,
            };

        }


        try {

            const matrix =
                new DOMMatrixReadOnly(
                    transform
                );


            return {

                x:
                    round(
                        matrix.m41
                    ),

                y:
                    round(
                        matrix.m42
                    ),

            };

        } catch {

            return {
                x: null,
                y: null,
            };

        }

    };


const parseElementNameList =
    (
        params,
        key,
        validNames
    ) => {

        const raw =
            params.get(
                key
            );


        if (
            !raw
        ) {

            return [];

        }


        return raw
            .split(
                ","
            )
            .map(
                (
                    value
                ) =>
                    value.trim()
            )
            .filter(
                Boolean
            )
            .filter(
                (
                    name
                ) =>
                    validNames
                        .has(
                            name
                        )
            );

    };


const parseFiniteNumberParam =
    (
        params,
        key,
        fallback
    ) => {

        const raw =
            params.get(
                key
            );


        if (
            raw === null ||
            raw === ""
        ) {

            return fallback;

        }


        const value =
            Number(
                raw
            );


        return (
            Number.isFinite(
                value
            ) &&
            value >= 0
        )
            ? value
            : fallback;

    };


const parseNonNegativeIntegerParam =
    (
        params,
        key,
        fallback
    ) => {

        const value =
            parseFiniteNumberParam(
                params,
                key,
                fallback
            );


        return Number.isInteger(
            value
        )
            ? value
            : fallback;

    };


// =======================================================
// VIEWPORT
// =======================================================

const getVisibleViewport =
    () => {

        const visualViewport =
            window.visualViewport;


        if (
            !visualViewport
        ) {

            return {

                left:
                    0,

                top:
                    0,

                right:
                    window.innerWidth,

                bottom:
                    window.innerHeight,

                width:
                    window.innerWidth,

                height:
                    window.innerHeight,

            };

        }


        const left =
            visualViewport
                .offsetLeft;


        const top =
            visualViewport
                .offsetTop;


        return {

            left:
                round(
                    left
                ),

            top:
                round(
                    top
                ),

            right:
                round(
                    left +
                    visualViewport.width
                ),

            bottom:
                round(
                    top +
                    visualViewport.height
                ),

            width:
                round(
                    visualViewport.width
                ),

            height:
                round(
                    visualViewport.height
                ),

        };

    };


const captureViewportSnapshot =
    () => {

        const visualViewport =
            window.visualViewport;


        const clientWidth =
            document
                .documentElement
                .clientWidth;


        const clientHeight =
            document
                .documentElement
                .clientHeight;


        const innerWidth =
            window.innerWidth;


        const innerHeight =
            window.innerHeight;


        return {

            capturedAt:
                new Date()
                    .toISOString(),

            url:
                window
                    .location
                    .href,

            orientation:
                getOrientation(),

            layoutMode:
                innerWidth >
                innerHeight
                    ? "landscape"
                    : "portrait",


            inner: {

                width:
                    innerWidth,

                height:
                    innerHeight,

            },


            visual:
                visualViewport
                    ? {

                        width:
                            round(
                                visualViewport
                                    .width
                            ),

                        height:
                            round(
                                visualViewport
                                    .height
                            ),

                        scale:
                            round(
                                visualViewport
                                    .scale
                            ),

                        offsetTop:
                            round(
                                visualViewport
                                    .offsetTop
                            ),

                        offsetLeft:
                            round(
                                visualViewport
                                    .offsetLeft
                            ),

                        pageTop:
                            round(
                                visualViewport
                                    .pageTop
                            ),

                        pageLeft:
                            round(
                                visualViewport
                                    .pageLeft
                            ),

                    }
                    : null,


            visibleViewport:
                getVisibleViewport(),


            screen: {

                width:
                    window
                        .screen
                        ?.width ??
                    null,

                height:
                    window
                        .screen
                        ?.height ??
                    null,

                availWidth:
                    window
                        .screen
                        ?.availWidth ??
                    null,

                availHeight:
                    window
                        .screen
                        ?.availHeight ??
                    null,

            },


            document: {

                clientWidth,

                clientHeight,

                scrollWidth:
                    document
                        .documentElement
                        .scrollWidth,

                scrollHeight:
                    document
                        .documentElement
                        .scrollHeight,

                scrollX:
                    round(
                        window.scrollX
                    ),

                scrollY:
                    round(
                        window.scrollY
                    ),

                horizontalOverflow:
                    document
                        .documentElement
                        .scrollWidth >
                    clientWidth + 1,

            },


            browserSpace: {

                innerMinusClientWidth:
                    round(
                        innerWidth -
                        clientWidth
                    ),

                innerMinusClientHeight:
                    round(
                        innerHeight -
                        clientHeight
                    ),

                visualMinusClientWidth:
                    visualViewport
                        ? round(
                            visualViewport
                                .width -
                            clientWidth
                        )
                        : null,

                visualHeightRatio:
                    visualViewport &&
                    innerHeight > 0
                        ? round(
                            visualViewport
                                .height /
                            innerHeight
                        )
                        : null,

            },


            devicePixelRatio:
                round(
                    window
                        .devicePixelRatio
                ),


            userAgent:
                navigator.userAgent,

        };

    };


// =======================================================
// TRACKED HERO ELEMENTS
// =======================================================

const trackedElements = {

    hero:
        ".hero",

    heroTitle:
        ".heroTitle",

    certifications:
        ".certifications",

    certificationImages:
        ".certificationsImages",

    scroll:
        ".scroll",

    scrollSvg:
        ".scroll > svg",

    socials:
        ".socials",

    bubble:
        ".bubbleContainer",

    contactLink:
        ".contactButtonLink",

    contactButton:
        ".contactButton",

    background:
        ".bg",

    heroImageContainer:
        ".hImg",

    heroImage:
        ".hImg img",

    canvas:
        ".bg canvas",

};


const TRACKED_ELEMENT_NAMES =
    new Set(
        Object.keys(
            trackedElements
        )
    );


// =======================================================
// EXPECTATION POLICY
// =======================================================

const DEFAULT_EXPECTED_VISIBLE = [

    "hero",

    "heroTitle",

    "certifications",

    "certificationImages",

    "scrollSvg",

    "socials",

    "contactLink",

    "contactButton",

    "background",

    "heroImageContainer",

    "heroImage",

    "canvas",

];


const PORTRAIT_EXPECTED_VISIBLE = [

    "bubble",

];


const getQaPolicy =
    (
        viewport
    ) => {

        const params =
            new URLSearchParams(
                window
                    .location
                    .search
            );


        const expectedVisible =
            new Set(
                DEFAULT_EXPECTED_VISIBLE
            );


        const expectedHidden =
            new Set();


        if (
            viewport.layoutMode ===
            "portrait"
        ) {

            PORTRAIT_EXPECTED_VISIBLE
                .forEach(
                    (
                        name
                    ) =>
                        expectedVisible
                            .add(
                                name
                            )
                );

        }


        const visibleOverrides =
            parseElementNameList(
                params,
                "qaExpectVisible",
                TRACKED_ELEMENT_NAMES
            );


        const hiddenOverrides =
            parseElementNameList(
                params,
                "qaExpectHidden",
                TRACKED_ELEMENT_NAMES
            );


        const optionalOverrides =
            parseElementNameList(
                params,
                "qaOptional",
                TRACKED_ELEMENT_NAMES
            );


        visibleOverrides
            .forEach(
                (
                    name
                ) => {

                    expectedHidden
                        .delete(
                            name
                        );


                    expectedVisible
                        .add(
                            name
                        );

                }
            );


        hiddenOverrides
            .forEach(
                (
                    name
                ) => {

                    expectedVisible
                        .delete(
                            name
                        );


                    expectedHidden
                        .add(
                            name
                        );

                }
            );


        optionalOverrides
            .forEach(
                (
                    name
                ) => {

                    expectedVisible
                        .delete(
                            name
                        );


                    expectedHidden
                        .delete(
                            name
                        );

                }
            );


        const maxHorizontal =
            parseFiniteNumberParam(
                params,

                "qaHeroImageMaxHorizontalCropPct",

                DEFAULT_HERO_IMAGE_MAX_HORIZONTAL_CROP_PERCENT
            );


        const maxVertical =
            parseFiniteNumberParam(
                params,

                "qaHeroImageMaxVerticalCropPct",

                DEFAULT_HERO_IMAGE_MAX_VERTICAL_CROP_PERCENT
            );


        const expectedCertificationImages =
            parseNonNegativeIntegerParam(
                params,

                "qaExpectedCertificationImages",

                DEFAULT_EXPECTED_CERTIFICATION_IMAGE_COUNT
            );


        return {

            visibility: {

                expectedVisible: [
                    ...expectedVisible,
                ],

                expectedHidden: [
                    ...expectedHidden,
                ],

                optional:
                    Object
                        .keys(
                            trackedElements
                        )
                        .filter(
                            (
                                name
                            ) =>
                                !expectedVisible
                                    .has(
                                        name
                                    ) &&
                                !expectedHidden
                                    .has(
                                        name
                                    )
                        ),

            },


            imageLoading: {

                certificationImages: {

                    selector:
                        ".certificationsImages img",

                    expectedCount:
                        expectedCertificationImages,

                    requireLoaded:
                        true,

                    requireVisible:
                        true,

                },


                heroImage: {

                    selector:
                        ".hImg img",

                    expectedCount:
                        1,

                    requireLoaded:
                        true,

                },

            },


            imageCrop: {

                heroImage: {

                    maxHorizontalPercent:
                        round(
                            maxHorizontal
                        ),

                    maxVerticalPercent:
                        round(
                            maxVertical
                        ),

                },

            },

        };

    };


// =======================================================
// VISIBILITY
// =======================================================

const getRenderedVisibility =
    (
        element,
        rect,
        style
    ) => {

        const reasons =
            [];


        const ownOpacity =
            Number.parseFloat(
                style.opacity
            );


        if (
            element.hidden
        ) {

            reasons.push(
                "html-hidden"
            );

        }


        if (
            style.display ===
            "none"
        ) {

            reasons.push(
                "display:none"
            );

        }


        if (
            style.visibility ===
                "hidden" ||
            style.visibility ===
                "collapse"
        ) {

            reasons.push(
                `visibility:${style.visibility}`
            );

        }


        if (
            Number.isFinite(
                ownOpacity
            ) &&
            ownOpacity <=
                VISIBILITY_OPACITY_EPSILON
        ) {

            reasons.push(
                "opacity:0"
            );

        }


        let ancestor =
            element.parentElement;


        let hiddenAncestor =
            null;


        while (
            ancestor &&
            ancestor !==
            document.documentElement
        ) {

            const ancestorStyle =
                window.getComputedStyle(
                    ancestor
                );


            const ancestorOpacity =
                Number.parseFloat(
                    ancestorStyle.opacity
                );


            let reason =
                null;


            if (
                ancestor.hidden
            ) {

                reason =
                    "html-hidden";

            } else if (
                ancestorStyle.display ===
                "none"
            ) {

                reason =
                    "display:none";

            } else if (
                ancestorStyle.visibility ===
                    "hidden" ||
                ancestorStyle.visibility ===
                    "collapse"
            ) {

                reason =
                    `visibility:${ancestorStyle.visibility}`;

            } else if (
                Number.isFinite(
                    ancestorOpacity
                ) &&
                ancestorOpacity <=
                    VISIBILITY_OPACITY_EPSILON
            ) {

                reason =
                    "opacity:0";

            }


            if (
                reason
            ) {

                hiddenAncestor = {

                    element:
                        describeElement(
                            ancestor
                        ),

                    reason,

                };


                reasons.push(
                    `ancestor-${reason}`
                );


                break;

            }


            ancestor =
                ancestor.parentElement;

        }


        const zeroWidth =
            rect.width <=
            VISIBILITY_SIZE_EPSILON;


        const zeroHeight =
            rect.height <=
            VISIBILITY_SIZE_EPSILON;


        const hasClientRects =
            element
                .getClientRects()
                .length > 0;


        if (
            !hasClientRects
        ) {

            reasons.push(
                "no-client-rects"
            );

        }


        if (
            zeroWidth
        ) {

            reasons.push(
                "zero-width"
            );

        }


        if (
            zeroHeight
        ) {

            reasons.push(
                "zero-height"
            );

        }


        const rendered =
            reasons.length ===
            0;


        return {

            rendered,

            state:
                rendered
                    ? "visible"
                    : "hidden",

            primaryReason:
                reasons[0] ??
                null,

            reasons,

            display:
                style.display,

            visibility:
                style.visibility,

            opacity:
                Number.isFinite(
                    ownOpacity
                )
                    ? round(
                        ownOpacity
                    )
                    : null,

            zeroWidth,

            zeroHeight,

            hasClientRects,

            hiddenAncestor,

        };

    };


const analyzeVisibilityPolicy =
    (
        elements,
        policy
    ) => {

        const failures =
            [];


        const passes =
            [];


        for (
            const name of
            policy.expectedVisible
        ) {

            const element =
                elements[
                    name
                ];


            if (
                !element?.found
            ) {

                failures.push({

                    name,

                    expected:
                        "visible",

                    actual:
                        "missing",

                    status:
                        "UNEXPECTED_MISSING",

                    reasons: [
                        "element-not-found",
                    ],

                });


                continue;

            }


            if (
                !element
                    .visibility
                    ?.rendered
            ) {

                failures.push({

                    name,

                    expected:
                        "visible",

                    actual:
                        "hidden",

                    status:
                        "UNEXPECTED_HIDDEN",

                    reasons:
                        element
                            .visibility
                            ?.reasons ??
                        [
                            "unknown",
                        ],

                    visibility:
                        element
                            .visibility,

                });


                continue;

            }


            passes.push({

                name,

                expected:
                    "visible",

                actual:
                    "visible",

                status:
                    "PASS",

            });

        }


        for (
            const name of
            policy.expectedHidden
        ) {

            const element =
                elements[
                    name
                ];


            if (
                !element?.found ||
                !element
                    .visibility
                    ?.rendered
            ) {

                passes.push({

                    name,

                    expected:
                        "hidden",

                    actual:
                        element
                            ?.found
                            ? "hidden"
                            : "missing",

                    status:
                        "PASS",

                });


                continue;

            }


            failures.push({

                name,

                expected:
                    "hidden",

                actual:
                    "visible",

                status:
                    "UNEXPECTED_VISIBLE",

                reasons: [
                    "element-is-rendered",
                ],

                visibility:
                    element
                        .visibility,

            });

        }


        return {

            passed:
                failures.length ===
                0,

            failureCount:
                failures.length,

            passCount:
                passes.length,

            failures,

            passes,

            expectedVisible:
                policy
                    .expectedVisible,

            expectedHidden:
                policy
                    .expectedHidden,

            optional:
                policy.optional,

        };

    };


// =======================================================
// CLIPPING
// =======================================================

const getClipSeverity =
    (
        clipping
    ) => {

        const amount =
            maxNumber(
                Object.values(
                    clipping
                )
            );


        if (
            amount <= 0
        ) {

            return "none";

        }


        if (
            amount <=
            NEGLIGIBLE_CLIP_MAX
        ) {

            return "negligible";

        }


        if (
            amount <=
            WARNING_CLIP_MAX
        ) {

            return "warning";

        }


        return "fail";

    };


const getViewportClipping =
    (
        rect,
        visibleViewport
    ) => {

        const clipping = {

            top:
                round(
                    Math.max(
                        0,

                        visibleViewport.top -
                        rect.top
                    )
                ),

            right:
                round(
                    Math.max(
                        0,

                        rect.right -
                        visibleViewport.right
                    )
                ),

            bottom:
                round(
                    Math.max(
                        0,

                        rect.bottom -
                        visibleViewport.bottom
                    )
                ),

            left:
                round(
                    Math.max(
                        0,

                        visibleViewport.left -
                        rect.left
                    )
                ),

        };


        return {

            ...clipping,

            max:
                round(
                    maxNumber(
                        Object.values(
                            clipping
                        )
                    )
                ),

            severity:
                getClipSeverity(
                    clipping
                ),

        };

    };


const clipsOnAxis =
    (
        overflowValue
    ) =>
        [
            "hidden",
            "clip",
            "scroll",
            "auto",
        ].includes(
            overflowValue
        );


const getClipContainerInfo =
    (
        element
    ) => {

        const style =
            window.getComputedStyle(
                element
            );


        const clipsX =
            clipsOnAxis(
                style.overflowX
            );


        const clipsY =
            clipsOnAxis(
                style.overflowY
            );


        return {

            clipsX,

            clipsY,

            isClipContainer:
                clipsX ||
                clipsY,

            overflow:
                style.overflow,

            overflowX:
                style.overflowX,

            overflowY:
                style.overflowY,

        };

    };


const getAncestorClipping =
    (
        element,
        elementRect
    ) => {

        const results =
            [];


        let ancestor =
            element.parentElement;


        while (
            ancestor &&
            ancestor !==
                document.body &&
            ancestor !==
                document.documentElement
        ) {

            const style =
                window.getComputedStyle(
                    ancestor
                );


            const clipsX =
                clipsOnAxis(
                    style.overflowX
                );


            const clipsY =
                clipsOnAxis(
                    style.overflowY
                );


            if (
                clipsX ||
                clipsY
            ) {

                const ancestorRect =
                    ancestor
                        .getBoundingClientRect();


                const clipping = {

                    top:
                        clipsY
                            ? round(
                                Math.max(
                                    0,

                                    ancestorRect.top -
                                    elementRect.top
                                )
                            )
                            : 0,

                    right:
                        clipsX
                            ? round(
                                Math.max(
                                    0,

                                    elementRect.right -
                                    ancestorRect.right
                                )
                            )
                            : 0,

                    bottom:
                        clipsY
                            ? round(
                                Math.max(
                                    0,

                                    elementRect.bottom -
                                    ancestorRect.bottom
                                )
                            )
                            : 0,

                    left:
                        clipsX
                            ? round(
                                Math.max(
                                    0,

                                    ancestorRect.left -
                                    elementRect.left
                                )
                            )
                            : 0,

                };


                const severity =
                    getClipSeverity(
                        clipping
                    );


                if (
                    severity !==
                    "none"
                ) {

                    results.push({

                        ancestor:
                            describeElement(
                                ancestor
                            ),

                        ancestorRect:
                            rectToObject(
                                ancestorRect
                            ),

                        overflow:
                            style.overflow,

                        overflowX:
                            style.overflowX,

                        overflowY:
                            style.overflowY,

                        clipping: {

                            ...clipping,

                            max:
                                round(
                                    maxNumber(
                                        Object.values(
                                            clipping
                                        )
                                    )
                                ),

                            severity,

                        },

                    });

                }

            }


            ancestor =
                ancestor
                    .parentElement;

        }


        return results;

    };


// =======================================================
// IMAGE CROPPING
// =======================================================

const getImageCropInfo =
    (
        element,
        rect,
        style
    ) => {

        if (
            !(
                element instanceof
                HTMLImageElement
            )
        ) {

            return null;

        }


        const naturalWidth =
            element.naturalWidth;


        const naturalHeight =
            element.naturalHeight;


        const renderedWidth =
            rect.width;


        const renderedHeight =
            rect.height;


        const objectFit =
            style.objectFit;


        const objectPosition =
            style.objectPosition;


        if (
            !element.complete ||
            naturalWidth <= 0 ||
            naturalHeight <= 0 ||
            renderedWidth <= 0 ||
            renderedHeight <= 0
        ) {

            return {

                loaded:
                    false,

                naturalWidth,

                naturalHeight,

                renderedWidth:
                    round(
                        renderedWidth
                    ),

                renderedHeight:
                    round(
                        renderedHeight
                    ),

                objectFit,

                objectPosition,

                cropped:
                    null,

            };

        }


        const widthScale =
            renderedWidth /
            naturalWidth;


        const heightScale =
            renderedHeight /
            naturalHeight;


        let drawnWidth =
            renderedWidth;


        let drawnHeight =
            renderedHeight;


        if (
            objectFit ===
            "cover"
        ) {

            const scale =
                Math.max(
                    widthScale,
                    heightScale
                );


            drawnWidth =
                naturalWidth *
                scale;


            drawnHeight =
                naturalHeight *
                scale;

        } else if (
            objectFit ===
            "contain"
        ) {

            const scale =
                Math.min(
                    widthScale,
                    heightScale
                );


            drawnWidth =
                naturalWidth *
                scale;


            drawnHeight =
                naturalHeight *
                scale;

        } else if (
            objectFit ===
            "none"
        ) {

            drawnWidth =
                naturalWidth;


            drawnHeight =
                naturalHeight;

        } else if (
            objectFit ===
            "scale-down"
        ) {

            const containScale =
                Math.min(
                    widthScale,
                    heightScale
                );


            const scale =
                Math.min(
                    1,
                    containScale
                );


            drawnWidth =
                naturalWidth *
                scale;


            drawnHeight =
                naturalHeight *
                scale;

        } else if (
            objectFit ===
            "fill"
        ) {

            drawnWidth =
                renderedWidth;


            drawnHeight =
                renderedHeight;

        }


        const horizontalCrop =
            Math.max(
                0,

                drawnWidth -
                renderedWidth
            );


        const verticalCrop =
            Math.max(
                0,

                drawnHeight -
                renderedHeight
            );


        const horizontalPercent =
            drawnWidth > 0
                ? (
                    horizontalCrop /
                    drawnWidth
                ) * 100
                : 0;


        const verticalPercent =
            drawnHeight > 0
                ? (
                    verticalCrop /
                    drawnHeight
                ) * 100
                : 0;


        return {

            loaded:
                true,


            natural: {

                width:
                    naturalWidth,

                height:
                    naturalHeight,

                aspectRatio:
                    round(
                        naturalWidth /
                        naturalHeight
                    ),

            },


            rendered: {

                width:
                    round(
                        renderedWidth
                    ),

                height:
                    round(
                        renderedHeight
                    ),

                aspectRatio:
                    renderedHeight > 0
                        ? round(
                            renderedWidth /
                            renderedHeight
                        )
                        : null,

            },


            drawn: {

                width:
                    round(
                        drawnWidth
                    ),

                height:
                    round(
                        drawnHeight
                    ),

            },


            objectFit,

            objectPosition,


            cropped:
                horizontalCrop > 1 ||
                verticalCrop > 1,


            crop: {

                horizontalTotal:
                    round(
                        horizontalCrop
                    ),

                verticalTotal:
                    round(
                        verticalCrop
                    ),


                percentOfDrawn: {

                    horizontal:
                        round(
                            horizontalPercent
                        ),

                    vertical:
                        round(
                            verticalPercent
                        ),

                },


                approximatePerSide: {

                    left:
                        round(
                            horizontalCrop /
                            2
                        ),

                    right:
                        round(
                            horizontalCrop /
                            2
                        ),

                    top:
                        round(
                            verticalCrop /
                            2
                        ),

                    bottom:
                        round(
                            verticalCrop /
                            2
                        ),

                },


                approximatePerSidePercent: {

                    left:
                        round(
                            horizontalPercent /
                            2
                        ),

                    right:
                        round(
                            horizontalPercent /
                            2
                        ),

                    top:
                        round(
                            verticalPercent /
                            2
                        ),

                    bottom:
                        round(
                            verticalPercent /
                            2
                        ),

                },

            },

        };

    };


const analyzeCropPolicy =
    (
        elements,
        policy
    ) => {

        const failures =
            [];


        const passes =
            [];


        const heroImage =
            elements
                .heroImage;


        const limits =
            policy
                .heroImage;


        /*
          V4.1:

          Loading failures are handled by
          imageLoadingPolicy.

          Crop policy only evaluates a
          successfully loaded Hero image.
        */

        if (
            !heroImage?.found ||
            !heroImage
                .imageCrop
                ?.loaded
        ) {

            return {

                evaluated:
                    false,

                passed:
                    true,

                failureCount:
                    0,

                passCount:
                    0,

                failures: [],

                passes: [],

                limits,

                reason:
                    "Hero image was not available for crop analysis. See imageLoadingPolicy.",

            };

        }


        const horizontalPercent =
            heroImage
                .imageCrop
                .crop
                .percentOfDrawn
                .horizontal ??
            0;


        const verticalPercent =
            heroImage
                .imageCrop
                .crop
                .percentOfDrawn
                .vertical ??
            0;


        if (
            horizontalPercent >
            limits
                .maxHorizontalPercent
        ) {

            failures.push({

                name:
                    "heroImage",

                axis:
                    "horizontal",

                status:
                    "EXCESSIVE_CROP",

                actualPercent:
                    horizontalPercent,

                maxPercent:
                    limits
                        .maxHorizontalPercent,

            });

        }


        if (
            verticalPercent >
            limits
                .maxVerticalPercent
        ) {

            failures.push({

                name:
                    "heroImage",

                axis:
                    "vertical",

                status:
                    "EXCESSIVE_CROP",

                actualPercent:
                    verticalPercent,

                maxPercent:
                    limits
                        .maxVerticalPercent,

            });

        }


        if (
            !failures.length
        ) {

            passes.push({

                name:
                    "heroImage",

                status:
                    "PASS",

                horizontalPercent,

                verticalPercent,

                limits,

            });

        }


        return {

            evaluated:
                true,

            passed:
                failures.length ===
                0,

            failureCount:
                failures.length,

            passCount:
                passes.length,

            failures,

            passes,

            limits,

        };

    };


// =======================================================
// V4.1 IMAGE ASSET / LOAD VERIFICATION
// =======================================================

const captureImageAsset =
    (
        element,
        index,
        group
    ) => {

        if (
            !element ||
            !(
                element instanceof
                HTMLImageElement
            )
        ) {

            return {

                group,

                index,

                found:
                    false,

                loadedSuccessfully:
                    false,

                status:
                    "IMAGE_NOT_FOUND",

            };

        }


        const rect =
            element
                .getBoundingClientRect();


        const style =
            window.getComputedStyle(
                element
            );


        const visibility =
            getRenderedVisibility(
                element,
                rect,
                style
            );


        const complete =
            element.complete;


        const naturalWidth =
            element.naturalWidth;


        const naturalHeight =
            element.naturalHeight;


        const loadedSuccessfully =
            complete &&
            naturalWidth > 0 &&
            naturalHeight > 0;


        let status =
            "LOADED";


        if (
            !complete
        ) {

            status =
                "LOADING_OR_INCOMPLETE";

        } else if (
            naturalWidth <= 0 ||
            naturalHeight <= 0
        ) {

            status =
                "IMAGE_FAILED_TO_LOAD";

        }


        return {

            group,

            index,

            found:
                true,


            element:
                describeElement(
                    element
                ),


            src:
                element
                    .getAttribute(
                        "src"
                    ),


            currentSrc:
                element.currentSrc ||
                null,


            alt:
                element
                    .getAttribute(
                        "alt"
                    ),


            complete,

            loadedSuccessfully,

            status,


            natural: {

                width:
                    naturalWidth,

                height:
                    naturalHeight,

                aspectRatio:
                    naturalHeight > 0
                        ? round(
                            naturalWidth /
                            naturalHeight
                        )
                        : null,

            },


            rendered: {

                ...rectToObject(
                    rect
                ),

            },


            visibility,


            computed: {

                display:
                    style.display,

                visibility:
                    style.visibility,

                opacity:
                    style.opacity,

                objectFit:
                    style.objectFit,

                objectPosition:
                    style.objectPosition,

            },

        };

    };


const captureImageAssets =
    () => {

        const certificationElements = [

            ...document
                .querySelectorAll(
                    ".certificationsImages img"
                ),

        ];


        const certificationImages =
            certificationElements
                .map(
                    (
                        element,
                        index
                    ) =>
                        captureImageAsset(

                            element,

                            index,

                            "certificationImages"

                        )
                );


        const heroImageElement =
            document.querySelector(
                ".hImg img"
            );


        const heroImage =
            heroImageElement
                ? captureImageAsset(

                    heroImageElement,

                    0,

                    "heroImage"

                )
                : {

                    group:
                        "heroImage",

                    index:
                        0,

                    found:
                        false,

                    loadedSuccessfully:
                        false,

                    status:
                        "IMAGE_NOT_FOUND",

                };


        return {

            certificationImages,

            heroImage,

        };

    };


const analyzeImageLoadingPolicy =
    (
        imageAssets,
        policy
    ) => {

        const failures =
            [];


        const passes =
            [];


        const certificationImages =
            imageAssets
                .certificationImages;


        const expectedCount =
            policy
                .certificationImages
                .expectedCount;


        const foundCount =
            certificationImages
                .length;


        const loadedCount =
            certificationImages
                .filter(
                    (
                        image
                    ) =>
                        image
                            .loadedSuccessfully
                )
                .length;


        const visibleCount =
            certificationImages
                .filter(
                    (
                        image
                    ) =>
                        image
                            .visibility
                            ?.rendered
                )
                .length;


        if (
            foundCount !==
            expectedCount
        ) {

            failures.push({

                group:
                    "certificationImages",

                status:
                    "IMAGE_COUNT_MISMATCH",

                expectedCount,

                foundCount,

                reason:
                    `Expected ${expectedCount} certification images but found ${foundCount}.`,

            });

        }


        certificationImages
            .forEach(
                (
                    image
                ) => {

                    if (
                        !image
                            .loadedSuccessfully
                    ) {

                        failures.push({

                            group:
                                "certificationImages",

                            index:
                                image.index,

                            status:
                                "IMAGE_FAILED_TO_LOAD",

                            src:
                                image.src,

                            currentSrc:
                                image.currentSrc,

                            complete:
                                image.complete,

                            naturalWidth:
                                image
                                    .natural
                                    ?.width ??
                                0,

                            naturalHeight:
                                image
                                    .natural
                                    ?.height ??
                                0,

                            reason:
                                `Certification image #${image.index + 1} did not load successfully.`,

                        });


                        return;

                    }


                    if (
                        policy
                            .certificationImages
                            .requireVisible &&
                        !image
                            .visibility
                            ?.rendered
                    ) {

                        failures.push({

                            group:
                                "certificationImages",

                            index:
                                image.index,

                            status:
                                "IMAGE_UNEXPECTED_HIDDEN",

                            src:
                                image.src,

                            currentSrc:
                                image.currentSrc,

                            reasons:
                                image
                                    .visibility
                                    ?.reasons ??
                                [
                                    "unknown",
                                ],

                            reason:
                                `Certification image #${image.index + 1} loaded but is not rendered visibly.`,

                        });


                        return;

                    }


                    passes.push({

                        group:
                            "certificationImages",

                        index:
                            image.index,

                        status:
                            "PASS",

                        src:
                            image.src,

                        currentSrc:
                            image.currentSrc,

                        naturalWidth:
                            image
                                .natural
                                ?.width ??
                            null,

                        naturalHeight:
                            image
                                .natural
                                ?.height ??
                            null,

                    });

                }
            );


        const heroImage =
            imageAssets
                .heroImage;


        if (
            !heroImage.found
        ) {

            failures.push({

                group:
                    "heroImage",

                index:
                    0,

                status:
                    "IMAGE_NOT_FOUND",

                reason:
                    "Main Hero image was not found.",

            });

        } else if (
            !heroImage
                .loadedSuccessfully
        ) {

            failures.push({

                group:
                    "heroImage",

                index:
                    0,

                status:
                    "IMAGE_FAILED_TO_LOAD",

                src:
                    heroImage.src,

                currentSrc:
                    heroImage.currentSrc,

                complete:
                    heroImage.complete,

                naturalWidth:
                    heroImage
                        .natural
                        ?.width ??
                    0,

                naturalHeight:
                    heroImage
                        .natural
                        ?.height ??
                    0,

                reason:
                    "Main Hero image did not load successfully.",

            });

        } else {

            passes.push({

                group:
                    "heroImage",

                index:
                    0,

                status:
                    "PASS",

                src:
                    heroImage.src,

                currentSrc:
                    heroImage.currentSrc,

                naturalWidth:
                    heroImage
                        .natural
                        ?.width ??
                    null,

                naturalHeight:
                    heroImage
                        .natural
                        ?.height ??
                    null,

            });

        }


        return {

            passed:
                failures.length ===
                0,

            failureCount:
                failures.length,

            passCount:
                passes.length,

            failures,

            passes,


            certificationImages: {

                expectedCount,

                foundCount,

                loadedCount,

                visibleCount,

            },


            heroImage: {

                found:
                    heroImage.found,

                loadedSuccessfully:
                    heroImage
                        .loadedSuccessfully ??
                    false,

            },

        };

    };


// =======================================================
// CANVAS
// =======================================================

const getCanvasInfo =
    (
        element
    ) => {

        if (
            !(
                element instanceof
                HTMLCanvasElement
            )
        ) {

            return null;

        }


        return {

            widthAttribute:
                element.width,

            heightAttribute:
                element.height,

            requiresVisualCheck:
                true,

            reason:
                "DOM bounds can verify the canvas element, but not whether Three.js/WebGL content inside the canvas is visually cropped.",

        };

    };


// =======================================================
// CAPTURE ONE TRACKED ELEMENT
// =======================================================

const captureElement =
    (
        selector,
        visibleViewport
    ) => {

        const element =
            document.querySelector(
                selector
            );


        if (
            !element
        ) {

            return {

                selector,

                found:
                    false,

            };

        }


        const rect =
            element
                .getBoundingClientRect();


        const style =
            window.getComputedStyle(
                element
            );


        const visibility =
            getRenderedVisibility(
                element,
                rect,
                style
            );


        return {

            selector,

            found:
                true,


            element:
                describeElement(
                    element
                ),


            rect:
                rectToObject(
                    rect
                ),


            viewportClipping:
                getViewportClipping(
                    rect,
                    visibleViewport
                ),


            ancestorClipping:
                getAncestorClipping(
                    element,
                    rect
                ),


            clipContainer:
                getClipContainerInfo(
                    element
                ),


            imageCrop:
                getImageCropInfo(
                    element,
                    rect,
                    style
                ),


            canvas:
                getCanvasInfo(
                    element
                ),


            visibility,


            transformTranslation:
                getTransformTranslation(
                    style.transform
                ),


            computed: {

                display:
                    style.display,

                visibility:
                    style.visibility,

                opacity:
                    style.opacity,

                position:
                    style.position,

                width:
                    style.width,

                height:
                    style.height,

                fontSize:
                    style.fontSize,

                marginTop:
                    style.marginTop,

                marginRight:
                    style.marginRight,

                marginBottom:
                    style.marginBottom,

                marginLeft:
                    style.marginLeft,

                paddingTop:
                    style.paddingTop,

                paddingRight:
                    style.paddingRight,

                paddingBottom:
                    style.paddingBottom,

                paddingLeft:
                    style.paddingLeft,

                transform:
                    style.transform,

                overflow:
                    style.overflow,

                overflowX:
                    style.overflowX,

                overflowY:
                    style.overflowY,

                objectFit:
                    style.objectFit,

                objectPosition:
                    style.objectPosition,

                zIndex:
                    style.zIndex,

            },

        };

    };


// =======================================================
// HERO EDGE DISTANCES
// =======================================================

const getHeroEdgeDistances =
    (
        elementRect,
        heroRect
    ) => {

        if (
            !elementRect ||
            !heroRect
        ) {

            return null;

        }


        return {

            top:
                round(
                    elementRect.top -
                    heroRect.top
                ),

            right:
                round(
                    heroRect.right -
                    elementRect.right
                ),

            bottom:
                round(
                    heroRect.bottom -
                    elementRect.bottom
                ),

            left:
                round(
                    elementRect.left -
                    heroRect.left
                ),

        };

    };


// =======================================================
// PORTRAIT BUBBLE PLACEMENT
// =======================================================

const analyzeBubblePlacement =
    (
        elements,
        orientation
    ) => {

        if (
            !isPortraitOrientation(
                orientation
            )
        ) {

            return {

                evaluated:
                    false,

                mode:
                    "landscape",

                reason:
                    "Portrait bubble-placement rule is not applied in landscape. Landscape geometry is still fully captured.",

            };

        }


        const certificationImages =
            elements
                .certificationImages;


        const bubble =
            elements
                .bubble;


        const scrollSvg =
            elements
                .scrollSvg;


        if (
            !certificationImages
                ?.found ||
            !bubble
                ?.found ||
            !scrollSvg
                ?.found
        ) {

            return {

                evaluated:
                    false,

                mode:
                    "portrait",

                reason:
                    "Required elements were not found.",

            };

        }


        if (
            !certificationImages
                .visibility
                ?.rendered ||
            !bubble
                .visibility
                ?.rendered ||
            !scrollSvg
                .visibility
                ?.rendered
        ) {

            return {

                evaluated:
                    false,

                mode:
                    "portrait",

                reason:
                    "Required portrait bubble-placement elements exist but one or more are not rendered. Check visibilityPolicy failures.",

            };

        }


        const certBottom =
            certificationImages
                .rect
                .bottom;


        const scrollTop =
            scrollSvg
                .rect
                .top;


        const bubbleTop =
            bubble
                .rect
                .top;


        const bubbleBottom =
            bubble
                .rect
                .bottom;


        const bubbleHeight =
            bubble
                .rect
                .height;


        const usableTop =
            certBottom +
            BUBBLE_MIN_GAP;


        const usableBottom =
            scrollTop -
            BUBBLE_MIN_GAP;


        const availableHeight =
            usableBottom -
            usableTop;


        if (
            availableHeight <= 0
        ) {

            return {

                evaluated:
                    true,

                mode:
                    "portrait",

                status:
                    "NO_SPACE",

                certificationBottom:
                    round(
                        certBottom
                    ),

                scrollSvgTop:
                    round(
                        scrollTop
                    ),

                minimumGap:
                    BUBBLE_MIN_GAP,

                availableHeight:
                    round(
                        availableHeight
                    ),

                reason:
                    "Certification images and scroll SVG do not leave a usable vertical region for the bubble.",

            };

        }


        if (
            bubbleHeight >
            availableHeight
        ) {

            return {

                evaluated:
                    true,

                mode:
                    "portrait",

                status:
                    "BUBBLE_TOO_TALL",

                certificationBottom:
                    round(
                        certBottom
                    ),

                scrollSvgTop:
                    round(
                        scrollTop
                    ),

                usableTop:
                    round(
                        usableTop
                    ),

                usableBottom:
                    round(
                        usableBottom
                    ),

                availableHeight:
                    round(
                        availableHeight
                    ),

                bubbleHeight:
                    round(
                        bubbleHeight
                    ),

                reason:
                    "The bubble is taller than the available region.",

            };

        }


        const desiredTop =
            usableTop +
            (
                availableHeight -
                bubbleHeight
            ) /
            2;


        const desiredBottom =
            desiredTop +
            bubbleHeight;


        const movementY =
            desiredTop -
            bubbleTop;


        const currentTranslateY =
            bubble
                .transformTranslation
                ?.y;


        const suggestedTranslateY =
            typeof currentTranslateY ===
                "number"
                ? currentTranslateY +
                    movementY
                : null;


        const currentlyInsideZone =
            bubbleTop >=
                usableTop &&
            bubbleBottom <=
                usableBottom;


        let status =
            "PASS";


        if (
            bubbleBottom >
            usableBottom
        ) {

            status =
                "TOO_LOW";

        } else if (
            bubbleTop <
            usableTop
        ) {

            status =
                "TOO_HIGH";

        }


        return {

            evaluated:
                true,

            mode:
                "portrait",

            status,

            currentlyInsideZone,

            minimumGap:
                BUBBLE_MIN_GAP,


            anchors: {

                certificationBottom:
                    round(
                        certBottom
                    ),

                scrollSvgTop:
                    round(
                        scrollTop
                    ),

            },


            usableRegion: {

                top:
                    round(
                        usableTop
                    ),

                bottom:
                    round(
                        usableBottom
                    ),

                height:
                    round(
                        availableHeight
                    ),

            },


            currentBubble: {

                top:
                    round(
                        bubbleTop
                    ),

                bottom:
                    round(
                        bubbleBottom
                    ),

                height:
                    round(
                        bubbleHeight
                    ),

                translateY:
                    currentTranslateY,

            },


            targetBubble: {

                top:
                    round(
                        desiredTop
                    ),

                bottom:
                    round(
                        desiredBottom
                    ),

            },


            recommendation: {

                movementY:
                    round(
                        movementY
                    ),

                direction:
                    movementY <
                        -0.5
                        ? "UP"
                        : movementY >
                            0.5
                            ? "DOWN"
                            : "NONE",

                pixels:
                    round(
                        Math.abs(
                            movementY
                        )
                    ),

                suggestedTranslateY:
                    suggestedTranslateY !==
                        null
                        ? round(
                            suggestedTranslateY
                        )
                        : null,

            },

        };

    };


// =======================================================
// MEDIA QUERIES
// =======================================================

const getStylesheetName =
    (
        styleSheet
    ) => {

        if (
            styleSheet.href
        ) {

            return styleSheet.href;

        }


        const owner =
            styleSheet.ownerNode;


        const viteId =
            owner
                ?.getAttribute?.(
                    "data-vite-dev-id"
                );


        return (
            viteId ||
            "inline-style"
        );

    };


const getMatchingMediaQueries =
    () => {

        const matches =
            [];


        let order =
            0;


        const walkRules =
            (
                rules,
                stylesheetName
            ) => {

                if (
                    !rules
                ) {

                    return;

                }


                for (
                    const rule of
                    rules
                ) {

                    if (
                        rule.type ===
                        CSSRule.MEDIA_RULE
                    ) {

                        order += 1;


                        if (
                            window
                                .matchMedia(
                                    rule
                                        .conditionText
                                )
                                .matches
                        ) {

                            matches.push({

                                order,

                                condition:
                                    rule
                                        .conditionText,

                                source:
                                    stylesheetName,

                                childRuleCount:
                                    rule
                                        .cssRules
                                        ?.length ??
                                    0,

                            });

                        }


                        walkRules(
                            rule.cssRules,
                            stylesheetName
                        );

                    } else if (
                        rule.cssRules
                    ) {

                        walkRules(
                            rule.cssRules,
                            stylesheetName
                        );

                    }

                }

            };


        for (
            const styleSheet of
            document.styleSheets
        ) {

            try {

                walkRules(

                    styleSheet
                        .cssRules,

                    getStylesheetName(
                        styleSheet
                    )

                );

            } catch {

                /*
                  Ignore inaccessible
                  stylesheets.
                */

            }

        }


        return matches;

    };


// =======================================================
// MAIN REPORT
// =======================================================

export const captureHeroQA =
    () => {

        const viewport =
            captureViewportSnapshot();


        const visibleViewport =
            viewport
                .visibleViewport;


        const policy =
            getQaPolicy(
                viewport
            );


        const elements =
            Object.fromEntries(

                Object
                    .entries(
                        trackedElements
                    )
                    .map(
                        ([
                            name,
                            selector,
                        ]) => [

                            name,

                            captureElement(
                                selector,
                                visibleViewport
                            ),

                        ]
                    )

            );


        /*
          NEW IN V4.1:
          capture each actual image asset
          individually.
        */

        const imageAssets =
            captureImageAssets();


        const heroRect =
            elements
                .hero
                ?.found
                ? elements
                    .hero
                    .rect
                : null;


        for (
            const element of
            Object.values(
                elements
            )
        ) {

            if (
                !element.found ||
                !heroRect
            ) {

                element.heroEdges =
                    null;


                continue;

            }


            element.heroEdges =
                getHeroEdgeDistances(
                    element.rect,
                    heroRect
                );

        }


        // -----------------------------------
        // Missing tracked elements
        // -----------------------------------

        const missingElements =
            Object
                .entries(
                    elements
                )
                .filter(
                    (
                        [
                            ,
                            value,
                        ]
                    ) =>
                        !value.found
                )
                .map(
                    (
                        [
                            name,
                        ]
                    ) =>
                        name
                );


        // -----------------------------------
        // Viewport clipping
        // -----------------------------------

        const viewportFailures =
            [];


        const viewportWarnings =
            [];


        const viewportNegligible =
            [];


        /*
          Hidden elements do NOT enter
          clipping analysis.

          If they should be visible,
          visibilityPolicy catches them.
        */

        for (
            const [
                name,
                element,
            ] of
            Object.entries(
                elements
            )
        ) {

            if (
                !element.found ||
                !element
                    .visibility
                    ?.rendered
            ) {

                continue;

            }


            const item = {

                name,

                clipping:
                    element
                        .viewportClipping,

            };


            const severity =
                element
                    .viewportClipping
                    .severity;


            if (
                severity ===
                "fail"
            ) {

                viewportFailures
                    .push(
                        item
                    );

            } else if (
                severity ===
                "warning"
            ) {

                viewportWarnings
                    .push(
                        item
                    );

            } else if (
                severity ===
                "negligible"
            ) {

                viewportNegligible
                    .push(
                        item
                    );

            }

        }


        // -----------------------------------
        // Parent clipping
        // -----------------------------------

        const parentClippedElements =
            Object
                .entries(
                    elements
                )
                .filter(
                    (
                        [
                            ,
                            value,
                        ]
                    ) =>
                        value.found &&
                        value
                            .visibility
                            ?.rendered &&
                        value
                            .ancestorClipping
                            .length >
                        0
                )
                .map(
                    ([
                        name,
                        value,
                    ]) => ({

                        name,

                        ancestors:
                            value
                                .ancestorClipping,

                    })
                );


        // -----------------------------------
        // Clip containers
        // -----------------------------------

        const clipContainers =
            Object
                .entries(
                    elements
                )
                .filter(
                    (
                        [
                            ,
                            value,
                        ]
                    ) =>
                        value.found &&
                        value
                            .clipContainer
                            .isClipContainer
                )
                .map(
                    ([
                        name,
                        value,
                    ]) => ({

                        name,

                        overflow:
                            value
                                .clipContainer
                                .overflow,

                        overflowX:
                            value
                                .clipContainer
                                .overflowX,

                        overflowY:
                            value
                                .clipContainer
                                .overflowY,

                    })
                );


        // -----------------------------------
        // Image cropping
        // -----------------------------------

        const croppedImages =
            Object
                .entries(
                    elements
                )
                .filter(
                    (
                        [
                            ,
                            value,
                        ]
                    ) =>
                        value.found &&
                        value
                            .visibility
                            ?.rendered &&
                        value
                            .imageCrop &&
                        value
                            .imageCrop
                            .cropped
                )
                .map(
                    ([
                        name,
                        value,
                    ]) => ({

                        name,

                        imageCrop:
                            value.imageCrop,

                    })
                );


        // -----------------------------------
        // Visibility policy
        // -----------------------------------

        const visibilityPolicy =
            analyzeVisibilityPolicy(
                elements,
                policy.visibility
            );


        // -----------------------------------
        // V4.1 image loading policy
        // -----------------------------------

        const imageLoadingPolicy =
            analyzeImageLoadingPolicy(
                imageAssets,
                policy.imageLoading
            );


        // -----------------------------------
        // Crop policy
        // -----------------------------------

        const cropPolicy =
            analyzeCropPolicy(
                elements,
                policy.imageCrop
            );


        // -----------------------------------
        // Canvas visual checks
        // -----------------------------------

        const visualCheckElements =
            Object
                .entries(
                    elements
                )
                .filter(
                    (
                        [
                            ,
                            value,
                        ]
                    ) =>
                        value.found &&
                        value
                            .visibility
                            ?.rendered &&
                        value
                            .canvas
                            ?.requiresVisualCheck
                )
                .map(
                    (
                        [
                            name,
                        ]
                    ) =>
                        name
                );


        // -----------------------------------
        // Bubble relationship
        // -----------------------------------

        const bubblePlacement =
            analyzeBubblePlacement(
                elements,
                viewport.orientation
            );


        // -----------------------------------
        // Media queries
        // -----------------------------------

        const matchingMediaQueries =
            getMatchingMediaQueries();


        const lastMatchingMediaQuery =
            matchingMediaQueries
                .length
                ? matchingMediaQueries[
                    matchingMediaQueries
                        .length -
                    1
                ]
                : null;


        // -----------------------------------
        // QA label
        // -----------------------------------

        const params =
            new URLSearchParams(
                window
                    .location
                    .search
            );


        const qaLabel =
            params.get(
                "qaLabel"
            ) ||
            null;


        // -----------------------------------
        // Aggregate result
        // -----------------------------------

        const overallFailures =
            [];


        if (
            viewport
                .document
                .horizontalOverflow
        ) {

            overallFailures.push({

                category:
                    "horizontal-overflow",

                status:
                    "FAIL",

                reason:
                    "Horizontal document overflow detected.",

            });

        }


        for (
            const item of
            viewportFailures
        ) {

            overallFailures.push({

                category:
                    "viewport-clipping",

                status:
                    "FAIL",

                name:
                    item.name,

                reason:
                    `${item.name} is clipped by ${item.clipping.max}px.`,

                details:
                    item,

            });

        }


        for (
            const item of
            visibilityPolicy
                .failures
        ) {

            overallFailures.push({

                category:
                    "visibility",

                status:
                    item.status,

                name:
                    item.name,

                reason:
                    `${item.name} expected ${item.expected} but was ${item.actual}.`,

                details:
                    item,

            });

        }


        /*
          NEW IN V4.1:
          broken/missing certification images
          and broken Hero image now fail
          summary.overall.
        */

        for (
            const item of
            imageLoadingPolicy
                .failures
        ) {

            overallFailures.push({

                category:
                    "image-loading",

                status:
                    item.status,

                name:
                    item.group,

                reason:
                    item.reason,

                details:
                    item,

            });

        }


        for (
            const item of
            cropPolicy
                .failures
        ) {

            overallFailures.push({

                category:
                    "image-crop",

                status:
                    item.status,

                name:
                    item.name,

                reason:
                    item.axis
                        ? `${item.name} ${item.axis} crop ${item.actualPercent}% exceeds ${item.maxPercent}%.`
                        : item.reason,

                details:
                    item,

            });

        }


        if (
            bubblePlacement
                ?.evaluated &&
            bubblePlacement
                .status !==
                "PASS"
        ) {

            overallFailures.push({

                category:
                    "bubble-placement",

                status:
                    bubblePlacement
                        .status,

                name:
                    "bubble",

                reason:
                    `Portrait bubble placement is ${bubblePlacement.status}.`,

                details:
                    bubblePlacement,

            });

        }


        return {

            qaVersion:
                QA_VERSION,

            qaLabel,

            policy,


            thresholds: {

                negligibleClipMaxPx:
                    NEGLIGIBLE_CLIP_MAX,

                warningClipMaxPx:
                    WARNING_CLIP_MAX,

                bubbleMinGapPx:
                    BUBBLE_MIN_GAP,

                expectedCertificationImageCount:
                    policy
                        .imageLoading
                        .certificationImages
                        .expectedCount,

                heroImageMaxHorizontalCropPercent:
                    policy
                        .imageCrop
                        .heroImage
                        .maxHorizontalPercent,

                heroImageMaxVerticalCropPercent:
                    policy
                        .imageCrop
                        .heroImage
                        .maxVerticalPercent,

            },


            viewport,


            relationships: {

                bubblePlacement,

            },


            /*
              NEW IN V4.1.

              Raw individual image data lives
              here so Playwright/Appium/local
              analysis can inspect it directly.
            */

            assets: {

                images:
                    imageAssets,

            },


            summary: {

                horizontalOverflow:
                    viewport
                        .document
                        .horizontalOverflow,


                missingElementCount:
                    missingElements
                        .length,


                missingElements,


                viewportClipping: {

                    failureCount:
                        viewportFailures
                            .length,

                    warningCount:
                        viewportWarnings
                            .length,

                    negligibleCount:
                        viewportNegligible
                            .length,

                    failures:
                        viewportFailures,

                    warnings:
                        viewportWarnings,

                    negligible:
                        viewportNegligible,

                },


                parentClipping: {

                    count:
                        parentClippedElements
                            .length,

                    elements:
                        parentClippedElements,

                },


                clipContainers: {

                    count:
                        clipContainers
                            .length,

                    elements:
                        clipContainers,

                },


                imageCropping: {

                    count:
                        croppedImages
                            .length,

                    elements:
                        croppedImages,

                },


                visibilityPolicy,


                /*
                  NEW IN V4.1.
                */

                imageLoadingPolicy,


                cropPolicy,


                overall: {

                    passed:
                        overallFailures
                            .length ===
                        0,

                    failureCount:
                        overallFailures
                            .length,

                    failures:
                        overallFailures,

                },


                visualChecks: {

                    count:
                        visualCheckElements
                            .length,

                    elements:
                        visualCheckElements,

                },


                matchingMediaQueryCount:
                    matchingMediaQueries
                        .length,


                lastMatchingMediaQuery,

            },


            matchingMediaQueries,

            elements,

        };

    };


// =======================================================
// OVERLAY HELPERS
// =======================================================

const getShortAncestorSummary =
    (
        item
    ) => {

        if (
            !item
                .ancestors
                ?.length
        ) {

            return item.name;

        }


        const ancestor =
            item
                .ancestors[
                    0
                ];


        const clip =
            ancestor
                .clipping;


        return (
            `${item.name} by ${ancestor.ancestor}` +
            ` [L:${clip.left}` +
            ` R:${clip.right}` +
            ` T:${clip.top}` +
            ` B:${clip.bottom}]`
        );

    };


const formatBubblePlacement =
    (
        placement
    ) => {

        if (
            !placement
                ?.evaluated
        ) {

            return [

                `mode: ${placement?.mode ?? "unknown"}`,

                "not evaluated",

                `reason: ${placement?.reason ?? "unknown"}`,

            ];

        }


        const lines = [

            `status: ${placement.status}`,

        ];


        if (
            placement
                .anchors
        ) {

            lines.push(

                `cert bottom: ${placement.anchors.certificationBottom}px`,

                `scroll SVG top: ${placement.anchors.scrollSvgTop}px`

            );

        }


        if (
            placement
                .usableRegion
        ) {

            lines.push(

                `usable zone: ${placement.usableRegion.top}px → ${placement.usableRegion.bottom}px`,

                `zone height: ${placement.usableRegion.height}px`

            );

        }


        if (
            placement
                .currentBubble
        ) {

            lines.push(

                `bubble: ${placement.currentBubble.top}px → ${placement.currentBubble.bottom}px`,

                `current translateY: ${placement.currentBubble.translateY}px`

            );

        }


        if (
            placement
                .targetBubble
        ) {

            lines.push(

                `target: ${placement.targetBubble.top}px → ${placement.targetBubble.bottom}px`

            );

        }


        if (
            placement
                .recommendation
        ) {

            const rec =
                placement
                    .recommendation;


            lines.push(

                `move: ${rec.direction} ${rec.pixels}px`

            );


            if (
                rec
                    .suggestedTranslateY !==
                null
            ) {

                lines.push(

                    `suggested translateY: ${rec.suggestedTranslateY}px`

                );

            }

        }


        if (
            placement.reason
        ) {

            lines.push(

                `reason: ${placement.reason}`

            );

        }


        return lines;

    };


// =======================================================
// OVERLAY FORMAT
// =======================================================

const formatOverlay =
    (
        report
    ) => {

        const {

            viewport,

            summary,

            relationships,

            assets,

        } = report;


        const visual =
            viewport.visual;


        const imageLoading =
            summary
                .imageLoadingPolicy;


        const certificationAssets =
            assets
                ?.images
                ?.certificationImages ??
            [];


        const heroImageAsset =
            assets
                ?.images
                ?.heroImage;


        const lines = [

            "PORTFOLIO HERO QA — PHASE 1 / V4.1",

            "────────────────────────────────",

            `mode:    ${viewport.layoutMode}`,

            `stable:  ${
                document
                    .documentElement
                    .dataset
                    .qaStable ===
                "true"
                    ? "YES"
                    : "NO"
            }`,

            `inner:   ${viewport.inner.width} × ${viewport.inner.height}`,

            `visual:  ${
                visual
                    ? `${visual.width} × ${visual.height}`
                    : "not supported"
            }`,

            `client:  ${viewport.document.clientWidth} × ${viewport.document.clientHeight}`,

            `screen:  ${viewport.screen.width} × ${viewport.screen.height}`,

            `DPR:     ${viewport.devicePixelRatio}`,

            `orient:  ${viewport.orientation}`,

            `width lost to browser/scrollbar: ${viewport.browserSpace.innerMinusClientWidth}px`,

            "",

            `OVERALL: ${
                summary
                    .overall
                    .passed
                    ? "PASS"
                    : "FAIL"
            }`,

            `overall failures: ${
                summary
                    .overall
                    .failureCount
            }`,

            "",

            "IMAGE LOADING — V4.1",

            `cert expected: ${
                imageLoading
                    .certificationImages
                    .expectedCount
            }`,

            `cert found:    ${
                imageLoading
                    .certificationImages
                    .foundCount
            }`,

            `cert loaded:   ${
                imageLoading
                    .certificationImages
                    .loadedCount
            }`,

            `cert visible:  ${
                imageLoading
                    .certificationImages
                    .visibleCount
            }`,

            `failures:      ${
                imageLoading
                    .failureCount
            }`,

        ];


        certificationAssets
            .forEach(
                (
                    image
                ) => {

                    lines.push(

                        `  cert #${image.index + 1}: ${
                            image
                                .loadedSuccessfully
                                ? "LOADED"
                                : "FAIL"
                        }`,

                        `    natural: ${
                            image
                                .natural
                                ?.width ??
                            0
                        } × ${
                            image
                                .natural
                                ?.height ??
                            0
                        }`,

                        `    rendered: ${
                            image
                                .rendered
                                ?.width ??
                            0
                        } × ${
                            image
                                .rendered
                                ?.height ??
                            0
                        }`,

                        `    visible: ${
                            image
                                .visibility
                                ?.rendered
                                ? "YES"
                                : "NO"
                        }`,

                        `    src: ${
                            image
                                .currentSrc ||
                            image
                                .src ||
                            "none"
                        }`

                    );

                }
            );


        lines.push(

            `  hero image: ${
                heroImageAsset
                    ?.loadedSuccessfully
                    ? "LOADED"
                    : "FAIL"
            }`

        );


        if (
            imageLoading
                .failures
                .length
        ) {

            lines.push(

                ...imageLoading
                    .failures
                    .map(
                        (
                            item
                        ) =>
                            `  FAIL ${item.group}${
                                typeof item.index ===
                                "number"
                                    ? ` #${item.index + 1}`
                                    : ""
                            }: ${item.status}`
                    )

            );

        }


        lines.push(

            "",

            "VISIBILITY POLICY",

            `failures: ${
                summary
                    .visibilityPolicy
                    .failureCount
            }`

        );


        if (
            summary
                .visibilityPolicy
                .failures
                .length
        ) {

            lines.push(

                ...summary
                    .visibilityPolicy
                    .failures
                    .map(
                        (
                            item
                        ) =>
                            `  FAIL ${item.name}: expected ${item.expected}, actual ${item.actual} (${
                                (
                                    item.reasons ||
                                    []
                                ).join(
                                    ", "
                                ) ||
                                "unknown"
                            })`
                    )

            );

        } else {

            lines.push(
                "  none"
            );

        }


        lines.push(

            "",

            "BUBBLE PLACEMENT",

            ...formatBubblePlacement(
                relationships
                    .bubblePlacement
            ),

            "",

            "VIEWPORT CLIPPING",

            `failures:   ${
                summary
                    .viewportClipping
                    .failureCount
            }`,

            `warnings:   ${
                summary
                    .viewportClipping
                    .warningCount
            }`,

            `negligible: ${
                summary
                    .viewportClipping
                    .negligibleCount
            }`

        );


        if (
            summary
                .viewportClipping
                .failures
                .length
        ) {

            lines.push(

                ...summary
                    .viewportClipping
                    .failures
                    .map(
                        (
                            item
                        ) =>
                            `  FAIL ${item.name}: ${item.clipping.max}px`
                    )

            );

        }


        if (
            summary
                .viewportClipping
                .warnings
                .length
        ) {

            lines.push(

                ...summary
                    .viewportClipping
                    .warnings
                    .map(
                        (
                            item
                        ) =>
                            `  WARN ${item.name}: ${item.clipping.max}px`
                    )

            );

        }


        if (
            summary
                .viewportClipping
                .negligible
                .length
        ) {

            lines.push(

                ...summary
                    .viewportClipping
                    .negligible
                    .map(
                        (
                            item
                        ) =>
                            `  tiny ${item.name}: ${item.clipping.max}px`
                    )

            );

        }


        lines.push(

            "",

            "PARENT / ANCESTOR CLIPPING",

            `count: ${
                summary
                    .parentClipping
                    .count
            }`

        );


        if (
            summary
                .parentClipping
                .elements
                .length
        ) {

            lines.push(

                ...summary
                    .parentClipping
                    .elements
                    .map(
                        (
                            item
                        ) =>
                            `  ${getShortAncestorSummary(item)}`
                    )

            );

        } else {

            lines.push(
                "  none"
            );

        }


        lines.push(

            "",

            "IMAGE CROPPING",

            `count: ${
                summary
                    .imageCropping
                    .count
            }`

        );


        if (
            summary
                .imageCropping
                .elements
                .length
        ) {

            lines.push(

                ...summary
                    .imageCropping
                    .elements
                    .map(
                        (
                            item
                        ) => {

                            const crop =
                                item
                                    .imageCrop
                                    .crop;


                            return (
                                `  ${item.name}` +
                                ` H:${crop.horizontalTotal}px (${crop.percentOfDrawn?.horizontal ?? 0}%)` +
                                ` V:${crop.verticalTotal}px (${crop.percentOfDrawn?.vertical ?? 0}%)`
                            );

                        }
                    )

            );

        } else {

            lines.push(
                "  none"
            );

        }


        lines.push(

            "",

            "CROP POLICY",

            `evaluated: ${
                summary
                    .cropPolicy
                    .evaluated
                    ? "YES"
                    : "NO"
            }`,

            `failures: ${
                summary
                    .cropPolicy
                    .failureCount
            }`,

            `hero image max H: ${
                summary
                    .cropPolicy
                    .limits
                    .maxHorizontalPercent
            }%`,

            `hero image max V: ${
                summary
                    .cropPolicy
                    .limits
                    .maxVerticalPercent
            }%`

        );


        if (
            summary
                .cropPolicy
                .failures
                .length
        ) {

            lines.push(

                ...summary
                    .cropPolicy
                    .failures
                    .map(
                        (
                            item
                        ) =>
                            item.axis
                                ? `  FAIL ${item.name} ${item.axis}: ${item.actualPercent}% > ${item.maxPercent}%`
                                : `  FAIL ${item.name}: ${item.reason}`
                    )

            );

        } else {

            lines.push(
                "  none"
            );

        }


        lines.push(

            "",

            "CANVAS / VISUAL CHECK",

            `count: ${
                summary
                    .visualChecks
                    .count
            }`,

            summary
                .visualChecks
                .elements
                .length
                ? `  ${summary.visualChecks.elements.join(", ")}`
                : "  none",

            "",

            `horizontal overflow: ${
                summary
                    .horizontalOverflow
                    ? "YES"
                    : "NO"
            }`,

            `matching @media rules: ${
                summary
                    .matchingMediaQueryCount
            }`

        );


        if (
            summary
                .lastMatchingMediaQuery
        ) {

            lines.push(

                `last matching rule: ${
                    summary
                        .lastMatchingMediaQuery
                        .condition
                }`

            );

        }


        lines.push(

            "",

            "Copy JSON to save the report."

        );


        return lines.join(
            "\n"
        );

    };


// =======================================================
// OVERLAY UI
// =======================================================

const createOverlay =
    () => {

        const panel =
            document.createElement(
                "div"
            );


        panel.id =
            "portfolio-qa-panel";


        Object.assign(

            panel.style,

            {

                position:
                    "fixed",

                top:
                    "8px",

                left:
                    "8px",

                zIndex:
                    "2147483647",

                width:
                    "min(470px, calc(100vw - 16px))",

                maxHeight:
                    "68vh",

                overflow:
                    "auto",

                padding:
                    "12px",

                border:
                    "1px solid rgba(255,255,255,.35)",

                borderRadius:
                    "8px",

                background:
                    "rgba(0,0,0,.90)",

                color:
                    "#fff",

                font:
                    "12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",

                boxShadow:
                    "0 8px 30px rgba(0,0,0,.35)",

            }

        );


        const controls =
            document.createElement(
                "div"
            );


        Object.assign(

            controls.style,

            {

                display:
                    "flex",

                gap:
                    "8px",

                marginBottom:
                    "8px",

            }

        );


        const makeButton =
            (
                label
            ) => {

                const button =
                    document
                        .createElement(
                            "button"
                        );


                button.type =
                    "button";


                button.textContent =
                    label;


                Object.assign(

                    button.style,

                    {

                        padding:
                            "6px 10px",

                        border:
                            "1px solid #777",

                        borderRadius:
                            "6px",

                        background:
                            "#1f1f1f",

                        color:
                            "#fff",

                        cursor:
                            "pointer",

                        font:
                            "inherit",

                    }

                );


                return button;

            };


        const refreshButton =
            makeButton(
                "Refresh"
            );


        const copyButton =
            makeButton(
                "Copy JSON"
            );


        const output =
            document.createElement(
                "pre"
            );


        Object.assign(

            output.style,

            {

                margin:
                    "0",

                whiteSpace:
                    "pre-wrap",

                overflowWrap:
                    "anywhere",

            }

        );


        controls.append(

            refreshButton,

            copyButton

        );


        panel.append(

            controls,

            output

        );


        document.body
            .appendChild(
                panel
            );


        return {

            panel,

            output,

            refreshButton,

            copyButton,

        };

    };


// =======================================================
// SAVE REPORT TO VITE SERVER
// =======================================================

const saveQaReport =
    async (
        report
    ) => {

        const response =
            await fetch(

                "/__qa/observations",

                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                    },

                    body:
                        JSON.stringify(
                            report
                        ),

                }

            );


        if (
            !response.ok
        ) {

            throw new Error(
                `QA save failed: ${response.status}`
            );

        }


        return response.json();

    };


// =======================================================
// INITIALIZE
// =======================================================

export const initHeroQA =
    () => {

        const params =
            new URLSearchParams(
                window
                    .location
                    .search
            );


        const qaEnabled =
            params.get(
                "qa"
            ) ===
            "1";


        if (
            !qaEnabled
        ) {

            return undefined;

        }


        document
            .documentElement
            .dataset
            .qa =
            "true";


        const removeQaStabilizer =
            installQaStabilizer();


        let currentReport =
            null;


        let overlay =
            null;


        let refreshTimer =
            null;


        const refresh =
            () => {

                currentReport =
                    captureHeroQA();


                window
                    .__PORTFOLIO_QA_LAST__ =
                    currentReport;


                if (
                    overlay
                ) {

                    overlay
                        .output
                        .textContent =
                        formatOverlay(
                            currentReport
                        );

                }


                return currentReport;

            };


        window.__PORTFOLIO_QA__ = {

            version:
                QA_VERSION,

            capture:
                captureHeroQA,

            refresh,

            getLast:
                () =>
                    currentReport,

        };


        const overlayEnabled =
            params.get(
                "qaOverlay"
            ) !==
            "0";


        if (
            overlayEnabled
        ) {

            overlay =
                createOverlay();


            overlay
                .refreshButton
                .addEventListener(

                    "click",

                    refresh

                );


            overlay
                .copyButton
                .addEventListener(

                    "click",

                    async () => {

                        const report =
                            refresh();


                        const text =
                            JSON.stringify(

                                report,

                                null,

                                2

                            );


                        let copied =
                            false;


                        let saved =
                            false;


                        let savedFilename =
                            null;


                        /*
                          Save first.
                        */

                        try {

                            const result =
                                await saveQaReport(
                                    report
                                );


                            saved =
                                result
                                    ?.ok ===
                                true;


                            savedFilename =
                                result
                                    ?.filename ??
                                null;


                            if (
                                savedFilename
                            ) {

                                console.log(
                                    `[Portfolio QA] Saved: ${savedFilename}`
                                );

                            }

                        } catch (
                            error
                        ) {

                            console.error(
                                "[Portfolio QA] Save failed:",
                                error
                            );

                        }


                        /*
                          Clipboard is independent.
                        */

                        try {

                            await navigator
                                .clipboard
                                .writeText(
                                    text
                                );


                            copied =
                                true;

                        } catch (
                            error
                        ) {

                            console.warn(
                                "[Portfolio QA] Clipboard unavailable:",
                                error
                            );


                            console.log(
                                text
                            );

                        }


                        if (
                            saved &&
                            copied
                        ) {

                            overlay
                                .copyButton
                                .textContent =
                                "Saved + Copied!";

                        } else if (
                            saved
                        ) {

                            overlay
                                .copyButton
                                .textContent =
                                "Saved JSON!";

                        } else if (
                            copied
                        ) {

                            overlay
                                .copyButton
                                .textContent =
                                "Copied (save failed)";

                        } else {

                            overlay
                                .copyButton
                                .textContent =
                                "Save failed";

                        }


                        window.setTimeout(

                            () => {

                                if (
                                    overlay
                                ) {

                                    overlay
                                        .copyButton
                                        .textContent =
                                        "Copy JSON";

                                }

                            },

                            1800

                        );

                    }

                );

        }


        const scheduleRefresh =
            () => {

                window.clearTimeout(
                    refreshTimer
                );


                refreshTimer =
                    window.setTimeout(

                        refresh,

                        120

                    );

            };


        const waitForImages =
            async () => {

                const images = [
                    ...document.images,
                ];


                await Promise.all(

                    images.map(

                        (
                            image
                        ) => {

                            if (
                                image.complete
                            ) {

                                return Promise.resolve();

                            }


                            return new Promise(

                                (
                                    resolve
                                ) => {

                                    const done =
                                        () =>
                                            resolve();


                                    image.addEventListener(

                                        "load",

                                        done,

                                        {
                                            once:
                                                true,
                                        }

                                    );


                                    image.addEventListener(

                                        "error",

                                        done,

                                        {
                                            once:
                                                true,
                                        }

                                    );

                                }

                            );

                        }

                    )

                );

            };


        const start =
            async () => {

                if (
                    document
                        .fonts
                        ?.ready
                ) {

                    await document
                        .fonts
                        .ready;

                }


                await waitForImages();


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


                refresh();


                /*
                  Capture again after the
                  page/browser UI has had
                  time to settle.
                */

                window.setTimeout(

                    refresh,

                    2500

                );

            };


        window.addEventListener(

            "resize",

            scheduleRefresh

        );


        window.addEventListener(

            "orientationchange",

            scheduleRefresh

        );


        window
            .visualViewport
            ?.addEventListener(

                "resize",

                scheduleRefresh

            );


        window
            .visualViewport
            ?.addEventListener(

                "scroll",

                scheduleRefresh

            );


        start();


        return () => {

            window.clearTimeout(
                refreshTimer
            );


            window.removeEventListener(

                "resize",

                scheduleRefresh

            );


            window.removeEventListener(

                "orientationchange",

                scheduleRefresh

            );


            window
                .visualViewport
                ?.removeEventListener(

                    "resize",

                    scheduleRefresh

                );


            window
                .visualViewport
                ?.removeEventListener(

                    "scroll",

                    scheduleRefresh

                );


            overlay
                ?.panel
                .remove();


            removeQaStabilizer
                ?.();


            delete document
                .documentElement
                .dataset
                .qa;


            delete window
                .__PORTFOLIO_QA__;


            delete window
                .__PORTFOLIO_QA_LAST__;

        };

    };