/**
 * Pending-module declarations for the red phase of the test-first loop.
 *
 * SPEC-000's tests are written before `src/` exists, so a static import of the seam module would
 * make `npm run typecheck` fail — and typecheck must stay green even while the suite is red
 * (AGENTS.md §5, enforced by the Stop hook). This declaration covers exactly the contract SPEC-000
 * states, nothing more.
 *
 * It is a FALLBACK, not a substitute: TypeScript resolves the real relative file in preference to
 * an ambient wildcard module, so the moment `src/testing/seam.ts` exists the tests are checked
 * against its actual types and this declaration stops having any effect. It never affects runtime
 * resolution, which is why the unit suite still fails at import time today.
 */
declare module '*/src/testing/seam' {
  export type InspectorSeam = {
    getRotation(): { x: number; y: number; z: number; w: number };
    getFrameCount(): number;
  };

  /** Installs `window.__inspector__`, except when `mode` is `'production'` (AC-000-6). */
  export function installSeam(mode: string): void;
}
