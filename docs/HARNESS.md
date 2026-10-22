# Harness architecture

Presentation companion. The README is the front door; this is the design rationale, the demo script
and the honest list of what this harness does not do.

## The problem this harness solves

An agent asked to make a suite green has two routes: write correct code, or change what "green"
means. The second is faster, and nothing about a plain prompt prevents it. Everything below exists
to close that route and then to make the first route fast.

## Layout

```
┌─ HARNESS (humans only) ───────────────────────────────────────────────┐
│                                                                       │
│  AGENTS.md ────────── the rules. CLAUDE.md is a pointer to it, so     │
│                       the harness is runner-agnostic                  │
│                                                                       │
│  specs/ ───────────── SPEC-000..003, acceptance criteria with stable  │
│                       IDs, status as a forwards-only ratchet          │
│                                                                       │
│  scripts/ ─────────── verify.mjs (the gate orchestrator)              │
│                       check-ac-traceability.mjs                       │
│                       check-core-purity.mjs                           │
│                       check-protected-paths.mjs                       │
│                       gate-red.mjs, spec-status.mjs                   │
│                       protected-paths.mjs  ← ONE list, three users    │
│                                                                       │
│  .claude/hooks/ ───── guard-protected-paths.mjs  (PreToolUse)         │
│                       stop-gate.mjs              (Stop)               │
│  .claude/agents/ ──── test-author, implementer (disjoint write scopes)│
│  .claude/skills/ ──── feature  (the loop, as one command)             │
│                                                                       │
│  .github/ci.yml ───── verify | harness gates | protected paths        │
│  .harness/locked ──── the sentinel that arms the lock
  claude-progress.md ── append-only durable memory; the only write is via a script                 │
└───────────────────────────────────────────────────────────────────────┘
                                   │
                          enforced boundary
                                   │
┌─ APPLICATION (agents only) ───────────────────────────────────────────┐
│  src/core/     pure logic — no three, no React, no DOM, no clock      │
│  src/app/      React + @react-three/fiber shell, thin                 │
│  src/testing/  window.__inspector__ seam (dev/test builds only)       │
│  tests/unit/   Vitest        tests/e2e/   Playwright                  │
└───────────────────────────────────────────────────────────────────────┘
```

## The loop

```
  /feature SPEC-00X
        │
        ├─ 1. read spec ─────────────── ambiguous? STOP and report. Never reinterpret.
        │
        ├─ 2. arm it ────────────────── spec-status.mjs → in-progress
        │                               ratchet: arming only tightens gates
        │
        ├─ 3. test-author ───────────── writes tests/ only, titles cite AC IDs
        │         │
        │         └─ gate:red ───────── passes ONLY if the suite fails
        │                               a test that passes with no implementation
        │                               is asserting nothing
        │
        ├─ 4. commit tests alone ────── later weakening becomes a visible diff
        │                               against an already-committed file
        │
        ├─ 5. implementer ───────────── writes src/ only, never tests/
        │         │
        │         └─ Stop hook ─────── refuses completion while gates are red
        │
        ├─ 6. verify ────────────────── all gates, not a subset
        │
        └─ 7. commit, close, push ───── repo demo-ready after every spec
```

## Design decisions worth defending

### Three enforcement layers over one list

`scripts/protected-paths.mjs` holds the list. The PreToolUse hook reads it for fast in-context
feedback. The CI job reads it for the actual guarantee. `permissions.deny` is a coarse backstop.

The division matters: **a hook runs inside the agent's own process and is therefore advisory.** CI
runs outside it. If asked which single layer to keep, keep CI.

### The guard covers Bash, not just Edit

Blocking the `Edit` tool while leaving Bash open blocks nothing: `sed -i`, `> file`, `tee`, `mv`,
`git checkout --`. The guard parses Bash commands per shell segment, identifies each segment's
leading command, and denies protected-path writes through any of them.

Two refinements came out of actually using it:

- **Interpreters are not writes.** `node scripts/verify.mjs` _runs_ the harness, which is the point
  of the harness. Interpreters are judged on inline-code flags (`-e`, `-c`) instead.
- **Forbidden-command rules are segment-scoped.** An earlier version scanned the whole command
  string, so a doc comment that merely _mentioned_ `--no-verify` tripped the rule. Text is data, not
  a command.

### The lock is armed by a human sentinel, not by file existence

`.harness/locked` arms the guard. Before it exists the harness is still being authored and there is
no contract to protect; after it exists it sits inside a protected path, so no agent can Edit,
`rm` or `git checkout` it away.

This replaced a design where the only unlock was `HARNESS_ALLOW_PROTECTED=1`. That was circular: the
guard has to deny an agent setting the variable (otherwise it is self-authorisation), which left no
legitimate path for the `/feature` flow to use it either.

### Spec status is a ratchet, not a free field

