#!/usr/bin/env node
/**
 * Stop and SubagentStop hook: an agent may not declare itself finished while the gates are red.
 *
 * Wired to BOTH events. Gating only the main agent left the real risk uncovered — a delegated
 * implementer could stop with a red suite and report success, and nothing but a human reading its
 * report would catch it.
 *
 * Phase-aware, because the loop is test-first: during the red phase a failing unit suite is the
 * expected outcome, so only typecheck and lint run.
 *
 * The phase is **inferred, never declared**, and that is what makes it unspoofable. A "phase: red"
 * marker file would simply hand the agent a switch for turning off its own gate. Instead:
 *
 *   red   = the working tree changes tests/ and not src/        (tests being authored), or
 *           HEAD is a test(...) commit and src/ is unchanged     (tests committed, no impl yet)
 *   green = anything else                                        (full fast suite)
 *
 * An agent cannot cheat into the lenient mode: both routes require that no source code has been
 * written, in which case there is nothing to let through.
 *
 * Note that this gate blocking mid-loop is correct, not noise. If the implementation is incomplete
 * and the suite is red, the work IS unfinished, and saying so is this hook's entire job.
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

function headSubject() {
  const run = spawnSync('git', ['log', '-1', '--pretty=%s'], { cwd: root, encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() : '';
}

const changed = changedPaths();
const touchesTests = changed.some((p) => p.startsWith('tests/'));
const touchesSrc = changed.some((p) => p.startsWith('src/'));

// Tests are committed before any implementation exists (see .claude/skills/feature), so a
// test(...) commit at HEAD with no source changes is a legitimately red state.
const testsJustCommitted = /^test\(/.test(headSubject()) && !touchesSrc;

const red = (touchesTests && !touchesSrc) || testsJustCommitted;

/**
 * During the red phase the tests import modules the implementer has not written yet, so tsc
 * reports TS2307 "cannot find module". Treating that as a failure is what pressures an agent into
 * writing a .d.ts shim to silence it — a shim that then lets typecheck pass on a genuinely
 * unresolvable import for the rest of the project's life.
 *
 * So the red phase tolerates TS2307 and nothing else: a real type error in a test file still
 * blocks, while an import of a planned module does not.
 */
function typecheckAllowingMissingModules(cwd) {
  const run = spawnSync('npm', ['run', '-s', 'typecheck'], { cwd, encoding: 'utf8' });
  if (run.status === 0) return null;

  const output = (run.stdout ?? '') + (run.stderr ?? '');
  const errors = output.split('\n').filter((line) => /error TS\d+:/.test(line));

  /**
   * Two shapes of "the implementer has not written it yet":
   *   TS2307  cannot find module            — the test introduces a NEW module
   *   TS2305  has no exported member        — the test EXTENDS an existing module
   *
   * tsc distinguishes them only by whether the file happens to exist, which is not an
   * architectural signal. Tolerating only TS2307 meant the test-first phase could create a module
   * but never extend one — and it pushed an agent toward splitting a module purely to convert the
   * error code, which would have let a gate choose the file layout. TS2305 is therefore tolerated
   * too, but only when the error names a module under src/.
   *
   * TS2339 ("property does not exist on type") is deliberately NOT tolerated: that is a real type
   * error far more often than it is a test-first artifact.
   */
  const tolerated = (line) =>
    /error TS2307:/.test(line) || (/error TS2305:/.test(line) && /['"][^'"]*src\//.test(line));
  const other = errors.filter((line) => !tolerated(line));

  if (errors.length > 0 && other.length === 0) {
    process.stderr.write(
      `note: typecheck reports ${errors.length} reference(s) to code that does not exist yet\n` +
        `(TS2307/TS2305), expected during the test-first phase. Do NOT add a .d.ts shim and do NOT\n` +
        `restructure modules to change the error code; the implementation will resolve them.\n`,
    );
    return null;
  }
  return `--- npm run typecheck ---\n${output}`.trim();
}

const failures = [];

if (red) {
  const typecheckFailure = typecheckAllowingMissingModules(root);
  if (typecheckFailure !== null) failures.push(typecheckFailure);

  const lint = spawnSync('npm', ['run', '-s', 'lint'], { cwd: root, encoding: 'utf8' });
  if (lint.status !== 0) {
    failures.push(`--- npm run lint ---\n${(lint.stdout ?? '') + (lint.stderr ?? '')}`.trim());
  }
} else {
  const run = spawnSync('npm', ['run', '-s', 'verify:fast'], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) {
    failures.push(`--- npm run verify:fast ---\n${(run.stdout ?? '') + (run.stderr ?? '')}`.trim());
  }
}

if (failures.length === 0) process.exit(0);

process.stderr.write(
  `Gates are red — the work is not finished.\n\n${failures.join('\n\n')}\n\n` +
    (red
      ? `Inferred phase: RED (test-first step: no source changes yet). A failing unit\n` +
        `suite is expected here, but typecheck and lint must still pass. Fix the test files; do not\n` +
        `touch src/.\n`
      : `Fix these, then confirm with: npm run verify\n` +
        `If a gate is red for a reason you cannot fix, say exactly which gate and why — do not weaken\n` +
        `a test, a type or a spec to get past it.\n`),
);
process.exit(2);
