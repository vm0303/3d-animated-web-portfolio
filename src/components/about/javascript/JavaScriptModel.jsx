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
            <primitive object={model} />
        </group>
    );
};


export default JavaScriptModel;
