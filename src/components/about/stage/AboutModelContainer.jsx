import {
    Canvas
} from "@react-three/fiber";

import {
    OrbitControls,
    PerspectiveCamera,
    Preload,
    Stage,
    useGLTF,
} from "@react-three/drei";

import {
    Suspense,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import {
    ABOUT_SCENES
} from "./aboutScenes";

import CarouselModelSlot
    from "./CarouselModelSlot";


/*
 * Carousel-only movement.
 * Text-section changes do NOT use these values.
 */
const SLIDE_DURATION = 0.9;
const SLIDE_DISTANCE = 2.8;
const EDGE_SCALE = 0.88;


/*
 * Keep the post-drag grace period.
 * After the grace period ends, a NEW full
 * scene.interval countdown begins.
 */
const INTERACTION_RESUME_DELAY = 1200;


/*
 * Lama's Stage uses Drei Bounds camera fitting.
 * Bounds' default camera transition duration is 1s.
 * We leave the actual camera movement to Stage/Bounds
 * instead of scaling the model ourselves.
 */
const LAMA_ZOOM_DURATION = 1000;


/*
 * Important adaptation:
 *
 * Lama lets Stage fit to each model. In this portfolio,
 * each model already has an approved visualScale.
 * Fitting directly to each model would largely cancel
 * those per-model size choices.
 *
 * Instead Stage fits this fixed frame. That preserves
 * the same Stage/Bounds zoom mechanism while keeping the
 * model sizes from aboutScenes.js meaningful.
 *
 * These dimensions reproduce the current desktop framing
 * closely with the existing fov={38} camera. We can make
 * this geometry-responsive later with the rest of About.
 */
const StageBoundsAnchor = () => {
    return (
        <mesh>
            <boxGeometry
                args={[
                    2.55,
                    2.55,
                    2.55,
                ]}
            />

            <meshBasicMaterial
                transparent
                opacity={0}
                depthWrite={false}
                depthTest={false}
                colorWrite={false}
            />
        </mesh>
    );
};


const AboutModelContainer = ({
    activeScene,
    onLaptopReady,
}) => {
    const [
        renderSceneId,
        setRenderSceneId,
    ] = useState(activeScene);


    const [
        activeIndex,
        setActiveIndex,
    ] = useState(0);


    /*
     * transition.kind:
     *
     * "scene"
     *   A text keyword changed.
     *   The incoming model loads invisibly, then the
     *   scene swaps and Lama's Stage/Bounds camera zoom
     *   is restarted.
     *
     * "carousel"
     *   Same text section, next model.
     *   Uses the existing horizontal slide.
     */
    const [
        transition,
        setTransition,
    ] = useState(null);


    const [
        isInteracting,
        setIsInteracting,
    ] = useState(false);


    /*
     * Incrementing this remounts the camera + Stage +
     * OrbitControls, which recreates Lama's container
     * remount behavior for text-section changes.
     */
    const [
        sceneZoomEpoch,
        setSceneZoomEpoch,
    ] = useState(0);


    /*
     * About begins with the Laptop, so the initial entry
     * should receive the same Stage/Bounds zoom.
     */
    const [
        sceneZoomActive,
        setSceneZoomActive,
    ] = useState(true);


    const transitionSequenceRef =
        useRef(0);

    const transitionRef =
        useRef(null);


    const resumeTimerRef =
        useRef(null);

    const sceneZoomTimerRef =
        useRef(null);

    const warmupFrameOneRef =
        useRef(null);

    const warmupFrameTwoRef =
        useRef(null);


    const scene =
        ABOUT_SCENES[
        renderSceneId
        ] ??
        ABOUT_SCENES.developer;


    const activeItem =
        scene.items[
        activeIndex
        ] ??
        scene.items[0];


    useEffect(() => {
        transitionRef.current =
            transition;
    }, [transition]);


    /*
     * -----------------------------------------
     * LAMA STAGE/BOUNDS ZOOM
     * -----------------------------------------
     */

    const triggerLamaZoom =
        useCallback(() => {
            if (
                sceneZoomTimerRef
                    .current
            ) {
                window.clearTimeout(
                    sceneZoomTimerRef
                        .current
                );
            }


            setSceneZoomActive(true);

            setSceneZoomEpoch(
                (current) =>
                    current + 1
            );


            sceneZoomTimerRef.current =
                window.setTimeout(
                    () => {
                        sceneZoomTimerRef
                            .current =
                            null;

                        setSceneZoomActive(
                            false
                        );
                    },
                    LAMA_ZOOM_DURATION
                );
        }, []);


    /*
     * Initial Laptop zoom.
     */
    useEffect(() => {
        sceneZoomTimerRef.current =
            window.setTimeout(
                () => {
                    sceneZoomTimerRef
                        .current =
                        null;

                    setSceneZoomActive(
                        false
                    );
                },
                LAMA_ZOOM_DURATION
            );


        return () => {
            if (
                sceneZoomTimerRef
                    .current
            ) {
                window.clearTimeout(
                    sceneZoomTimerRef
                        .current
                );
            }
        };
    }, []);


    /*
     * -----------------------------------------
     * CAROUSEL GPU WARM-UP
     * -----------------------------------------
     */

    const cancelWarmupFrames =
        useCallback(() => {
            if (
                warmupFrameOneRef
                    .current !== null
            ) {
                window.cancelAnimationFrame(
                    warmupFrameOneRef
                        .current
                );
            }


            if (
                warmupFrameTwoRef
                    .current !== null
            ) {
                window.cancelAnimationFrame(
                    warmupFrameTwoRef
                        .current
                );
            }


            warmupFrameOneRef.current =
                null;

            warmupFrameTwoRef.current =
                null;
        }, []);


    const commitCarouselReady =
        useCallback(
            (
                transitionId
            ) => {
                const current =
                    transitionRef
                        .current;


                if (
                    !current ||
                    current.id !==
                    transitionId ||
                    current.ready
                ) {
                    return;
                }


                const readyTransition = {
                    ...current,
                    ready: true,
                };


                transitionRef.current =
                    readyTransition;

                setTransition(
                    readyTransition
                );
            },
            []
        );


    const finishTransition =
        useCallback(
            (
                transitionId
            ) => {
                const current =
                    transitionRef
                        .current;


                if (
                    !current ||
                    current.id !==
                    transitionId
                ) {
                    return;
                }


                setRenderSceneId(
                    current.toSceneId
                );

                setActiveIndex(
                    current.toIndex
                );


                transitionRef.current =
                    null;

                setTransition(null);
            },
            []
        );


    const markTransitionReady =
        useCallback(
            (
                transitionId
            ) => {
                const current =
                    transitionRef
                        .current;


                if (
                    !current ||
                    current.id !==
                    transitionId
                ) {
                    return;
                }


                cancelWarmupFrames();


                /*
                 * TEXT SECTION CHANGE:
                 *
                 * No model-scale animation.
                 * Swap to the ready model, then remount
                 * camera + Stage so Stage/Bounds performs
                 * Lama's camera-based fit/zoom.
                 */
                if (
                    current.kind ===
                    "scene"
                ) {
                    setRenderSceneId(
                        current.toSceneId
                    );

                    setActiveIndex(
                        current.toIndex
                    );


                    transitionRef.current =
                        null;

                    setTransition(null);


                    /*
                     * The incoming Laptop has now genuinely
                     * loaded and completed normalization.
                     *
                     * Notify About only at this point so the
                     * View Screen button never appears while
                     * the previous model is still being shown.
                     */
                    if (
                        current.toSceneId ===
                        "developer" &&
                        current.toItem.id ===
                        "laptop"
                    ) {
                        onLaptopReady?.();
                    }


                    triggerLamaZoom();

                    return;
                }


                /*
                 * CAROUSEL:
                 *
                 * The GLB is already preloaded. Give the
                 * incoming mounted object two rendered
                 * frames before starting movement.
                 */
                if (current.ready) {
                    return;
                }


                warmupFrameOneRef
                    .current =
                    window.requestAnimationFrame(
                        () => {
                            warmupFrameTwoRef
                                .current =
                                window.requestAnimationFrame(
                                    () => {
                                        warmupFrameOneRef
                                            .current =
                                            null;

                                        warmupFrameTwoRef
                                            .current =
                                            null;


                                        commitCarouselReady(
                                            transitionId
                                        );
                                    }
                                );
                        }
                    );
            },
            [
                cancelWarmupFrames,
                commitCarouselReady,
                triggerLamaZoom,
                onLaptopReady,
            ]
        );


    /*
     * -----------------------------------------
     * BEGIN TRANSITION
     * -----------------------------------------
     */

    const beginTransition =
        useCallback(
            (
                toSceneId,
                toIndex,
                kind = "carousel"
            ) => {
                const currentTransition =
                    transitionRef
                        .current;


                /*
                 * Automatic carousel events never stack.
                 * Explicit keyword changes may override a
                 * carousel transition because user input
                 * wins.
                 */
                if (
                    currentTransition &&
                    kind !== "scene"
                ) {
                    return;
                }


                if (
                    currentTransition
                        ?.kind ===
                    "scene" &&
                    currentTransition
                        .toSceneId ===
                    toSceneId
                ) {
                    return;
                }


                const targetScene =
                    ABOUT_SCENES[
                    toSceneId
                    ] ??
                    ABOUT_SCENES.developer;


                const toItem =
                    targetScene.items[
                    toIndex
                    ] ??
                    targetScene.items[0];


                if (!toItem) {
                    return;
                }


                if (
                    !currentTransition &&
                    toSceneId ===
                    renderSceneId &&
                    toIndex ===
                    activeIndex
                ) {
                    return;
                }


                cancelWarmupFrames();


                transitionSequenceRef
                    .current += 1;


                const nextTransition = {
                    id:
                        transitionSequenceRef
                            .current,

                    kind,
                    toSceneId,
                    toIndex,
                    toItem,
                    ready: false,
                };


                transitionRef.current =
                    nextTransition;

                setTransition(
                    nextTransition
                );
            },
            [
                activeIndex,
                cancelWarmupFrames,
                renderSceneId,
            ]
        );


    /*
     * -----------------------------------------
     * TEXT SECTION CHANGE
     * -----------------------------------------
     */

    useEffect(() => {
        if (
            activeScene ===
            renderSceneId
        ) {
            return;
        }


        beginTransition(
            activeScene,
            0,
            "scene"
        );
    }, [
        activeScene,
        renderSceneId,
        beginTransition,
    ]);


    /*
     * -----------------------------------------
     * CAROUSEL ASSET PRELOAD
     * -----------------------------------------
     *
     * As soon as a multi-model text section is active,
     * preload ALL other models in that section.
     *
     * This still respects the About visibility gate:
     * AboutModelContainer does not exist until About is
     * visible. It simply removes first-cycle carousel
     * network/parse latency once a carousel is selected.
     */

    useEffect(() => {
        const targetScene =
            ABOUT_SCENES[
            activeScene
            ] ??
            ABOUT_SCENES.developer;


        if (
            targetScene.items.length <=
            1
        ) {
            return;
        }


        targetScene.items.forEach(
            (item) => {
                if (item.assetPath) {
                    useGLTF.preload(
                        item.assetPath
                    );
                }
            }
        );
    }, [activeScene]);


    /*
     * -----------------------------------------
     * CAROUSEL TIMER
     * -----------------------------------------
     *
     * Every stable model gets the FULL interval.
     *
     * If the user starts dragging:
     *   -> effect cleanup cancels the timer.
     *
     * When the post-drag grace period ends:
     *   -> isInteracting becomes false.
     *   -> this effect starts a brand-new FULL 6500ms
     *      timer (or whatever scene.interval is).
     */

    useEffect(() => {
        const canRunCarousel =
            activeScene ===
            renderSceneId &&

            !transition &&

            !sceneZoomActive &&

            !isInteracting &&

            scene.items.length > 1 &&

            Boolean(scene.interval);


        if (!canRunCarousel) {
            return undefined;
        }


        const carouselTimer =
            window.setTimeout(
                () => {
                    const nextIndex =
                        (
                            activeIndex +
                            1
                        ) %
                        scene.items.length;


                    beginTransition(
                        renderSceneId,
                        nextIndex,
                        "carousel"
                    );
                },
                scene.interval
            );


        return () => {
            window.clearTimeout(
                carouselTimer
            );
        };
    }, [
        activeScene,
        renderSceneId,
        activeIndex,
        scene.items.length,
        scene.interval,
        transition,
        sceneZoomActive,
        isInteracting,
        beginTransition,
    ]);


    /*
     * -----------------------------------------
     * USER INTERACTION
     * -----------------------------------------
     */

    const handleInteractionStart =
        useCallback(() => {
            if (
                resumeTimerRef
                    .current
            ) {
                window.clearTimeout(
                    resumeTimerRef
                        .current
                );
            }


            resumeTimerRef.current =
                null;


            setIsInteracting(true);
        }, []);


    const handleInteractionEnd =
        useCallback(() => {
            if (
                resumeTimerRef
                    .current
            ) {
                window.clearTimeout(
                    resumeTimerRef
                        .current
                );
            }


            resumeTimerRef.current =
                window.setTimeout(
                    () => {
                        resumeTimerRef
                            .current =
                            null;


                        /*
                         * Setting false restarts the
                         * carousel effect with a full
                         * scene.interval countdown.
                         */
                        setIsInteracting(
                            false
                        );
                    },
                    INTERACTION_RESUME_DELAY
                );
        }, []);


    /*
     * About unmounted because it left the viewport.
     */
    useEffect(() => {
        return () => {
            cancelWarmupFrames();


            if (
                resumeTimerRef
                    .current
            ) {
                window.clearTimeout(
                    resumeTimerRef
                        .current
                );
            }


            if (
                sceneZoomTimerRef
                    .current
            ) {
                window.clearTimeout(
                    sceneZoomTimerRef
                        .current
                );
            }
        };
    }, [cancelWarmupFrames]);


    /*
     * -----------------------------------------
     * MODEL SLOTS
     * -----------------------------------------
     */

    let modelSlots;


    /*
     * Same text section = carousel slide.
     */
    if (
        transition?.kind ===
        "carousel"
    ) {
        modelSlots = [
            {
                key:
                    `${renderSceneId}-${activeItem.id}`,

                item:
                    activeItem,

                animationId:
                    transition.id,

                playing:
                    transition.ready,

                visible:
                    true,

                fromOffset:
                    0,

                toOffset:
                    -SLIDE_DISTANCE,

                fromScale:
                    1,

                toScale:
                    EDGE_SCALE,

                duration:
                    SLIDE_DURATION,
            },

            {
                key:
                    `${transition.toSceneId}-${transition.toItem.id}`,

                item:
                    transition.toItem,

                animationId:
                    transition.id,

                playing:
                    transition.ready,

                visible:
                    true,

                fromOffset:
                    SLIDE_DISTANCE,

                toOffset:
                    0,

                fromScale:
                    EDGE_SCALE,

                toScale:
                    1,

                duration:
                    SLIDE_DURATION,

                onModelReady:
                    () => {
                        markTransitionReady(
                            transition.id
                        );
                    },

                onComplete:
                    () => {
                        finishTransition(
                            transition.id
                        );
                    },
            },
        ];
    }


    /*
     * Different text section:
     *
     * Keep the old model visible only while the new GLB
     * loads. The incoming model is mounted invisibly so
     * its bounds/materials can be prepared.
     *
     * Once ready, markTransitionReady swaps the scene and
     * triggers the Stage/Bounds camera zoom.
     */
    else if (
        transition?.kind ===
        "scene"
    ) {
        modelSlots = [
            {
                key:
                    `${renderSceneId}-${activeItem.id}`,

                item:
                    activeItem,

                animationId:
                    null,

                playing:
                    false,

                visible:
                    true,

                fromOffset:
                    0,

                toOffset:
                    0,

                fromScale:
                    1,

                toScale:
                    1,

                duration:
                    SLIDE_DURATION,
            },

            {
                key:
                    `${transition.toSceneId}-${transition.toItem.id}`,

                item:
                    transition.toItem,

                animationId:
                    transition.id,

                playing:
                    false,

                visible:
                    false,

                fromOffset:
                    0,

                toOffset:
                    0,

                fromScale:
                    1,

                toScale:
                    1,

                duration:
                    SLIDE_DURATION,

                onModelReady:
                    () => {
                        markTransitionReady(
                            transition.id
                        );
                    },
            },
        ];
    }


    /*
     * Stable single model / stable carousel item.
     */
    else {
        modelSlots = [
            {
                key:
                    `${renderSceneId}-${activeItem.id}`,

                item:
                    activeItem,

                animationId:
                    null,

                playing:
                    false,

                visible:
                    true,

                fromOffset:
                    0,

                toOffset:
                    0,

                fromScale:
                    1,

                toScale:
                    1,

                duration:
                    SLIDE_DURATION,

                onModelReady:
                    renderSceneId === "developer" &&
                        activeItem.id === "laptop"
                        ? onLaptopReady
                        : undefined,
            },
        ];
    }


    const stageIntensity =
        transition?.kind ===
            "carousel" &&
            transition.ready
            ? (
                transition
                    .toItem
                    .stageIntensity ??
                0.65
            )
            : (
                activeItem
                    .stageIntensity ??
                0.65
            );


    /*
     * CRITICAL ROTATION RULE:
     *
     * Carousel slides must NOT disable OrbitControls.
     *
     * Drei/Three's OrbitControls performs autoRotate from its
     * per-frame update. Setting `enabled={false}` during a carousel
     * also stops that update path, which is why the spin visibly
     * paused even though autoRotate itself was still true.
     *
     * Therefore:
     * - text-section/Lama zoom: controls + autoRotate pause
     * - carousel slide: controls stay enabled, autoRotate stays on
     *
     * Pointer input is blocked at the wrapper during the short
     * carousel slide so the user cannot grab the camera mid-slide,
     * while OrbitControls itself remains alive and spinning.
     */
    const isSceneTransition =
        transition?.kind === "scene";

    const isCarouselTransition =
        transition?.kind === "carousel";


    const controlsEnabled =
        !sceneZoomActive &&
        !isSceneTransition;


    const autoRotateEnabled =
        !sceneZoomActive &&
        !isSceneTransition;


    return (
        <div
            className=
            "aboutModelContainer"
        >
            <div
                className=
                "aboutCanvasShell"

                /*
                 * During a carousel slide, block pointer input
                 * without disabling OrbitControls itself.
                 *
                 * This is the key difference: autoRotate keeps
                 * updating continuously while the models slide.
                 */
                style={{
                    pointerEvents:
                        isCarouselTransition
                            ? "none"
                            : "auto",
                }}
            >
                <Canvas
                    dpr={[
                        1,
                        1.75,
                    ]}

                    gl={{
                        antialias: true,

                        powerPreference:
                            "high-performance",
                    }}

                    onCreated={({
                        gl
                    }) => {
                        gl.toneMappingExposure =
                            1;
                    }}
                >
                    <Suspense
                        fallback={null}
                    >
                        {/*
                          Lama-style section zoom:

                          A fresh camera and Stage are mounted
                          for every text-section change.

                          The camera starts farther away, then
                          Stage/Bounds performs its native fit
                          animation into the fixed framing box.

                          Using the fixed box is what preserves
                          the approved per-model visualScale.
                        */}
                        <PerspectiveCamera
                            key={
                                `camera-${sceneZoomEpoch}`
                            }

                            makeDefault

                            position={[
                                0,
                                0,
                                7,
                            ]}

                            fov={38}
                        />


                        <OrbitControls
                            key={`controls-${sceneZoomEpoch}`}

                            makeDefault

                            enabled={controlsEnabled}

                            enableZoom={false}
                            enablePan={false}

                            target={[0, 0, 0]}

                            autoRotate={autoRotateEnabled}

                            autoRotateSpeed={2}

                            enableDamping
                            dampingFactor={0.06}

                            rotateSpeed={0.65}

                            onStart={handleInteractionStart}
                            onEnd={handleInteractionEnd}
                        />


                        <Stage
                            key={
                                `stage-${sceneZoomEpoch}`
                            }

                            preset="soft"

                            environment="city"

                            intensity={
                                stageIntensity
                            }

                            shadows={false}

                            /*
                             * Lama leaves Stage's camera
                             * adjustment enabled. 1.2 is
                             * Drei Bounds' standard fit margin.
                             */
                            adjustCamera={1.2}
                        >
                            <StageBoundsAnchor />
                        </Stage>


                        {/*
                          Models intentionally live OUTSIDE
                          Stage's bounds calculation.

                          Stage still contributes lights and the
                          environment to the same Three scene,
                          but camera fitting only sees the fixed
                          anchor. This keeps visualScale intact.
                        */}
                        {modelSlots.map(
                            (
                                slot
                            ) => (
                                <Suspense
                                    key={
                                        slot.key
                                    }

                                    fallback={
                                        null
                                    }
                                >
                                    <CarouselModelSlot
                                        item={
                                            slot.item
                                        }

                                        animationId={
                                            slot.animationId
                                        }

                                        playing={
                                            slot.playing
                                        }

                                        visible={
                                            slot.visible
                                        }

                                        fromOffset={
                                            slot.fromOffset
                                        }

                                        toOffset={
                                            slot.toOffset
                                        }

                                        fromScale={
                                            slot.fromScale
                                        }

                                        toScale={
                                            slot.toScale
                                        }

                                        duration={
                                            slot.duration
                                        }

                                        onModelReady={
                                            slot.onModelReady
                                        }

                                        onComplete={
                                            slot.onComplete
                                        }
                                    />
                                </Suspense>
                            )
                        )}


                        {/*
                          Forces Three to compile the currently
                          mounted model materials/programs.
                          The key reruns this when an incoming
                          model is mounted for a transition.
                        */}
                        <Preload
                            key={
                                transition
                                    ? `preload-${transition.id}`
                                    : `preload-${renderSceneId}-${activeIndex}`
                            }

                            all
                        />
                    </Suspense>
                </Canvas>
            </div>
        </div>
    );
};


export default AboutModelContainer;
