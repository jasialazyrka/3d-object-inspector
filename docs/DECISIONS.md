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
whole-string scan false-positived on a doc comment that merely _mentioned_ `--no-verify`.

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

## ADR-010 — Coverage is governed by an explicit per-directory policy

**Decision.** `vitest.config.ts` configures no thresholds. `scripts/check-coverage-policy.mjs`
declares one per directory: `src/core` 100%, `src/app` and `src/testing` verified via E2E. A
directory under `src/` with no declared policy fails the gate.

**Why.** The original single global 85% threshold was not merely wrong, it was **unsatisfiable**.
It demanded 85% unit coverage across `src/`, while AGENTS.md §7 says the render shell is asserted
through Playwright. With one unit-coverable function in the codebase, 85% required `src/` to contain
at most one function in total. The implementer proved this arithmetically and correctly refused to
inflate the implementation or hide code in a coverage-excluded file to get past it.

Vitest's per-glob thresholds were the next attempt and do not exclude matched files from the global
figure in v5, so the policy moved into an explicit gate.

**The gate is stricter than the number it replaced.** A global threshold quietly tolerates new
untested code as long as the average holds. This fails outright on an undeclared directory, so
exempting code is a visible, reviewable edit rather than a number drifting down.

**Lesson worth keeping.** A gate nobody has tested is not a gate. The `100%` threshold on
`src/core` had been written as a glob key that matched nothing — vitest compares globs against
absolute paths — so it was **silently inert** from the moment it was written, and would have stayed
inert until someone noticed `src/core` was never actually checked. Gates need their own red test:
this one was verified by pointing it at an undeclared directory and confirming it fails.

## ADR-011 — The Stop gate covers subagents, and blocking mid-loop is correct

**Decision.** `stop-gate.mjs` is wired to **both** `Stop` and `SubagentStop`.

**Why.** Gating only the main agent left the real risk uncovered. The orchestrator delegates the
writing to `test-author` and `implementer`; those are the agents that could stop with a red suite
and report success, and nothing but a human reading the report would have caught it.

**A correction.** When the hook repeatedly blocked the orchestrator mid-loop, the first instinct was
to call that a defect and loosen the phase inference. It was not a defect: the implementation was
genuinely incomplete and the suite was genuinely red, so the hook was telling the truth. The noise
is the cost of the guarantee, and the right response was to extend the gate to subagents rather than
weaken it for the orchestrator. The only refinement kept was recognising a `test(...)` commit at
HEAD with no source changes as a legitimately red state, since the loop commits tests first by
design.

## ADR-012 — `permissions.deny` is absolute, and that is the point

**Observation.** The sentinel in `.harness/locked` disarms the PreToolUse hook, but
`permissions.deny` in `.claude/settings.json` is enforced by the runner itself and ignores the
sentinel entirely. Editing a protected config with `sed` stays blocked even while the harness is
unlocked.

**Kept deliberately.** It is friction — harness edits have to go through a tool the deny list does
not cover. But a backstop that could be switched off by the thing it is backstopping is not a
backstop. The force-push rules work the same way, which is why rewriting the published history was
handed back to a human rather than performed by an agent.

## ADR-013 — A test seam that returns a constant makes every assertion through it vacuous

**What happened.** `src/testing/seam.ts` shipped in SPEC-000 returning a hardcoded identity
quaternion. That was correct while the object was static. By SPEC-002 it was a trap: the e2e suite
asserts drag behaviour _through_ the seam, so had the seam kept returning a constant, every drag
test would have passed against that constant. Green gates, nothing tested.

**Decision.** The seam must report live state, and growing it is part of the spec that depends on
it. `getRotation()` now returns the orientation reported each frame by the render shell.

**Why it is worth an ADR.** This is the hollow-test failure mode arriving through the back door.
`gate:ac-trace` cannot see it — a test citing AC-002-8 existed and passed. Coverage cannot see it —
the seam was covered. Only reading what the assertion actually compares catches it. It is the
clearest argument in this repo for mutation testing over `src/core`, and for treating observability
code as production code rather than scaffolding.

## ADR-014 — E2E flakiness is sometimes the test harness pausing, not the app

**What happened.** AC-002-9 (the coast is observable after release) failed roughly one run in four,
and the maths was never wrong. Under load, Playwright's CDP round trips leave 150–370 ms of genuine
stillness between the last `mouse.move` and `mouse.up`. The implementation was reading that interval
as the release sample, so `dtMs` exceeded the 250 ms release window and the core _correctly_
returned zero velocity: the pointer really had paused before release.

**Decision.** Sample `RecentMovement` as the trailing release window — the position at release
versus the newest sample at or before the window opening — so both ends are exact and the duration
is the window itself, never the scheduler's latency.

**Residual, stated rather than hidden.** Under heavy oversubscription (36 concurrent SwiftShader
tests) the harness can still leave more than 250 ms of real stillness, in which case zero velocity
is the contractually correct answer and the test's premise is void. About 1 run in 20 in that state;
stock settings ran 11/11 green, and CI uses `workers: 1` with one retry.

**The general lesson.** When an e2e test is flaky, the first question is whether the _test_ is
asserting something the application never promised under those conditions. Retrying would have
hidden a real misreading of the contract.
