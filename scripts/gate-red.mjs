#!/usr/bin/env node
/**
 * Gate: test-first, verified.
 *
 * Run after the test-authoring step and before any implementation. It asserts the new unit tests
 * genuinely FAIL. A test that passes before the code it describes exists is not testing anything —
 * this is the cheapest available guard against hollow tests, and it is why tests are committed in
 * their own commit.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vitest', 'run', '--coverage=false'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status === 0) {
  console.error(
    `\ngate:red FAILED — the unit suite passes, but no implementation exists yet.\n` +
      `Either the new tests assert nothing, or they were written against code already present.\n` +
      `Expected outcome of the test-authoring step is a RED suite.`,
  );
  process.exit(1);
}

console.log(
  `\ngate:red OK — suite is red (exit ${result.status}), as expected before implementation.`,
);
process.exit(0);
