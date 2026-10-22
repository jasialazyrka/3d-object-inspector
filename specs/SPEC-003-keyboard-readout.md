---
id: SPEC-003
title: Keyboard control, reset and degree readout
status: done
---

# SPEC-003 — Keyboard control, reset and degree readout

Rotation without a pointing device, a way back to a known orientation, and a live numeric readout.

## Rationale

A rotatable object reachable only by dragging is unusable by keyboard and untestable without
synthetic pointer events. This spec also makes orientation legible, which makes the whole app
easier to demonstrate.

## Acceptance criteria

- **AC-003-1** — The canvas is keyboard focusable (`tabIndex = 0`) and carries an accessible name
  describing it as an interactive 3D object.
- **AC-003-2** — `keyToRotation(key, { shift })` maps `ArrowLeft`/`ArrowRight` to a negative/positive
  yaw step and `ArrowUp`/`ArrowDown` to a negative/positive pitch step.
- **AC-003-3** — Holding Shift multiplies the step size by a fixed factor greater than 1.
- **AC-003-4** — `keyToRotation` returns `null` for any key it does not handle, so unrelated
  keystrokes are left alone.
- **AC-003-5** — Pressing `r` resets the orientation to identity and zeroes velocity.
- **AC-003-6** — A visible Reset control exists and resets the orientation to identity when
  activated.
- **AC-003-7** — The readout displays yaw, pitch and roll as whole degrees in `[0, 360)` and updates
  as the orientation changes.
- **AC-003-8** — Handled keys call `preventDefault`, so arrow keys rotate the object instead of
  scrolling the page.
- **AC-003-9** — E2E: focusing the canvas and pressing `ArrowRight` changes the rotation reported by
  the seam; pressing `r` afterwards returns it to the identity quaternion.

## Out of scope

Object switching and view toggles — see `ROADMAP.md`.
