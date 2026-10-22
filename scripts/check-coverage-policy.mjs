#!/usr/bin/env node
/**
 * Gate: coverage policy, declared per directory.
 *
 * Vitest offers one global threshold, which cannot express this project's architecture:
 *
 *   src/core     pure, deterministic, framework-free  -> unit-tested to 100%
 *   src/app      React + three.js render shell        -> verified through Playwright (AGENTS.md §7)
 *   src/testing  the E2E seam itself                  -> verified through Playwright
 *
 * A single global unit-coverage number over all three is meaningless, and an earlier 85% global
 * threshold was literally unsatisfiable: with one unit-coverable function in src/, no conforming
 * implementation could reach it. Vitest's per-glob thresholds were tried next and do not exclude
 * matched files from the global figure in v5.
 *
 * So the policy is stated here instead, and it is stricter than a global number in the way that
 * matters: a NEW directory under src/ with no declared policy FAILS. Untested code cannot arrive
 * unnoticed, and exempting a directory is a visible, reviewable edit to this file rather than a
 * number quietly drifting downwards.
 */
import { readFileSync, existsSync } from 'node:fs';
import { relative, sep } from 'node:path';

const SUMMARY = 'coverage/coverage-summary.json';
const METRICS = ['lines', 'statements', 'functions', 'branches'];

/**
 * Longest matching prefix wins, so `src/app/components` inherits the `src/app` policy.
 * A number means "every metric must be at least this". 'e2e' means "verified by Playwright,
 * not by unit tests" — still reported, never silently dropped.
 */
const POLICY = [
  { prefix: 'src/core', require: 100 },
  { prefix: 'src/app', require: 'e2e' },
  { prefix: 'src/testing', require: 'e2e' },
];

if (!existsSync(SUMMARY)) {
  console.error(
    `coverage-policy: ${SUMMARY} not found.\n` +
      `Run the unit gate first: npm run test:unit (verify.mjs orders these correctly).`,
  );
  process.exit(1);
}

const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
const files = Object.entries(summary).filter(([key]) => key !== 'total');

if (files.length === 0) {
  console.log('coverage-policy: no files in the coverage report — nothing to check');
  process.exit(0);
}

function policyFor(relPath) {
  return POLICY.filter((p) => relPath.startsWith(`${p.prefix}/`)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
}

const rows = [];
const failures = [];
const unpoliced = [];

for (const [absPath, data] of files) {
  const relPath = relative(process.cwd(), absPath).split(sep).join('/');
  const policy = policyFor(relPath);

  if (!policy) {
    unpoliced.push(relPath);
    continue;
  }

  if (policy.require === 'e2e') {
    rows.push({ relPath, policy: 'e2e', detail: 'verified via Playwright' });
    continue;
  }

  const below = METRICS.filter((m) => (data[m]?.pct ?? 0) < policy.require).map(
    (m) => `${m} ${(data[m]?.pct ?? 0).toFixed(2)}%`,
  );

  rows.push({
    relPath,
    policy: `${policy.require}%`,
    detail: below.length === 0 ? 'met' : below.join(', '),
  });
  if (below.length > 0) failures.push({ relPath, require: policy.require, below });
}

const pad = Math.max(...rows.map((r) => r.relPath.length), ...unpoliced.map((u) => u.length), 10);
console.log(`coverage-policy: ${files.length} file(s) in ${SUMMARY}`);
for (const r of rows) {
  console.log(`  ${r.relPath.padEnd(pad)}  ${r.policy.padEnd(4)}  ${r.detail}`);
}

if (unpoliced.length > 0) {
  console.error(`\nNO COVERAGE POLICY for these files:`);
  for (const u of unpoliced) console.error(`  ${u}`);
  console.error(
    `\nEvery directory under src/ needs a declared policy. Add one to POLICY in\n` +
      `scripts/check-coverage-policy.mjs: a number if the code is unit-testable, or 'e2e' if its\n` +
      `behaviour is asserted through Playwright. Exempting code must be a deliberate, reviewable\n` +
      `decision — which is the point of this gate.`,
  );
}

if (failures.length > 0) {
  console.error(`\nBELOW POLICY:`);
  for (const f of failures) {
    console.error(`  ${f.relPath}  requires ${f.require}% — ${f.below.join(', ')}`);
  }
  console.error(
    `\nsrc/core is pure and deterministic, so an untested branch there is an untested branch,\n` +
      `not an environment problem. Add the missing unit tests.`,
  );
}

process.exit(unpoliced.length > 0 || failures.length > 0 ? 1 : 0);
