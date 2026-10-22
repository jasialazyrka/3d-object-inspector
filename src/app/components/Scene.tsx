import { useFrame } from '@react-three/fiber';

import { reportFrame } from '../../testing/seam';

/**
 * One shaded, static mesh on a contrasting background (AC-000-3), plus the per-frame tick that
 * drives the seam's frame counter (AC-000-5).
 */
export function Scene() {
  useFrame(() => {
    reportFrame();
  });

  return (
    <>
      <color attach="background" args={['#0b1020']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 5, 3]} intensity={2} />
      <mesh>
        <torusKnotGeometry args={[0.7, 0.25, 160, 32]} />
        <meshStandardMaterial color="#6fa8ff" metalness={0.2} roughness={0.35} />
      </mesh>
    </>
  );
}
