import { describe, expect, it } from 'vitest';

import {
  applyDelta,
  createRotationState,
  toEulerDegrees,
  toWholeDegrees,
} from '../../../src/core/rotation';
import type { RotationState } from '../../../src/core/rotation';

/**
 * SPEC-003 — the degree readout's formatting (src/core/rotation.ts).
 *
 * AC-003-7 asks for yaw, pitch and roll "as whole degrees in [0, 360)". The float decomposition
 * already exists as `toEulerDegrees` (SPEC-001, AC-001-8/AC-001-9); rounding it is pure arithmetic,
 * so it belongs in src/core next to the decomposition it rounds, not in the React component that
 * paints it (AGENTS.md §3). The component then renders three integers and holds no logic.
 *
 * Contract these tests commit the implementation to:
 *
 *   toWholeDegrees(state: RotationState): { yaw: number; pitch: number; roll: number }
 *       = Math.round(toEulerDegrees(state).angle) % 360   for each of the three angles
 *
 * Both halves of that definition are load-bearing:
 *
 *   Math.round  — the nearest whole degree, not a truncation. 2.8647889756541165 reads as 3,
 *                 357.1352110243458 reads as 357: a readout that floors would show 2 and 357,
 *                 which drifts visibly below the true angle.
 *   % 360       — the boundary. `toEulerDegrees` returns [0, 360), so Math.round can return 360
 *                 (anything from 359.5 upwards), and a readout showing "360" for an object sitting
 *                 a tenth of a degree short of home is wrong twice over: 360 is outside [0, 360),
 *                 and the same orientation would read 0 coming the other way. The modulo maps that
 *                 one case, and only that case, back to 0.
 *
 * Every input below is built deterministically — either by composing `applyDelta` from identity, or
 * by writing the unit quaternion of a known angle about a single axis, q = (axis * sin(a/2),
 * cos(a/2)) — so there is no clock, no randomness and nothing to round twice.
 */

const IDENTITY_STATE = (): RotationState => createRotationState();

const DEGREES_PER_RADIAN = 180 / Math.PI;
const RADIANS_PER_DEGREE = Math.PI / 180;

/** A state holding exactly `degrees` of yaw about world Y and nothing else. */
const yawState = (degrees: number): RotationState => {
  const half = (degrees * RADIANS_PER_DEGREE) / 2;
  return {
    orientation: { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) },
    velocity: { x: 0, y: 0 },
  };
};

/** A state holding exactly `degrees` of pitch about world X and nothing else. */
const pitchState = (degrees: number): RotationState => {
  const half = (degrees * RADIANS_PER_DEGREE) / 2;
  return {
    orientation: { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) },
    velocity: { x: 0, y: 0 },
  };
};

/**
 * A state holding exactly `degrees` of roll about world Z and nothing else. Roll is unreachable
 * through the X/Y deltas the input layer produces, so it is written directly — the readout still
 * has to display it.
 */
const rollState = (degrees: number): RotationState => {
  const half = (degrees * RADIANS_PER_DEGREE) / 2;
  return {
    orientation: { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) },
    velocity: { x: 0, y: 0 },
  };
};

