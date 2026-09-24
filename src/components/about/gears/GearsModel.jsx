import React from 'react'
import { useGLTF } from '@react-three/drei'

export default function Model(props) {
  const { nodes, materials } = useGLTF('/about/gears.glb')
  return (
    <group {...props} dispose={null}>
      <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
        <mesh name="Object_2" geometry={nodes.Object_2.geometry} material={materials['material_0.001']} />
        <mesh name="Object_3" geometry={nodes.Object_3.geometry} material={materials['material_0.001']} />
        <mesh name="Object_4" geometry={nodes.Object_4.geometry} material={materials['material_0.001']} />
        <mesh name="Object_5" geometry={nodes.Object_5.geometry} material={materials['material_0.001']} />
        <mesh name="Object_6" geometry={nodes.Object_6.geometry} material={materials['material_0.001']} />
        <mesh name="Object_7" geometry={nodes.Object_7.geometry} material={materials['material_0.001']} />
        <mesh name="Object_8" geometry={nodes.Object_8.geometry} material={materials['material_0.001']} />
      </group>
    </group>
  )
}


