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


/*
 * Keep the first camera-facing correction for the lifetime of one About
 * Canvas/WebGL renderer.
 *
 * Carousel model slots are remounted as items cycle, so a local ref alone
 * cannot preserve the clapperboard's rotational phase. The renderer, however,
 * stays alive for the entire About visit and is recreated when About leaves
 * view and later mounts again. WeakMap gives us exactly that lifetime without
 * persisting anything across About visits or page refreshes.
 */
const cameraFacingAnglesByRenderer =
    new WeakMap();


const getCameraFacingAngle = (
    renderer,
    itemId,
    camera
) => {
    let itemAngles =
        cameraFacingAnglesByRenderer
            .get(renderer);


    if (!itemAngles) {
        itemAngles = new Map();

        cameraFacingAnglesByRenderer
            .set(
                renderer,
                itemAngles
            );
    }


    if (itemAngles.has(itemId)) {
        return itemAngles.get(itemId);
    }


    const angle =
        Math.atan2(
            camera.position.x,
            camera.position.z
        );


    itemAngles.set(
        itemId,
        angle
    );


    return angle;
};


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

    const cameraFacingAppliedRef =
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
     * Reset slide motion whenever a new
     * transition begins.
     */
    useLayoutEffect(() => {
        elapsedRef.current = 0;

        completedRef.current =
            false;
    }, [animationId]);


    /*
     * Each newly mounted slot still needs the stored session correction
     * applied once. The actual angle is retained outside the slot in the
     * renderer-scoped WeakMap above.
     */
    useLayoutEffect(() => {
        cameraFacingAppliedRef.current =
            false;
    }, [item.id]);


    useFrame(
        ({ camera, gl }, delta) => {
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
             * Opted-in models get one front-facing correction per About visit.
             *
             * First appearance:
             *   calculate the correction from the current camera azimuth.
             *
             * Later appearances during the SAME About visit:
             *   reuse that exact correction instead of front-aligning again.
             *   The shared OrbitControls camera therefore keeps the visual
             *   rotation progressing naturally from its current angle.
             *
             * Leaving About destroys its Canvas/WebGL renderer. On the next
             * visit (or after a page refresh), the new renderer has no stored
             * correction, so the first clapperboard reveal front-aligns again.
             */
            if (
                item.faceCameraOnEnter &&
                !cameraFacingAppliedRef.current
            ) {
                group.rotation.y =
                    getCameraFacingAngle(
                        gl,
                        item.id,
                        camera
                    );

                cameraFacingAppliedRef.current =
                    true;
            }


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