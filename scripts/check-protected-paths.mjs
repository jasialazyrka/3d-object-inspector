#!/usr/bin/env node
/**
 * Gate: no pull request may change harness paths without a human saying so.
 *
 * The PreToolUse hook gives an agent fast feedback, but a hook runs inside the agent's own process
 * and is therefore advisory. This gate is the real guarantee: it runs in CI, outside the agent, and
 * fails any PR touching a protected path unless the PR carries the "harness-change" label.
 *
 * Usage:
 *   node scripts/check-protected-paths.mjs --base origin/main [--labels "a,b"]
 */
import { execFileSync } from 'node:child_process';
import { protectedBy } from './protected-paths.mjs';

const ESCAPE_LABEL = 'harness-change';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const base =
  arg('base') ??
  (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined) ??
  'HEAD~1';

const labels = (arg('labels') ?? process.env.HARNESS_PR_LABELS ?? '')
  .split(',')
  .map((l) => l.trim().toLowerCase())
  .filter(Boolean);

let changed = [];
try {
  const range = git(['rev-parse', '--verify', '--quiet', base]) ? `${base}...HEAD` : null;
  if (!range) {
    console.log(`protected-paths: base ref "${base}" not found — nothing to compare, skipping`);
    process.exit(0);
  }
  changed = git(['diff', '--name-only', range]).split('\n').filter(Boolean);
} catch {
  console.log(`protected-paths: cannot diff against "${base}" — skipping`);
  process.exit(0);
}

const touched = changed
  .map((file) => ({ file, pattern: protectedBy(file) }))
  .filter((x) => x.pattern !== null);

console.log(
  `protected-paths: ${changed.length} changed file(s) vs ${base}, ` +
    `${touched.length} protected, labels: [${labels.join(', ') || 'none'}]`,
);

if (touched.length === 0) process.exit(0);

if (labels.includes(ESCAPE_LABEL)) {
  console.log(`\nLabel "${ESCAPE_LABEL}" present — harness change authorised by a human:`);
  for (const t of touched) console.log(`  ${t.file}  (${t.pattern})`);
  process.exit(0);
}

console.error(`\nThis change touches harness paths, which agents may not modify:`);
for (const t of touched) console.error(`  ${t.file}  (protected by ${t.pattern})`);
console.error(
  `\nThe harness is the contract the work is judged against; code cannot move its own goalposts.\n` +
    `If the change is intentional, a human adds the "${ESCAPE_LABEL}" label to the PR.`,
);
process.exit(1);
