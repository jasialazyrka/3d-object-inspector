# Progress log

Durable memory for this project, appended to at the end of every `/feature` run.

## Why this file exists

A subagent's report lives only in the orchestrator's context. Compact the context or end the session
and every finding is gone. Specs record what must be true. Git records what changed. Neither records
what was **learned on the way** — why a test needed a particular flag, which approach failed first,
what the spec left unsaid and how it was settled.

That gap is a context-management failure, and it was a real one here: the findings from the first
four specs survived only because a human copied them into commit messages by hand.

## How it works

- **Append-only.** Written solely by `scripts/record-progress.mjs`; `claude-progress.md` is a
  protected path, so direct edits are denied by the PreToolUse guard and by CI. The recorder refuses
  any write that would alter an existing entry. A progress log an agent can rewrite is a log the
  inconvenient truth disappears from.
- **Gate results are measured, not typed.** The recorder runs the gates itself and embeds what it
  observed, so an entry cannot claim green while red.
- **Enforced.** `gate:progress` fails if a spec reached `done` without an entry.
- **Notes are mandatory.** An entry with no notes is refused.

### Honest limitation

Like `gate:ac-trace`, this gate proves an entry _exists_. It cannot judge whether the notes are worth
reading. That remains a human review question.

---

## 2026-10-22T18:09:53Z — SPEC-000 (done)

**Foundation — canvas, render loop, test seam**

- **HEAD at record time:** `005b0ad` docs(harness): record the SPEC-003 findings and final scope
- **Commits for this spec:**
  - `6444a6c feat(SPEC-000): static 3D object with a deterministic test seam`
  - `a979dea test(SPEC-000): add failing specs for canvas, render loop and test seam`
  - `4abda5e chore(harness): Phase 0 — specs, gates, guards and CI`
- **Gates measured by the recorder (`verify:fast`):** GREEN — typecheck PASS · lint PASS · test:unit PASS · coverage-policy PASS
- **Files touched across those commits:**
  - `.claude/agents/implementer.md`
  - `.claude/agents/test-author.md`
  - `.claude/hooks/guard-protected-paths.mjs`
  - `.claude/hooks/stop-gate.mjs`
  - `.claude/settings.json`
  - `.claude/skills/feature/SKILL.md`
  - `.github/workflows/ci.yml`
  - `.gitignore`
  - `.harness/locked`
  - `.prettierignore`
  - `.prettierrc.json`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `docs/DECISIONS.md`
  - `docs/HARNESS.md`
  - `eslint.config.js`
  - `index.html`
  - `package-lock.json`
  - `package.json`
  - `playwright.config.ts`
  - `scripts/check-ac-traceability.mjs`
  - `scripts/check-core-purity.mjs`
  - `scripts/check-coverage-policy.mjs`
  - `scripts/check-protected-paths.mjs`
  - `scripts/gate-red.mjs`
  - `scripts/protected-paths.mjs`
  - `scripts/spec-status.mjs`
  - `scripts/verify.mjs`
  - `specs/README.md`
  - `specs/ROADMAP.md`
  - `specs/SPEC-000-foundation.md`
  - `specs/SPEC-001-rotation-core.md`
  - `specs/SPEC-002-pointer-drag.md`
  - `specs/SPEC-003-keyboard-readout.md`
  - `src/app/App.tsx`
  - `src/app/components/Scene.tsx`
  - `src/app/styles.css`
  - `src/main.tsx`
  - `src/testing/seam.ts`
  - `tests/e2e/foundation.spec.ts`
  - `tests/types/pending-src-modules.d.ts`
  - `tests/unit/testing/seam.test.ts`
  - `tsconfig.json`
  - `vite.config.ts`
  - `vitest.config.ts`

### Notes

_Backfilled after the fact: this log was added after SPEC-003, so the first four entries were written
from git history and the subagent reports rather than at the end of each run._

**Findings the diff cannot show:**

- `preserveDrawingBuffer: true` is required on the WebGL context for the blank-canvas check.
  Without it the drawing buffer is cleared after compositing, `gl.readPixels` comes back uniform and
  `canvas.toDataURL()` is blank — the test fails for a reason that looks like a render bug.
