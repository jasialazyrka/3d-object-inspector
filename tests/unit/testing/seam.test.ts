import { afterEach, describe, expect, it } from 'vitest';

import { installSeam } from '../../../src/testing/seam';

/**
 * SPEC-000 — the seam installer (src/testing/seam.ts).
 *
 * Only the mode-gating of the installer is a unit concern; the seam's observable values
 * (AC-000-5, AC-000-7) are asserted end to end through a live render loop in
 * tests/e2e/foundation.spec.ts.
 *
 * `window` here is jsdom's. The seam is an injected global, so it is reached through a narrowing
 * cast rather than a global augmentation, which would collide with the one the implementation of
 * src/testing/seam.ts may declare for itself.
 */
type SeamWindow = Window & {
  __inspector__?: {
    getRotation(): { x: number; y: number; z: number; w: number };
    getFrameCount(): number;
  };
};

const seamWindow = (): SeamWindow => window as SeamWindow;

afterEach(() => {
  delete seamWindow().__inspector__;
});

describe('installSeam', () => {
  it('[AC-000-6] is a no-op in production mode: window.__inspector__ is never installed', () => {
    installSeam('production');

    expect(seamWindow().__inspector__).toBeUndefined();
    expect('__inspector__' in window).toBe(false);
  });

  it('[AC-000-4] installs getRotation and getFrameCount on window.__inspector__ in development mode', () => {
    installSeam('development');

    const seam = seamWindow().__inspector__;
    expect(seam).toBeDefined();
    expect(typeof seam?.getRotation).toBe('function');
    expect(typeof seam?.getFrameCount).toBe('function');
  });

  it('[AC-000-4] installs getRotation and getFrameCount on window.__inspector__ in test mode', () => {
    installSeam('test');

    const seam = seamWindow().__inspector__;
    expect(seam).toBeDefined();
    expect(typeof seam?.getRotation).toBe('function');
    expect(typeof seam?.getFrameCount).toBe('function');
  });
});
