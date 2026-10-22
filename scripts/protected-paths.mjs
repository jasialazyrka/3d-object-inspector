/**
 * The harness lock: paths only a human may change.
 *
 * Shared by three independent enforcement layers so the list exists exactly once:
 *   1. .claude/hooks/guard-protected-paths.mjs  (PreToolUse: Edit-family + Bash)
 *   2. scripts/check-protected-paths.mjs        (CI: fails a PR touching these)
 *   3. .claude/settings.json permissions.deny   (coarse backstop, hand-maintained)
 */

export const PROTECTED_PATTERNS = [
  'AGENTS.md',
  'CLAUDE.md',
  'specs/**',
  '.github/**',
  '.harness/**',
  '.claude/settings.json',
  '.claude/hooks/**',
  '.claude/agents/**',
  '.claude/skills/**',
  'scripts/**',
  'package-lock.json',
  'tsconfig*.json',
  'eslint.config.*',
  'prettier.config.*',
  'vite.config.*',
  'vitest.config.*',
  'playwright.config.*',
];

export const OVERRIDE_ENV = 'HARNESS_ALLOW_PROTECTED';

/** True when the human has explicitly unlocked the harness for this process. */
export function isOverridden(env = process.env) {
  return env[OVERRIDE_ENV] === '1';
}

function globToRegExp(glob) {
  let out = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if ('.?+^$(){}[]|\\/'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return new RegExp(`${out}$`);
}

const COMPILED = PROTECTED_PATTERNS.map((pattern) => ({ pattern, re: globToRegExp(pattern) }));

/** Normalise an absolute, ./-prefixed or backslashed path to a repo-relative POSIX path. */
export function toRepoRelative(candidate, repoRoot) {
  let p = String(candidate).trim().replace(/\\/g, '/');
  const root = String(repoRoot).replace(/\\/g, '/').replace(/\/$/, '');
  if (p.startsWith(`${root}/`)) p = p.slice(root.length + 1);
  p = p.replace(/^\.\//, '').replace(/^\/+/, '');
  return p;
}

/** The pattern that protects this repo-relative path, or null. */
export function protectedBy(relPath) {
  const p = toRepoRelative(relPath, '');
  const hit = COMPILED.find(({ re }) => re.test(p));
  return hit ? hit.pattern : null;
}

export function isProtected(relPath) {
  return protectedBy(relPath) !== null;
}
