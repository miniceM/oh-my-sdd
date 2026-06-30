// git hook 校验共用的 git 操作工具。
//
// 提供同步接口（execFileSync 包装）——git hook 需要快速同步决策，
// async 版本在短命令上反而增加复杂度。runGitSync 失败返回 null，
// 调用方负责优雅降级（非 git 目录、无 staged 文件等场景 exit 0）。
//
// 安全：使用 execFileSync + 参数数组，不拼接 shell 字符串，
// 避免 staged 文件名含 shell 元字符导致的命令注入。

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * 同步执行 git 命令。失败返回 null（不抛错，调用方降级）。
 * @param {string[]} args - git 参数数组（不经 shell，防注入）
 * @param {string} cwd - 工作目录
 * @returns {string|null} stdout（trim 后），失败 null
 */
export function runGitSync(args, cwd = process.cwd()) {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * 获取 staged 文件列表（Added/Copied/Modified/Renamed，排除删除和未合并）。
 * @param {string} cwd
 * @returns {string[]} 相对路径数组，空数组表示无 staged 文件
 */
export function getStagedFiles(cwd = process.cwd()) {
  const out = runGitSync(
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    cwd
  );
  if (!out) return [];
  // -z 用 NUL 分隔，避免文件名含空格/换行的问题
  return out.split('\0').filter(Boolean);
}

/**
 * 读取 staged 版本文件内容。
 * @param {string} filePath - 相对路径
 * @param {string} cwd
 * @returns {string|null} 文件内容（已 trim 首尾空白）；binary 或读取失败返回 null
 * @note 内容经 trim 处理，文件末尾换行/空白会被剥离。当前规则引擎
 *       匹配 AKIA/sk-/rm -rf 等模式不受影响；如需精确尾部内容检测，
 *       应使用不经 trim 的内部变体。
 */
export function getStagedContent(filePath, cwd = process.cwd()) {
  const content = runGitSync(['show', `:${filePath}`], cwd);
  if (content === null) return null;
  // 简单 binary 检测：含 NUL 字符视为 binary
  if (content.includes('\0')) return null;
  return content;
}

/**
 * 读取 HEAD 最近一次 commit 的消息。
 * @param {string} cwd
 * @returns {string|null} 消息全文，无 commit 时 null
 */
export function getHeadCommitMessage(cwd = process.cwd()) {
  return runGitSync(['log', '-1', '--format=%B', 'HEAD'], cwd);
}

/**
 * 读取 commit 消息文件（commit-msg / prepare-commit-msg 的 $1 参数）。
 * @param {string} msgFilePath
 * @returns {string} 文件内容，读取失败返回空字符串
 */
export function readCommitMsgFile(msgFilePath) {
  try {
    return readFileSync(msgFilePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * 解析 pre-push stdin 的 ref 行。
 * stdin 格式每行: <localRef> <localSha> <remoteRef> <remoteSha>
 * force push 时 localRef 前缀有 + 号。
 * @param {string} stdin
 * @returns {Array<{localRef: string, localSha: string, remoteRef: string, remoteSha: string}>}
 */
export function parsePushStdin(stdin) {
  if (!stdin || typeof stdin !== 'string') return [];
  return stdin
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    })
    .filter((r) => r.localRef && r.remoteRef);
}

/**
 * 检测是否 force push（localRef 含 + 前缀）。
 * @param {string} localRef
 * @returns {boolean}
 */
export function isForcePush(localRef) {
  return typeof localRef === 'string' && localRef.startsWith('+');
}

/**
 * 检测是否受保护分支（main/master）。
 * @param {string} refName - remoteRef，如 refs/heads/main
 * @returns {boolean}
 */
export function isProtectedBranch(refName) {
  if (!refName || typeof refName !== 'string') return false;
  // refs/heads/main / refs/heads/master / main / master 都匹配
  const branch = refName.replace(/^refs\/heads\//, '');
  return branch === 'main' || branch === 'master';
}

/**
 * 获取 .git 目录路径。
 * @param {string} cwd
 * @returns {string|null} .git 目录绝对路径，非 git 仓库返回 null
 */
export function getGitDir(cwd = process.cwd()) {
  return runGitSync(['rev-parse', '--git-dir'], cwd);
}