describe('toWholeDegrees', () => {
  it('[AC-003-7] reads the identity orientation as 0, 0, 0', () => {
    expect(toWholeDegrees(IDENTITY_STATE())).toEqual({ yaw: 0, pitch: 0, roll: 0 });
  });

  it('[AC-003-7] rounds to the nearest whole degree rather than truncating: 2.864... reads 3 and 357.135... reads 357', () => {
    // 0.05 rad = 2.8647889756541165 degrees.
    const right = applyDelta(IDENTITY_STATE(), { x: 0, y: 0.05 });
    const left = applyDelta(IDENTITY_STATE(), { x: 0, y: -0.05 });

    expect(toEulerDegrees(right).yaw).toBeCloseTo(0.05 * DEGREES_PER_RADIAN, 9);
    expect(toWholeDegrees(right)).toEqual({ yaw: 3, pitch: 0, roll: 0 });

    expect(toEulerDegrees(left).yaw).toBeCloseTo(360 - 0.05 * DEGREES_PER_RADIAN, 9);
    expect(toWholeDegrees(left)).toEqual({ yaw: 357, pitch: 0, roll: 0 });
  });

  it('[AC-003-7] rounds pitch the same way: 0.05 rad down reads 3, 0.05 rad up reads 357', () => {
    expect(toWholeDegrees(applyDelta(IDENTITY_STATE(), { x: 0.05, y: 0 }))).toEqual({
      yaw: 0,
      pitch: 3,
      roll: 0,
    });
    expect(toWholeDegrees(applyDelta(IDENTITY_STATE(), { x: -0.05, y: 0 }))).toEqual({
      yaw: 0,
      pitch: 357,
      roll: 0,
    });
  });

  it('[AC-003-7] rounds down below the half degree and up above it: 42.2 reads 42, 42.7 reads 43', () => {
    expect(toWholeDegrees(pitchState(42.2)).pitch).toBe(42);
    expect(toWholeDegrees(pitchState(42.7)).pitch).toBe(43);
    expect(toWholeDegrees(yawState(0.4)).yaw).toBe(0);
    expect(toWholeDegrees(yawState(0.6)).yaw).toBe(1);
    expect(toWholeDegrees(rollState(90.6)).roll).toBe(91);
  });

  it('[AC-003-7] displays all three angles, roll included: 45 degrees of roll reads 45', () => {
    expect(toWholeDegrees(rollState(45))).toEqual({ yaw: 0, pitch: 0, roll: 45 });
    expect(toWholeDegrees(yawState(180))).toEqual({ yaw: 180, pitch: 0, roll: 0 });
    expect(toWholeDegrees(pitchState(30))).toEqual({ yaw: 0, pitch: 30, roll: 0 });
  });

  it('[AC-003-7] an angle that rounds to 360 displays as 0, not 360 — on yaw, on pitch and on roll', () => {
    // Each of these is inside [0, 360) before rounding and exactly 360 after it.
    expect(toEulerDegrees(yawState(359.9)).yaw).toBeCloseTo(359.9, 9);
    expect(Math.round(toEulerDegrees(yawState(359.9)).yaw)).toBe(360);
    expect(toWholeDegrees(yawState(359.9)).yaw).toBe(0);

    expect(Math.round(toEulerDegrees(pitchState(359.8)).pitch)).toBe(360);
    expect(toWholeDegrees(pitchState(359.8)).pitch).toBe(0);

    expect(Math.round(toEulerDegrees(rollState(359.9)).roll)).toBe(360);
    expect(toWholeDegrees(rollState(359.9)).roll).toBe(0);
  });

  it('[AC-003-7] only the 360 case wraps: 359.4 still reads 359 on every axis', () => {
    expect(toWholeDegrees(yawState(359.4)).yaw).toBe(359);
    expect(toWholeDegrees(pitchState(359.4)).pitch).toBe(359);
    expect(toWholeDegrees(rollState(359.4)).roll).toBe(359);
  });

  it('[AC-003-7] wraps all three at once when every angle rounds to 360', () => {
    const half = (-0.1 * RADIANS_PER_DEGREE) / 2;
    const sin = Math.sin(half);
    const cos = Math.cos(half);
    // -0.1 degrees about each of Y, X and Z, composed: 359.9 on all three angles.
    const aboutY = { x: 0, y: sin, z: 0, w: cos };
    const aboutX = { x: sin, y: 0, z: 0, w: cos };
    const aboutZ = { x: 0, y: 0, z: sin, w: cos };
    const yx = {
      x: aboutY.w * aboutX.x + aboutY.x * aboutX.w + aboutY.y * aboutX.z - aboutY.z * aboutX.y,
      y: aboutY.w * aboutX.y - aboutY.x * aboutX.z + aboutY.y * aboutX.w + aboutY.z * aboutX.x,
      z: aboutY.w * aboutX.z + aboutY.x * aboutX.y - aboutY.y * aboutX.x + aboutY.z * aboutX.w,
      w: aboutY.w * aboutX.w - aboutY.x * aboutX.x - aboutY.y * aboutX.y - aboutY.z * aboutX.z,
    };
    const orientation = {
      x: yx.w * aboutZ.x + yx.x * aboutZ.w + yx.y * aboutZ.z - yx.z * aboutZ.y,
      y: yx.w * aboutZ.y - yx.x * aboutZ.z + yx.y * aboutZ.w + yx.z * aboutZ.x,
      z: yx.w * aboutZ.z + yx.x * aboutZ.y - yx.y * aboutZ.x + yx.z * aboutZ.w,
      w: yx.w * aboutZ.w - yx.x * aboutZ.x - yx.y * aboutZ.y - yx.z * aboutZ.z,
    };
    const state: RotationState = { orientation, velocity: { x: 0, y: 0 } };

    const euler = toEulerDegrees(state);
    expect(euler.yaw).toBeCloseTo(359.9, 6);
    expect(euler.pitch).toBeCloseTo(359.9, 6);
    expect(euler.roll).toBeCloseTo(359.9, 6);

    expect(toWholeDegrees(state)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
  });

  it('[AC-003-7] is exactly Math.round of toEulerDegrees modulo 360, over 1456 orientations', () => {
    let checked = 0;

    for (let yawDegrees = 0; yawDegrees < 360; yawDegrees += 7) {
      for (let pitchDegrees = 0; pitchDegrees < 360; pitchDegrees += 13) {
        const state = applyDelta(
          applyDelta(IDENTITY_STATE(), { x: pitchDegrees * RADIANS_PER_DEGREE, y: 0 }),
          { x: 0, y: yawDegrees * RADIANS_PER_DEGREE },
        );

        const euler = toEulerDegrees(state);
        const whole = toWholeDegrees(state);

        expect(whole.yaw).toBe(Math.round(euler.yaw) % 360);
        expect(whole.pitch).toBe(Math.round(euler.pitch) % 360);
        expect(whole.roll).toBe(Math.round(euler.roll) % 360);

        for (const angle of [whole.yaw, whole.pitch, whole.roll]) {
          expect(Number.isInteger(angle)).toBe(true);
          expect(angle).toBeGreaterThanOrEqual(0);
          expect(angle).toBeLessThan(360);
        }
        checked += 1;
      }
    }

    expect(checked).toBe(1456);
  });

  it('[AC-003-7] updates as the orientation changes: four shifted yaw steps read 11, 23, 34, 46', () => {
    const expected = [11, 23, 34, 46];
    let state = IDENTITY_STATE();

    expect(toWholeDegrees(state).yaw).toBe(0);

    for (const degrees of expected) {
      state = applyDelta(state, { x: 0, y: 0.2 });
      expect(toWholeDegrees(state).yaw).toBe(degrees);
      expect(toWholeDegrees(state).pitch).toBe(0);
      expect(toWholeDegrees(state).roll).toBe(0);
    }
  });

  it('[AC-003-7] does not mutate the state it reads', () => {
    const state = applyDelta(IDENTITY_STATE(), { x: 0.3, y: -0.2 });
    const snapshot = structuredClone(state);

    toWholeDegrees(state);

    expect(state).toEqual(snapshot);
  });
});
