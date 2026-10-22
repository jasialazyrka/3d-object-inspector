# CLAUDE.md

The rules for this repository live in **[AGENTS.md](./AGENTS.md)** — read it before your first edit.
It is runner-agnostic on purpose; this file exists only to point there.

Two things that matter most, repeated here because they are absolute:

1. **`specs/**` and every other harness path are read-only for agents.** If a spec is wrong, stop
   and say so. Do not edit it, do not work around it.
2. **`npm run verify` is the definition of done.** Not a subset of it.
