#!/usr/bin/env node
/**
 * The definition of done: one entry point for every quality gate.
 *
 * Deliberately a plain Node script calling npm scripts rather than hook logic, so the whole harness
 * is portable — any agent runner, or a bare CI job, gets identical enforcement by running
 * `npm run verify`. Hooks only make the same gates fire sooner.
 *
 *   node scripts/verify.mjs          all gates
 *   node scripts/verify.mjs --fast   typecheck + lint + unit (used by the Stop hook)
 *   node scripts/verify.mjs --json   machine-readable summary
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const fast = process.argv.includes('--fast');
const asJson = process.argv.includes('--json');

function walk(dir, test) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, test);
    return test(entry) ? [full] : [];
  });
}

const hasUnitTests = walk('tests/unit', (f) => /\.test\.tsx?$/.test(f)).length > 0;
const hasE2eTests = walk('tests/e2e', (f) => /\.spec\.ts$/.test(f)).length > 0;

/**
 * `skip` exists so Phase 0 — a complete harness with an empty src/ — is honestly green rather than
 * green because the gates were weakened. A skipped gate is reported as SKIP, never as PASS.
 */
const GATES = [
  // typecheck is never skipped: the build configs are themselves TypeScript, so tsc always has
  // something to check even before src/ exists.
  { name: 'typecheck', script: 'typecheck' },
  { name: 'lint', script: 'lint' },
  { name: 'format', script: 'format', fast: false },
  {
    name: 'test:unit',
    script: 'test:unit',
    skip: !hasUnitTests ? 'no unit tests yet' : null,
  },
  { name: 'ac-trace', script: 'gate:ac-trace', fast: false },
  { name: 'core-purity', script: 'gate:core-purity', fast: false },
  {
    name: 'test:e2e',
    script: 'test:e2e',
    fast: false,
    skip: !hasE2eTests ? 'no e2e tests yet' : null,
  },
];

const selected = GATES.filter((g) => (fast ? g.fast !== false : true));
const results = [];

for (const gate of selected) {
  if (gate.skip) {
    results.push({ gate: gate.name, status: 'SKIP', ms: 0, reason: gate.skip });
    if (!asJson) console.log(`\n=== ${gate.name}: SKIP (${gate.skip}) ===`);
    continue;
  }
  if (!asJson) console.log(`\n=== ${gate.name} ===`);
  const started = Date.now();
  const run = spawnSync('npm', ['run', '-s', gate.script], {
    stdio: asJson ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
  });
  results.push({
    gate: gate.name,
    status: run.status === 0 ? 'PASS' : 'FAIL',
    ms: Date.now() - started,
    ...(run.status === 0
      ? {}
      : { output: asJson ? String(run.stdout ?? '') + String(run.stderr ?? '') : undefined }),
  });
}

const failed = results.filter((r) => r.status === 'FAIL');

if (asJson) {
  console.log(
    JSON.stringify({ mode: fast ? 'fast' : 'full', ok: failed.length === 0, results }, null, 2),
  );
} else {
  const pad = Math.max(...results.map((r) => r.gate.length));
  console.log(`\n${'─'.repeat(pad + 24)}`);
  console.log(`verify (${fast ? 'fast' : 'full'})`);
  console.log('─'.repeat(pad + 24));
  for (const r of results) {
    const mark = { PASS: '✓', FAIL: '✗', SKIP: '–' }[r.status];
    const detail = r.status === 'SKIP' ? r.reason : `${(r.ms / 1000).toFixed(1)}s`;
    console.log(`  ${mark} ${r.gate.padEnd(pad)}  ${r.status.padEnd(4)}  ${detail}`);
  }
  console.log('─'.repeat(pad + 24));
  console.log(
    failed.length === 0
      ? `ALL GATES GREEN${results.some((r) => r.status === 'SKIP') ? ' (some skipped — see above)' : ''}`
      : `FAILED: ${failed.map((r) => r.gate).join(', ')}`,
  );
}

process.exit(failed.length === 0 ? 0 : 1);
