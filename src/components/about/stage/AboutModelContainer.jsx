import {
    Canvas,
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
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import {
    ABOUT_SCENES
} from "./aboutScenes";

import CarouselModelSlot
    from "./CarouselModelSlot";


const SLIDE_DURATION = 0.85;
const SLIDE_DISTANCE = 2.8;
const EDGE_SCALE = 0.88;
const INTERACTION_RESUME_DELAY = 1200;
const LAMA_ZOOM_DURATION = 1000;
const DESKTOP_FRAME_EDGE = 2.55;


const StageBoundsAnchor = ({ edge }) => {
    return (
        <mesh>
            <boxGeometry
                args={[
                    edge,
                    edge,
                    edge,
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
    isActive,
    onLaptopReady,
}) => {
    const modelContainerRef = useRef(null);

    const [frameEdge, setFrameEdge] =
        useState(DESKTOP_FRAME_EDGE);


    useLayoutEffect(() => {
        const node = modelContainerRef.current;

        if (!node) {
            return undefined;
        }

        const syncFrame = () => {
            const value = Number.parseFloat(
                getComputedStyle(node).getPropertyValue(
                    "--about-stage-frame-edge"
                )
            );

            setFrameEdge(
                Number.isFinite(value) && value > 0
                    ? value
                    : DESKTOP_FRAME_EDGE
            );
        };

        syncFrame();

        window.addEventListener(
            "resize",
            syncFrame
        );

        return () => {
            window.removeEventListener(
                "resize",
                syncFrame
            );
        };
    }, []);


    const [
        renderSceneId,
        setRenderSceneId,
    ] = useState(activeScene);

    const [
        activeIndex,
        setActiveIndex,
    ] = useState(0);

    const [
        transition,
        setTransition,
    ] = useState(null);

    const [
        sceneZoomEpoch,
        setSceneZoomEpoch,
    ] = useState(0);

    const [
        sceneZoomActive,
        setSceneZoomActive,
    ] = useState(true);


    const transitionSequenceRef =
        useRef(0);

    const transitionRef =
        useRef(null);

    const carouselTimerRef =
        useRef(null);

    const scheduleCarouselTimerRef =
        useRef(null);

    const resumeTimerRef =
        useRef(null);

    const isInteractingRef =
        useRef(false);

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


    const cancelCarouselTimer =
        useCallback(() => {
            if (
                carouselTimerRef
                    .current !== null
            ) {
                window.clearTimeout(
                    carouselTimerRef
                        .current
                );

                carouselTimerRef.current =
                    null;
            }
        }, []);


    const scheduleCarouselTimer =
        useCallback(() => {
            cancelCarouselTimer();

            const canRunCarousel =
                isActive &&
                !isInteractingRef.current &&
                activeScene ===
                    renderSceneId &&
                !transition &&
                !sceneZoomActive &&
                scene.items.length > 1 &&
                Boolean(scene.interval);

            if (!canRunCarousel) {
                return;
            }

            carouselTimerRef.current =
                window.setTimeout(
                    () => {
                        carouselTimerRef.current =
                            null;

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
        }, [
            isActive,
            activeScene,
            renderSceneId,
            activeIndex,
            scene.items.length,
            scene.interval,
            transition,
            sceneZoomActive,
            beginTransition,
            cancelCarouselTimer,
        ]);


    useEffect(() => {
        scheduleCarouselTimerRef.current =
            scheduleCarouselTimer;

        return () => {
            if (
                scheduleCarouselTimerRef
                    .current ===
                    scheduleCarouselTimer
            ) {
                scheduleCarouselTimerRef
                    .current =
                    null;
            }
        };
    }, [
        scheduleCarouselTimer,
    ]);


    useEffect(() => {
        scheduleCarouselTimer();

        return () => {
            cancelCarouselTimer();
        };
    }, [
        scheduleCarouselTimer,
        cancelCarouselTimer,
    ]);


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

            isInteractingRef.current =
                true;

            cancelCarouselTimer();
        }, [cancelCarouselTimer]);


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

                        isInteractingRef.current =
                            false;

                        scheduleCarouselTimerRef
                            .current?.();
                    },
                    INTERACTION_RESUME_DELAY
                );
        }, []);


    useEffect(() => {
        return () => {
            cancelWarmupFrames();
            cancelCarouselTimer();

            isInteractingRef.current =
                false;

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
    }, [
        cancelWarmupFrames,
        cancelCarouselTimer,
    ]);


    let modelSlots;

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
                    (
                        renderSceneId ===
                            "developer" &&
                        activeItem.id ===
                            "laptop"
                    )
                        ? () => {
                            onLaptopReady?.();
                        }
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

    const isSceneTransition =
        transition?.kind ===
            "scene";

    const isCarouselTransition =
        transition?.kind ===
            "carousel";

    const controlsEnabled =
        isActive &&
        !sceneZoomActive &&
        !isSceneTransition;

    const autoRotateEnabled =
        isActive &&
        !sceneZoomActive &&
        !isSceneTransition;


    return (
        <div
            className="aboutModelContainer"
            ref={modelContainerRef}
        >
            <div
                className="aboutCanvasShell"
                style={{
                    pointerEvents:
                        !isActive ||
                        isCarouselTransition
                            ? "none"
                            : "auto",
                }}
            >
                <Canvas
                    frameloop={
                        isActive
                            ? "always"
                            : "demand"
                    }
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
                        <PerspectiveCamera
                            key={
                                `camera-${sceneZoomEpoch}-${frameEdge}`
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
                            autoRotateSpeed={2.5}
                            enableDamping={false}
                            rotateSpeed={0.65}
                            onStart={handleInteractionStart}
                            onEnd={handleInteractionEnd}
                        />

                        <Stage
                            key={
                                `stage-${sceneZoomEpoch}-${frameEdge}`
                            }
                            preset="soft"
                            environment="city"
                            intensity={
                                stageIntensity
                            }
                            shadows={false}
                            adjustCamera={1.2}
                        >
                            <StageBoundsAnchor
                                edge={frameEdge}
                            />
                        </Stage>

                        {modelSlots.map(
                            (
                                slot
                            ) => (
                                <Suspense
                                    key={
                                        slot.key
                                    }
                                    fallback={null}
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
