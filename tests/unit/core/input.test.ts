import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RELEASE_WINDOW_MS,
  DEFAULT_SENSITIVITY,
  beginDrag,
  dragMove,
  endDrag,
  pointerDeltaToRotation,
} from '../../../src/core/input';
import type { PointerDelta, RecentMovement } from '../../../src/core/input';
import { applyDelta, createRotationState, step, toEulerDegrees } from '../../../src/core/rotation';
import type { Quat, RotationState } from '../../../src/core/rotation';

/**
 * SPEC-002 — pointer input mapping (src/core/input.ts).
 *
 * Pure and framework-free like the rest of src/core: no DOM, no clock, no randomness. Time enters
 * only as an explicit `dtMs`, so every number below is asserted exactly.
 *
 * Contract these tests commit the implementation to:
 *
 *   type PointerDelta   = { dx: number; dy: number }          // CSS pixels
 *   type RecentMovement = { dx: number; dy: number; dtMs: number }
 *       dx/dy — net pointer displacement, in pixels, over the sampled interval
 *       dtMs  — duration of that interval in ms, ENDING at the moment of release
 *   type EndDragOptions = { sensitivity?: number; releaseWindowMs?: number }
 *
 *   DEFAULT_SENSITIVITY        = 0.005   // radians per pixel
 *   DEFAULT_RELEASE_WINDOW_MS  = 250     // a sampled interval longer than this is stale
 *
 *   pointerDeltaToRotation(delta: PointerDelta, sensitivity?: number): { x: number; y: number }
 *       returns a rotation delta in radians in rotation.ts's AngularVelocity shape:
 *       x = dy * sensitivity (about world X, pitch), y = dx * sensitivity (about world Y, yaw)
 *   beginDrag(state: RotationState): RotationState
 *   dragMove(state: RotationState, delta: PointerDelta, sensitivity?: number): RotationState
 *   endDrag(state: RotationState, movement: RecentMovement, options?: EndDragOptions): RotationState
 *
 * `dragMove` is the one name the spec does not state. AC-002-4 describes the behaviour ("while
 * dragging, each pointer move applies its rotation delta immediately and leaves velocity at zero")
 * without naming a function, so a name is pinned here to make the criterion testable.
 *
 * Sign conventions (AC-002-2), pinned because the spec names them:
 *   dragging right (dx > 0) -> positive yaw about world Y;
 *   dragging down  (dy > 0) -> positive pitch about world X.
 *
 * Sensitivity is radians per pixel, so a 200 px drag at the default sensitivity is 1.0 rad.
 *
 * Release semantics, numerically (AC-002-5, AC-002-6). `endDrag` sets
 *   velocity = { x: (dy / dtMs) * sensitivity, y: (dx / dtMs) * sensitivity }   [rad/ms]
 * except that it returns EXACTLY { x: 0, y: 0 } when the sample carries no usable movement:
 *   - dtMs <= 0                 (no elapsed time — never divide by zero);
 *   - dtMs > releaseWindowMs    (stale: the pointer paused before release);
 *   - dx === 0 && dy === 0      (a click: no displacement).
 * The window boundary is inclusive: dtMs exactly equal to releaseWindowMs still coasts.
 *
 * Deliberately NOT pinned: the composition order inside a single `applyDelta` call with both
 * components non-zero (no criterion constrains it), so compound-delta orientations are asserted
 * against `applyDelta` itself rather than against a hand-built quaternion product.
 */

const SENSITIVITY = 0.005;

/** A deterministic, non-identity orientation that still carries velocity (a coast in progress). */
const coastingState = (): RotationState => ({
  orientation: applyDelta(createRotationState(), { x: 0.3, y: -0.2 }).orientation,
  velocity: { x: 0.004, y: -0.003 },
});

const maxQuatDiff = (a: Quat, b: Quat): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z), Math.abs(a.w - b.w));

