import { describe, expect, it } from 'vitest';

import {
  applyDelta,
  createRotationState,
  reset,
  step,
  toEulerDegrees,
} from '../../../src/core/rotation';
import type { Quat, RotationState } from '../../../src/core/rotation';

/**
 * SPEC-001 — rotation core (src/core/rotation.ts).
 *
 * The module is pure and framework-free, so every assertion here is exact: fixed `dtMs`, no clock,
 * no randomness, no DOM. Where the spec states a tolerance (1e-9) it is asserted literally.
 *
 * Contract these tests commit the implementation to:
 *
 *   createRotationState(): RotationState
 *   applyDelta(state: RotationState, delta: { x: number; y: number }): RotationState
 *   step(state: RotationState, dtMs: number, options?: StepOptions): RotationState
 *   reset(state: RotationState): RotationState
 *   toEulerDegrees(state: RotationState): { yaw: number; pitch: number; roll: number }
 *
 *   StepOptions = { halfLifeMs?: number; settleThreshold?: number }
 *     halfLifeMs      — ms after which velocity magnitude is halved (default 100)
 *     settleThreshold — rad/ms; velocity below it snaps to exactly { x: 0, y: 0 } (default 1e-5)
 *
 * Conventions pinned below (the spec names them, so they are asserted, not assumed):
 *   - right-handed rotations: a positive delta about +Y maps (0,0,1) -> (1,0,0);
 *   - `applyDelta` composes in the WORLD frame (the delta pre-multiplies the current orientation),
 *     which is what "about the world Y axis" means for a non-identity state (AC-001-2);
 *   - `toEulerDegrees` reports yaw about world Y, pitch about world X, roll about world Z, each
 *     normalized into [0, 360) (AC-001-9).
 *
 * Deliberately NOT pinned: the composition order inside a single `applyDelta` call whose delta has
 * both components non-zero. No criterion constrains it, so AC-001-4 is asserted relative to
 * `applyDelta` itself rather than to a hand-built quaternion product.
 */

const DEFAULT_HALF_LIFE_MS = 100;
const DEFAULT_SETTLE_THRESHOLD = 1e-5;

/** A half-life far longer than any dtMs used here: damping is negligible, nothing snaps. */
const NO_DAMPING = { halfLifeMs: 1e12, settleThreshold: 0 };

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

type Vec3 = { x: number; y: number; z: number };

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** v + 2 * (q.xyz x ((q.xyz x v) + q.w * v)) — independent of the implementation under test. */
const rotateVector = (q: Quat, v: Vec3): Vec3 => {
  const qv: Vec3 = { x: q.x, y: q.y, z: q.z };
  const t = cross(qv, v);
  const inner: Vec3 = { x: t.x + q.w * v.x, y: t.y + q.w * v.y, z: t.z + q.w * v.z };
  const outer = cross(qv, inner);
  return { x: v.x + 2 * outer.x, y: v.y + 2 * outer.y, z: v.z + 2 * outer.z };
};

const quatLength = (q: Quat): number => Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);

const speed = (v: { x: number; y: number }): number => Math.hypot(v.x, v.y);

const expectQuatClose = (actual: Quat, expected: Quat, tolerance: number): void => {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.w - expected.w)).toBeLessThanOrEqual(tolerance);
};

const expectVec3Close = (actual: Vec3, expected: Vec3, tolerance: number): void => {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tolerance);
};

const expectNormalizedDegrees = (value: number): void => {
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThan(360);
};

/** A deterministic, non-identity, non-settled state used by the purity and no-op tests. */
const tiltedState = (): RotationState => ({
  orientation: applyDelta(createRotationState(), { x: 0.3, y: -0.2 }).orientation,
  velocity: { x: 0.002, y: -0.001 },
});

describe('createRotationState', () => {
  it('[AC-001-1] returns the identity orientation and zero velocity', () => {
    expect(createRotationState()).toEqual({
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0 },
    });
  });

  it('[AC-001-1][AC-001-10] returns a fresh state on every call, holding no module-level state', () => {
    const first = createRotationState();
    first.orientation.w = 0.5;
    first.velocity.x = 9;

    expect(createRotationState()).toEqual({
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0 },
    });
  });
});

