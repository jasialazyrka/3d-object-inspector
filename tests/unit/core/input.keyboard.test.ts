import { describe, expect, it } from 'vitest';

import {
  DEFAULT_KEY_STEP,
  SHIFT_STEP_MULTIPLIER,
  isResetKey,
  keyToRotation,
} from '../../../src/core/input';
import type { KeyModifiers } from '../../../src/core/input';
import {
  applyDelta,
  createRotationState,
  reset,
  step,
  toEulerDegrees,
} from '../../../src/core/rotation';
import type { AngularVelocity, Quat, RotationState } from '../../../src/core/rotation';

/**
 * SPEC-003 — keyboard input mapping (src/core/input.ts).
 *
 * Keys in, radians out. The key mapping lives in src/core/input.ts rather than in a new module:
 * it is input mapping, exactly like the pointer mapping next to it, and it reaches for the same
 * `AngularVelocity` shape and the same sign conventions (AGENTS.md §3 — any logic expressible
 * without React or three.js belongs in src/core).
 *
 * Pure and framework-free: no DOM, no KeyboardEvent, no clock. The shell reads `event.key` and
 * `event.shiftKey` and passes plain values in, so every number below is asserted exactly.
 *
 * Contract these tests commit the implementation to:
 *
 *   type KeyModifiers = { shift: boolean }
 *
 *   DEFAULT_KEY_STEP       = 0.05   // radians turned by one unshifted arrow press
 *   SHIFT_STEP_MULTIPLIER  = 4      // the "fixed factor greater than 1" of AC-003-3
 *
 *   keyToRotation(key: string, modifiers: KeyModifiers): AngularVelocity | null
 *       returns a rotation delta in radians in rotation.ts's AngularVelocity shape
 *       (x = pitch about world X, y = yaw about world Y), or null for any key it does
 *       not handle. `modifiers` is required: the caller always knows the shift state.
 *
 *   isResetKey(key: string): boolean
 *       true for 'r' and 'R', false otherwise.
 *
 * Why `isResetKey` is a separate predicate (AC-003-5): `keyToRotation` returns a rotation DELTA,
 * and a reset is not a delta — it is a jump to a known state. Folding `r` into `keyToRotation`
 * would mean either lying (returning a delta that is not one) or widening the return type for a
 * single key. A predicate keeps `keyToRotation`'s contract honest, which is also why
 * `keyToRotation('r', …)` must return null (asserted below): `r` is handled, but not by it.
 * The reset itself is `reset` from SPEC-001, which already returns identity and zero velocity.
 *
 * Sign conventions (AC-003-2), chosen to agree with the pointer (SPEC-002, AC-002-2) so that the
 * keyboard and the mouse cannot disagree about which way the object turns:
 *   ArrowRight -> positive yaw   (as dragging right)     ArrowLeft -> negative yaw
 *   ArrowDown  -> positive pitch (as dragging down)      ArrowUp   -> negative pitch
 * That agreement is asserted through `toEulerDegrees`, not merely through the sign of a component,
 * so it is observable in the orientation the user actually sees.
 *
 * Step size: 0.05 rad = 2.8647889756541165 degrees per press, so ~126 presses make a full turn and
 * a shifted press (0.2 rad = 11.459155902616466 degrees) makes ~31. 0.05 * 4 is exactly the double
 * 0.2 — multiplying by a power of two is exact — so the shifted steps are asserted with `toBe`.
 *
 * The zero axis of a one-axis press is asserted as `Math.abs(component) === 0`: that is exact
 * (zero tolerance) while staying indifferent to whether an implementation produces +0 or -0.
 */

const NO_SHIFT: KeyModifiers = { shift: false };
const SHIFT: KeyModifiers = { shift: true };

/** 0.05 rad, the unshifted step, written out so the expectations do not quote the constant. */
const STEP = 0.05;

/** 0.05 * 4; exact in binary floating point. */
const SHIFTED_STEP = 0.2;

/** 0.05 rad in degrees — what one unshifted press reads as on the degree readout. */
const STEP_DEGREES = (STEP * 180) / Math.PI;

