# AGENTS.md — rules of this repository

This file is the single source of truth for every agent working here, regardless of runner
(Claude Code, Codex, Aider, CI). `CLAUDE.md` only points here. Read this fully before your first
edit.

## 1. What this project is

A browser 3D Object Inspector: an arbitrary 3D object the user rotates interactively. The
application is deliberately small. The engineering value is in the harness: specs, gates and
feedback loops.

## 2. The two layers — and the one rule you must never break

| Layer           | Paths                                                                                                                                                                                             | Who may write |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **Harness**     | `AGENTS.md`, `CLAUDE.md`, `specs/**`, `.claude/**`, `scripts/**`, `.github/**`, `.harness/**`, `tsconfig*.json`, `eslint.config.*`, `vitest.config.*`, `playwright.config.*`, `package-lock.json` | Humans only   |
| **Application** | `src/**`, `tests/**`                                                                                                                                                                              | Agents        |

**`specs/**` is read-only for you.** If a spec is wrong, incomplete or impossible, **stop and say
so** in your final message. Never edit a spec, never work around one, never silently reinterpret
one. Writes to harness paths are denied by a PreToolUse hook (both Edit-family tools and Bash) and
independently by a CI job. Attempting to bypass the guard is a failure, not a workaround.

## 3. Architecture

```
src/core/      pure TypeScript. NO imports of three, react, react-dom, @react-three/*,
               and NO DOM/browser globals (window, document, navigator, performance, requestAnimationFrame).
               Rotation maths, input mapping, damping. Pure functions over immutable state.
src/app/       React + @react-three/fiber render shell. Thin. Holds no business logic.
src/testing/   the deterministic E2E seam (window.__inspector__). Dev/test builds only.
tests/unit/    Vitest. Mirrors src/ structure.
tests/e2e/     Playwright. Behaviour via the seam, never pixel comparison.
```

Why: `src/core` is deterministic and framework-free, so it is unit-tested to 100% with a fixed `dt`
and no WebGL. **Any logic you can express without React or three.js belongs in `src/core`.** This is
enforced by ESLint `no-restricted-imports` and `scripts/check-core-purity.mjs` — both gates, not
suggestions.

### Core conventions

- Pure functions only in `src/core`: take state, return new state. No mutation, no module-level
  mutable state, no `Date.now()`, no randomness, no I/O.
- Time is always an explicit `dtMs: number` parameter. Never read a clock inside `src/core`.
- `export type` for types; `verbatimModuleSyntax` is on, so use `import type` for type-only imports.
- No `any` — it is an ESLint error. No `as` casts to dodge a type error; fix the type.
- No `@ts-expect-error` / `eslint-disable` without a comment explaining why, and never to silence a
  gate.
- Vitest globals are off: `import { describe, it, expect } from 'vitest'`.

## 4. Specs are the contract

Specs live in `specs/` and carry acceptance criteria with stable IDs: `AC-001-3` = spec 001,
criterion 3. Every test cites the IDs it covers in its title:

```ts
it('[AC-001-3] damps angular velocity to zero within 2s', () => {
  /* ... */
});
```

`npm run gate:ac-trace` fails on:

- **orphan AC** — an active spec's criterion with no test citing it;
- **phantom ID** — a test citing an AC that does not exist.

A spec's frontmatter `status:` controls enforcement: `planned` specs are not enforced,
`in-progress` and `done` specs are. Only a human changes `status`.

Read `specs/README.md` for the format.

## 5. The loop

Work happens via the `/feature <SPEC-ID>` flow, which is test-first and verified as such:

1. Tests are written first, citing the AC IDs, and **committed on their own**.
2. `npm run gate:red` asserts those tests genuinely fail — a test that passes before any
   implementation exists is not a test.
3. Implementation follows until `npm run verify` is green, then a second commit.

Consequences for you:

- **test-author role:** write tests under `tests/`. Do not touch `src/`. Do not write implementation
  "to make them pass" — failing is the expected outcome of your step.
- **implementer role:** write code under `src/`. **Do not touch `tests/`.** If a test looks wrong,
  stop and report it; weakening or deleting a committed test is the single worst thing you can do
  here, and it shows up as a diff on an already-committed file.

## 5a. Recording what the run learned

`claude-progress.md` is the project's durable memory. A subagent's report lives only in the
orchestrator's context: compact the context or end the session and every finding is gone. Specs say
what must be true, git says what changed — neither records what was _learned on the way_.

At the end of a `/feature` run, after the push:

```bash
node scripts/record-progress.mjs --spec SPEC-00X --notes "..."
```

The log is a protected path, so this script is the only way to write it, and it is **append-only** —
it refuses any write that would alter an existing entry. It fills in the commits, files and gate
results itself by measuring them, so an entry cannot claim green while red. You supply only the part
no diff can reconstruct:

- findings a future reader could not get from the code,
- decisions you made where the spec was silent,
- anything you left open or unresolved.

An entry with no notes is refused. `gate:progress` fails if a spec reached `done` without one.

## 6. Definition of done

A change is done only when **all** of these pass:

```bash
npm run verify     # every gate, same locally and in CI
```

which is: `typecheck` · `lint` · `format` · `test:unit` · `gate:coverage-policy` ·
`gate:ac-trace` · `gate:progress` · `gate:core-purity` · `test:e2e`.

Coverage is governed by an explicit per-directory policy, not one global number: `src/core` must be
at 100% on every metric, while `src/app` and `src/testing` are verified through E2E instead. A new
directory under `src/` with no declared policy fails the gate — untested code cannot arrive
unnoticed.

Fast inner loop, used by the Stop hook: `npm run verify:fast` (typecheck + lint + unit).

Never report work as complete on the strength of a partial run. If a gate is red and you cannot fix
it, say exactly which gate and why.

## 7. 3D testing rules

WebGL pixels are not a test surface. `src/testing/seam.ts` exposes `window.__inspector__` in
dev/test builds only:

```ts
window.__inspector__ = { getRotation(), getFrameCount() }
```

E2E asserts observable behaviour through that seam — a drag changes rotation by the expected sign
and magnitude, the frame counter advances — plus a canvas blank-check against total render failure.
Do not add screenshot comparison; it is deliberately deferred (see `specs/ROADMAP.md`).

## 8. Commits

Conventional commits, scoped to the spec:

```
test(SPEC-001): add failing specs for rotation core
feat(SPEC-001): implement quaternion rotation with inertia damping
```

Never `git commit --no-verify`. Never `git push --force`. Never `vitest -u` to bulk-update
snapshots.

## 9. Commands

| Command                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | dev server                                           |
| `npm run verify`       | **all gates — the definition of done**               |
| `npm run verify:fast`  | typecheck + lint + unit                              |
| `npm run typecheck`    | `tsc --noEmit`                                       |
| `npm run lint`         | ESLint                                               |
| `npm run format:write` | Prettier write (use this to fix `format` failures)   |
| `npm run test:unit`    | Vitest + coverage                                    |
| `npm run test:e2e`     | Playwright                                           |
| `npm run gate:red`     | asserts unit tests currently FAIL (test-first check) |
