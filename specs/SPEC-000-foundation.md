---
id: SPEC-000
title: Foundation — canvas, render loop, test seam
status: planned
---

# SPEC-000 — Foundation

Stand up the application shell: a React + `@react-three/fiber` canvas rendering a single 3D object,
plus the deterministic test seam that all later E2E work depends on. No interactivity yet — the
object is static in this spec.

## Rationale

Everything after this spec needs a reliable way to observe 3D state from a test. Pixel-diffing a
WebGL canvas headlessly is flaky, so instead the app exposes a small typed seam on `window` in
dev/test builds, and E2E asserts behaviour through it.

## Acceptance criteria

- **AC-000-1** — The app mounts into `#root` and renders exactly one `<canvas>` element.
- **AC-000-2** — The canvas has a usable WebGL context (`webgl2` or `webgl`).
- **AC-000-3** — The canvas renders a non-blank image: sampled pixels are not all identical.
- **AC-000-4** — In dev/test builds, `window.__inspector__` exists and exposes
  `getRotation(): { x: number; y: number; z: number; w: number }` and `getFrameCount(): number`.
- **AC-000-5** — `getFrameCount()` strictly increases over a 500 ms observation window (the render
  loop is live).
- **AC-000-6** — The seam installer is a no-op when the build mode is `production`, so
  `window.__inspector__` is absent in a production bundle.
- **AC-000-7** — `getRotation()` initially returns the identity quaternion
  `{ x: 0, y: 0, z: 0, w: 1 }`.

## Out of scope

Interaction of any kind (SPEC-001/002/003), object switching, lighting controls.