describe('applyDelta', () => {
  it('[AC-001-2] rotates a radians about the world Y axis for { x: 0, y: a }', () => {
    const a = Math.PI / 2;

    const next = applyDelta(createRotationState(), { x: 0, y: a });

    // Axis-angle quaternion about +Y: (0, sin(a/2), 0, cos(a/2)).
    expectQuatClose(
      next.orientation,
      { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) },
      1e-12,
    );
    // Right-handed: +90 degrees about +Y maps (0, 0, 1) to (1, 0, 0).
    expectVec3Close(
      rotateVector(next.orientation, { x: 0, y: 0, z: 1 }),
      { x: 1, y: 0, z: 0 },
      1e-12,
    );
  });

  it('[AC-001-2] rotates a radians about the world X axis for { x: a, y: 0 }', () => {
    const a = Math.PI / 2;

    const next = applyDelta(createRotationState(), { x: a, y: 0 });

    // Axis-angle quaternion about +X: (sin(a/2), 0, 0, cos(a/2)).
    expectQuatClose(
      next.orientation,
      { x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) },
      1e-12,
    );
    // Right-handed: +90 degrees about +X maps (0, 1, 0) to (0, 0, 1).
    expectVec3Close(
      rotateVector(next.orientation, { x: 0, y: 1, z: 0 }),
      { x: 0, y: 0, z: 1 },
      1e-12,
    );
  });

  it('[AC-001-2] composes about the WORLD axis, not the body axis, for a non-identity state', () => {
    const quarter = Math.PI / 2;
    const pitched = applyDelta(createRotationState(), { x: quarter, y: 0 });

    const yawed = applyDelta(pitched, { x: 0, y: quarter });

    // Ry(90) * Rx(90) sends (0,1,0) -> (0,0,1) -> (1,0,0). The body-frame composition
    // Rx(90) * Ry(90) would send it to (0,0,1) instead, so this pins the frame exactly.
    expectVec3Close(
      rotateVector(yawed.orientation, { x: 0, y: 1, z: 0 }),
      { x: 1, y: 0, z: 0 },
      1e-12,
    );
  });

  it('[AC-001-2] leaves the orientation unchanged for a zero delta', () => {
    const before = tiltedState();

    const after = applyDelta(before, { x: 0, y: 0 });

    expectQuatClose(after.orientation, before.orientation, 0);
  });

  it('[AC-001-2] carries the velocity through unchanged', () => {
    const before = tiltedState();

    const after = applyDelta(before, { x: 0.1, y: 0.2 });

    expect(after.velocity).toEqual(before.velocity);
  });

  it('[AC-001-3] keeps the orientation normalized to within 1e-9 after 1000 successive calls', () => {
    let state = createRotationState();

    for (let i = 0; i < 1000; i += 1) {
      state = applyDelta(state, { x: 0.013, y: -0.007 });
    }

    expect(Math.abs(quatLength(state.orientation) - 1)).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-001-10] does not mutate the state or the delta passed in', () => {
    const state = tiltedState();
    const delta = { x: 0.25, y: -0.4 };
    const stateSnapshot = structuredClone(state);
    const deltaSnapshot = structuredClone(delta);

    const next = applyDelta(state, delta);

    expect(state).toEqual(stateSnapshot);
    expect(delta).toEqual(deltaSnapshot);
    expect(next.orientation).not.toBe(state.orientation);
  });
});

