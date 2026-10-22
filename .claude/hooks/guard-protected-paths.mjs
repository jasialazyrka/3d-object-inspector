#!/usr/bin/env node
/**
 * PreToolUse guard: agents may not modify the harness.
 *
 * Covers the Edit family AND Bash, because denying Edit alone is theatre — `sed -i`, a `>`
 * redirection or `git checkout --` would walk straight around it.
 *
 * This hook is the FAST layer. The real guarantee is scripts/check-protected-paths.mjs running in
 * CI, outside the agent's process. Both read the same list from scripts/protected-paths.mjs.
 *
 * ARMING: the lock is inert until a human creates `.harness/locked`. Before that the harness is
 * still being authored and there is no contract to protect. Arming it is deliberately a human act,
 * and deliberately one-way: `.harness/**` is itself a protected path, so once the sentinel exists
 * no agent can Edit, Write, `rm` or `git checkout` it away. This replaces an earlier design where
 * the only unlock was an environment variable — which an agent could, in principle, set itself.
 *
 * Exit 0 = allow, exit 2 = deny with the stderr text fed back to the agent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isOverridden, OVERRIDE_ENV, protectedBy } from '../../scripts/protected-paths.mjs';

const WRITE_COMMANDS = new Set([
  'sed',
  'gsed',
  'tee',
  'mv',
  'cp',
  'rm',
  'truncate',
  'dd',
  'patch',
  'install',
  'ln',
  'touch',
  'chmod',
  'chown',
  'sponge',
  'ed',
  'rsync',
  'shred',
]);

/**
 * Interpreters are not writes in themselves: running `node scripts/verify.mjs` is the whole point
 * of the harness. They become a write vector only through inline code, so that is what they are
 * judged on.
 */
const INTERPRETERS = new Set([
  'node',
  'python',
  'python3',
  'perl',
  'ruby',
  'awk',
  'sh',
  'bash',
  'zsh',
]);
const INLINE_CODE_FLAGS = /(?:^|\s)(?:-e|-c|--eval|--exec|-i)(?:\s|=|$)/;

const GIT_WRITE_SUBCOMMANDS = new Set([
  'checkout',
  'restore',
  'apply',
  'rm',
  'mv',
  'clean',
  'stash',
]);

