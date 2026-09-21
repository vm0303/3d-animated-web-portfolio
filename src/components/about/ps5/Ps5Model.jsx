import React from 'react'
import { useGLTF } from '@react-three/drei'

export default function Model(props) {
  const { nodes, materials } = useGLTF('./about/ps5.glb')
  return (
    <group {...props} dispose={null}>
      <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
        <mesh name="Object_2" geometry={nodes.Object_2.geometry} material={materials.Acrylic_Clear} />
        <mesh name="Object_3" geometry={nodes.Object_3.geometry} material={materials.Paper_White} />
        <mesh name="Object_4" geometry={nodes.Object_4.geometry} material={materials.Paper_White_NONE} />
      </group>
    </group>
  )
}

