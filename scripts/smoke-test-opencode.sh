#!/usr/bin/env bash
# smoke-test-opencode.sh — End-to-end smoke test for oh-my-sdd OpenCode plugin.
#
# Installs the plugin to a temp HOME, runs all hooks, tests disable/enable,
# uninstalls, and cleans up. Manual diagnostic tool — NOT for CI.
#
# Usage:
#   ./scripts/smoke-test-opencode.sh
#
# Exit: 0 = all checks passed, non-zero = first failure.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_HOME="$(mktemp -d)"
export HOME="$TEMP_HOME"
export CLAUDE_PLUGIN_ROOT="$ROOT_DIR"

PASS=0
FAIL=0

pass() { echo "  ✓ PASS: $1"; ((PASS++)) || true; }

fail() { echo "  ✗ FAIL: $1"; ((FAIL++)) || true; }

cleanup() {
  rm -rf "$TEMP_HOME"
  echo ""
  echo "════════════════════════════════════"
  echo "  Passed: $PASS   Failed: $FAIL"
  echo "════════════════════════════════════"
}
trap cleanup EXIT

OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
OPENCODE_CONFIG_JSON="$OPENCODE_CONFIG_DIR/opencode.json"

echo ""
echo "═══ Step 1: Install (oms-install --tool opencode) ═══"

if node "$ROOT_DIR/bin/oms-install.js" --tool opencode 2>&1; then
  pass "install.js exited 0"
else
  fail "install.js exited non-zero"
  exit 1
fi

echo ""
echo "═══ Step 2: Verify opencode.json plugin entry ═══"

if [[ ! -f "$OPENCODE_CONFIG_JSON" ]]; then
  fail "opencode.json not created at $OPENCODE_CONFIG_JSON"
  exit 1
fi
pass "opencode.json exists"

# Check plugin array contains oh-my-sdd entry
if node -e "
  const c = JSON.parse(require('fs').readFileSync('$OPENCODE_CONFIG_JSON','utf8'));
  const p = c.plugin || [];
  const found = p.some(e => e.includes('oh-my-sdd'));
  process.exit(found ? 0 : 1);
" 2>/dev/null; then
  pass "opencode.json plugin array contains oh-my-sdd"
else
  fail "opencode.json plugin array missing oh-my-sdd entry"
  echo "  Content: $(cat "$OPENCODE_CONFIG_JSON")"
  exit 1
fi

echo ""
echo "═══ Step 3: Verify plugin files ═══"

PLUGIN_DIR="$OPENCODE_CONFIG_DIR/plugins/oh-my-sdd"
if [[ -f "$PLUGIN_DIR/plugin.js" ]]; then
  pass "plugin.js installed"
else
  fail "plugin.js missing at $PLUGIN_DIR/plugin.js"
  exit 1
fi

if [[ -f "$PLUGIN_DIR/hooks/pre-tool-use.js" ]]; then
  pass "hooks/pre-tool-use.js installed"
else
  fail "hooks/pre-tool-use.js missing"
  exit 1
fi

echo ""
echo "═══ Step 4: Simulate hooks (stdin JSON → stdout JSON) ═══"

echo '{"session_id":"smoke-test-001","cwd":"/tmp"}' | \
  node "$ROOT_DIR/hooks/session-start.js" >/dev/null 2>&1
if [[ $? -eq 0 ]]; then
  pass "session-start.js ran without crash"
else
  fail "session-start.js crashed (exit $?)"
fi

echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/smoke.js","content":"// smoke"}}' | \
  node "$ROOT_DIR/hooks/pre-tool-use.js" >/dev/null 2>&1
if [[ $? -eq 0 ]]; then
  pass "pre-tool-use.js (Write) ran without crash"
else
  fail "pre-tool-use.js crashed (exit $?)"
fi

echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/smoke.js","content":"// smoke"}}' | \
  node "$ROOT_DIR/hooks/post-tool-use.js" >/dev/null 2>&1
if [[ $? -eq 0 ]]; then
  pass "post-tool-use.js ran without crash"
