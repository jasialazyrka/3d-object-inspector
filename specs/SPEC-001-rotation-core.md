---
id: SPEC-001
title: Rotation core — pure quaternion state with inertia damping
status: done
---

# SPEC-001 — Rotation core

The framework-free heart of the application: orientation as a quaternion, angular velocity, and
exponential damping. Lives in `src/core/rotation.ts`, imports nothing from `three`, `react` or the
DOM, and is unit-tested to 100% lines and branches.

## Rationale

Keeping this logic pure makes it deterministic — fixed `dtMs`, no clock, no RAF, no WebGL — so the
interesting behaviour (damping, normalization drift, settling) is tested exactly rather than
observed approximately.

## Model

```ts
type Quat = { x: number; y: number; z: number; w: number };
type AngularVelocity = { x: number; y: number }; // rad per ms, about world X and Y
type RotationState = { orientation: Quat; velocity: AngularVelocity };
```

Damping is exponential with a configurable half-life: after `halfLifeMs`, velocity magnitude is half
its previous value.

## Acceptance criteria

- **AC-001-1** — `createRotationState()` returns the identity orientation
  `{ x: 0, y: 0, z: 0, w: 1 }` and zero velocity.
- **AC-001-2** — `applyDelta(state, { x: 0, y: a })` rotates the orientation by `a` radians about
  the world Y axis; `applyDelta(state, { x: a, y: 0 })` rotates by `a` radians about world X.
- **AC-001-3** — The orientation quaternion stays normalized (`|q| - 1` within `1e-9`) after 1000
  successive `applyDelta` calls — no drift.
- **AC-001-4** — `step(state, dtMs)` advances the orientation by the current angular velocity: a
  velocity of `v` rad/ms over `dtMs` produces the same orientation as
  `applyDelta(state, { x: v.x * dtMs, y: v.y * dtMs })`.
- **AC-001-5** — `step` damps velocity exponentially: with `halfLifeMs = 100`, a step of 100 ms
  leaves velocity magnitude at half its previous value, within `1e-9`.
- **AC-001-6** — `step` snaps velocity to exactly `{ x: 0, y: 0 }` once its magnitude falls below
  the settle threshold, so a coast terminates rather than decaying forever.
- **AC-001-7** — `step(state, 0)` returns a state deeply equal to the input (zero elapsed time is a
  no-op).
- **AC-001-8** — `reset(state)` returns the identity orientation and zero velocity, regardless of
  the input state.
- **AC-001-9** — `toEulerDegrees(state)` returns `{ yaw, pitch, roll }` in degrees, each normalized
  to `[0, 360)`, and returns `{ yaw: 0, pitch: 0, roll: 0 }` for the identity orientation.
- **AC-001-10** — Every exported function is pure: calling it does not mutate the state object or
  the delta object passed in (verified by deep-equality against a snapshot of the inputs).

## Out of scope

Pointer or keyboard input handling (SPEC-002/003), rendering.