- Playwright's `not.toBeEmpty()` is defined on **text** content, and a `<canvas>` contributes none.
  That assertion forced an `<h1>` into the DOM that AC-000-1 never asked for — and the title then
  painted _underneath_ the canvas, invisible to a user, with every gate green. Caught only by looking
  at a screenshot. **Lesson: a test should assert its criterion, not more.**

**Decisions where the spec was silent:**

- Kept the `<h1>` rather than editing the committed test, and fixed its `z-index` separately. Editing
  a committed test to make implementation easier is the pattern the harness exists to prevent, even
  when the test is the thing at fault.
- `StrictMode` deliberately omitted so a double mount cannot produce a second `<canvas>`.

**Harness defects this run exposed:**

- The red-phase gate demanded a clean typecheck while the tests import a module that does not exist
  yet. Unsatisfiable, so the test-author wrote a `.d.ts` shim to silence it — **an impossible gate
  does not stop an agent, it teaches it to cheat.** Shim deleted, gate changed to tolerate TS2307.
- Vite bound IPv6-only while `playwright.config.ts` polled `127.0.0.1`; every cold e2e run died on
  the webServer timeout. Fixed with an explicit `--host 127.0.0.1`.
- The global 85% coverage threshold was **arithmetically unsatisfiable** — it demanded unit coverage
  of a shell verified by Playwright. Replaced with an explicit per-directory policy.
- The 100% threshold on `src/core` was a vitest glob key that matched nothing, so it had been
  **silently inert since the day it was written**. A gate nobody has tested is not a gate.

**Left open:** none for this spec.

---

## 2026-10-22T18:09:57Z — SPEC-001 (done)

**Rotation core — pure quaternion state with inertia damping**

- **HEAD at record time:** `005b0ad` docs(harness): record the SPEC-003 findings and final scope
- **Commits for this spec:**
  - `bdb37cb docs(harness): record what SPEC-001 and SPEC-002 taught`
  - `3a958b5 feat(SPEC-001): pure quaternion rotation core with inertia damping`
  - `6983804 test(SPEC-001): add failing specs for the pure rotation core`
- **Gates measured by the recorder (`verify:fast`):** GREEN — typecheck PASS · lint PASS · test:unit PASS · coverage-policy PASS
- **Files touched across those commits:**
  - `.claude/hooks/stop-gate.mjs`
  - `.harness/locked`
  - `README.md`
  - `docs/DECISIONS.md`
  - `docs/HARNESS.md`
  - `scripts/spec-status.mjs`
  - `specs/SPEC-001-rotation-core.md`
  - `src/core/rotation.ts`
  - `tests/unit/core/rotation.test.ts`

### Notes

_Backfilled after the fact._

**Findings the diff cannot show:**

- The test-author validated all 33 hand-computed constants against a throwaway reference
  implementation **outside the repo** before committing, proving every expected number was
  reachable. This is the cheapest available answer to the hollow-test problem: the implementer then
  works against numbers known to be satisfiable rather than against someone's arithmetic guess.
  Worth repeating on every numeric spec.
- First run where the 100% `src/core` policy actually fired on real code — it had been inert until
  this point, so this spec is also the gate's own first test.

**Decisions where the spec was silent:**

- Composition order inside a single `applyDelta` with both components non-zero is left unpinned:
  AC-001-2 defines only pure-X and pure-Y deltas, and X/Y rotations do not commute. AC-001-4 was
  therefore written relative to `applyDelta` itself rather than to a hand-built quaternion product.
- The exact `magnitude === settleThreshold` boundary is untested: "below" versus "at or below"
  cannot be decided from the spec and the comparison would be float-fragile.

**Harness defects this run exposed:**

- `@typescript-eslint/no-unused-vars` has no `argsIgnorePattern`, so `reset(_state)` — which ignores
  its argument by design, per AC-001-8 — is a lint error. Worked around by declaring `reset` as a
  typed const. The config is the real fix.

