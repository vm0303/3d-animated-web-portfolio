import React from 'react'
import { useGLTF } from '@react-three/drei'

export default function Model(props) {
  const { nodes, materials } = useGLTF('./about/cloud.glb')
  return (
    <group {...props} dispose={null}>
      <mesh name="Mesh_0204" geometry={nodes.Mesh_0204.geometry} material={materials['Material_0.003']} position={[-0.004, 0.004, -0.002]} />
    </group>
  )
}