const expectQuatClose = (actual: Quat, expected: Quat, tolerance: number): void => {
  expect(maxQuatDiff(actual, expected)).toBeLessThanOrEqual(tolerance);
};

describe('pointerDeltaToRotation', () => {
  it('[AC-002-1] maps dx pixels to dx * sensitivity radians about world Y and dy pixels to dy * sensitivity about world X', () => {
    const delta: PointerDelta = { dx: 12, dy: -7 };

    const rotation = pointerDeltaToRotation(delta, SENSITIVITY);

    expect(rotation.y).toBe(12 * SENSITIVITY); // yaw, about world Y
    expect(rotation.x).toBe(-7 * SENSITIVITY); // pitch, about world X
    expect(rotation).toEqual({ x: -0.035, y: 0.06 });
  });

  it('[AC-002-1] scales linearly with sensitivity: 100 px at 0.01 rad/px is exactly 1 radian', () => {
    expect(pointerDeltaToRotation({ dx: 100, dy: 0 }, 0.01)).toEqual({ x: 0, y: 1 });
    expect(pointerDeltaToRotation({ dx: 0, dy: 100 }, 0.01)).toEqual({ x: 1, y: 0 });
    expect(pointerDeltaToRotation({ dx: 100, dy: 0 }, 0.02)).toEqual({ x: 0, y: 2 });
  });

  it('[AC-002-1] maps a zero delta to exactly zero rotation on both axes', () => {
    expect(pointerDeltaToRotation({ dx: 0, dy: 0 }, SENSITIVITY)).toEqual({ x: 0, y: 0 });
  });

  it('[AC-002-1] keeps the two axes independent: dx alone produces no pitch, dy alone no yaw', () => {
    expect(pointerDeltaToRotation({ dx: 40, dy: 0 }, SENSITIVITY)).toEqual({ x: 0, y: 0.2 });
    expect(pointerDeltaToRotation({ dx: 0, dy: 40 }, SENSITIVITY)).toEqual({ x: 0.2, y: 0 });
  });

  it('[AC-002-1] defaults to DEFAULT_SENSITIVITY = 0.005 rad/px when no sensitivity is given', () => {
    expect(DEFAULT_SENSITIVITY).toBe(0.005);
    expect(pointerDeltaToRotation({ dx: 1, dy: 0 })).toEqual({ x: 0, y: 0.005 });
    expect(pointerDeltaToRotation({ dx: 200, dy: -100 })).toEqual(
      pointerDeltaToRotation({ dx: 200, dy: -100 }, DEFAULT_SENSITIVITY),
    );
    // 200 px at the default sensitivity is exactly 1 radian of yaw.
    expect(pointerDeltaToRotation({ dx: 200, dy: 0 })).toEqual({ x: 0, y: 1 });
  });

  it('[AC-002-2] dragging right yields a positive yaw delta and dragging left a negative one', () => {
    expect(pointerDeltaToRotation({ dx: 40, dy: 0 }, SENSITIVITY).y).toBe(0.2);
    expect(pointerDeltaToRotation({ dx: -40, dy: 0 }, SENSITIVITY).y).toBe(-0.2);
  });

  it('[AC-002-2] dragging down yields a positive pitch delta and dragging up a negative one', () => {
    expect(pointerDeltaToRotation({ dx: 0, dy: 40 }, SENSITIVITY).x).toBe(0.2);
    expect(pointerDeltaToRotation({ dx: 0, dy: -40 }, SENSITIVITY).x).toBe(-0.2);
  });

  it('[AC-002-2] follows the pointer: a 40 px rightward drag reads as yaw 11.459155902616464 degrees, leftward as 348.5408440973835', () => {
    const right = toEulerDegrees(dragMove(createRotationState(), { dx: 40, dy: 0 }, SENSITIVITY));
    const left = toEulerDegrees(dragMove(createRotationState(), { dx: -40, dy: 0 }, SENSITIVITY));

    // 0.2 rad in degrees; a yaw inside (0, 180) is "with" the pointer, not against it.
    expect(Math.abs(right.yaw - (0.2 * 180) / Math.PI)).toBeLessThanOrEqual(1e-9);
    expect(right.yaw).toBeGreaterThan(0);
    expect(right.yaw).toBeLessThan(180);
    expect(Math.abs(right.pitch)).toBeLessThanOrEqual(1e-9);

    // The mirror drag normalizes to 360 - 11.4591559... , i.e. the opposite sense.
    expect(Math.abs(left.yaw - (360 - (0.2 * 180) / Math.PI))).toBeLessThanOrEqual(1e-9);
  });

  it('[AC-002-2] follows the pointer: a 40 px downward drag reads as pitch 11.459155902616464 degrees, upward as 348.5408440973835', () => {
    const down = toEulerDegrees(dragMove(createRotationState(), { dx: 0, dy: 40 }, SENSITIVITY));
    const up = toEulerDegrees(dragMove(createRotationState(), { dx: 0, dy: -40 }, SENSITIVITY));

    expect(Math.abs(down.pitch - (0.2 * 180) / Math.PI)).toBeLessThanOrEqual(1e-9);
    expect(down.pitch).toBeGreaterThan(0);
    expect(down.pitch).toBeLessThan(180);
    expect(Math.abs(down.yaw)).toBeLessThanOrEqual(1e-9);

    expect(Math.abs(up.pitch - (360 - (0.2 * 180) / Math.PI))).toBeLessThanOrEqual(1e-9);
  });
});

