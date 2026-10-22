#!/usr/bin/env node
/**
 * The cleanup step of the /feature loop: persist what this run learned.
 *
 * Why this exists: a subagent's report lives only in the orchestrator's context. Every finding from
 * this project's first four specs — preserveDrawingBuffer, handlers above <Canvas>, CDP latency
 * landing in dtMs — survived only because a human copied it into a commit message by hand. Compact
 * the context or end the session and it is gone. Specs say what must be true; git says what changed;
 * neither records what was learned on the way.
 *
 * Why it is a script and not a file agents edit: claude-progress.md is a protected path, so this is
 * the only sanctioned write — the same shape as scripts/spec-status.mjs. The log is APPEND-ONLY. A
 * progress log an agent can rewrite is a log the inconvenient truth disappears from, which is the
 * same reasoning that puts .harness/locked inside a protected path.
 *
 * The gate result in each entry is measured here, not typed by the agent: the recorder runs the
 * gates itself and embeds what it observed. An entry therefore cannot claim green while red.
 *
 * Usage:
 *   node scripts/record-progress.mjs --spec SPEC-003 --notes "..."
 *   node scripts/record-progress.mjs --spec SPEC-003            # notes on stdin
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const LOG = 'claude-progress.md';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

const specId = arg('spec');
if (!specId || !/^SPEC-\d{3}$/.test(specId)) {
  console.error('Usage: node scripts/record-progress.mjs --spec SPEC-nnn [--notes "..."]');
  console.error('Notes may also be piped on stdin.');
  process.exit(2);
}

let notes = arg('notes');
if (notes === undefined && !process.stdin.isTTY) {
  notes = readFileSync(0, 'utf8').trim();
}
if (!notes) {
  console.error(
    `REFUSED: an entry with no notes is noise.\n` +
      `Record what this run actually learned: findings a future reader could not get from the diff,\n` +
      `decisions you made where the spec was silent, and anything left open.`,
  );
  process.exit(2);
}

// ── spec metadata, read rather than asserted ─────────────────────────────────────────────────
const specFile = git(['ls-files', 'specs'])
  .split('\n')
  .filter((f) => /SPEC-\d{3}-.*\.md$/.test(f))
  .find((f) => new RegExp(`^id:\\s*${specId}\\s*$`, 'm').test(readFileSync(f, 'utf8')));

if (!specFile) {
  console.error(`No spec with id "${specId}" found under specs/`);
  process.exit(2);
}

const specText = readFileSync(specFile, 'utf8');
const status = /^status:\s*(.+)$/m.exec(specText)?.[1].trim() ?? 'unknown';
const title = /^title:\s*(.+)$/m.exec(specText)?.[1].trim() ?? specId;

// ── what actually landed, from git rather than from the agent ────────────────────────────────
const head = git(['rev-parse', '--short', 'HEAD'], 'unknown');
const headSubject = git(['log', '-1', '--pretty=%s'], '');
const commits = git(['log', '--pretty=%h %s', `--grep=${specId}`], '')
  .split('\n')
  .filter(Boolean);
const files = git(['log', '--name-only', '--pretty=format:', `--grep=${specId}`], '')
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f, i, all) => all.indexOf(f) === i)
  .sort();

// ── gates, measured here ─────────────────────────────────────────────────────────────────────
console.log('recording progress: running gates to measure, not to trust...');
const run = spawnSync('node', ['scripts/verify.mjs', '--fast', '--json'], { encoding: 'utf8' });
let gateLine = 'verify:fast could not be run at record time';
let gatesOk = false;
try {
  const report = JSON.parse(run.stdout);
  gatesOk = report.ok === true;
  gateLine = report.results.map((r) => `${r.gate} ${r.status}`).join(' · ');
} catch {
  /* leave the fallback text; never fabricate a result */
}

const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const entry = [
  `## ${now} — ${specId} (${status})`,
  ``,
  `**${title}**`,
  ``,
  `- **HEAD at record time:** \`${head}\` ${headSubject}`,
  `- **Commits for this spec:**`,
  ...(commits.length > 0 ? commits.map((c) => `  - \`${c}\``) : ['  - _(none found)_']),
  `- **Gates measured by the recorder (\`verify:fast\`):** ${gatesOk ? 'GREEN' : 'NOT GREEN'} — ${gateLine}`,
  `- **Files touched across those commits:**`,
  ...(files.length > 0 ? files.map((f) => `  - \`${f}\``) : ['  - _(none found)_']),
  ``,
  `### Notes`,
  ``,
  notes,
  ``,
].join('\n');

const existing = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
if (!existing) {
  console.error(
    `REFUSED: ${LOG} does not exist. It carries a header explaining what the log is for;\n` +
      `this script only appends to it and will not invent one.`,
  );
  process.exit(2);
}

const next = `${existing.replace(/\s*$/, '')}\n\n---\n\n${entry}`;

// Append-only, proven rather than promised: everything already in the file must still be there,
// byte for byte, as a prefix of what we are about to write.
if (!next.startsWith(existing.replace(/\s*$/, ''))) {
  console.error('REFUSED: the write would alter existing entries. This log is append-only.');
  process.exit(1);
}

writeFileSync(LOG, next);
console.log(
  `appended ${specId} entry to ${LOG} (${commits.length} commit(s), ${files.length} file(s))`,
);
if (!gatesOk) {
  console.log('note: the entry records that gates were NOT green at record time.');
}
