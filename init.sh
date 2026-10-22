#!/usr/bin/env bash
#
# Initialization step of the harness loop.
#
# One entry point for environment setup, used by humans, agents and CI alike. Before this existed, a
# fresh machine needed someone to remember `npm ci` and `npx playwright install chromium`, and the CI
# workflow listed those steps separately — so local and CI setup could drift apart silently. Same
# argument as `npm run verify`: if setup has two definitions, one of them is wrong.
#
# Idempotent. Safe to run repeatedly, and safe to run first on a clean checkout.
#
#   ./init.sh            install dependencies and browsers, then check the harness
#   ./init.sh --check    verify only, install nothing (a preflight)
#
set -euo pipefail

REQUIRED_NODE_MAJOR=22
CHECK_ONLY=0
FAILURES=0

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")"

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m\xe2\x9c\x93\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m\xe2\x9c\x97\033[0m %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
note() { printf '    %s\n' "$1"; }

# -- 1. prerequisites ------------------------------------------------------------------------
say "1. Prerequisites"

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$node_major" -ge "$REQUIRED_NODE_MAJOR" ]; then
    ok "node $(node -v)"
  else
    bad "node $(node -v) is too old; this project requires >= ${REQUIRED_NODE_MAJOR}"
    note "package.json declares engines.node >=${REQUIRED_NODE_MAJOR}"
  fi
else
  bad "node is not installed"
fi

if command -v npm >/dev/null 2>&1; then ok "npm $(npm -v)"; else bad "npm is not installed"; fi
if command -v git >/dev/null 2>&1; then ok "git $(git --version | awk '{print $3}')"; else bad "git is not installed"; fi

if [ "$FAILURES" -ne 0 ]; then
  printf '\n\033[31mPrerequisites are not satisfied. Nothing was installed.\033[0m\n'
  exit 1
fi

# -- 2. dependencies -------------------------------------------------------------------------
say "2. Dependencies"

if [ "$CHECK_ONLY" -eq 1 ]; then
  if [ -d node_modules ]; then
    ok "node_modules present (--check: not reinstalling)"
  else
    bad "node_modules missing - run ./init.sh without --check"
  fi
elif [ -f package-lock.json ]; then
  # npm ci is exact and reproducible, and it is what CI runs. That sameness is the point.
  npm ci --no-audit --no-fund
  ok "dependencies installed from package-lock.json (npm ci)"
else
  npm install --no-audit --no-fund
  ok "dependencies installed (no lockfile found, used npm install)"
fi

# -- 3. browsers -----------------------------------------------------------------------------
say "3. Playwright browser"

# The e2e suite drives real WebGL through headless Chromium with SwiftShader. Without this the first
# e2e run fails on a missing browser rather than on anything to do with the code.
if [ "$CHECK_ONLY" -eq 1 ]; then
  if npx --no-install playwright install --dry-run chromium >/dev/null 2>&1; then
    ok "chromium available (--check: not installing)"
  else
    bad "chromium not installed - run ./init.sh without --check"
  fi
elif [ -n "${CI:-}" ]; then
  npx playwright install --with-deps chromium
  ok "chromium installed with system dependencies (CI)"
else
  npx playwright install chromium
  ok "chromium installed"
fi

# -- 4. harness integrity --------------------------------------------------------------------
# The harness is a guarantee only while it is actually present. A partial checkout, a botched merge
# or a deleted hook would otherwise surface much later as "the gates passed".
say "4. Harness integrity"

required_files=(
  AGENTS.md
  CLAUDE.md
  claude-progress.md
  .claude/settings.json
  .claude/hooks/guard-protected-paths.mjs
  .claude/hooks/stop-gate.mjs
  .claude/skills/feature/SKILL.md
  .claude/agents/test-author.md
  .claude/agents/implementer.md
  scripts/verify.mjs
  scripts/protected-paths.mjs
  scripts/check-ac-traceability.mjs
  scripts/check-core-purity.mjs
  scripts/check-coverage-policy.mjs
  scripts/check-protected-paths.mjs
  scripts/check-progress.mjs
  scripts/record-progress.mjs
  scripts/spec-status.mjs
  scripts/gate-red.mjs
  .github/workflows/ci.yml
)

missing=0
for f in "${required_files[@]}"; do
  if [ ! -f "$f" ]; then bad "missing: $f"; missing=$((missing + 1)); fi
done
if [ "$missing" -eq 0 ]; then ok "all ${#required_files[@]} harness files present"; fi

syntax_bad=0
for f in .claude/hooks/*.mjs scripts/*.mjs; do
  if ! node --check "$f" 2>/dev/null; then bad "syntax error: $f"; syntax_bad=$((syntax_bad + 1)); fi
done
if [ "$syntax_bad" -eq 0 ]; then ok "hooks and gate scripts parse"; fi

for f in .claude/settings.json package.json; do
  if node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null; then
    ok "$f is valid JSON"
  else
    bad "$f is not valid JSON"
  fi
done

# Every hook settings.json references must exist, or it fails silently at runtime.
hooks_missing=0
while IFS= read -r hook; do
  [ -z "$hook" ] && continue
  if [ ! -f "$hook" ]; then
    bad "settings.json references a missing hook: $hook"
    hooks_missing=$((hooks_missing + 1))
  fi
done < <(node -e '
  const s = JSON.parse(require("fs").readFileSync(".claude/settings.json", "utf8"));
  const out = new Set();
  for (const entries of Object.values(s.hooks ?? {})) {
    for (const entry of entries) {
      for (const h of entry.hooks ?? []) {
        const m = /\$CLAUDE_PROJECT_DIR\/([^"\s]+)/.exec(h.command ?? "");
        if (m) out.add(m[1]);
      }
    }
  }
  console.log([...out].join("\n"));
' 2>/dev/null)
if [ "$hooks_missing" -eq 0 ]; then ok "every hook referenced by settings.json exists"; fi

# -- 5. state --------------------------------------------------------------------------------
say "5. Harness state"

if [ -f .harness/locked ]; then
  ok "protected-path lock is ARMED - specs/, scripts/, hooks and CI config are read-only"
else
  printf '  \033[33m!\033[0m protected-path lock is NOT armed; harness paths are writable\n'
  note "arm it by creating the file .harness/locked (see docs/HARNESS.md)"
fi

printf '\n  Specifications:\n'
for f in specs/SPEC-*.md; do
  id="$(sed -n 's/^id: *//p' "$f" | head -1)"
  st="$(sed -n 's/^status: *//p' "$f" | head -1)"
  ti="$(sed -n 's/^title: *//p' "$f" | head -1)"
  printf '    %-10s %-14s %s\n' "$id" "[$st]" "$ti"
done

# -- summary ---------------------------------------------------------------------------------
if [ "$FAILURES" -ne 0 ]; then
  printf '\n\033[31mInitialization finished with %d problem(s).\033[0m\n' "$FAILURES"
  exit 1
fi

printf '\n%s\n' "Initialization complete."
printf '%s\n' ""
printf '%s\n' "  npm run verify      every quality gate - the definition of done"
printf '%s\n' "  npm run dev         the application"
printf '%s\n' "  /feature SPEC-00X   implement one spec through the test-first loop"
printf '%s\n' ""
printf '%s\n' "Read AGENTS.md before your first edit."
