#!/usr/bin/env bash
# scripts/dev-launch-claude.sh — 用 mock iam 启动 Claude Code 进行本地测试
#
# 用法：
#   ./scripts/dev-launch-claude.sh                # 用默认 alice/sdd 已登录状态
#   OMS_MOCK_USER=bob ./scripts/dev-launch-claude.sh
#   OMS_MOCK_LOGGED_OUT=1 ./scripts/dev-launch-claude.sh  # 模拟未登录
#
# 启动后在新 Claude Code 会话里测试：
#   - "你是谁？" → 期望回答含"企业 SDD Agent"（baseline 注入成功）
#   - /sdd-spec test-001 → 期望 Ring 1 工作流
#   - 改文件后查 ~/.oh-my-sdd/queue.jsonl → 应有 session.start / slash.invoked 事件

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 把 mock iam 加到 PATH 最前
export PATH="$SCRIPT_DIR:$PATH"

# 验证 mock iam 可达
if ! command -v iam >/dev/null 2>&1; then
  echo "❌ mock iam 不可执行。先跑: chmod +x $SCRIPT_DIR/mock-iam" >&2
  exit 1
fi

echo "→ PATH 已注入 mock iam: $(command -v iam)"
echo "→ mock 用户: ${OMS_MOCK_USER:-alice}"
echo "→ mock system: ${OMS_MOCK_SYSTEM:-sdd}"
if [[ "${OMS_MOCK_LOGGED_OUT:-0}" == "1" ]]; then
  echo "→ ⚠️ 模拟未登录状态（测试 NEED_LOGIN 路径）"
fi
echo ""

# 验证 mock 输出
echo "→ mock iam auth status -json 输出:"
iam auth status -json
echo ""

# 启动 Claude Code
echo "→ 启动 Claude Code..."
exec claude "$@"
