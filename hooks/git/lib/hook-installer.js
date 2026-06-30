// .git/hooks 文件管理 — 安装/卸载/状态查询。
//
// 幂等设计：每个 oms 安装的 hook 含 marker 行 `# oh-my-sdd-git-hook: <type>`
//   - hook 不存在 → 创建
//   - hook 存在 + 含 marker → 覆盖（幂等更新）
//   - hook 存在 + 无 marker → 备份到 <type>.oms-backup，写入 oms 脚本
// uninstall：含 marker 删除，有 backup 恢复；无 marker 跳过
//
// shell 包装脚本固化 PACKAGE_ROOT 绝对路径，避免运行时路径查找。

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { getGitDir } from './hook-utils.js';

const MARKER_PREFIX = '# oh-my-sdd-git-hook:';
const PATH_MARKER_PREFIX = '# oh-my-sdd-path:';

// oms-git-hooks.js 通过 __dirname 推算 PACKAGE_ROOT 传入
export const HOOK_TYPES = ['pre-commit', 'pre-push', 'commit-msg', 'prepare-commit-msg'];

const CHECK_SCRIPTS = {
  'pre-commit': 'pre-commit-check.js',
  'pre-push': 'pre-push-check.js',
  'commit-msg': 'commit-msg-check.js',
  'prepare-commit-msg': 'prepare-commit-msg-check.js',
};

/**
 * 生成 shell 包装脚本。
 * 固化 PACKAGE_ROOT 绝对路径 + node 探测 + marker。
 */
function buildWrapperScript(hookType, packageRoot) {
  const checkScript = CHECK_SCRIPTS[hookType];
  const argsPass = '"$@"';

  return `#!/bin/sh
${MARKER_PREFIX} ${hookType}
${PATH_MARKER_PREFIX} ${packageRoot}
# Managed by oh-my-sdd. To uninstall: oms-git-hooks uninstall

OMS_ROOT="${packageRoot}"

# 探测 node：PATH 优先，fallback 常见位置
NODE_BIN=$(command -v node 2>/dev/null || echo "")
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  for p in /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    [ -x "$p" ] && { NODE_BIN="$p"; break; }
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "oh-my-sdd ${hookType}: node not found, skipping check" >&2
  exit 0
fi

exec "$NODE_BIN" "$OMS_ROOT/hooks/git/${checkScript}" ${argsPass}
`;
}

function hookPath(hooksDir, hookType) {
  return path.join(hooksDir, hookType);
}

function backupPath(hooksDir, hookType) {
  return path.join(hooksDir, `${hookType}.oms-backup`);
}

function hasOmsMarker(content) {
  return content.includes(MARKER_PREFIX);
}

/**
 * 确保 hooks 目录存在。
 */
function ensureHooksDir(cwd) {
  const gitDir = getGitDir(cwd);
  if (!gitDir) return null;
  const hooksDir = path.isAbsolute(gitDir)
    ? path.join(gitDir, 'hooks')
    : path.join(cwd, gitDir, 'hooks');
  return hooksDir;
}

/**
 * 安装单个 hook。返回 { action, backedUp } 描述操作结果。
 */
export function installHook(hookType, packageRoot, cwd = process.cwd()) {
  const hooksDir = ensureHooksDir(cwd);
  if (!hooksDir) {
    return { action: 'not-git-repo', backedUp: false };
  }

  // 确保 hooks 目录存在
  mkdirSync(hooksDir, { recursive: true });

  const target = hookPath(hooksDir, hookType);
  const wrapper = buildWrapperScript(hookType, packageRoot);

  if (!existsSync(target)) {
    writeFileSync(target, wrapper, { mode: 0o755 });
    return { action: 'created', backedUp: false };
  }

  const existing = readFileSync(target, 'utf8');

  if (hasOmsMarker(existing)) {
    // 已是 oms hook，覆盖更新（幂等）
    writeFileSync(target, wrapper, { mode: 0o755 });
    return { action: 'updated', backedUp: false };
  }

  // 用户已有非 oms hook，备份后写入 oms 脚本
  const backup = backupPath(hooksDir, hookType);
  renameSync(target, backup);
  writeFileSync(target, wrapper, { mode: 0o755 });
  return { action: 'replaced-with-backup', backedUp: true };
}

