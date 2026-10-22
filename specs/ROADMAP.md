# Roadmap — deliberately deferred

Scope control is a harness feature. These items are specified enough to be picked up, and left
undone on purpose: the challenge rewards a small reliable application over an ambitious unreliable
one, and the deadline is one day.

## Deferred features

### SPEC-004 — Object switcher

Switch between procedurally generated meshes (cube, icosahedron, torus knot, octahedron) without
losing the current orientation. Catalogue of mesh descriptors belongs in `src/core/objects.ts` so
the available set is testable without three.js.

### SPEC-005 — View controls

Axis lock (X / Y / free), auto-rotate toggle, wireframe toggle. Each is a pure transform over the
rotation delta, so each is unit-testable in `src/core`.

## Deferred gates — wired but disabled

Each is configured and commented out rather than absent, so enabling one is a one-line change
rather than a project.

| Gate                                           | Why deferred                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mutation testing** (Stryker over `src/core`) | The highest-value next gate. AC traceability proves a test exists per criterion; it cannot prove the test asserts anything. Mutation testing is the only gate here that would catch a hollow test. |
| **Screenshot diff**                            | WebGL rendering in headless CI (SwiftShader) differs from local hardware rendering; a visual baseline would be flaky before it was useful. The seam-based E2E assertions cover behaviour instead.  |
| **axe a11y**                                   | SPEC-003 adds the first real a11y surface (focus, accessible name, keyboard). Worth arming once that spec lands.                                                                                   |
| **Bundle-size budget**                         | Meaningless until the app has grown past a skeleton.                                                                                                                                               |
| **Dead-code detection** (`knip`)               | Same — noise on a four-module codebase.                                                                                                                                                            |

## Known harness limitations

See the end of `specs/README.md` and `docs/HARNESS.md`. In short: the protected-path lock defends
against drift and accident, not against a determined agent, because the override is a single
process-wide environment variable.
