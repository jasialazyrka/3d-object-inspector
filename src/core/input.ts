/**
 * SPEC-002 — pointer input mapping.
 *
 * Pixels in, radians out. Pure and framework-free like the rest of src/core: no DOM, no clock.
 * Timestamps are taken in src/app and arrive here as plain numbers on `RecentMovement`.
 */

import { applyDelta } from './rotation';
import type { AngularVelocity, RotationState } from './rotation';

/** A pointer displacement in CSS pixels. */
export type PointerDelta = { dx: number; dy: number };

/** Net pointer displacement in pixels over an interval of `dtMs` ending at the release instant. */
export type RecentMovement = { dx: number; dy: number; dtMs: number };

export type EndDragOptions = {
  /** Radians per pixel. */
  sensitivity?: number;
  /** A sampled interval longer than this is stale, so the release imparts no inertia. */
  releaseWindowMs?: number;
};

/** Radians per pixel: a 200 px drag is exactly 1 radian. */
export const DEFAULT_SENSITIVITY = 0.005;

/** Milliseconds; a sample older than this means the pointer paused before release (AC-002-6). */
export const DEFAULT_RELEASE_WINDOW_MS = 250;

const ZERO_VELOCITY: AngularVelocity = { x: 0, y: 0 };

/**
 * Maps horizontal pixels to yaw about world Y and vertical pixels to pitch about world X, so the
 * object follows the pointer: right is positive yaw, down is positive pitch (AC-002-1, AC-002-2).
 */
export const pointerDeltaToRotation = (
  delta: PointerDelta,
  sensitivity: number = DEFAULT_SENSITIVITY,
): AngularVelocity => ({
  x: delta.dy * sensitivity,
  y: delta.dx * sensitivity,
});

/** Grabbing the object cancels any coast in progress: it stops dead under the pointer (AC-002-3). */
export const beginDrag = (state: RotationState): RotationState => ({
  orientation: { ...state.orientation },
  velocity: { ...ZERO_VELOCITY },
});

/**
 * Applies one pointer move immediately and keeps the velocity at zero, so the object tracks the
 * pointer without accumulating inertia mid-drag (AC-002-4).
 */
export const dragMove = (
  state: RotationState,
  delta: PointerDelta,
  sensitivity: number = DEFAULT_SENSITIVITY,
): RotationState => ({
  orientation: applyDelta(state, pointerDeltaToRotation(delta, sensitivity)).orientation,
  velocity: { ...ZERO_VELOCITY },
});

/**
 * Turns the recent pointer movement into an angular velocity in radians per millisecond, leaving
 * the orientation where the drag left it (AC-002-5). A sample that carries no usable movement
 * imparts none: no elapsed time, a stale interval, or no displacement at all (AC-002-6).
 */
export const endDrag = (
  state: RotationState,
  movement: RecentMovement,
  options: EndDragOptions = {},
): RotationState => {
  const sensitivity = options.sensitivity ?? DEFAULT_SENSITIVITY;
  const releaseWindowMs = options.releaseWindowMs ?? DEFAULT_RELEASE_WINDOW_MS;

  const stale = movement.dtMs <= 0 || movement.dtMs > releaseWindowMs;
  const still = movement.dx === 0 && movement.dy === 0;

  const velocity =
    stale || still
      ? ZERO_VELOCITY
      : pointerDeltaToRotation(
          { dx: movement.dx / movement.dtMs, dy: movement.dy / movement.dtMs },
          sensitivity,
        );

  return { orientation: { ...state.orientation }, velocity: { ...velocity } };
};
