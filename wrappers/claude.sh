#!/usr/bin/env bash
# enterprise-wrapper/wrappers/claude.sh
# POSIX-compatible wrapper for Claude CLI with enterprise constraints
#
# 无需管理员权限，用户级部署
# 安装位置: ~/.local/bin/claude

set -euo pipefail

# ============================================
# 配置路径（用户级）
# ============================================
ENTERPRISE_RULES="${CLAUDE_ENTERPRISE_RULES:-${HOME}/.config/claude-enterprise/baseline.md}"
ENTERPRISE_CONFIG="${HOME}/.config/claude-enterprise/config.sh"

# 加载用户自定义配置（可选）
if [[ -f "$ENTERPRISE_CONFIG" ]]; then
  source "$ENTERPRISE_CONFIG"
fi

# ============================================
# 查找原 Claude binary
# ============================================
find_original_claude() {
  # 优先使用备份 symlink（即使在同目录也有效）
  local backup="${HOME}/.local/bin/claude-original"
  if [[ -e "$backup" && -x "$backup" ]]; then
    # 确保备份不是 wrapper 自身（检查是否是 symlink 或文件名不同）
    if [[ -L "$backup" || "$(basename "$backup")" != "claude" ]]; then
      echo "$backup"
      return 0
    fi
  fi

  # 其他常见安装位置
  local locations=(
    "${HOME}/.claude/bin/claude"             # Claude 官方用户级安装
    "/usr/local/bin/claude"                  # 系统级安装（如果有权限）
    "/usr/bin/claude"                        # 系统级安装
    "/opt/homebrew/bin/claude"               # Homebrew 安装 (macOS Apple Silicon)
  )

  local self_path
  self_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  for loc in "${locations[@]}"; do
    if [[ -x "$loc" ]]; then
      local loc_dir
      loc_dir="$(cd "$(dirname "$loc")" && pwd)"
      # 排除 wrapper 所在目录（但备份 symlink 已在上面处理）
      if [[ "$loc_dir" != "$self_path" ]]; then
        echo "$loc"
        return 0
      fi
    fi
  done

  # 最后尝试 PATH 中的 claude（排除 wrapper 自身）
  local path_claude
  path_claude="$(command -v claude)"
  if [[ -n "$path_claude" ]]; then
    local path_dir
    path_dir="$(cd "$(dirname "$path_claude")" && pwd)"
    if [[ "$path_dir" != "$self_path" ]]; then
      echo "$path_claude"
      return 0
    fi
  fi

  echo "ERROR: Cannot find original Claude binary" >&2
  echo "  Searched locations:" >&2
  echo "    - $backup" >&2
  for loc in "${locations[@]}"; do
    echo "    - $loc" >&2
  done
  return 1
}

# ============================================
# 支持绕过选项
# ============================================
if [[ "${1:-}" == "--no-enterprise" ]]; then
  shift
  CLAUDE_ORIGINAL=$(find_original_claude)
  exec "$CLAUDE_ORIGINAL" "$@"
fi

# ============================================
# 检查规则文件
# ============================================
if [[ ! -f "$ENTERPRISE_RULES" ]]; then
  echo "Warning: Enterprise rules file not found: $ENTERPRISE_RULES"
  echo "Running without enterprise constraints..."
  CLAUDE_ORIGINAL=$(find_original_claude)
  exec "$CLAUDE_ORIGINAL" "$@"
fi

# ============================================
# 执行 Claude with enterprise rules
# ============================================
CLAUDE_ORIGINAL=$(find_original_claude)
exec "$CLAUDE_ORIGINAL" --append-system-prompt-file "$ENTERPRISE_RULES" "$@"