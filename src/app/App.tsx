import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';

import { Scene } from './components/Scene';
import { usePointerDrag } from './hooks/usePointerDrag';
import { createRotationState } from '../core/rotation';
import type { RotationState } from '../core/rotation';

/**
 * The render shell: a title label and exactly one <canvas> (AC-000-1) with a WebGL context
 * (AC-000-2). `preserveDrawingBuffer` keeps the framebuffer readable after a frame, which the E2E
 * blank-check (AC-000-3) samples with gl.readPixels.
 *
 * The drag gesture's state lives here, in a ref the pointer handlers write and the render loop
 * inside <Canvas> advances each frame (SPEC-002).
 */
export function App() {
  const stateRef = useRef<RotationState>(createRotationState());
  const dragHandlers = usePointerDrag(stateRef);

  return (
    <>
      <h1 className="app-title">3D Object Inspector</h1>
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [0, 1, 3.2], fov: 50 }}
        {...dragHandlers}
      >
        <Scene stateRef={stateRef} />
      </Canvas>
    </>
  );
}