describe('beginDrag', () => {
  it('[AC-002-3] zeroes the velocity so grabbing the object cancels a coast in progress', () => {
    const coasting = coastingState();

    const grabbed = beginDrag(coasting);

    expect(grabbed.velocity).toEqual({ x: 0, y: 0 });
  });

  it('[AC-002-3] leaves the orientation exactly where the coast had reached: the object stops dead under the pointer', () => {
    const coasting = coastingState();

    const grabbed = beginDrag(coasting);

    expectQuatClose(grabbed.orientation, coasting.orientation, 0);
  });

  it('[AC-002-3] is idempotent and safe on an already-still state', () => {
    const still = createRotationState();

    expect(beginDrag(still)).toEqual(still);
    expect(beginDrag(beginDrag(coastingState()))).toEqual(beginDrag(coastingState()));
  });

  it('[AC-002-3] stops the coast for good: after beginDrag, 960 ms of steps do not move the orientation', () => {
    let state = beginDrag(coastingState());
    const grabbedAt = state.orientation;

    for (let i = 0; i < 60; i += 1) {
      state = step(state, 16);
    }

    expect(state.velocity).toEqual({ x: 0, y: 0 });
    expectQuatClose(state.orientation, grabbedAt, 1e-15);
  });

  it('[AC-002-3] does not mutate the state passed in', () => {
    const state = coastingState();
    const snapshot = structuredClone(state);

    const grabbed = beginDrag(state);

    expect(state).toEqual(snapshot);
    expect(grabbed.velocity).not.toBe(state.velocity);
  });
});