/** Keys the mapping must not claim. `r` is covered separately: it is handled, but not by this. */
const UNHANDLED_KEYS = [
  'a',
  'q',
  'z',
  'Enter',
  ' ',
  'Escape',
  'Tab',
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Backspace',
  'Delete',
  '1',
  '+',
  '-',
  'F5',
];

/** Narrows the nullable return at a single place, so the tests below read as plain maths. */
const rotationFor = (key: string, modifiers: KeyModifiers): AngularVelocity => {
  const rotation = keyToRotation(key, modifiers);
  if (rotation === null) throw new Error(`keyToRotation returned null for key ${key}`);
  return rotation;
};

const maxQuatDiff = (a: Quat, b: Quat): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z), Math.abs(a.w - b.w));

/** One key press applied to a state: the composition the render shell performs. */
const press = (state: RotationState, key: string, modifiers: KeyModifiers): RotationState =>
  applyDelta(state, rotationFor(key, modifiers));

/** A deterministic, non-identity orientation that still carries velocity (a coast in progress). */
const coastingState = (): RotationState => ({
  orientation: applyDelta(createRotationState(), { x: 0.3, y: -0.2 }).orientation,
  velocity: { x: 0.004, y: -0.003 },
});

describe('keyToRotation', () => {
  it('[AC-003-2] maps ArrowRight to a positive yaw step of +0.05 rad about world Y and ArrowLeft to -0.05', () => {
    const right = rotationFor('ArrowRight', NO_SHIFT);
    const left = rotationFor('ArrowLeft', NO_SHIFT);

    expect(right.y).toBe(0.05);
    expect(Math.abs(right.x)).toBe(0);
    expect(left.y).toBe(-0.05);
    expect(Math.abs(left.x)).toBe(0);
  });

  it('[AC-003-2] maps ArrowDown to a positive pitch step of +0.05 rad about world X and ArrowUp to -0.05', () => {
    const down = rotationFor('ArrowDown', NO_SHIFT);
    const up = rotationFor('ArrowUp', NO_SHIFT);

    expect(down.x).toBe(0.05);
    expect(Math.abs(down.y)).toBe(0);
    expect(up.x).toBe(-0.05);
    expect(Math.abs(up.y)).toBe(0);
  });

  it('[AC-003-2] takes the unshifted step from DEFAULT_KEY_STEP = 0.05 radians', () => {
    expect(DEFAULT_KEY_STEP).toBe(0.05);

    expect(rotationFor('ArrowRight', NO_SHIFT).y).toBe(DEFAULT_KEY_STEP);
    expect(rotationFor('ArrowLeft', NO_SHIFT).y).toBe(-DEFAULT_KEY_STEP);
    expect(rotationFor('ArrowDown', NO_SHIFT).x).toBe(DEFAULT_KEY_STEP);
    expect(rotationFor('ArrowUp', NO_SHIFT).x).toBe(-DEFAULT_KEY_STEP);
  });

  it('[AC-003-2] ArrowRight yaws the way dragging right does: one press from identity reads as yaw 2.8647889756541165 degrees, ArrowLeft as 357.1352110243458', () => {
    const right = toEulerDegrees(press(createRotationState(), 'ArrowRight', NO_SHIFT));
    const left = toEulerDegrees(press(createRotationState(), 'ArrowLeft', NO_SHIFT));

    expect(Math.abs(right.yaw - STEP_DEGREES)).toBeLessThanOrEqual(1e-9);
    expect(right.yaw).toBeGreaterThan(0);
    expect(right.yaw).toBeLessThan(180);
    expect(Math.abs(right.pitch)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(right.roll)).toBeLessThanOrEqual(1e-9);

    // The mirror press normalizes to 360 - 2.8647889756541165, i.e. the opposite sense.
    expect(Math.abs(left.yaw - (360 - STEP_DEGREES))).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-003-2] ArrowDown pitches the way dragging down does: one press from identity reads as pitch 2.8647889756541165 degrees, ArrowUp as 357.1352110243458', () => {
    const down = toEulerDegrees(press(createRotationState(), 'ArrowDown', NO_SHIFT));
    const up = toEulerDegrees(press(createRotationState(), 'ArrowUp', NO_SHIFT));

    expect(Math.abs(down.pitch - STEP_DEGREES)).toBeLessThanOrEqual(1e-9);
    expect(down.pitch).toBeGreaterThan(0);
    expect(down.pitch).toBeLessThan(180);
    expect(Math.abs(down.yaw)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(down.roll)).toBeLessThanOrEqual(1e-9);

    expect(Math.abs(up.pitch - (360 - STEP_DEGREES))).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-003-2] a press from identity lands on exactly the quaternion of a 0.05 rad turn about its own axis', () => {
    const half = STEP / 2;

    expect(
      maxQuatDiff(press(createRotationState(), 'ArrowRight', NO_SHIFT).orientation, {
        x: 0,
        y: Math.sin(half),
        z: 0,
        w: Math.cos(half),
      }),
    ).toBeLessThanOrEqual(1e-15);

    expect(
      maxQuatDiff(press(createRotationState(), 'ArrowDown', NO_SHIFT).orientation, {
        x: Math.sin(half),
        y: 0,
        z: 0,
        w: Math.cos(half),
      }),
    ).toBeLessThanOrEqual(1e-15);
  });

  it('[AC-003-2] opposite keys cancel exactly: ArrowRight then ArrowLeft returns to identity', () => {
    const there = press(createRotationState(), 'ArrowRight', NO_SHIFT);
    const back = press(there, 'ArrowLeft', NO_SHIFT);

    expect(maxQuatDiff(back.orientation, { x: 0, y: 0, z: 0, w: 1 })).toBeLessThanOrEqual(1e-15);
    expect(
      maxQuatDiff(
        press(press(createRotationState(), 'ArrowUp', NO_SHIFT), 'ArrowDown', NO_SHIFT).orientation,
        { x: 0, y: 0, z: 0, w: 1 },
      ),
    ).toBeLessThanOrEqual(1e-15);
  });

  it('[AC-003-2] rotating by key leaves the velocity untouched, so a key press is a step and not a flick', () => {
    const still = press(createRotationState(), 'ArrowRight', NO_SHIFT);
    expect(still.velocity).toEqual({ x: 0, y: 0 });

    // ...and the orientation therefore stays put when the frame loop advances it.
    expect(maxQuatDiff(step(still, 16).orientation, still.orientation)).toBeLessThanOrEqual(1e-15);
  });

  it('[AC-003-3] SHIFT_STEP_MULTIPLIER is 4 — a fixed factor greater than 1', () => {
    expect(SHIFT_STEP_MULTIPLIER).toBe(4);
    expect(SHIFT_STEP_MULTIPLIER).toBeGreaterThan(1);
  });

  it('[AC-003-3] holding Shift multiplies every arrow step by exactly 4: 0.05 rad becomes 0.2 rad, sign and axis preserved', () => {
    const right = rotationFor('ArrowRight', SHIFT);
    const left = rotationFor('ArrowLeft', SHIFT);
    const down = rotationFor('ArrowDown', SHIFT);
    const up = rotationFor('ArrowUp', SHIFT);

    expect(right.y).toBe(SHIFTED_STEP);
    expect(Math.abs(right.x)).toBe(0);
    expect(left.y).toBe(-SHIFTED_STEP);
    expect(Math.abs(left.x)).toBe(0);
    expect(down.x).toBe(SHIFTED_STEP);
    expect(Math.abs(down.y)).toBe(0);
    expect(up.x).toBe(-SHIFTED_STEP);
    expect(Math.abs(up.y)).toBe(0);
  });

  it('[AC-003-3] the shifted step is DEFAULT_KEY_STEP * SHIFT_STEP_MULTIPLIER for every arrow key', () => {
    const expected = DEFAULT_KEY_STEP * SHIFT_STEP_MULTIPLIER;

    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const unshifted = rotationFor(key, NO_SHIFT);
      const shifted = rotationFor(key, SHIFT);

      expect(Math.hypot(shifted.x, shifted.y)).toBe(expected);
      expect(Math.hypot(shifted.x, shifted.y)).toBe(
        Math.hypot(unshifted.x, unshifted.y) * SHIFT_STEP_MULTIPLIER,
      );
      expect(shifted.x).toBe(unshifted.x * SHIFT_STEP_MULTIPLIER);
      expect(shifted.y).toBe(unshifted.y * SHIFT_STEP_MULTIPLIER);
    }
  });

  it('[AC-003-3] one shifted press turns the object as far as four unshifted presses of the same key', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      let four = createRotationState();
      for (let i = 0; i < SHIFT_STEP_MULTIPLIER; i += 1) four = press(four, key, NO_SHIFT);
      const one = press(createRotationState(), key, SHIFT);

      expect(maxQuatDiff(four.orientation, one.orientation)).toBeLessThanOrEqual(1e-12);
    }
  });

  it('[AC-003-3] a shifted ArrowRight press from identity reads as yaw 11.459155902616466 degrees', () => {
    const shifted = toEulerDegrees(press(createRotationState(), 'ArrowRight', SHIFT));

    expect(Math.abs(shifted.yaw - (SHIFTED_STEP * 180) / Math.PI)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(shifted.yaw - 4 * STEP_DEGREES)).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-003-4] returns null for every key it does not handle, shifted or not', () => {
    for (const key of UNHANDLED_KEYS) {
      expect(keyToRotation(key, NO_SHIFT)).toBeNull();
      // Shift must not turn an unrelated key into a rotation either.
      expect(keyToRotation(key, SHIFT)).toBeNull();
    }
  });

  it('[AC-003-4] matches the arrow key names exactly: a different case or a near miss is not handled', () => {
    for (const key of ['arrowright', 'ARROWRIGHT', 'Arrowright', 'Right', 'ArrowRight ', 'Arrow']) {
      expect(keyToRotation(key, NO_SHIFT)).toBeNull();
    }
  });

  it('[AC-003-4] returns null for the empty string rather than claiming a key that does not exist', () => {
    expect(keyToRotation('', NO_SHIFT)).toBeNull();
  });

  it('[AC-003-4][AC-003-5] returns null for the reset key: r is handled, but not as a rotation delta', () => {
    expect(keyToRotation('r', NO_SHIFT)).toBeNull();
    expect(keyToRotation('r', SHIFT)).toBeNull();
    expect(keyToRotation('R', NO_SHIFT)).toBeNull();
  });
});