`planned → in-progress → done`, forwards only. Every forward transition makes gates **stricter** —
`in-progress` arms `gate:ac-trace` over all of that spec's criteria. So an agent can safely be
trusted to commit itself to more work; the dangerous direction is refused outright, and the script
aborts if its rewrite would change any line but `status:`.

### The test-first phase is inferred, not declared

An earlier design wrote `.harness/phase = red|green`. That hands the agent a switch for turning off
its own gate. The Stop hook instead infers the phase from git: a working tree that changes `tests/`
and not `src/` is the test-authoring step, where a red unit suite is expected. The only route into
the lenient mode is to have written no source code at all — in which case there is nothing to let
through.

### SKIP is not PASS

Phase 0 deliberately shipped a complete harness against an empty `src/`. `verify.mjs` reports gates
with nothing to check as **SKIP** and says so in the summary, rather than reporting a hollow green.

### `src/core` purity is what makes 3D testable at all

Rotation maths with no three.js, no React, no DOM and no clock — time enters as an explicit `dtMs`
parameter. Damping, quaternion normalization drift and settling then become exact assertions rather
than observations, which is what justifies a 100% coverage threshold on that directory. Two
independent mechanisms enforce the boundary (ESLint `no-restricted-imports` and
`check-core-purity.mjs`) because it is the load-bearing architectural decision.

### E2E asserts behaviour, not pixels

SwiftShader in headless CI does not render identically to local hardware, so a screenshot baseline
would be flaky before it was useful. The app exposes `window.__inspector__` in dev/test builds and
Playwright asserts through it, plus a blank-canvas check to catch total render failure.

## Demo script

| #   | Show                      | Command                                                                                         |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | The app                   | `npm run dev`, drag the object                                                                  |
| 2   | All gates green           | `npm run verify`                                                                                |
| 3   | Traceability has teeth    | arm a spec with no tests → `npm run gate:ac-trace` names the orphan criteria                    |
| 4   | The goalpost guard, Edit  | ask an agent to edit `specs/SPEC-001-rotation-core.md` → denied with explanation                |
| 5   | The guard covers Bash too | the same via `sed -i` → denied                                                                  |
| 6   | CI does not negotiate     | a PR touching a protected path → `protected-paths` job fails without the `harness-change` label |
| 7   | Test-first is verified    | the test-only commit is red; the implementation commit is green                                 |
| 8   | Core purity               | add `import * as THREE from 'three'` to `src/core` → ESLint and `core-purity` both fail         |

## Limitations — stated, not hidden

- **The red-phase typecheck allowance is too narrow (open).** It tolerates TS2307 "cannot find
  module" but not TS2305 "has no exported member", so the test-first phase can introduce a new
  module but not extend an existing one. Left open deliberately on a deadline; it affects only the
  test-author role — see ADR-015, which is also the clearest example in this repo of an agent
  refusing to route around a gate when routing around it would have looked like architecture.
- **Observability code is production code.** The test seam shipped returning a hardcoded identity
  quaternion, which would have made every drag assertion in SPEC-002 pass against a constant. No
  gate here can detect that: a test existed, it cited its criterion, and the seam was covered. Only
  reading what the assertion compares catches it — see ADR-013.
- **One e2e test has a known flake envelope.** AC-002-9 asserts an observable coast after release;
  under heavy oversubscription the test harness itself can pause longer than the 250 ms release
  window, where zero velocity is contractually correct and the test's premise is void. ~1 run in 20
  in that state, green at stock settings. Documented rather than retried away — see ADR-014.
- **A gate nobody has tested is not a gate.** The 100% threshold on `src/core` was written as a
  vitest glob key that matched nothing, so it was silently inert from the day it was written. Every
  gate here has since been checked by making it fail on purpose; that practice matters more than any
  individual gate.
- **`gate:ac-trace` proves a test exists per criterion. It cannot prove the test asserts anything.**
  `it('[AC-001-3] ...', () => {})` satisfies it. **Mutation testing (Stryker over `src/core`) is the
  single highest-value next gate**, and the one that would close this hole.
- Coverage thresholds are necessary, not sufficient — 100% of lines executed is not 100% of
  behaviour asserted.
- Role separation between `test-author` and `implementer` rests on prompts, the path guard and
  review, not on OS-level sandboxing. A single agent with both scopes could still cross the line;
  the test-first commit ordering is what makes it visible afterwards.
- `HARNESS_ALLOW_PROTECTED=1` unlocks the harness process-wide once a human sets it. The lock
  defends against drift and accident, not against a determined agent.
- The guard resolves paths relative to the repo root; an absolute path outside that root is not
  matched. Tightening this is a known to-do.
- Deferred gates — screenshot diff, axe a11y, bundle budget, dead-code — are configured with
  reasons in `specs/ROADMAP.md` rather than silently absent.
- Deferred features — object switcher, view controls — likewise. The brief prefers a small reliable
  application over an ambitious unreliable one, and the deadline was one day.