describe('dragMove', () => {
  it('[AC-002-4] applies the pointer delta immediately: the orientation equals applyDelta with the mapped rotation', () => {
    const state = coastingState();
    const delta: PointerDelta = { dx: 30, dy: -12 };

    const moved = dragMove(state, delta, SENSITIVITY);

    const expected = applyDelta(state, pointerDeltaToRotation(delta, SENSITIVITY));
    expectQuatClose(moved.orientation, expected.orientation, 1e-12);
  });

  it('[AC-002-4] applies a 40 px rightward move from identity as a 0.2 rad rotation about world Y', () => {
    const moved = dragMove(createRotationState(), { dx: 40, dy: 0 }, SENSITIVITY);

    expectQuatClose(moved.orientation, { x: 0, y: Math.sin(0.1), z: 0, w: Math.cos(0.1) }, 1e-12);
  });

  it('[AC-002-4] applies a 40 px downward move from identity as a 0.2 rad rotation about world X', () => {
    const moved = dragMove(createRotationState(), { dx: 0, dy: 40 }, SENSITIVITY);

    expectQuatClose(moved.orientation, { x: Math.sin(0.1), y: 0, z: 0, w: Math.cos(0.1) }, 1e-12);
  });

  it('[AC-002-4] leaves velocity at exactly zero, even when the incoming state still carries one', () => {
    const moved = dragMove(coastingState(), { dx: 30, dy: -12 }, SENSITIVITY);

    expect(moved.velocity).toEqual({ x: 0, y: 0 });
  });

  it('[AC-002-4] accumulates no inertia across a whole drag: velocity stays zero after 50 moves', () => {
    let state = beginDrag(createRotationState());

    for (let i = 0; i < 50; i += 1) {
      state = dragMove(state, { dx: 6, dy: -3 }, SENSITIVITY);
      expect(state.velocity).toEqual({ x: 0, y: 0 });
    }

    // ...and stepping afterwards cannot move it, because there is no velocity to integrate.
    const draggedTo = state.orientation;
    expectQuatClose(step(state, 16).orientation, draggedTo, 1e-15);
  });

  it('[AC-002-4] accumulates the orientation across moves: two 20 px moves equal one 40 px move', () => {
    const twice = dragMove(
      dragMove(createRotationState(), { dx: 20, dy: 0 }, SENSITIVITY),
      { dx: 20, dy: 0 },
      SENSITIVITY,
    );
    const once = dragMove(createRotationState(), { dx: 40, dy: 0 }, SENSITIVITY);

    expectQuatClose(twice.orientation, once.orientation, 1e-12);
  });

  it('[AC-002-4] is a no-op for a zero-pixel move', () => {
    const state = beginDrag(coastingState());

    const moved = dragMove(state, { dx: 0, dy: 0 }, SENSITIVITY);

    expectQuatClose(moved.orientation, state.orientation, 0);
    expect(moved.velocity).toEqual({ x: 0, y: 0 });
  });

  it('[AC-002-4] defaults to DEFAULT_SENSITIVITY when no sensitivity is given', () => {
    const state = coastingState();

    expect(dragMove(state, { dx: 30, dy: -12 })).toEqual(
      dragMove(state, { dx: 30, dy: -12 }, DEFAULT_SENSITIVITY),
    );
  });

  it('[AC-002-4] does not mutate the state or the delta passed in', () => {
    const state = coastingState();
    const delta: PointerDelta = { dx: 30, dy: -12 };
    const stateSnapshot = structuredClone(state);
    const deltaSnapshot = structuredClone(delta);

    const moved = dragMove(state, delta, SENSITIVITY);

    expect(state).toEqual(stateSnapshot);
    expect(delta).toEqual(deltaSnapshot);
    expect(moved.orientation).not.toBe(state.orientation);
  });
});

