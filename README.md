# 3D Object Inspector

A browser application with a 3D object you can rotate by dragging — built end to end by AI agents
operating inside a deliberately engineered harness.

The application is small on purpose. The engineering is in the harness: the specifications agents
work from, the gates that judge the result, and the loops that feed failures back to the agent
without a human in the middle.

## Quick start

```bash
npm ci
npm run dev        # http://localhost:5173
npm run verify     # every quality gate — the definition of done
```

## Harness architecture

### Two layers, one hard boundary

| Layer           | Paths                                                                    | Who writes it |
| --------------- | ------------------------------------------------------------------------ | ------------- |
| **Harness**     | `AGENTS.md`, `specs/`, `.claude/`, `scripts/`, `.github/`, build configs | Humans only   |
| **Application** | `src/`, `tests/`                                                         | Agents only   |

The boundary is enforced, not requested. An agent's natural failure mode under pressure is to edit
the thing judging it — relax a spec, weaken an assertion, lower a threshold. Three independent
mechanisms prevent it:

1. **`.claude/hooks/guard-protected-paths.mjs`** — a PreToolUse hook denying writes to harness
   paths. It covers Bash as well as the Edit tools, because blocking `Edit` alone is theatre while
   `sed -i`, `> file` and `git checkout --` remain open.
2. **`scripts/check-protected-paths.mjs`** — the same list enforced in CI, _outside_ the agent's
   process. A hook is advisory; this is the guarantee. A PR touching harness paths fails unless a
   human attaches the `harness-change` label.
3. **`.claude/settings.json` `permissions.deny`** — a coarse backstop at the tool-permission layer.

All three read one list, in `scripts/protected-paths.mjs`.

The lock is armed by a human creating `.harness/locked`. Before that the harness is still being
authored and there is nothing to protect; afterwards the sentinel sits inside a protected path, so
no agent can remove it.

### Specifications are executable

Each spec in `specs/` carries acceptance criteria with stable IDs, written as observable assertions
rather than intentions. Tests cite the IDs they cover:

```ts
it('[AC-001-3] keeps the orientation quaternion normalized', () => {
  /* ... */
});
```

`npm run gate:ac-trace` then fails on **orphan criteria** (specified, untested) and **phantom IDs**
(tested, unspecified). Coverage is measured against _intent_, not lines.

A spec's `status` is a **ratchet** — `planned → in-progress → done`, forwards only, via
`scripts/spec-status.mjs`. Arming a spec only ever makes the gates stricter, which is why agents are
trusted with it; disarming one is refused outright.

### Durable memory

A subagent's report lives only in the orchestrator's context. `claude-progress.md` is appended to at
the end of every `/feature` run, through `scripts/record-progress.mjs` — the log is a protected path,
so that script is the only way to write it, and it is **append-only**. Gate results in each entry are
measured by the recorder rather than typed by the agent, so an entry cannot claim green while red,
and `gate:progress` fails if a spec reached `done` without one.

Specs record what must be true and git records what changed; this records what was _learned on the
way_, which is the part no diff can reconstruct.

### The loop is test-first, and that is verified

`/feature <SPEC-ID>` drives one spec from end to end:

```
read spec → arm it → test-author writes failing tests → gate:red proves they fail
          → commit tests alone → implementer writes code → verify → commit → push
```

Two details carry most of the weight:

- **`npm run gate:red`** passes only if the unit suite _fails_. A test that passes before its
  implementation exists is asserting nothing, and this catches it immediately.
- **Tests are committed before implementation.** Any later weakening of a test shows up as a diff
  against an already-committed file instead of hiding inside one large commit.

The `test-author` and `implementer` subagents have disjoint write scopes — tests and source
respectively — so implementation code never edits the tests judging it.

### Feedback loops

- **`guard-protected-paths`** (PreToolUse) — denies the write and explains why, in the agent's
  context, before any damage.
- **`stop-gate`** (Stop) — an agent cannot declare itself finished while gates are red. It is
  phase-aware, and the phase is **inferred from git rather than declared**: a working tree that
  changes `tests/` but not `src/` is the test-first step, where a red suite is expected. Inferring
  it means an agent cannot flip a flag to switch its own gate off — the only route into the lenient
  mode is to have written no source at all.

### Architecture that makes 3D testable

```
src/core/     pure TypeScript — no three.js, no React, no DOM, no clock, no randomness
src/app/      React + @react-three/fiber render shell, deliberately thin
src/testing/  window.__inspector__ seam, dev/test builds only
```

All rotation maths lives in `src/core`, where time enters as an explicit `dtMs` parameter. That
makes damping, normalization drift and settling testable _exactly_, with a coverage threshold of
**100%** on `src/core` and 85% overall. ESLint's `no-restricted-imports` and
`scripts/check-core-purity.mjs` both enforce the boundary.

E2E never compares pixels. A WebGL canvas rendered by SwiftShader in headless CI does not match
local hardware rendering, so a visual baseline would be flaky before it was useful. Instead the app
exposes a typed seam and Playwright asserts behaviour through it — the frame counter advances, a
drag changes rotation by the expected sign — plus a blank-canvas check against total render failure.

### Quality gates

`npm run verify` runs all of them, identically on a laptop and in CI:

| Gate          | What it protects                                                                   |
| ------------- | ---------------------------------------------------------------------------------- |
| `typecheck`   | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| `lint`        | ESLint, `no-explicit-any` as an error, core-purity import rule                     |
| `format`      | Prettier                                                                           |
| `test:unit`   | Vitest + coverage thresholds (100% `src/core`)                                     |
| `ac-trace`    | every active acceptance criterion has a test                                       |
| `core-purity` | `src/core` stays framework-free and deterministic                                  |
| `test:e2e`    | Playwright smoke through the seam                                                  |

Gates live in `npm run verify`, never only in a hook, so the harness is portable: any agent runner —
or a bare CI job — gets identical enforcement. Hooks only make the same gates fire sooner.

A gate with nothing to check reports **SKIP**, never PASS. Phase 0 shipped a complete harness
against an empty `src/`, and said so.

## Honest limitations

- **`gate:ac-trace` proves a test exists per criterion, not that it asserts anything meaningful.**
  `it('[AC-001-3] ...', () => {})` would satisfy it. Mutation testing (Stryker over `src/core`) is
  the named next gate — see `specs/ROADMAP.md`.
- Coverage thresholds are necessary, not sufficient.
- Role separation between `test-author` and `implementer` rests on prompts, the guard and review —
  not on OS-level sandboxing.
- `HARNESS_ALLOW_PROTECTED=1` unlocks the harness process-wide. The lock defends against drift and
  accident, not against a determined agent. CI is the layer that does not negotiate.
- Screenshot diffing, axe a11y, bundle budgets and dead-code detection are configured as deferred
  gates with reasons, not silently absent.

## Scope

Delivered: all four specs — `SPEC-000` foundation, `SPEC-001` rotation core, `SPEC-002` pointer
drag, `SPEC-003` keyboard control and readout. The object is rotatable by mouse, touch and keyboard,
coasts to a stop when released, and reports its orientation live. **110 unit tests, 19 e2e tests, 36
acceptance criteria all traced to tests**, and both `src/core` modules at 100% on every metric.
Deferred with reasons in `specs/ROADMAP.md`: object switcher, view controls.

See `AGENTS.md` for the rules agents work under, and `specs/README.md` for the specification format.