describe('step', () => {
  it('[AC-001-4] advances the orientation by velocity * dtMs, exactly as the equivalent applyDelta', () => {
    const state = tiltedState();
    const dtMs = 16;

    const stepped = step(state, dtMs, NO_DAMPING);

    const expected = applyDelta(state, {
      x: state.velocity.x * dtMs,
      y: state.velocity.y * dtMs,
    });
    expectQuatClose(stepped.orientation, expected.orientation, 1e-12);
  });

  it('[AC-001-4] integrates with the velocity held at the start of the step, under damping', () => {
    const state = tiltedState();
    const dtMs = 100;

    const stepped = step(state, dtMs, { halfLifeMs: 100, settleThreshold: 0 });

    const expected = applyDelta(state, {
      x: state.velocity.x * dtMs,
      y: state.velocity.y * dtMs,
    });
    expectQuatClose(stepped.orientation, expected.orientation, 1e-12);
  });

  it('[AC-001-4] leaves the orientation untouched when the velocity is zero', () => {
    const state: RotationState = {
      orientation: tiltedState().orientation,
      velocity: { x: 0, y: 0 },
    };

    const stepped = step(state, 16, NO_DAMPING);

    expectQuatClose(stepped.orientation, state.orientation, 0);
  });

  it('[AC-001-5] halves velocity magnitude over a 100 ms step with halfLifeMs = 100, within 1e-9', () => {
    const state: RotationState = { orientation: IDENTITY, velocity: { x: 0.004, y: -0.003 } };
    const before = speed(state.velocity);

    const stepped = step(state, 100, { halfLifeMs: 100, settleThreshold: 0 });

    expect(before).toBeCloseTo(0.005, 12);
    expect(Math.abs(speed(stepped.velocity) - before / 2)).toBeLessThanOrEqual(1e-9);
    // Damping is isotropic: the direction of travel is preserved.
    expect(Math.abs(stepped.velocity.x - 0.002)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(stepped.velocity.y + 0.0015)).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-001-5] damps as 0.5 ^ (dtMs / halfLifeMs): two half-lives quarter the magnitude, within 1e-9', () => {
    const state: RotationState = { orientation: IDENTITY, velocity: { x: 0.006, y: -0.008 } };
    const before = speed(state.velocity); // 0.01

    const stepped = step(state, 500, { halfLifeMs: 250, settleThreshold: 0 });

    expect(Math.abs(speed(stepped.velocity) - before / 4)).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-001-5] damps continuously: two 50 ms steps equal one 100 ms step, within 1e-9', () => {
    const state: RotationState = { orientation: IDENTITY, velocity: { x: 0.01, y: 0.02 } };
    const options = { halfLifeMs: 100, settleThreshold: 0 };

    const split = step(step(state, 50, options), 50, options);
    const whole = step(state, 100, options);

    expect(Math.abs(speed(split.velocity) - speed(whole.velocity))).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-001-6] snaps velocity to exactly { x: 0, y: 0 } once the magnitude falls below the settle threshold', () => {
    const state: RotationState = { orientation: IDENTITY, velocity: { x: 1.5e-3, y: 0 } };

    // 1.5e-3 damped by one half-life is 7.5e-4, which is below the 1e-3 threshold.
    const stepped = step(state, 100, { halfLifeMs: 100, settleThreshold: 1e-3 });

    expect(stepped.velocity).toEqual({ x: 0, y: 0 });
  });

  it('[AC-001-6] keeps damping without snapping while the magnitude stays above the settle threshold', () => {
    const state: RotationState = { orientation: IDENTITY, velocity: { x: 3e-3, y: 0 } };

    // 3e-3 damped by one half-life is 1.5e-3, which is still above the 1e-3 threshold.
    const stepped = step(state, 100, { halfLifeMs: 100, settleThreshold: 1e-3 });

    expect(Math.abs(stepped.velocity.x - 1.5e-3)).toBeLessThanOrEqual(1e-9);
    expect(stepped.velocity.y).toBe(0);
  });

  it('[AC-001-6] terminates a coast: velocity reaches exactly zero and the orientation then stops changing', () => {
    const options = { halfLifeMs: 100, settleThreshold: 1e-3 };
    let state: RotationState = { orientation: IDENTITY, velocity: { x: 0.01, y: -0.02 } };

    for (let i = 0; i < 1000; i += 1) {
      state = step(state, 16, options);
    }

    expect(state.velocity).toEqual({ x: 0, y: 0 });
    const settled = step(state, 16, options);
    expect(settled.velocity).toEqual({ x: 0, y: 0 });
    expectQuatClose(settled.orientation, state.orientation, 0);
  });

  it('[AC-001-5][AC-001-6] defaults to halfLifeMs = 100 and settleThreshold = 1e-5 when no options are given', () => {
    const state: RotationState = { orientation: IDENTITY, velocity: { x: 0.004, y: -0.003 } };

    expect(step(state, 100)).toEqual(
      step(state, 100, {
        halfLifeMs: DEFAULT_HALF_LIFE_MS,
        settleThreshold: DEFAULT_SETTLE_THRESHOLD,
      }),
    );
  });

  it('[AC-001-5] takes the default settleThreshold when only halfLifeMs is given', () => {
    const state: RotationState = { orientation: IDENTITY, velocity: { x: 0.004, y: -0.003 } };

    expect(step(state, 100, { halfLifeMs: 250 })).toEqual(
      step(state, 100, { halfLifeMs: 250, settleThreshold: DEFAULT_SETTLE_THRESHOLD }),
    );
  });

  it('[AC-001-6] takes the default halfLifeMs when only settleThreshold is given', () => {
    const state: RotationState = { orientation: IDENTITY, velocity: { x: 0.004, y: -0.003 } };

    expect(step(state, 100, { settleThreshold: 1e-3 })).toEqual(
      step(state, 100, { halfLifeMs: DEFAULT_HALF_LIFE_MS, settleThreshold: 1e-3 }),
    );
  });

  it('[AC-001-7] is a no-op for dtMs = 0: the returned state is deeply equal to the input', () => {
    const state = tiltedState();

    expect(step(state, 0, { halfLifeMs: 100, settleThreshold: 1e-3 })).toEqual(state);
    expect(step(state, 0)).toEqual(state);
  });

  it('[AC-001-10] does not mutate the state or the options passed in', () => {
    const state = tiltedState();
    const options = { halfLifeMs: 100, settleThreshold: 1e-6 };
    const stateSnapshot = structuredClone(state);
    const optionsSnapshot = structuredClone(options);

    const next = step(state, 16, options);

    expect(state).toEqual(stateSnapshot);
    expect(options).toEqual(optionsSnapshot);
    expect(next.orientation).not.toBe(state.orientation);
    expect(next.velocity).not.toBe(state.velocity);
  });
});

