---
id: SPEC-002
title: Pointer drag with inertia
status: done
---

# SPEC-002 — Pointer drag with inertia

The user grabs the object with mouse or touch, drags to rotate it, and on release the object coasts
and settles. Input mapping is pure (`src/core/input.ts`); only event plumbing lives in `src/app`.

## Rationale

Splitting "pixels to radians" from "listen for pointermove" keeps the interesting part — sensitivity,
sign conventions, release velocity — unit-testable without a DOM.

## Acceptance criteria

- **AC-002-1** — `pointerDeltaToRotation({ dx, dy }, sensitivity)` maps horizontal pixels to yaw and
  vertical pixels to pitch: `dx` pixels produce `dx * sensitivity` radians about world Y, `dy` pixels
  produce `dy * sensitivity` radians about world X.
- **AC-002-2** — Dragging right produces a positive yaw delta and dragging down produces a positive
  pitch delta, so the object follows the pointer rather than opposing it.
- **AC-002-3** — `beginDrag(state)` zeroes the velocity, so grabbing the object cancels any coast in
  progress and the object stops dead under the pointer.
- **AC-002-4** — While dragging, each pointer move applies its rotation delta immediately and leaves
  velocity at zero (the object tracks the pointer and does not accumulate inertia mid-drag).
- **AC-002-5** — `endDrag(state, recentMovement)` sets angular velocity from the recent pointer
  movement, converting pixels per millisecond to radians per millisecond with the same sensitivity.
- **AC-002-6** — A release with no recent movement (a click, or a drag that paused before release)
  produces zero velocity: the object does not coast.
- **AC-002-7** — After release, repeated `step` calls damp the coast until the state reports settled,
  within 2000 ms of simulated time.
- **AC-002-8** — E2E: a rightward drag across the canvas increases yaw; the rotation reported by the
  seam after the drag differs from the identity quaternion.
- **AC-002-9** — E2E: after releasing a fast drag, the seam's rotation continues to change for at
  least one further frame (the coast is observable), and then stops changing.
- **AC-002-10** — The canvas sets `touch-action: none` so touch drags rotate the object instead of
  scrolling the page.

## Out of scope

Keyboard control and the degree readout (SPEC-003), axis locking.
