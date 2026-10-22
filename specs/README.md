# Specifications

Specs are the contract between the human and the agents. They are **read-only for agents** —
enforced by a PreToolUse hook and by a CI job. An agent that finds a spec wrong or impossible must
stop and report it, never edit or reinterpret it.

## Format

Every spec is a Markdown file `SPEC-<nnn>-<slug>.md` with YAML frontmatter:

```yaml
---
id: SPEC-001
title: Rotation core
status: planned # planned | in-progress | done
---
```

`status` controls gate enforcement:

| status        | `gate:ac-trace` behaviour                                       |
| ------------- | --------------------------------------------------------------- |
| `planned`     | criteria not yet enforced (spec is a promise, not a commitment) |
| `in-progress` | every criterion must be cited by at least one test              |
| `done`        | same as `in-progress`                                           |

Only a human changes `status`. The `/feature` flow flips a spec to `in-progress` at the start of
work, which is what arms its gate.

## Acceptance criteria

Each criterion gets a stable ID — `AC-<spec number>-<criterion number>` — and is written as a single
**observable assertion**, not a description of intent. "Rotation is smooth" is not a criterion;
"angular velocity magnitude decays below 1e-4 rad/ms within 2000 ms and is then exactly 0" is.

IDs are immutable. Never renumber. To retire a criterion, mark it `~~AC-001-4~~ (withdrawn)` and
leave the number dead.

## Traceability

Every test cites the criteria it covers in its title:

```ts
it('[AC-001-3] keeps the orientation quaternion normalized', () => {
  /* ... */
});
```

`npm run gate:ac-trace` then fails on:

- **orphan AC** — an active criterion no test cites;
- **phantom ID** — a test citing a criterion that does not exist.

### Known limitation

This gate proves a test _exists_ for each criterion. It cannot prove the test _asserts anything
meaningful_ — `it('[AC-001-3] ...', () => {})` would satisfy it. Mutation testing (Stryker over
`src/core`) is the named next step; see `ROADMAP.md`.
