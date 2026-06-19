#!/usr/bin/env bash
# scripts/diag-session.sh
# 用途:重启 Claude Code 后,一键自检 oh-my-sdd 的 SessionStart hook 是否真被触发,
#       以及 baseline 是否被注入到 system prompt。
# 背景:Claude Code 把 SessionStart hook 的 additionalContext 作为 system 消息注入,
#       所以新会话的 Claude 应该能"看到" baseline 文字。本脚本旁路验证 hook 副作用。

set -uo pipefail

GREEN=$'\033[32m'; RED=$'\033[31m'; YEL=$'\033[33m'; CYAN=$'\033[36m'; OFF=$'\033[0m'

echo "${CYAN}=== 1. Claude Code 是否为 oh-my-sdd 写过 session meta ===${OFF}"
DATA_DIR="$HOME/.claude/plugins/data/oh-my-sdd-oh-my-sdd"
if [[ -d "$DATA_DIR" ]]; then
  files=$(ls -A "$DATA_DIR" 2>/dev/null)
  if [[ -z "$files" ]]; then
    echo "${RED}目录存在但为空${OFF}  →  hook 没跑,或跑了但认证状态非 OK(saveSessionMeta 只在 OK 时调用)"
  else
    echo "${GREEN}有文件${OFF}  →  hook 跑过且认证 OK:"
    ls -la "$DATA_DIR"
  fi
else
  echo "${RED}目录不存在${OFF}  →  hook 从未跑过"
fi

echo
echo "${CYAN}=== 2. 直接跑 hook 看它本身健康度(用 Claude Code 加载的 cache 路径)===${OFF}"
CACHE="$HOME/.claude/plugins/cache/oh-my-sdd/oh-my-sdd/0.1.0"
if [[ -f "$CACHE/hooks/session-start.js" ]]; then
  out=$(echo "{\"cwd\":\"$PWD\",\"session_id\":\"diag-$$\"}" \
        | CLAUDE_PLUGIN_ROOT="$CACHE" node "$CACHE/hooks/session-start.js" 2>&1)
  if echo "$out" | grep -q "企业 SDD Agent 基线"; then
    echo "${GREEN}hook 健康,baseline 能正常生成${OFF}"
  elif echo "$out" | grep -q "additionalContext"; then
    echo "${YEL}hook 跑了但没吐 baseline(可能走 auth-required/NO_CLI/ERROR 分支)${OFF}:"
    echo "$out" | head -5
  else
    echo "${RED}hook 异常${OFF}:"
    echo "$out" | head -20
  fi
else
  echo "${RED}cache 路径不存在: $CACHE${OFF}  →  插件没正确安装"
fi

echo
echo "${CYAN}=== 3. Claude Code 启 hook 的子进程能否找到 iam ===${OFF}"
iam_path=$(command -v iam 2>/dev/null || true)
if [[ -n "$iam_path" ]]; then
  echo "${GREEN}iam 在 PATH:${OFF} $iam_path"
else
  echo "${YEL}iam 不在 PATH${OFF}  →  若 Claude Code 子进程也找不到,hook 会走 NO_CLI 分支(只输出警告,不输出 baseline)"
fi

echo
echo "${CYAN}=== 判断指南(配合新会话问 Claude '你看到企业 SDD Agent 基线了吗')===${OFF}"
cat <<'EOF'
• Claude 说"看到了" + 第 1 步有文件        → 一切正常,问题已解决(之前会话只是没重启生效)
• Claude 说"没看到" + 第 1 步有文件         → hook 跑了但 additionalContext 没合并 → Claude Code 行为问题
• Claude 说"没看到" + 第 1 步为空 + 第 2 步健康 → Claude Code 这次没触发 hook → 重启/重装插件
• Claude 说"没看到" + 第 1 步为空 + 第 3 步 iam 缺失 → 环境问题,把 iam 加进 settings.json 的 env.PATH
EOF
