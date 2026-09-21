import React from 'react'
import { useGLTF } from '@react-three/drei'

export default function Model(props) {
  const { nodes, materials } = useGLTF('./about/bicycle.glb')
  return (
    <group {...props} dispose={null}>
      <group name="MongooseTyax_2" rotation={[-Math.PI / 2, 0, 0]}>
        <mesh name="MongooseTyax_2_Bike_Mongoose_Tyax_0" geometry={nodes.MongooseTyax_2_Bike_Mongoose_Tyax_0.geometry} material={materials.Bike_Mongoose_Tyax} />
        <mesh name="MongooseTyax_2_Bike_Mongoose_Tyax_0_1" geometry={nodes.MongooseTyax_2_Bike_Mongoose_Tyax_0_1.geometry} material={materials.Bike_Mongoose_Tyax} />
      </group>
    </group>
  )
}

