/**
 * The deterministic E2E seam (AGENTS.md §7, SPEC-000).
 *
 * `window.__inspector__` lets Playwright assert 3D behaviour through observable state instead of
 * pixels. It is installed in dev/test builds only — `installSeam('production')` is a no-op
 * (AC-000-6), so a production bundle exposes nothing.
 */

export type Quaternion = { x: number; y: number; z: number; w: number };

export type InspectorSeam = {
  getRotation(): Quaternion;
  getFrameCount(): number;
};

declare global {
  interface Window {
    __inspector__?: InspectorSeam;
  }
}

/** SPEC-000 has no interactivity, so the orientation stays the identity quaternion (AC-000-7). */
const IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

let frameCount = 0;

/** Called once per rendered frame by the render shell; monotonically non-decreasing (AC-000-5). */
export function reportFrame(): void {
  frameCount += 1;
}

export function installSeam(mode: string): void {
  if (mode === 'production') return;

  window.__inspector__ = {
    getRotation: () => ({ ...IDENTITY }),
    getFrameCount: () => frameCount,
  };
}
