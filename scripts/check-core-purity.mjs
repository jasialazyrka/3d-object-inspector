#!/usr/bin/env node
/**
 * Gate: src/core must stay framework-free and deterministic.
 *
 * ESLint's no-restricted-imports covers the import side; this script is the independent backstop
 * and additionally bans non-deterministic globals, which is what actually keeps the 100%-coverage
 * unit tests reproducible.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const CORE_DIR = 'src/core';

const BANNED_IMPORTS = [
  /^three(\/|$)/,
  /^react(-dom)?(\/|$)/,
  /^@react-three\//,
  /^@testing-library\//,
  /^\.\.\/(app|testing)(\/|$)/,
];

const BANNED_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'performance',
  'requestAnimationFrame',
  'fetch',
  'Math.random',
  'Date.now',
  'process',
  'globalThis',
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const files = walk(CORE_DIR);
const violations = [];

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '');
    if (/^\s*\*/.test(raw) || /^\s*\/\//.test(raw)) return;

    const imp = /\b(?:import|export)\b[\s\S]*?from\s*['"]([^'"]+)['"]/.exec(line);
    const dyn = /\brequire\s*\(\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/.exec(line);
    const source = imp?.[1] ?? dyn?.[1] ?? dyn?.[2];
    if (source && BANNED_IMPORTS.some((re) => re.test(source))) {
      violations.push({ file, line: i + 1, what: `imports "${source}"` });
    }

    for (const g of BANNED_GLOBALS) {
      const re = g.includes('.')
        ? new RegExp(`\\b${g.replace('.', '\\.')}\\b`)
        : new RegExp(`(?<![.\\w$])${g}\\b`);
      if (re.test(line)) violations.push({ file, line: i + 1, what: `uses "${g}"` });
    }
  });
}

console.log(`core-purity: ${files.length} file(s) under ${CORE_DIR}`);

if (violations.length > 0) {
  console.error(`\n${CORE_DIR} must be framework-free and deterministic. Violations:`);
  for (const v of violations) {
    console.error(`  ${relative('.', v.file)}:${v.line}  ${v.what}`);
  }
  console.error(
    `\n${CORE_DIR} is pure logic: no three.js, no React, no DOM, no clock, no randomness.\n` +
      `Time enters as an explicit dtMs parameter. Move rendering or event code to src/app.`,
  );
  process.exit(1);
}
process.exit(0);
