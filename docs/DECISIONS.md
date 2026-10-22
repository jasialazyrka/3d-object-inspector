# Decision log

Short records of harness decisions that were not obvious, including the ones that were wrong first.

## ADR-001 — Rules in `AGENTS.md`, not `CLAUDE.md`

**Decision.** `AGENTS.md` holds the rules; `CLAUDE.md` is a three-line pointer to it.

**Why.** The harness should not be shaped by one vendor's runner. Everything enforceable lives in
`npm run verify`, which any agent runner or bare CI job can call; the hooks only make the same gates
fire sooner. Porting to another runner means writing a new pointer file, not re-deriving the rules.

## ADR-002 — Gates in `npm run verify`, never only in hooks

**Decision.** Every gate is reachable from one npm script. Hooks call the same scripts.

**Why.** A gate that exists only as a hook is invisible to CI, to humans, and to any other agent.
It also makes "the agent said it was done" unfalsifiable. One entry point means local and CI cannot
disagree about what green means.

## ADR-003 — The guard must cover Bash

**Decision.** The PreToolUse guard inspects Bash commands as well as the Edit-family tools.

**Why.** Denying `Edit` while leaving Bash open denies nothing — `sed -i`, `> file`, `tee`, `mv`,
`git checkout --` all remain. Discovered immediately in practice: the first thing to try when an
Edit is blocked is a shell equivalent.

**Refinements forced by use.** Interpreters (`node`, `python`) are not writes by themselves —
running the harness is the point of the harness — so they are judged on inline-code flags. And
forbidden-command rules are scoped to a shell segment's leading command, because an earlier
whole-string scan false-positived on a doc comment that merely *mentioned* `--no-verify`.

## ADR-004 — The lock is armed by a human-created sentinel

**Decision.** `.harness/locked` arms the guard. It sits inside a protected path, so it is one-way.

**Why.** The first design used only `HARNESS_ALLOW_PROTECTED=1`, which was circular. The guard must
deny an agent setting that variable, since self-authorisation defeats the purpose — but that left no
legitimate path for Phase 0 authoring or for the `/feature` flow either. A sentinel separates "not
yet armed" from "unlocked by a human", and makes arming an explicit, auditable, one-way act.

## ADR-005 — Spec status is a forwards-only ratchet

**Decision.** `scripts/spec-status.mjs` moves a spec `planned → in-progress → done` and refuses to
move it back. It rewrites exactly one frontmatter line and aborts if any other line would change.

**Why.** Arming a spec makes gates stricter, so agents can be trusted with that direction. Disarming
is the dangerous one. A ratchet gives the `/feature` flow the write it legitimately needs without
opening `specs/` generally — and without needing a human in the loop for every spec.

## ADR-006 — The test-first phase is inferred from git, not declared

**Decision.** The Stop hook decides whether a red unit suite is acceptable by looking at the working
tree: `tests/` changed and `src/` untouched means the test-authoring step.

**Why.** The first design wrote `.harness/phase = red`. Protecting that file keeps an agent from
writing it, but it still means the gate's strictness is controlled by a flag rather than by reality.
Inference removes the switch entirely: the only way into the lenient mode is to have written no
source code, where there is nothing to let through.

## ADR-007 — `src/core` is framework-free, enforced twice

**Decision.** No `three`, `react`, DOM, clock or randomness in `src/core`. Time enters as `dtMs`.
Enforced by ESLint `no-restricted-imports` **and** `scripts/check-core-purity.mjs`.

**Why.** This is the decision that makes a 3D application testable. Pure rotation maths can be
asserted exactly — damping halving within `1e-9`, quaternion drift over 1000 applications — which is
what justifies the 100% coverage threshold on that directory. Two mechanisms because the boundary is
load-bearing and silent erosion would be expensive.

## ADR-008 — E2E through a seam, not screenshots

**Decision.** `window.__inspector__` in dev/test builds; Playwright asserts rotation and frame
count through it. No pixel comparison. Screenshot diffing is deferred with a reason.

**Why.** SwiftShader in headless CI does not match local hardware rendering, so a visual baseline is
flaky before it is useful. A typed seam gives deterministic assertions about the thing that actually
matters — that the object rotated by the expected amount.

## ADR-009 — SKIP is reported, never dressed up as PASS

**Decision.** `verify.mjs` reports gates with nothing to check as SKIP, and says so in the summary.

**Why.** Phase 0 shipped a complete harness against an empty `src/`. A green tick for a test suite
that does not exist is the exact dishonesty this harness is built to prevent.