describe('endDrag', () => {
  it('[AC-002-5] converts pixels per millisecond to radians per millisecond with the same sensitivity', () => {
    const movement: RecentMovement = { dx: 300, dy: -150, dtMs: 50 };

    const released = endDrag(createRotationState(), movement, { sensitivity: SENSITIVITY });

    // 300 px / 50 ms = 6 px/ms -> 6 * 0.005 = 0.03 rad/ms of yaw;
    // -150 px / 50 ms = -3 px/ms -> -0.015 rad/ms of pitch.
    expect(released.velocity).toEqual({ x: -0.015, y: 0.03 });
  });

  it('[AC-002-5] uses exactly the sensitivity of pointerDeltaToRotation: a 1 ms sample is the per-pixel mapping itself', () => {
    const movement: RecentMovement = { dx: 12, dy: -7, dtMs: 1 };

    const released = endDrag(createRotationState(), movement, { sensitivity: SENSITIVITY });

    expect(released.velocity).toEqual(
      pointerDeltaToRotation({ dx: movement.dx, dy: movement.dy }, SENSITIVITY),
    );
  });

  it('[AC-002-5] scales inversely with the sample duration: the same pixels over twice the time halve the velocity', () => {
    const fast = endDrag(
      createRotationState(),
      { dx: 120, dy: 0, dtMs: 50 },
      {
        sensitivity: SENSITIVITY,
      },
    );
    const slow = endDrag(
      createRotationState(),
      { dx: 120, dy: 0, dtMs: 100 },
      {
        sensitivity: SENSITIVITY,
      },
    );

    expect(fast.velocity).toEqual({ x: 0, y: 0.012 });
    expect(slow.velocity).toEqual({ x: 0, y: 0.006 });
  });

  it('[AC-002-5] respects the sign of the recent movement on both axes', () => {
    const movement: RecentMovement = { dx: -100, dy: 100, dtMs: 50 };

    const released = endDrag(createRotationState(), movement, { sensitivity: SENSITIVITY });

    expect(released.velocity).toEqual({ x: 0.01, y: -0.01 });
  });

  it('[AC-002-5] leaves the orientation exactly as the drag left it', () => {
    const dragged = dragMove(createRotationState(), { dx: 200, dy: -80 }, SENSITIVITY);

    const released = endDrag(
      dragged,
      { dx: 300, dy: -150, dtMs: 50 },
      {
        sensitivity: SENSITIVITY,
      },
    );

    expectQuatClose(released.orientation, dragged.orientation, 0);
  });

  it('[AC-002-5] defaults to DEFAULT_SENSITIVITY when no options are given', () => {
    const movement: RecentMovement = { dx: 300, dy: -150, dtMs: 50 };
    const state = createRotationState();

    expect(endDrag(state, movement)).toEqual(
      endDrag(state, movement, {
        sensitivity: DEFAULT_SENSITIVITY,
        releaseWindowMs: DEFAULT_RELEASE_WINDOW_MS,
      }),
    );
    // Default sensitivity is 0.005, so 6 px/ms becomes 0.03 rad/ms.
    expect(endDrag(state, movement).velocity).toEqual({ x: -0.015, y: 0.03 });
  });

  it('[AC-002-5] takes the default releaseWindowMs when only sensitivity is given', () => {
    const movement: RecentMovement = { dx: 120, dy: 0, dtMs: 200 };
    const state = createRotationState();

    expect(endDrag(state, movement, { sensitivity: 0.01 })).toEqual(
      endDrag(state, movement, {
        sensitivity: 0.01,
        releaseWindowMs: DEFAULT_RELEASE_WINDOW_MS,
      }),
    );
  });

  it('[AC-002-5] takes the default sensitivity when only releaseWindowMs is given', () => {
    const movement: RecentMovement = { dx: 120, dy: 0, dtMs: 200 };
    const state = createRotationState();

    expect(endDrag(state, movement, { releaseWindowMs: 500 })).toEqual(
      endDrag(state, movement, {
        sensitivity: DEFAULT_SENSITIVITY,
        releaseWindowMs: 500,
      }),
    );
  });

  it('[AC-002-6] a click produces exactly zero velocity: no displacement means no coast', () => {
    const dragged = dragMove(createRotationState(), { dx: 200, dy: 0 }, SENSITIVITY);

    const released = endDrag(dragged, { dx: 0, dy: 0, dtMs: 8 }, { sensitivity: SENSITIVITY });

    expect(released.velocity).toEqual({ x: 0, y: 0 });
    expectQuatClose(released.orientation, dragged.orientation, 0);
  });

  it('[AC-002-6] a drag that paused before release produces exactly zero velocity: a sample longer than the 250 ms release window is stale', () => {
    expect(DEFAULT_RELEASE_WINDOW_MS).toBe(250);

    const paused = endDrag(
      createRotationState(),
      { dx: 120, dy: -60, dtMs: 400 },
      {
        sensitivity: SENSITIVITY,
      },
    );

    expect(paused.velocity).toEqual({ x: 0, y: 0 });
  });

  it('[AC-002-6] treats the release window as inclusive: 250 ms still coasts, 250.5 ms does not', () => {
    const state = createRotationState();

    const atWindow = endDrag(state, { dx: 120, dy: 0, dtMs: 250 }, { sensitivity: SENSITIVITY });
    const pastWindow = endDrag(
      state,
      { dx: 120, dy: 0, dtMs: 250.5 },
      {
        sensitivity: SENSITIVITY,
      },
    );

    expect(atWindow.velocity).toEqual({ x: 0, y: 0.0024 });
    expect(pastWindow.velocity).toEqual({ x: 0, y: 0 });
  });

  it('[AC-002-6] honours an explicit releaseWindowMs', () => {
    const state = createRotationState();
    const movement: RecentMovement = { dx: 120, dy: 0, dtMs: 200 };

    expect(
      endDrag(state, movement, { sensitivity: SENSITIVITY, releaseWindowMs: 100 }).velocity,
    ).toEqual({ x: 0, y: 0 });
    expect(
      endDrag(state, movement, { sensitivity: SENSITIVITY, releaseWindowMs: 500 }).velocity,
    ).toEqual({ x: 0, y: 0.003 });
  });

  it('[AC-002-6] a zero-duration or negative-duration sample produces exactly zero velocity, never Infinity or NaN', () => {
    const state = createRotationState();

    const instant = endDrag(state, { dx: 120, dy: -60, dtMs: 0 }, { sensitivity: SENSITIVITY });
    const backwards = endDrag(
      state,
      { dx: 120, dy: -60, dtMs: -16 },
      {
        sensitivity: SENSITIVITY,
      },
    );

    expect(instant.velocity).toEqual({ x: 0, y: 0 });
    expect(backwards.velocity).toEqual({ x: 0, y: 0 });
  });

  it('[AC-002-6] does not mutate the state or the movement passed in', () => {
    const state = coastingState();
    const movement: RecentMovement = { dx: 300, dy: -150, dtMs: 50 };
    const stateSnapshot = structuredClone(state);
    const movementSnapshot = structuredClone(movement);

    const released = endDrag(state, movement, { sensitivity: SENSITIVITY });

    expect(state).toEqual(stateSnapshot);
    expect(movement).toEqual(movementSnapshot);
    expect(released.velocity).not.toBe(state.velocity);
  });
});

