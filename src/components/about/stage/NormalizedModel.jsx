import {
    useEffect,
    useLayoutEffect,
    useRef,
} from "react";

import * as THREE from "three";


/*
 * Change this ONE value later if every model
 * needs to become globally larger/smaller.
 *
 * Do not resize individual generated JSX files.
 */
const TARGET_RADIUS = 1.05;


const NormalizedModel = ({
    item,
    onReady,
}) => {
    const scaleGroup = useRef(null);
    const contentGroup = useRef(null);

    const onReadyRef = useRef(onReady);

    const Model = item.Model;


    /*
     * Keep the latest callback without forcing
     * the normalization calculation to rerun.
     */
    useEffect(() => {
        onReadyRef.current = onReady;
    }, [onReady]);


    useLayoutEffect(() => {
        const scaleNode =
            scaleGroup.current;

        const contentNode =
            contentGroup.current;


        if (
            !scaleNode ||
            !contentNode
        ) {
            return;
        }


        /*
         * Always begin measurement from a clean
         * transform so scale corrections never
         * accumulate.
         */
        scaleNode.scale.setScalar(1);

        contentNode.position.set(
            0,
            0,
            0
        );


        contentNode.updateWorldMatrix(
            true,
            true
        );


        const box =
            new THREE.Box3()
                .setFromObject(
                    contentNode,
                    true
                );


        if (box.isEmpty()) {
            return;
        }


        const center =
            box.getCenter(
                new THREE.Vector3()
            );


        const sphere =
            box.getBoundingSphere(
                new THREE.Sphere()
            );


        if (
            !Number.isFinite(
                sphere.radius
            ) ||
            sphere.radius <= 0
        ) {
            return;
        }


        /*
         * Convert the world-space center back
         * into the parent's local coordinate
         * system.
         *
         * This makes the normalization safe even
         * while the outer carousel slot moves.
         */
        const parent =
            contentNode.parent;


        const localCenter =
            parent
                ? parent.worldToLocal(
                    center.clone()
                )
                : center.clone();


        contentNode.position.set(
            -localCenter.x,
            -localCenter.y,
            -localCenter.z
        );


        /*
         * Work out how much ancestor scaling was
         * already applied before normalization.
         */
        const worldScale =
            new THREE.Vector3();


        scaleNode.getWorldScale(
            worldScale
        );


        const ancestorScale =
            Math.max(
                Math.abs(worldScale.x),
                Math.abs(worldScale.y),
                Math.abs(worldScale.z),
                0.0001
            );


        const localRadius =
            sphere.radius /
            ancestorScale;


        const normalizedScale =
            TARGET_RADIUS /
            localRadius;


        /*
         * visualScale is ONLY a small perceptual
         * correction after automatic normalization.
         */
        const visualScale =
            item.visualScale ?? 1;


        scaleNode.scale.setScalar(
            normalizedScale *
            visualScale
        );


        /*
         * Used by the carousel so it does not
         * start sliding until the incoming model
         * has actually loaded and been normalized.
         */
        onReadyRef.current?.();

    }, [
        item.id,
        item.visualScale,
    ]);


    return (
        <group ref={scaleGroup}>
            <group ref={contentGroup}>
                <Model />
            </group>
        </group>
    );
};


export default NormalizedModel;