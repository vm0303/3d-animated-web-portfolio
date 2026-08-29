import {
  MeshDistortMaterial,
  Sphere,
} from "@react-three/drei";


const Shape = () => {
  const qaMode =
    typeof window !== "undefined" &&
    new URLSearchParams(
      window.location.search
    ).get("qa") === "1";


  return (
    <>
      <Sphere
        args={[1, 100, 200]}
        scale={2.3}
      >
        <MeshDistortMaterial
          color="#55a7f9"

          attach="material"

          distort={0.5}

          /*
            Normal site:
              continuously animate at speed 2.

            QA:
              keep the distorted shape,
              but stop it from changing.
          */
          speed={
            qaMode
              ? 0
              : 2
          }
        />
      </Sphere>


      <ambientLight
        intensity={2.2}
      />


      <directionalLight
        position={[
          1,
          2,
          3,
        ]}
      />
    </>
  );
};


export default Shape;