describe('isResetKey', () => {
  it('[AC-003-5] is true for r and for R, so a shifted or caps-locked r still resets', () => {
    expect(isResetKey('r')).toBe(true);
    expect(isResetKey('R')).toBe(true);
  });

  it('[AC-003-5] is false for every other key, including the arrows it must not swallow', () => {
    for (const key of [
      ...UNHANDLED_KEYS,
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      '',
      'reset',
      'rr',
    ]) {
      expect(isResetKey(key)).toBe(false);
    }
  });

  it('[AC-003-5] pressing r resets the orientation to identity and zeroes the velocity', () => {
    const rotated = press(coastingState(), 'ArrowRight', SHIFT);
    expect(rotated.orientation).not.toEqual({ x: 0, y: 0, z: 0, w: 1 });

    // Exactly what the shell does on a key press: reset wins, nothing else is applied.
    const afterR = isResetKey('r') ? reset(rotated) : rotated;

    expect(afterR.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(afterR.velocity).toEqual({ x: 0, y: 0 });
    expect(afterR).toEqual(createRotationState());
  });

  it('[AC-003-5] the reset orientation stays at identity: 60 frames of 16 ms move it nowhere, because the velocity is gone', () => {
    let state = reset(press(coastingState(), 'ArrowDown', SHIFT));

    for (let i = 0; i < 60; i += 1) {
      state = step(state, 16);
    }

    expect(state.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(state.velocity).toEqual({ x: 0, y: 0 });
    expect(toEulerDegrees(state)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
  });
});