**Left open:** the ESLint `argsIgnorePattern` gap. Documented, not fixed.

---

## 2026-10-22T18:10:29Z — SPEC-002 (done)

**Pointer drag with inertia**

- **HEAD at record time:** `005b0ad` docs(harness): record the SPEC-003 findings and final scope
- **Commits for this spec:**
  - `53e6b87 test(SPEC-003): add failing specs for keyboard control, reset and readout`
  - `bdb37cb docs(harness): record what SPEC-001 and SPEC-002 taught`
  - `c24c5df feat(SPEC-002): rotate the object by pointer drag, with inertia on release`
  - `45c8ae5 test(SPEC-002): add failing specs for pointer drag with inertia`
- **Gates measured by the recorder (`verify:fast`):** GREEN — typecheck PASS · lint PASS · test:unit PASS · coverage-policy PASS
- **Files touched across those commits:**
  - `README.md`
  - `docs/DECISIONS.md`
  - `docs/HARNESS.md`
  - `specs/SPEC-002-pointer-drag.md`
  - `specs/SPEC-003-keyboard-readout.md`
  - `src/app/App.tsx`
  - `src/app/components/Scene.tsx`
  - `src/app/hooks/usePointerDrag.ts`
  - `src/app/styles.css`
  - `src/core/input.ts`
  - `src/testing/seam.ts`
  - `tests/e2e/keyboard-readout.spec.ts`
  - `tests/e2e/pointer-drag.spec.ts`
  - `tests/unit/core/input.keyboard.test.ts`
  - `tests/unit/core/input.test.ts`
  - `tests/unit/core/rotation.readout.test.ts`

### Notes

_Backfilled after the fact._

**Findings the diff cannot show:**

- **Pointer handlers must mount above `<Canvas>`, not inside it.** The first attempt attached
  listeners in a `useEffect` inside `Scene` via `gl.domElement`. R3F creates the `<canvas>` element
  several frames _before_ it commits children, so an early `pointerdown` was swallowed and the whole
  gesture lost. The symptom looked like broken rotation maths; it was event timing.
- **The seam returned a hardcoded identity quaternion.** Correct while the object was static in
  SPEC-000, but by this spec it was a trap: every drag assertion would have passed against that
  constant. Green gates, nothing tested. No gate can detect this — a test existed, cited its
  criterion, and the seam was covered. **Observability code is production code.**
- **"Flaky" e2e was the test harness pausing, not the app.** AC-002-9 failed about 1 run in 4. Under
  load, Playwright's CDP round trips leave 150–370 ms of genuine stillness between the last
  `mouse.move` and `mouse.up`; that interval was being read as the release sample, pushing `dtMs`
  past the 250 ms release window, so the core _correctly_ returned zero velocity. Retrying would have
  hidden a real misreading of the contract. Fixed by sampling `RecentMovement` as the trailing
  release window, where both ends are exact.

**Decisions where the spec was silent:**

- AC-002-4 names no function; `dragMove` chosen.
- AC-002-6 says "no recent movement" without a number; defined as a sample of non-positive duration,
  or longer than a 250 ms release window (boundary inclusive), or zero displacement.
- Default sensitivity 0.005 rad/px — not specified anywhere.

**Harness defects this run exposed:**

- `stop-gate` ran on `Stop` only, not `SubagentStop`. The delegated agents — the ones that actually
  write code — were ungated, and could have stopped with a red suite and reported success. Fixed.

**Left open:** a residual flake envelope on AC-002-9 of roughly 1 run in 20 under heavy
oversubscription (36 concurrent SwiftShader tests), where the harness itself pauses longer than the
release window and zero velocity is contractually correct. Documented rather than retried away.

---

## 2026-10-22T18:10:33Z — SPEC-003 (done)

**Keyboard control, reset and degree readout**

- **HEAD at record time:** `005b0ad` docs(harness): record the SPEC-003 findings and final scope
- **Commits for this spec:**
  - `005b0ad docs(harness): record the SPEC-003 findings and final scope`
  - `f36c4c1 feat(SPEC-003): keyboard rotation, reset control and live degree readout`
  - `53e6b87 test(SPEC-003): add failing specs for keyboard control, reset and readout`
