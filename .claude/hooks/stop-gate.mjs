#!/usr/bin/env node
/**
 * Stop hook: an agent may not declare itself finished while the gates are red.
 *
 * Phase-aware, because the loop is test-first: during the red phase a failing unit suite is the
 * expected outcome, so only typecheck and lint run.
 *
 * The phase is **inferred from git, not declared**, and that is what makes it unspoofable. A
 * "phase: red" marker file would simply hand the agent a switch for turning off its own gate.
 * Instead:
 *
 *   red   = the working tree changes tests/ and does NOT change src/   (the test-authoring step)
 *   green = anything else                                              (full fast suite)
 *
 * An agent cannot cheat into the lenient mode, because the only route there is to have written no
 * source code at all — in which case there is nothing to let through.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');

// Set once this hook has already blocked; prevents an infinite stop/continue loop.
if (payload.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? payload.cwd ?? process.cwd();

function changedPaths() {
  const run = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) return [];
  return run.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) =>
      line
        .slice(3)
        .trim()
        .replace(/^.*\s->\s/, ''),
    );
}

const changed = changedPaths();
const touchesTests = changed.some((p) => p.startsWith('tests/'));
const touchesSrc = changed.some((p) => p.startsWith('src/'));
const red = touchesTests && !touchesSrc;

const scripts = red ? ['typecheck', 'lint'] : ['verify:fast'];

const failures = [];
for (const script of scripts) {
  const run = spawnSync('npm', ['run', '-s', script], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) {
    failures.push(`--- npm run ${script} ---\n${(run.stdout ?? '') + (run.stderr ?? '')}`.trim());
  }
}

if (failures.length === 0) process.exit(0);

process.stderr.write(
  `Gates are red — the work is not finished.\n\n${failures.join('\n\n')}\n\n` +
    (red
      ? `Inferred phase: RED (tests/ changed, src/ untouched — the test-first step). A failing unit\n` +
        `suite is expected here, but typecheck and lint must still pass. Fix the test files; do not\n` +
        `touch src/.\n`
      : `Fix these, then confirm with: npm run verify\n` +
        `If a gate is red for a reason you cannot fix, say exactly which gate and why — do not weaken\n` +
        `a test, a type or a spec to get past it.\n`),
);
process.exit(2);
