
import React from 'react'
import { useGLTF } from '@react-three/drei'

export default function Model(props) {
  const { nodes, materials } = useGLTF('./about/clapperboard.glb')
  return (
    <group {...props} dispose={null}>
      <group name="Clapperboard" position={[0, -0.058, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={0.025}>
        <mesh name="Clapperboard_Clapperboard_0" geometry={nodes.Clapperboard_Clapperboard_0.geometry} material={materials.Clapperboard} position={[0, 0.012, 0]} />
      </group>
      <mesh name="ClapperboardFlap_ClapperboardFlap_0" geometry={nodes.ClapperboardFlap_ClapperboardFlap_0.geometry} material={materials.ClapperboardFlap} position={[-0.164, 0.058, 0]} rotation={[-Math.PI / 2, -0.436, 0]} scale={0.025} />
    </group>
  )
}