else
  fail "post-tool-use.js crashed (exit $?)"
fi

echo '{"session_id":"smoke-test-001","prompt":"<command-name>sdd-spec</command-name> test","cwd":"/tmp"}' | \
  node "$ROOT_DIR/hooks/user-prompt-submit.js" >/dev/null 2>&1
if [[ $? -eq 0 ]]; then
  pass "user-prompt-submit.js ran without crash"
else
  fail "user-prompt-submit.js crashed (exit $?)"
fi

echo '{"session_id":"smoke-test-001","cwd":"/tmp"}' | \
  node "$ROOT_DIR/hooks/session-end.js" >/dev/null 2>&1
if [[ $? -eq 0 ]]; then
  pass "session-end.js ran without crash"
else
  fail "session-end.js crashed (exit $?)"
fi

echo ""
echo "═══ Step 5: Disable (oms-install --tool opencode --disable) ═══"

if node "$ROOT_DIR/bin/oms-install.js" --tool opencode --disable 2>&1; then
  pass "disable exited 0"
else
  fail "disable exited non-zero"
  exit 1
fi

if node -e "
  const c = JSON.parse(require('fs').readFileSync('$OPENCODE_CONFIG_JSON','utf8'));
  const p = c.plugin || [];
  const found = p.some(e => e.includes('oh-my-sdd'));
  process.exit(found ? 1 : 0);
" 2>/dev/null; then
  pass "plugin array no longer contains oh-my-sdd"
else
  fail "plugin array still contains oh-my-sdd after disable"
  exit 1
fi

if node -e "
  const c = JSON.parse(require('fs').readFileSync('$OPENCODE_CONFIG_JSON','utf8'));
  process.exit(c['oh-my-sdd']?.disabled === true ? 0 : 1);
" 2>/dev/null; then
  pass "oh-my-sdd.disabled === true"
else
  fail "oh-my-sdd.disabled not set to true"
  exit 1
fi

echo ""
echo "═══ Step 6: Enable (oms-install --tool opencode --enable) ═══"

if node "$ROOT_DIR/bin/oms-install.js" --tool opencode --enable 2>&1; then
  pass "enable exited 0"
else
  fail "enable exited non-zero"
  exit 1
fi

if node -e "
  const c = JSON.parse(require('fs').readFileSync('$OPENCODE_CONFIG_JSON','utf8'));
  const p = c.plugin || [];
  const found = p.some(e => e.includes('oh-my-sdd'));
  process.exit(found ? 0 : 1);
" 2>/dev/null; then
  pass "plugin array contains oh-my-sdd after re-enable"
else
  fail "plugin array missing oh-my-sdd after re-enable"
  exit 1
fi

if node -e "
  const c = JSON.parse(require('fs').readFileSync('$OPENCODE_CONFIG_JSON','utf8'));
  const disabled = c['oh-my-sdd']?.disabled;
  process.exit(disabled ? 1 : 0);
" 2>/dev/null; then
  pass "oh-my-sdd.disabled cleared"
else
  fail "oh-my-sdd.disabled still truthy after re-enable"
  exit 1
fi

echo ""
echo "═══ Step 7: Uninstall (oms-uninstall --tool opencode) ═══"

if node "$ROOT_DIR/bin/oms-uninstall.js" --tool opencode 2>&1; then
  pass "uninstall exited 0"
else
  fail "uninstall exited non-zero"
  exit 1
fi

if [[ -f "$OPENCODE_CONFIG_JSON" ]]; then
  if node -e "
    const c = JSON.parse(require('fs').readFileSync('$OPENCODE_CONFIG_JSON','utf8'));
    const p = c.plugin || [];
    const found = p.some(e => e.includes('oh-my-sdd'));
    process.exit(found ? 1 : 0);
  " 2>/dev/null; then
    pass "opencode.json clean after uninstall"
  else
    fail "opencode.json still has oh-my-sdd after uninstall"
  fi
else
  pass "opencode.json removed (acceptable)"
fi

echo ""
echo "═══ Smoke test complete ═══"

[[ $FAIL -eq 0 ]]