/** Split on shell separators so each segment's leading command can be identified. */
function segments(command) {
  return command
    .split(/(?:&&|\|\||[;|\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function leadingCommand(segment) {
  const tokens = segment.split(/\s+/).filter(Boolean);
  const assignments = [];
  let i = 0;
  while (
    i < tokens.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || tokens[i] === 'sudo')
  ) {
    if (tokens[i] !== 'sudo') assignments.push(tokens[i]);
    i += 1;
  }
  return { name: (tokens[i] ?? '').replace(/^.*\//, ''), rest: tokens.slice(i + 1), assignments };
}

/**
 * Commands no agent may run here, whichever paths they touch.
 *
 * Each rule is tested against a single shell SEGMENT and only fires when that segment actually
 * starts with the binary concerned. Scanning the whole command string instead would false-positive
 * on any text that merely mentions one of these — a heredoc body or a doc comment is data, not a
 * command.
 */
const FORBIDDEN_COMMANDS = [
  {
    test: ({ name, rest }, seg) =>
      name === 'git' && rest[0] === 'commit' && /(?:--no-verify|\s-n(?:\s|$))/.test(seg),
    why: 'git commit --no-verify skips the gates. The gates are the point.',
  },
  {
    test: ({ name, rest }, seg) =>
      name === 'git' &&
      rest[0] === 'push' &&
      /(?:--force|--force-with-lease|\s-f(?:\s|$))/.test(seg),
    why: 'force-pushing rewrites the history this work is judged by.',
  },
  {
    test: ({ name, rest }, seg) =>
      (name === 'vitest' || (name === 'npx' && rest.includes('vitest'))) &&
      /(?:--update|\s-u(?:\s|$))/.test(seg),
    why: 'bulk snapshot updates make failing tests pass without anyone reading them.',
  },
  {
    test: ({ name, rest }) =>
      name === 'rm' && rest.some((t) => /^-[a-zA-Z]*r[a-zA-Z]*f$|^-[a-zA-Z]*f[a-zA-Z]*r$/.test(t)),
    why: 'recursive force delete. Remove specific files instead.',
  },
  {
    test: ({ name, rest, assignments }) =>
      assignments.some((a) => a.startsWith(`${OVERRIDE_ENV}=`)) ||
      (name === 'export' && (rest[0] ?? '').startsWith(`${OVERRIDE_ENV}=`)),
    why: `${OVERRIDE_ENV} is the human unlock switch. An agent setting it is self-authorisation.`,
  },
];

function deny(reason) {
  process.stderr.write(`BLOCKED by harness guard\n\n${reason}\n`);
  process.exit(2);
}

function pathsInEditTool(input) {
  return [
    input?.file_path,
    input?.notebook_path,
    ...(input?.edits ?? []).map((e) => e?.file_path),
  ].filter((p) => typeof p === 'string' && p.length > 0);
}

/**
 * A heredoc body is data, not command text.
 *
 * The redirection scan below would otherwise fire on any document that merely CONTAINS `> path` —
 * which it did, on a help string inside init.sh that documented how to create `.harness/locked`.
 * Same class of false positive as the one already fixed for FORBIDDEN_COMMANDS: text that mentions
 * a command is not that command.
 *
 * Stripping the body is safe for this check specifically, because a heredoc's own redirection
 * target (`cat > specs/x <<'EOF'`) appears before the `<<` marker and therefore survives.
 */
function stripHeredocBodies(command) {
  return command.replace(
    /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\2[ \t]*$/gm,
    '<<HEREDOC_BODY_STRIPPED',
  );
}

function protectedWritesInBash(command) {
  const hits = [];

  // 1. output redirections: > file, >> file, 2> file, &> file
  for (const m of stripHeredocBodies(command).matchAll(/(?:\d?>>?|&>)\s*['"]?([^\s'"&|;<>]+)/g)) {
    const pattern = protectedBy(m[1]);
    if (pattern) hits.push({ path: m[1], pattern, how: 'shell redirection' });
  }

  // 2. write-capable commands given a protected path as an argument
  for (const segment of segments(command)) {
    const lead = leadingCommand(segment);
    const isGitWrite = lead.name === 'git' && GIT_WRITE_SUBCOMMANDS.has(lead.rest[0] ?? '');
    const isInlineInterpreter = INTERPRETERS.has(lead.name) && INLINE_CODE_FLAGS.test(segment);
    if (!WRITE_COMMANDS.has(lead.name) && !isGitWrite && !isInlineInterpreter) continue;
    for (const token of lead.rest) {
      const cleaned = token.replace(/^['"]|['"]$/g, '');
      if (cleaned.startsWith('-')) continue;
      const pattern = protectedBy(cleaned);
      if (pattern) {
        hits.push({
          path: cleaned,
          pattern,
          how: isInlineInterpreter ? `inline \`${lead.name}\` code` : `\`${lead.name}\``,
        });
      }
    }
  }

  return hits;
}

const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
const tool = payload.tool_name ?? '';
const input = payload.tool_input ?? {};
const root = process.env.CLAUDE_PROJECT_DIR ?? payload.cwd ?? process.cwd();

// Not yet armed by a human: the harness is still being authored.
if (!existsSync(`${root}/.harness/locked`)) process.exit(0);

// The human has explicitly unlocked the harness for this process.
if (isOverridden()) process.exit(0);

const LOCK_EXPLANATION =
  `Harness paths are read-only for agents. specs/ is the contract this work is judged against, and\n` +
  `the scripts, hooks and CI config are the gates that judge it — code cannot move its own goalposts.\n\n` +
  `If a spec is wrong, incomplete or impossible: STOP and say so in your final message. Do not edit\n` +
  `it, do not work around it, and do not reach for another tool. A human will unlock, change it and\n` +
  `relock.\n\n` +
  `Application code belongs in src/** and tests/**, which are yours to write.\n` +
  `To arm a spec for work, use the ratchet script in scripts/ (see AGENTS.md).`;

if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  for (const p of pathsInEditTool(input)) {
    const pattern = protectedBy(p);
    if (pattern)
      deny(`${tool} would write ${p}\n  protected by: ${pattern}\n\n${LOCK_EXPLANATION}`);
  }
  process.exit(0);
}

if (tool === 'Bash') {
  const command = String(input.command ?? '');

  for (const segment of segments(command)) {
    const lead = leadingCommand(segment);
    for (const rule of FORBIDDEN_COMMANDS) {
      if (rule.test(lead, segment)) deny(`This command is not permitted here.\n\n  ${rule.why}`);
    }
  }

  const hits = protectedWritesInBash(command);
  if (hits.length > 0) {
    const detail = hits
      .map((h) => `  ${h.path}  via ${h.how}  (protected by ${h.pattern})`)
      .join('\n');
    deny(`This Bash command would write to harness paths:\n${detail}\n\n${LOCK_EXPLANATION}`);
  }
}

process.exit(0);
