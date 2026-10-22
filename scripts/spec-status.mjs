#!/usr/bin/env node
/**
 * The only sanctioned way to change a spec status — and the only write into specs/ that needs no
 * human unlock, because it is a **ratchet**:
 *
 *   planned  ->  in-progress  ->  done        (forwards only, never backwards)
 *
 * Why that is safe to leave in agent hands: every forward transition makes the gates STRICTER.
 * Moving a spec to `in-progress` arms gate:ac-trace over all of its criteria. The dangerous
 * direction — disarming a spec by sending it back to `planned` — is refused outright. An agent can
 * commit itself to more work, never less.
 *
 * It rewrites exactly one frontmatter line, and aborts if anything else about the file would change.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ORDER = ['planned', 'in-progress', 'done'];
const [specId, nextStatus] = process.argv.slice(2);

if (!specId || !nextStatus) {
  console.error('Expected two arguments: <SPEC-ID> <planned|in-progress|done>');
  process.exit(2);
}
if (!ORDER.includes(nextStatus)) {
  console.error(`Unknown status "${nextStatus}". Expected one of: ${ORDER.join(', ')}`);
  process.exit(2);
}

const file = readdirSync('specs')
  .filter((f) => f.endsWith('.md'))
  .map((f) => join('specs', f))
  .find((f) => new RegExp(`^id:\\s*${specId}\\s*$`, 'm').test(readFileSync(f, 'utf8')));

if (!file) {
  console.error(`No spec with id "${specId}" found in specs/`);
  process.exit(2);
}

const before = readFileSync(file, 'utf8');
const statusLine = /^status:\s*(.+)$/m.exec(before);
if (!statusLine) {
  console.error(`${file} has no "status:" line in its frontmatter`);
  process.exit(2);
}

const current = statusLine[1].trim();
if (current === nextStatus) {
  console.log(`${specId} is already "${nextStatus}" — nothing to do`);
  process.exit(0);
}
if (ORDER.indexOf(nextStatus) < ORDER.indexOf(current)) {
  console.error(
    `REFUSED: ${specId} is "${current}"; moving it back to "${nextStatus}" would disarm its gates.\n` +
      `Status is a ratchet: ${ORDER.join(' -> ')}. Only a human editing the file can undo it.`,
  );
  process.exit(1);
}

const after = before.replace(/^status:\s*.+$/m, `status: ${nextStatus}`);

// Paranoia: prove the only difference is that one line, so this can never grow into a spec editor.
const beforeLines = before.split('\n');
const afterLines = after.split('\n');
const differing = beforeLines.filter((line, i) => line !== afterLines[i]);
if (differing.length !== 1) {
  console.error('REFUSED: the rewrite would change more than the status line. Aborting.');
  process.exit(1);
}

writeFileSync(file, after);
console.log(`${specId}: ${current} -> ${nextStatus}  (${file})`);
console.log('gate:ac-trace now enforces every criterion in this spec.');
