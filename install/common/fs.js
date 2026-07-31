// fs.js — 文件系统工具：目录复制 + skills 复制。
//
// 提供：
//   - rmIfExists (async): 删除路径（若存在），幂等
//   - copyDirRecursive (async): 递归复制目录（保留结构，跳过 .DS_Store）
//   - copySkillsToDir (async): 从 oh-my-sdd skills/ 复制到目标目录
//   - copyDir (sync): 同步目录复制（支持 filter/recursive 选项）
//   - copyFiles (sync): 同步复制指定文件列表
//
// 消费者：install/hosts/lingma-adapter.js（async）、install/hosts/opencode-adapter.js（sync）。

import { readFile, writeFile, mkdir, readdir, copyFile, rm } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// ============================================
// Async utilities (from install-shared.js)
// ============================================

/**
 * Remove a path if it exists. Idempotent.
 * @param {string} p - Path to remove
 * @returns {Promise<boolean>} true if removed, false if didn't exist
 */
export async function rmIfExists(p) {
  if (existsSync(p)) {
    await rm(p, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * 递归复制目录（保留结构，跳过 .DS_Store）。
 * 比 cp -r 更可控——可扩展为 .gitignore 排除、symlink 处理等。
 */
export async function copyDirRecursive(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * 从 oh-my-sdd 的 skills/ 复制到目标目录。
 * 只复制含 SKILL.md 的子目录（其他目录视为非 skill）。
 *
 * @param {string} skillsSrc - oh-my-sdd 的 skills/ 绝对路径
 * @param {string} destDir - 目标工具的 skills 目录（如 ~/.lingma/skills/）
 * @param {Function} announce - 进度通知函数
 * @returns {Promise<number>} 复制的 skill 数量
 */
export async function copySkillsToDir(skillsSrc, destDir, announce) {
  if (!existsSync(skillsSrc)) {
    announce(`  ⚠️  skills 源目录不存在: ${skillsSrc}`);
    return 0;
  }
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(skillsSrc, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(skillsSrc, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const destSkillDir = join(destDir, entry.name);
    await copyDirRecursive(join(skillsSrc, entry.name), destSkillDir);
    count++;
  }
  announce(`  ✓ 已复制 ${count} 个 skills -> ${destDir}`);
  return count;
}

// ============================================
// Sync utilities (from copy-utils.js)
// ============================================

/**
 * Remove a path if it exists (sync). Idempotent.
 * @param {string} p - Path to remove
 * @returns {boolean} true if removed, false if didn't exist
 */
export function rmIfExistsSync(p) {
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Copy directory contents recursively (sync).
 *
 * @param {string} srcDir - Source directory path
 * @param {string} targetDir - Target directory path
 * @param {object} [options] - Copy options
 * @param {function} [options.filter] - Filter function for entries (return true to copy)
 * @param {boolean} [options.recursive] - Copy subdirectories recursively (default: false)
 * @returns {number} Number of files copied
 */
export function copyDir(srcDir, targetDir, options = {}) {
  if (!existsSync(srcDir)) {
    return 0;
  }

  mkdirSync(targetDir, { recursive: true });

  const entries = readdirSync(srcDir);
  let copied = 0;

  for (const entry of entries) {
    if (options.filter && !options.filter(entry)) {
      continue;
    }

    const srcPath = join(srcDir, entry);
    const targetPath = join(targetDir, entry);

    const isDir = statSync(srcPath).isDirectory();

    if (isDir) {
      // 目录：只有在 recursive: true 时才处理
      if (options.recursive) {
        copied += copyDir(srcPath, targetPath, options);
      }
      // 否则跳过目录（不报错，不复制）
    } else {
      // 文件：始终复制
      try {
        copyFileSync(srcPath, targetPath);
        copied++;
      } catch (e) {
        // Log error but continue copying other files
        console.error(`[copyDir] Failed to copy ${srcPath} → ${targetPath}: ${e.message}`);
      }
    }
  }

  return copied;
}

/**
 * Copy specific files from source to target directory (sync).
 *
 * @param {string} srcDir - Source directory path
 * @param {string} targetDir - Target directory path
 * @param {string[]} files - Array of filenames to copy
 * @returns {number} Number of files copied
 */
export function copyFiles(srcDir, targetDir, files) {
  if (!existsSync(srcDir)) {
    return 0;
  }

  mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  for (const file of files) {
    const srcPath = join(srcDir, file);
    if (existsSync(srcPath)) {
      try {
        copyFileSync(srcPath, join(targetDir, file));
        copied++;
      } catch (e) {
        console.error(`[copyFiles] Failed to copy ${file}: ${e.message}`);
      }
    }
  }

  return copied;
}