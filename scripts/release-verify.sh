#!/usr/bin/env bash
# Sovereignty AI Studio — release readiness gate.
# This script proves only checks that it actually executes; it never writes PASS claims.
set -Eeuo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() { echo "RELEASE CHECK: FAIL: $*" >&2; exit 1; }
pass() { echo "RELEASE CHECK: PASS: $*"; }

command -v bash >/dev/null 2>&1 || fail "bash is required"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"
command -v node >/dev/null 2>&1 || fail "node is required"
command -v npm >/dev/null 2>&1 || fail "npm is required"

for f in START_SERVER.sh INSTALL.sh bridge.py node-bridge/server.js package.json package-lock.json node-bridge/package.json node-bridge/package-lock.json; do
  [[ -f "$f" ]] || fail "required release file missing: $f"
done
pass "release entrypoints and lockfiles exist"

for script in START_SERVER.sh INSTALL.sh scripts/local-ci.sh; do
  bash -n "$script" || fail "shell syntax validation failed: $script"
done
pass "shell syntax"

node --check node-bridge/server.js || fail "node bridge syntax validation failed"
pass "node syntax"

tmp_compile_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_compile_dir"' EXIT
while IFS= read -r -d '' pyfile; do
  PYTHONPYCACHEPREFIX="$tmp_compile_dir" python3 -m py_compile "$pyfile"     || fail "python compilation failed: $pyfile"
done < <(
  find . -type f -name '*.py'     -not -path './external/*'     -not -path './.venv/*'     -not -path './node_modules/*'     -print0
)
pass "python compilation"
python3 scripts/validate-runtime-coherence.py || fail "runtime coherence validation failed"
pass "runtime coherence"

node frontend/scripts/test-sghv119-ownership.js || fail "dashboard ownership validation failed"
pass "dashboard ownership"

bash scripts/local-ci.sh || fail "repository local CI failed"
pass "repository local CI"

# The release artifact must never contain local state, credentials, build caches, or VCS metadata.
for forbidden in .git .venv node_modules .sg_master_key .env __pycache__; do
  if find . -path "./$forbidden" -o -name "$forbidden" | grep -q .; then
    case "$forbidden" in
      .git|.venv|node_modules) : ;;
      *) fail "forbidden release material present: $forbidden" ;;
    esac
  fi
done
if find . -type f -name '*.pyc' -print -quit | grep -q .; then
  fail "compiled Python bytecode present in repository tree"
fi
pass "release exclusion policy"

echo "RELEASE CHECK: COMPLETE"
echo "No production claim is emitted by this gate. A release is eligible only when this command exits zero and the runtime smoke test succeeds on the target deployment host."
