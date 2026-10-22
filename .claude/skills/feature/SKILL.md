---
name: feature
description: Implement one spec end to end through the test-first harness loop — arm the spec, author failing tests, prove them red, commit, implement to green, verify, commit, push. Use when asked to implement, build or finish a SPEC-xxx.
---

# /feature <SPEC-ID>

Implement exactly one spec, test-first, with every transition verified rather than asserted.

Usage: `/feature SPEC-001`

## Rules for this flow

- One spec per run. Do not drift into another spec's criteria, even if they look adjacent.
- You orchestrate; the subagents do the writing. Do not write tests or implementation yourself —
  the separation between `test-author` and `implementer` is what stops implementation code from
  quietly editing the tests that judge it.
- If any step cannot be completed honestly, **stop and report**. Never weaken a test, a type, a
  threshold or a spec to move forward.

## Steps

### 1. Read the spec

Read `specs/SPEC-<id>-*.md` in full, plus `AGENTS.md` if not already in context. List the
acceptance-criteria IDs it defines. If a criterion is ambiguous, contradictory or untestable, stop
here and say which one and why — `specs/**` is read-only and you must not reinterpret it.

### 2. Arm the spec

```bash
node scripts/spec-status.mjs SPEC-<id> in-progress
```

This is a ratchet: it only moves a spec forwards, and it arms `gate:ac-trace` over every criterion
in that spec. From this point, a missing test is a build failure.

### 3. Author the failing tests (red)

Delegate to the **test-author** subagent. Give it: the spec path, the full criteria list, and the
instruction to write tests under `tests/` only, each title citing its AC IDs.

Then prove the suite is genuinely red:

```bash
npm run gate:red     # passes only if the unit suite FAILS
```

A green suite here means the tests assert nothing, or were written against code that already
exists. Either way, send it back to test-author — do not proceed.

### 4. Commit the tests alone

```bash
git add tests/ specs/
git commit -m "test(SPEC-<id>): add failing specs for <short description>"
```

Tests go in their own commit **before** any implementation. This is what makes later
test-weakening visible: it shows up as a diff against an already-committed file rather than hiding
inside one large commit.

### 5. Implement to green

Delegate to the **implementer** subagent. Give it: the spec path, the committed test files, and the
layering rules from `AGENTS.md` §3. It writes under `src/` only.

### 6. Verify

```bash
npm run verify
```

All of it — typecheck, lint, format, unit + coverage thresholds, ac-trace, core-purity, e2e. Not a
subset. `npm run format:write` fixes formatting failures. If a gate stays red, loop back to step 5
with the failure output; if it cannot go green without touching a test or a spec, stop and report.

### 7. Commit, close the spec, push

```bash
node scripts/spec-status.mjs SPEC-<id> done
git add src/ tests/ specs/
git commit -m "feat(SPEC-<id>): <short description>"
git push origin main
```

Push after every spec, so the repository is demo-ready at all times.

### 8. Report

State: the criteria now covered, the files added or changed, the final `verify` summary, and
anything you had to stop on.
