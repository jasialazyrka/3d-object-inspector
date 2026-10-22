import { Canvas } from '@react-three/fiber';

import { Scene } from './components/Scene';

/**
 * The render shell: a title label and exactly one <canvas> (AC-000-1) with a WebGL context
 * (AC-000-2). `preserveDrawingBuffer` keeps the framebuffer readable after a frame, which the E2E
 * blank-check (AC-000-3) samples with gl.readPixels.
 */
export function App() {
  return (
    <>
      <h1 className="app-title">3D Object Inspector</h1>
      <Canvas gl={{ preserveDrawingBuffer: true }} camera={{ position: [0, 1, 3.2], fov: 50 }}>
        <Scene />
      </Canvas>
    </>
  );
}
