import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { RefObject } from 'react';
import type { Mesh } from 'three';

import type { ReadoutRefs } from './Hud';
import { step, toWholeDegrees } from '../../core/rotation';
import type { RotationState } from '../../core/rotation';
import { reportFrame, reportRotation } from '../../testing/seam';

type SceneProps = { stateRef: RefObject<RotationState>; readoutRefs: ReadoutRefs };

/** Writes one whole-degree value, formatted, only when it has changed. */
function writeDegrees(ref: RefObject<HTMLSpanElement | null>, degrees: number): void {
  const text = `${degrees}°`;
  const element = ref.current;
  if (element !== null && element.textContent !== text) element.textContent = text;
}

/**
 * One shaded mesh on a contrasting background (AC-000-3), driven by the rotation core: every frame
 * advances the state by that frame's own `dtMs`, so a coast after release plays out and damps
 * (AC-002-7), and reports the live orientation to the seam (AC-000-5, AC-002-8, AC-002-9).
 *
 * The same frame also refreshes the degree readout from the live state, so it tracks the
 * orientation however it changed — drag, key or reset (AC-003-7).
 */
export function Scene({ stateRef, readoutRefs }: SceneProps) {
  const meshRef = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    stateRef.current = step(stateRef.current, delta * 1000);

    const { orientation } = stateRef.current;
    meshRef.current?.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);

    const degrees = toWholeDegrees(stateRef.current);
    writeDegrees(readoutRefs.yaw, degrees.yaw);
    writeDegrees(readoutRefs.pitch, degrees.pitch);
    writeDegrees(readoutRefs.roll, degrees.roll);

    reportFrame();
    reportRotation(orientation);
  });

  return (
    <>
      <color attach="background" args={['#0b1020']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 5, 3]} intensity={2} />
      <mesh ref={meshRef}>
        <torusKnotGeometry args={[0.7, 0.25, 160, 32]} />
        <meshStandardMaterial color="#6fa8ff" metalness={0.2} roughness={0.35} />
      </mesh>
    </>
  );
}
