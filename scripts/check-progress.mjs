#!/usr/bin/env node
/**
 * Gate: every finished spec leaves a progress entry.
 *
 * Without this, claude-progress.md is a convention, and conventions are what agents drop first when
 * a run gets long. The gate is what makes the cleanup step part of the harness: a spec can reach
 * `done` only once somebody recorded what the run learned.
 *
 * It deliberately checks only that an entry EXISTS, in the same spirit as gate:ac-trace — and with
 * the same honest limitation: it cannot judge whether the notes are worth reading.
 */
import { existsSync, readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const LOG = 'claude-progress.md';

if (!existsSync(LOG)) {
  console.error(
    `progress: ${LOG} is missing. The progress log is part of the harness, not optional.`,
  );
  process.exit(1);
}

const log = readFileSync(LOG, 'utf8');

const specs = readdirSync('specs')
  .filter((f) => /^SPEC-\d{3}-.*\.md$/.test(f))
  .map((f) => {
    const text = readFileSync(join('specs', f), 'utf8');
    return {
      file: join('specs', f),
      id: /^id:\s*(.+)$/m.exec(text)?.[1].trim() ?? '',
      status: /^status:\s*(.+)$/m.exec(text)?.[1].trim() ?? 'planned',
    };
  })
  .filter((s) => s.id !== '');

// An entry is a heading naming the spec, which is what record-progress.mjs writes.
const recorded = new Set([...log.matchAll(/^##\s+\S+\s+—\s+(SPEC-\d{3})\b/gm)].map((m) => m[1]));

const done = specs.filter((s) => s.status === 'done');
const missing = done.filter((s) => !recorded.has(s.id));

console.log(
  `progress: ${recorded.size} spec(s) recorded in ${LOG}; ` +
    `${done.length} spec(s) done, ${missing.length} without an entry`,
);

if (missing.length > 0) {
  console.error(`\nFINISHED SPECS WITH NO PROGRESS ENTRY:`);
  for (const s of missing) console.error(`  ${s.id}  (${s.file})`);
  console.error(
    `\nRecord it with:\n` +
      `  node scripts/record-progress.mjs --spec ${missing[0].id} --notes "..."\n\n` +
      `The notes are the part no diff can reconstruct: what the run learned, what you decided where\n` +
      `the spec was silent, and what you left open.`,
  );
  process.exit(1);
}
process.exit(0);
