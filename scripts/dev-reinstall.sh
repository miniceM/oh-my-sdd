#!/usr/bin/env bash
# scripts/dev-reinstall.sh — 清掉 Claude Code 的 plugin cache 后重装
#
# 何时用：
#   - 改了 baseline / skills / commands / hook 代码后，需要让 Claude Code 看到新内容
#   - npm uninstall + npm install 不刷新 cache（Claude Code 同版本优化）
#
# 用法：
#   ./scripts/dev-reinstall.sh           # 清 cache + 重装（mock iam 默认开）
#   NOMOCK=1 ./scripts/dev-reinstall.sh  # 不开 mock iam（用真 iam）
#
# 做的事：
#   1. claude plugin uninstall（标记 cache 为 orphan）
#   2. rm -rf ~/.claude/plugins/cache/oh-my-sdd（物理删 orphan）
#   3. npm install -g --foreground-scripts ./cli-tools-oh-my-sdd-0.1.0.tgz
#      （重新打包 + 装到 npm 全局 + 触发 postinstall → claude plugin install）
#
# 然后用 dev-launch-claude.sh 启动 Claude Code 验证。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PLUGIN_CACHE="$HOME/.claude/plugins/cache/oh-my-sdd"
TGZ="$PROJECT_ROOT/cli-tools-oh-my-sdd-0.1.0.tgz"

cd "$PROJECT_ROOT"

echo "→ 1/4 卸载 plugin（让 Claude Code 标记 cache 为 orphan）"
claude plugin uninstall oh-my-sdd@oh-my-sdd 2>&1 | tail -3 || true

echo "→ 2/4 物理删 cache 目录"
if [[ -d "$PLUGIN_CACHE" ]]; then
  rm -rf "$PLUGIN_CACHE"
  echo "  已删 $PLUGIN_CACHE"
else
  echo "  cache 不存在，跳过"
fi

echo "→ 3/4 重新打包 tgz"
npm pack 2>&1 | tail -1

echo "→ 4/4 npm install -g 触发 postinstall"
npm install -g --foreground-scripts "$TGZ" 2>&1 | tail -10

echo ""
echo "✓ 完成。验证："
echo "  claude plugin list | grep oh-my-sdd"
echo "  grep '身份声明' $PLUGIN_CACHE/oh-my-sdd/0.1.0/content/enterprise-baseline.md"
echo ""
echo "启动 Claude Code 测试："
if [[ -z "${NOMOCK:-}" ]]; then
  echo "  ./scripts/dev-launch-claude.sh"
else
  echo "  claude"
fi
