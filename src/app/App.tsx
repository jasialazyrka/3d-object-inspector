import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';

import { Hud } from './components/Hud';
import { Scene } from './components/Scene';
import { useKeyboardRotation } from './hooks/useKeyboardRotation';
import { usePointerDrag } from './hooks/usePointerDrag';
import { createRotationState, reset } from '../core/rotation';
import type { RotationState } from '../core/rotation';

/**
 * The render shell: the overlay HUD and exactly one <canvas> (AC-000-1) with a WebGL context
 * (AC-000-2). `preserveDrawingBuffer` keeps the framebuffer readable after a frame, which the E2E
 * blank-check (AC-000-3) samples with gl.readPixels.
 *
 * The drag gesture's state lives here, in a ref the pointer and keyboard handlers write and the
 * render loop inside <Canvas> advances each frame (SPEC-002, SPEC-003).
 */

/** Names the canvas for assistive technology and says how to operate it (AC-003-1). */
const CANVAS_LABEL = 'Interactive 3D object — drag or use the arrow keys to rotate';

export function App() {
  const stateRef = useRef<RotationState>(createRotationState());
  const dragHandlers = usePointerDrag(stateRef);
  const keyboardHandlers = useKeyboardRotation(stateRef);
  const readoutRefs = {
    yaw: useRef<HTMLSpanElement>(null),
    pitch: useRef<HTMLSpanElement>(null),
    roll: useRef<HTMLSpanElement>(null),
  };

  const onReset = (): void => {
    stateRef.current = reset(stateRef.current);
  };

  return (
    <>
      <Hud onReset={onReset} readoutRefs={readoutRefs} />
      <Canvas
        // <Canvas> spreads unknown props onto its wrapper div, so the focusability and the
        // accessible name are set on the <canvas> element itself through its forwarded ref.
        ref={(element) => {
          if (element === null) return;
          element.tabIndex = 0;
          element.setAttribute('aria-label', CANVAS_LABEL);
        }}
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [0, 1, 3.2], fov: 50 }}
        {...dragHandlers}
        {...keyboardHandlers}
      >
        <Scene stateRef={stateRef} readoutRefs={readoutRefs} />
      </Canvas>
    </>
  );
}
