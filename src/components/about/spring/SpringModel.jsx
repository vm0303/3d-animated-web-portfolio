import React from 'react'
import { useGLTF } from '@react-three/drei'

export default function Model(props) {
  const { nodes, materials } = useGLTF('./about/spring.glb')
  return (
    <group {...props} dispose={null}>
      <mesh name="Mesh_0205" geometry={nodes.Mesh_0205.geometry} material={materials['Material_0.004']} />
    </group>
  )
}