- **Gates measured by the recorder (`verify:fast`):** GREEN — typecheck PASS · lint PASS · test:unit PASS · coverage-policy PASS
- **Files touched across those commits:**
  - `README.md`
  - `docs/DECISIONS.md`
  - `docs/HARNESS.md`
  - `specs/SPEC-003-keyboard-readout.md`
  - `src/app/App.tsx`
  - `src/app/components/Hud.tsx`
  - `src/app/components/Scene.tsx`
  - `src/app/hooks/useKeyboardRotation.ts`
  - `src/app/styles.css`
  - `src/core/input.ts`
  - `src/core/rotation.ts`
  - `tests/e2e/keyboard-readout.spec.ts`
  - `tests/unit/core/input.keyboard.test.ts`
  - `tests/unit/core/rotation.readout.test.ts`

### Notes

_First entry written as part of the run it describes, rather than backfilled._

**Findings the diff cannot show:**

- **R3F v9 spreads props onto its wrapper div, not the canvas.** `CanvasProps extends
React.HTMLAttributes<HTMLDivElement>`, so `tabIndex`/`aria-label` passed as props land on the div
  and the e2e assertions against `locator('canvas')` fail — correctly. They have to be set through a
  ref to the real canvas element. A careful reading of the source would have called the prop version
  correct.
- **The HUD needs `pointer-events: none` with `auto` on its controls**, so the button and readout are
  genuinely hit-testable above the canvas while the rest of the viewport stays draggable.
- `toBeVisible()` does **not** check stacking order, which is exactly how the SPEC-000 `<h1>` passed
  every gate while painting under the canvas. The Reset control's visibility is therefore asserted by
  hit-testing its centre with `document.elementFromPoint`, so a repeat of that bug now fails a gate
  instead of needing someone to notice it in a screenshot.

**The most important thing that happened this run:** the test-author hit a gate it could not satisfy
honestly and **refused both available workarounds**. Typecheck failed with six TS2305 "has no
exported member" errors because the tests extend `src/core/input.ts`, and the red phase tolerates
only TS2307. It could have written a `.d.ts` shim, or split the keyboard mapping into a new
`src/core/keyboard.ts` purely to turn a TS2305 into a tolerated TS2307. It reported the gate as
broken instead. The second temptation is the dangerous one because it **would have looked like
architecture rather than evasion** — keyboard mapping is input mapping, and letting an error code
choose the file layout would be the gate winning an argument it has no business in.

**Decisions where the spec was silent:**

- Step size 0.05 rad and a Shift multiplier of exactly 4 — binary-exact, so shifted steps are
  asserted with `toBe` rather than a tolerance.
- `r` handled by a separate `isResetKey` predicate rather than folded into `keyToRotation`, which
  would mean widening that function's return type for one key.
- `Math.round(deg) % 360`, so 359.9 displays as 0 rather than 360 — asserted explicitly per axis.
- `r` treated as a "handled key" for AC-003-8, so it is `preventDefault`ed too.

**Harness defects this run exposed:**

- `scripts/spec-status.mjs` searched every `.md` under `specs/` for the id and matched the **example
  frontmatter inside a fenced code block in `specs/README.md`**, rewriting the documentation instead
  of the spec. Narrowed to `SPEC-nnn-*.md` files and leading frontmatter only. The ratchet's refusal
  to move backwards is what kept this to a mangled comment rather than a silently disarmed spec.
- This log did not exist. The entries above had to be reconstructed from git and the subagent reports
  — which is the failure this file is here to prevent.

**Left open:** the TS2305 gap in the red-phase typecheck allowance. The fix is to tolerate TS2305
where the error names a module under `src/`, but not TS2339 (a missing property on a type is a real
type error far more often than a test-first artifact). Left open deliberately on a deadline; it
blocks only the test-author role, since the implementer works in the green phase where the exports
exist.
