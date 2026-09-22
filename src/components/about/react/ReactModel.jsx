import React from 'react'
import { useGLTF } from '@react-three/drei'

export default function Model(props) {
  const { nodes, materials } = useGLTF('./about/react.glb')
  return (
    <group {...props} dispose={null}>
      <group name="be9210d376244066bed9d265a7a3a60efbx" scale={0.01}>
        <mesh name="React-Logo_Material002_0" geometry={nodes['React-Logo_Material002_0'].geometry} material={materials['Material.002']} position={[0, 7.935, 18.102]} rotation={[0, 0, -Math.PI / 2]} scale={[39.166, 39.166, 52.734]} />
      </group>
    </group>
  )
}

