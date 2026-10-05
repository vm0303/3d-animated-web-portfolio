import {
    useMemo,
} from "react";

import {
    useGLTF,
} from "@react-three/drei";


const JavaScriptModel = (props) => {
    const { scene } =
        useGLTF(
            "./about/js-logo.glb"
        );

    const model =
        useMemo(
            () => scene.clone(true),
            [scene]
        );


    return (
        <group
            {...props}
            dispose={null}
        >
            <group rotation={[0, Math.PI, 0]}>
                <primitive object={model} />
            </group>
        </group>
    );
};


export default JavaScriptModel;