describe('reset', () => {
  it('[AC-001-8] returns the identity orientation and zero velocity from a rotated, moving state', () => {
    const state = tiltedState();

    expect(reset(state)).toEqual({
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0 },
    });
  });

  it('[AC-001-8] returns the identity orientation and zero velocity from the initial state too', () => {
    expect(reset(createRotationState())).toEqual({
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0 },
    });
  });

  it('[AC-001-10] does not mutate the state passed in', () => {
    const state = tiltedState();
    const snapshot = structuredClone(state);

    const next = reset(state);

    expect(state).toEqual(snapshot);
    expect(next.orientation).not.toBe(state.orientation);
    expect(next.velocity).not.toBe(state.velocity);
  });
});

describe('toEulerDegrees', () => {
  it('[AC-001-9] returns exactly { yaw: 0, pitch: 0, roll: 0 } for the identity orientation', () => {
    // "exactly" is taken literally: toEqual separates -0 from 0, so normalizing into [0, 360)
    // must produce positive zero (e.g. ((d % 360) + 360) % 360), not the -0 that atan2 can yield.
    expect(toEulerDegrees(createRotationState())).toEqual({ yaw: 0, pitch: 0, roll: 0 });
  });

  it('[AC-001-9] reports a +30 degree world-Y rotation as yaw = 30', () => {
    const state = applyDelta(createRotationState(), { x: 0, y: Math.PI / 6 });

    const euler = toEulerDegrees(state);

    expect(Math.abs(euler.yaw - 30)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(euler.pitch)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(euler.roll)).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-001-9] reports a +30 degree world-X rotation as pitch = 30', () => {
    const state = applyDelta(createRotationState(), { x: Math.PI / 6, y: 0 });

    const euler = toEulerDegrees(state);

    expect(Math.abs(euler.pitch - 30)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(euler.yaw)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(euler.roll)).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-001-9] normalizes a negative world-Y rotation into [0, 360): -30 degrees reads as 330', () => {
    const state = applyDelta(createRotationState(), { x: 0, y: -Math.PI / 6 });

    const euler = toEulerDegrees(state);

    expect(Math.abs(euler.yaw - 330)).toBeLessThanOrEqual(1e-9);
    expectNormalizedDegrees(euler.yaw);
    expectNormalizedDegrees(euler.pitch);
    expectNormalizedDegrees(euler.roll);
  });

  it('[AC-001-9] normalizes a negative world-X rotation into [0, 360): -30 degrees reads as 330', () => {
    const state = applyDelta(createRotationState(), { x: -Math.PI / 6, y: 0 });

    const euler = toEulerDegrees(state);

    expect(Math.abs(euler.pitch - 330)).toBeLessThanOrEqual(1e-9);
    expectNormalizedDegrees(euler.yaw);
    expectNormalizedDegrees(euler.pitch);
    expectNormalizedDegrees(euler.roll);
  });

  it('[AC-001-9] stays within [0, 360) on every axis for compound orientations, including gimbal lock', () => {
    // Pitch at exactly +90 degrees is the degenerate case of a yaw/pitch/roll decomposition; yaw
    // and roll are not separable there, so only pitch and the ranges are asserted.
    const locked = toEulerDegrees(applyDelta(createRotationState(), { x: Math.PI / 2, y: 0 }));
    expect(Math.abs(locked.pitch - 90)).toBeLessThanOrEqual(1e-9);
    expectNormalizedDegrees(locked.yaw);
    expectNormalizedDegrees(locked.pitch);
    expectNormalizedDegrees(locked.roll);

    const deltas = [
      { x: 0.7, y: 2.9 },
      { x: -2.4, y: -1.1 },
      { x: 3.0, y: 3.0 },
      { x: -Math.PI / 2, y: 1.3 },
      { x: Math.PI, y: -Math.PI },
    ];
    let state = createRotationState();
    for (const delta of deltas) {
      state = applyDelta(state, delta);
      const euler = toEulerDegrees(state);
      expectNormalizedDegrees(euler.yaw);
      expectNormalizedDegrees(euler.pitch);
      expectNormalizedDegrees(euler.roll);
    }
  });

  it('[AC-001-10] does not mutate the state passed in', () => {
    const state = tiltedState();
    const snapshot = structuredClone(state);

    toEulerDegrees(state);

    expect(state).toEqual(snapshot);
  });
});
