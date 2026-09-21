import {
    useEffect,
    useLayoutEffect,
    useRef,
} from "react";

import {
    useFrame
} from "@react-three/fiber";

import * as THREE from "three";

import NormalizedModel
    from "./NormalizedModel";


const easeInOutCubic = (
    value
) => {
    if (value < 0.5) {
        return (
            4 *
            value *
            value *
            value
        );
    }

    return (
        1 -
        Math.pow(
            -2 * value + 2,
            3
        ) / 2
    );
};


const CarouselModelSlot = ({
    item,

    animationId,

    playing = false,

    visible = true,

    fromOffset = 0,
    toOffset = 0,

    fromScale = 1,
    toScale = 1,

    duration = 0.9,

    onModelReady,
    onComplete,
}) => {
    const groupRef =
        useRef(null);

    const elapsedRef =
        useRef(0);

    const completedRef =
        useRef(false);

    const onCompleteRef =
        useRef(onComplete);

    const rightVectorRef =
        useRef(
            new THREE.Vector3()
        );


    useEffect(() => {
        onCompleteRef.current =
            onComplete;
    }, [onComplete]);


    /*
     * Reset motion whenever a new
     * transition begins.
     */
    useLayoutEffect(() => {
        elapsedRef.current = 0;

        completedRef.current =
            false;
    }, [animationId]);


    useFrame(
        ({ camera }, delta) => {
            const group =
                groupRef.current;


            if (!group) {
                return;
            }


            if (
                playing &&
                !completedRef.current
            ) {
                /*
                 * Prevent giant jumps if the
                 * browser/tab briefly stalls.
                 */
                elapsedRef.current +=
                    Math.min(
                        delta,
                        0.05
                    );
            }


            const rawProgress =
                playing
                    ? Math.min(
                        elapsedRef.current /
                            duration,
                        1
                    )
                    : 0;


            const progress =
                easeInOutCubic(
                    rawProgress
                );


            const offset =
                THREE.MathUtils.lerp(
                    fromOffset,
                    toOffset,
                    progress
                );


            /*
             * Calculate horizontal movement
             * relative to the camera.
             *
             * The carousel therefore still
             * slides left/right on screen even
             * if the user rotated the model.
             */
            const right =
                rightVectorRef.current;


            right
                .set(1, 0, 0)
                .applyQuaternion(
                    camera.quaternion
                )
                .normalize()
                .multiplyScalar(
                    offset
                );


            group.position.copy(
                right
            );


            /*
             * This outer scale is animation
             * scale only.
             *
             * NormalizedModel still controls
             * the final visualScale from
             * aboutScenes.js.
             */
            const scale =
                THREE.MathUtils.lerp(
                    fromScale,
                    toScale,
                    progress
                );


            group.scale.setScalar(
                scale
            );


            if (
                playing &&
                rawProgress >= 1 &&
                !completedRef.current
            ) {
                completedRef.current =
                    true;

                onCompleteRef
                    .current?.();
            }
        }
    );


    return (
        <group
            ref={groupRef}
            visible={visible}
        >
            <NormalizedModel
                item={item}
                onReady={
                    onModelReady
                }
            />
        </group>
    );
};


export default CarouselModelSlot;