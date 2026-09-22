

import React from 'react'
import { useGLTF } from '@react-three/drei'

export default function Model(props) {
  const { nodes, materials } = useGLTF('./about/dumbbell.glb')
  return (
    <group {...props} dispose={null}>
      <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
        <mesh name="Object_2" geometry={nodes.Object_2.geometry} material={materials.Dark_iron} />
        <mesh name="Object_3" geometry={nodes.Object_3.geometry} material={materials['Metal.001']} />
        <mesh name="Object_4" geometry={nodes.Object_4.geometry} material={materials.Metal_Mesh} />
      </group>
    </group>
  )
}