/**
 * 卸载单个 hook。返回 { action, restored }。
 */
export function uninstallHook(hookType, cwd = process.cwd()) {
  const hooksDir = ensureHooksDir(cwd);
  if (!hooksDir) {
    return { action: 'not-git-repo', restored: false };
  }

  const target = hookPath(hooksDir, hookType);

  if (!existsSync(target)) {
    return { action: 'not-installed', restored: false };
  }

  const existing = readFileSync(target, 'utf8');

  if (!hasOmsMarker(existing)) {
    return { action: 'not-managed', restored: false };
  }

  // 删除 oms hook
  unlinkSync(target);

  // 恢复备份
  const backup = backupPath(hooksDir, hookType);
  if (existsSync(backup)) {
    renameSync(backup, target);
    return { action: 'restored-backup', restored: true };
  }

  return { action: 'removed', restored: false };
}

/**
 * 查询单个 hook 状态。
 * 返回: 'installed' | 'not-installed' | 'managed-other' | 'user-owned'
 */
export function getHookStatus(hookType, cwd = process.cwd()) {
  const hooksDir = ensureHooksDir(cwd);
  if (!hooksDir) return 'not-git-repo';

  const target = hookPath(hooksDir, hookType);
  if (!existsSync(target)) return 'not-installed';

  const existing = readFileSync(target, 'utf8');
  return hasOmsMarker(existing) ? 'installed' : 'user-owned';
}

/**
 * 批量安装所有 hook。
 */
export function installAll(packageRoot, cwd = process.cwd(), announce = () => {}) {
  let backedUpCount = 0;
  for (const hookType of HOOK_TYPES) {
    const result = installHook(hookType, packageRoot, cwd);
    if (result.action === 'not-git-repo') {
      announce('❌ 非 git 仓库，请先 git init');
      return { ok: false, backedUpCount: 0 };
    }
    if (result.backedUp) {
      backedUpCount++;
      announce(`  ${hookType}: 已安装（原 hook 备份到 ${hookType}.oms-backup）`);
    } else {
      announce(`  ${hookType}: ${result.action === 'created' ? '已创建' : '已更新'}`);
    }
  }
  if (backedUpCount > 0) {
    announce(`⚠️  ${backedUpCount} 个 hook 已备份原用户 hook，卸载时自动恢复`);
  }
  return { ok: true, backedUpCount };
}

/**
 * 批量卸载所有 hook。
 */
export function uninstallAll(cwd = process.cwd(), announce = () => {}) {
  let restoredCount = 0;
  for (const hookType of HOOK_TYPES) {
    const result = uninstallHook(hookType, cwd);
    if (result.action === 'restored-backup') {
      restoredCount++;
      announce(`  ${hookType}: 已卸载（原 hook 已恢复）`);
    } else if (result.action === 'removed') {
      announce(`  ${hookType}: 已卸载`);
    } else if (result.action === 'not-installed') {
      announce(`  ${hookType}: 未安装，跳过`);
    } else if (result.action === 'not-managed') {
      announce(`  ${hookType}: 非 oms 管理，跳过`);
    } else if (result.action === 'not-git-repo') {
      announce('❌ 非 git 仓库');
      return { ok: false, restoredCount: 0 };
    }
  }
  return { ok: true, restoredCount };
}

/**
 * 查询所有 hook 状态，返回格式化文本。
 */
export function statusAll(cwd = process.cwd()) {
  const lines = [`oh-my-sdd git hooks status for ${cwd}`, ''];
  for (const hookType of HOOK_TYPES) {
    const status = getHookStatus(hookType, cwd);
    const label = hookType.padEnd(20);
    let desc;
    if (status === 'installed') desc = 'INSTALLED';
    else if (status === 'not-installed') desc = 'NOT INSTALLED';
    else if (status === 'user-owned') desc = 'USER-OWNED (非 oms 管理)';
    else if (status === 'not-git-repo') desc = 'NOT A GIT REPO';
    lines.push(`  ${label} ${desc}`);
  }
  return lines.join('\n');
}