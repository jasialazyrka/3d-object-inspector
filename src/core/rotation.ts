/**
 * SPEC-001 — rotation core.
 *
 * Orientation as a unit quaternion plus an angular velocity, advanced by an explicit `dtMs` and
 * damped exponentially. Pure and framework-free: every function takes state and returns new state.
 */

export type Quat = { x: number; y: number; z: number; w: number };

/** Radians per millisecond, about the world X and Y axes. */
export type AngularVelocity = { x: number; y: number };

export type RotationState = { orientation: Quat; velocity: AngularVelocity };

export type StepOptions = {
  /** Milliseconds after which the velocity magnitude is halved. */
  halfLifeMs?: number;
  /** Radians per millisecond; a damped velocity below this snaps to exactly zero. */
  settleThreshold?: number;
};

const DEFAULT_HALF_LIFE_MS = 100;
const DEFAULT_SETTLE_THRESHOLD = 1e-5;
const DEGREES_PER_RADIAN = 180 / Math.PI;

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Hamilton product: the rotation of `b` followed by the rotation of `a`. */
const multiply = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

/** Rescales to unit length, which is what keeps repeated composition drift-free (AC-001-3). */
const normalize = (q: Quat): Quat => {
  const length = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
};

/** Degrees wrapped into [0, 360); the double modulo also turns -0 into +0 (AC-001-9). */
const wrapDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;

export const createRotationState = (): RotationState => ({
  orientation: { ...IDENTITY },
  velocity: { x: 0, y: 0 },
});

/**
 * Rotates the orientation by `delta.x` radians about world X and `delta.y` radians about world Y.
 * The delta pre-multiplies the current orientation, so the axes are world axes, not body axes.
 */
export const applyDelta = (state: RotationState, delta: AngularVelocity): RotationState => {
  const halfX = delta.x / 2;
  const halfY = delta.y / 2;
  const aboutX: Quat = { x: Math.sin(halfX), y: 0, z: 0, w: Math.cos(halfX) };
  const aboutY: Quat = { x: 0, y: Math.sin(halfY), z: 0, w: Math.cos(halfY) };

  return {
    orientation: normalize(multiply(multiply(aboutY, aboutX), state.orientation)),
    velocity: { ...state.velocity },
  };
};

/**
 * Advances the orientation by the velocity held at the start of the step, then damps that velocity
 * by `0.5 ** (dtMs / halfLifeMs)` and snaps it to zero once it falls below the settle threshold.
 */
export const step = (
  state: RotationState,
  dtMs: number,
  options: StepOptions = {},
): RotationState => {
  const halfLifeMs = options.halfLifeMs ?? DEFAULT_HALF_LIFE_MS;
  const settleThreshold = options.settleThreshold ?? DEFAULT_SETTLE_THRESHOLD;

  const { orientation } = applyDelta(state, {
    x: state.velocity.x * dtMs,
    y: state.velocity.y * dtMs,
  });

  const decay = 0.5 ** (dtMs / halfLifeMs);
  const damped = { x: state.velocity.x * decay, y: state.velocity.y * decay };
  const settled = Math.hypot(damped.x, damped.y) < settleThreshold;

  return { orientation, velocity: settled ? { x: 0, y: 0 } : damped };
};

/** Returns the identity orientation and zero velocity, whatever the input state holds. */
export const reset: (state: RotationState) => RotationState = () => createRotationState();

/**
 * Decomposes the orientation into yaw about world Y, pitch about world X and roll about world Z,
 * in degrees normalized to [0, 360).
 */
export const toEulerDegrees = (
  state: RotationState,
): { yaw: number; pitch: number; roll: number } => {
  const { x, y, z, w } = state.orientation;
  const m02 = 2 * (x * z + w * y);
  const m12 = 2 * (y * z - w * x);
  const m22 = 1 - 2 * (x * x + y * y);
  const m10 = 2 * (x * y + w * z);
  const m11 = 1 - 2 * (x * x + z * z);

  return {
    yaw: wrapDegrees(Math.atan2(m02, m22) * DEGREES_PER_RADIAN),
    pitch: wrapDegrees(Math.asin(Math.min(1, Math.max(-1, -m12))) * DEGREES_PER_RADIAN),
    roll: wrapDegrees(Math.atan2(m10, m11) * DEGREES_PER_RADIAN),
  };
};
