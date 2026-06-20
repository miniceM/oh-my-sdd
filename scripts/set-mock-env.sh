#!/usr/bin/env bash
# scripts/set-mock-env.sh — 把 mock iam + dop 注入当前 shell 的 PATH
#
# 用途：dev-launch-claude.sh 的"仅设 env"变体——不 exec claude，
# 让你在当前 shell 里手动跑 claude / node bin/oms-login.js 等命令。
#
# 用法：
#   source ./scripts/set-mock-env.sh         # 在当前 shell 注入 PATH（推荐）
#   ./scripts/set-mock-env.sh                # 子进程模式（PATH 不影响当前 shell）
#
# 注入后可跑：
#   - claude                                   # 启动 Claude Code（mock iam/dop 已生效）
#   - node bin/oms-login.js                    # 测试登录流程（含欢迎页）
#   - iam auth status -json                    # 直接调 mock iam
#   - dop change view ARD123456                # 直接调 mock dop
#
# 环境变量（可选）：
#   OMS_MOCK_USER                              默认 alice
#   OMS_MOCK_SYSTEM                            默认 sdd
#   OMS_MOCK_LOGGED_OUT=1                      模拟未登录（测试 NEED_LOGIN）
#   OMS_MOCK_DOP_FAIL_GET=1                    dop change view 模拟失败
#   OMS_MOCK_DOP_FAIL_UPDATE=1                 dop change update 模拟失败

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 把 mock iam + dop 加到 PATH 最前
export PATH="$SCRIPT_DIR:$PATH"

# 验证 mock 可达
if ! command -v iam >/dev/null 2>&1; then
  echo "❌ mock iam 不可执行。先跑: chmod +x $SCRIPT_DIR/iam" >&2
  exit 1
fi
if ! command -v dop >/dev/null 2>&1; then
  echo "❌ mock dop 不可执行。先跑: chmod +x $SCRIPT_DIR/dop" >&2
  exit 1
fi

echo "→ PATH 已注入 mock iam: $(command -v iam)"
echo "→ PATH 已注入 mock dop: $(command -v dop)"
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
echo "→ mock dop change view ARD123456 (示例):"
dop change view ARD123456 2>&1 | head -5
echo ""

