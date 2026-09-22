import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { ComputerModel } from '../computer/ComputerModel'
import { OrbitControls, PerspectiveCamera, Stage } from '@react-three/drei'

const ComputerModelContainer = () => {
  return (
    <Canvas>
        <Suspense fallback="loading...">
            <Stage environment="night" intensity={0.5}>
              <ComputerModel />
            </Stage>
          <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={2} />
          <PerspectiveCamera position={[-1, 0, 1.8]} zoom={0.5} makeDefault />
        </Suspense>
    </Canvas>
  )
}

export default ComputerModelContainer