describe('coast after release', () => {
  it('[AC-002-7] damps a 0.03 rad/ms release to exactly zero velocity after 1168 ms of simulated time, well within 2000 ms', () => {
    // 300 px / 50 ms at 0.005 rad/px = 0.03 rad/ms of yaw. With SPEC-001's defaults
    // (halfLifeMs 100, settleThreshold 1e-5) the magnitude crosses the threshold after
    // log2(0.03 / 1e-5) * 100 = 1155.07... ms, i.e. on the 73rd 16 ms step = 1168 ms.
    let state = endDrag(
      createRotationState(),
      { dx: 300, dy: 0, dtMs: 50 },
      {
        sensitivity: SENSITIVITY,
      },
    );
    expect(state.velocity).toEqual({ x: 0, y: 0.03 });

    const dtMs = 16;
    let elapsedMs = 0;
    let settledAtMs = Number.POSITIVE_INFINITY;
    while (elapsedMs < 2000) {
      state = step(state, dtMs);
      elapsedMs += dtMs;
      if (state.velocity.x === 0 && state.velocity.y === 0) {
        settledAtMs = elapsedMs;
        break;
      }
    }

    expect(settledAtMs).toBe(1168);
    expect(settledAtMs).toBeLessThanOrEqual(2000);
    expect(state.velocity).toEqual({ x: 0, y: 0 });
  });

  it('[AC-002-7] damps a two-axis release to exactly zero velocity after 1184 ms, and the orientation then stops changing', () => {
    // |{ x: -0.015, y: 0.03 }| = 0.0335410196624968..., threshold crossed at
    // log2(0.03354.../1e-5) * 100 = 1171.6... ms, i.e. on the 74th 16 ms step = 1184 ms.
    let state = endDrag(
      createRotationState(),
      { dx: 300, dy: -150, dtMs: 50 },
      {
        sensitivity: SENSITIVITY,
      },
    );
    expect(state.velocity).toEqual({ x: -0.015, y: 0.03 });

    const dtMs = 16;
    let elapsedMs = 0;
    let settledAtMs = Number.POSITIVE_INFINITY;
    while (elapsedMs < 2000) {
      state = step(state, dtMs);
      elapsedMs += dtMs;
      if (state.velocity.x === 0 && state.velocity.y === 0) {
        settledAtMs = elapsedMs;
        break;
      }
    }

    expect(settledAtMs).toBe(1184);
    expect(settledAtMs).toBeLessThanOrEqual(2000);

    const settledAt = state.orientation;
    for (let i = 0; i < 100; i += 1) {
      state = step(state, dtMs);
    }
    expect(state.velocity).toEqual({ x: 0, y: 0 });
    expectQuatClose(state.orientation, settledAt, 1e-15);
  });

  it('[AC-002-7] keeps the coast monotonic: velocity magnitude never grows between steps and reaches zero once', () => {
    let state = endDrag(
      createRotationState(),
      { dx: 300, dy: -150, dtMs: 50 },
      {
        sensitivity: SENSITIVITY,
      },
    );

    let previous = Math.hypot(state.velocity.x, state.velocity.y);
    let zeroReadings = 0;
    for (let i = 0; i < 125; i += 1) {
      state = step(state, 16);
      const current = Math.hypot(state.velocity.x, state.velocity.y);
      expect(current).toBeLessThanOrEqual(previous);
      if (current === 0) zeroReadings += 1;
      previous = current;
    }

    // 125 steps of 16 ms = 2000 ms simulated. Settling on the 74th step (1184 ms) leaves
    // 125 - 74 + 1 = 52 zero readings.
    expect(zeroReadings).toBe(52);
  });

  it('[AC-002-6][AC-002-7] a paused release never coasts: the orientation is unchanged after 2000 ms of steps', () => {
    const dragged = dragMove(createRotationState(), { dx: 200, dy: -80 }, SENSITIVITY);
    let state = endDrag(dragged, { dx: 120, dy: -60, dtMs: 400 }, { sensitivity: SENSITIVITY });

    for (let i = 0; i < 125; i += 1) {
      state = step(state, 16);
    }

    expect(state.velocity).toEqual({ x: 0, y: 0 });
    expectQuatClose(state.orientation, dragged.orientation, 1e-15);
  });

  it('[AC-002-3][AC-002-7] a new grab mid-coast ends the coast immediately', () => {
    let state = endDrag(
      createRotationState(),
      { dx: 300, dy: 0, dtMs: 50 },
      {
        sensitivity: SENSITIVITY,
      },
    );

    for (let i = 0; i < 10; i += 1) {
      state = step(state, 16);
    }
    expect(Math.hypot(state.velocity.x, state.velocity.y)).toBeGreaterThan(0);

    const grabbed = beginDrag(state);
    let afterGrab = grabbed;
    for (let i = 0; i < 125; i += 1) {
      afterGrab = step(afterGrab, 16);
    }

    expect(afterGrab.velocity).toEqual({ x: 0, y: 0 });
    expectQuatClose(afterGrab.orientation, grabbed.orientation, 1e-15);
  });
});
