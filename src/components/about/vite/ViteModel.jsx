import {
    useMemo,
} from "react";

import {
    useGLTF,
} from "@react-three/drei";


const ViteModel = (props) => {
    const { scene } =
        useGLTF(
            "./about/vite/vite.glb"
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


export default ViteModel;
