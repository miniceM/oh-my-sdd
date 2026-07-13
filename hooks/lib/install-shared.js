// install-shared.js — OpenCode 和通义灵码 lingma 安装/卸载的共享 utilities。
//
// 为何独立成文件：避免 install-opencode.js 和 install-lingma.js 重复同样的工具代码。
// 这些 utilities 100% 跨工具复用——剥离它们让两个工具模块只保留"工具特定"逻辑。
//
// 包含：
//   - copyDirRecursive: 通用目录递归复制
//   - copySkillsToDir: 从 oh-my-sdd 的 skills/ 复制到目标目录（保留 skill 目录结构）
//   - 哨兵系统：writeSentinel / readSentinel / SENTINEL_* 常量
//
// 不包含：
//   - 路径常量（每个工具有自己的 ~/.config/opencode 或 ~/.lingma）
//   - baseline 注入逻辑（OpenCode 哨兵块追加 vs lingma 整体覆盖，机制不同不共享）
//   - 工具特定 plugin 编译/settings.json 生成

import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ============================================
// 哨兵系统：HTML 注释包裹的 baseline 块 + 哨兵文件
// ============================================
export const SENTINEL_BEGIN = '<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->';
export const SENTINEL_END = '<!-- OH-MY-SDD:END -->';
export const SENTINEL_RE = /<!-- OH-MY-SDD:BEGIN[\s\S]*?<!-- OH-MY-SDD:END -->\n?/g;

/**
 * 哨兵文件路径：~/.oh-my-sdd/baseline-{tool}.sentinel
 * 卸载时通过此文件知道 baseline 注入到哪里（可能与默认位置不同）。
 */
export function sentinelPathFor(tool) {
  const omsHome = process.env.HOME || process.env.USERPROFILE;
  if (!omsHome) throw new Error('Cannot determine home directory for sentinel');
  return join(omsHome, '.oh-my-sdd', `baseline-${tool}.sentinel`);
}

/**
 * 写入哨兵文件，记录 baseline 注入位置和元数据。
 * 卸载时通过此文件精准定位清理。
 */
export async function writeSentinel(tool, dest, blockMarker, announce) {
  const p = sentinelPathFor(tool);
  await mkdir(dirname(p), { recursive: true });
  const meta = {
    tool,
    dest,
    block_marker: blockMarker,
    installed_at: new Date().toISOString(),
  };
  await writeFile(p, JSON.stringify(meta, null, 2) + '\n', { mode: 0o600 });
  announce(`  ✓ 哨兵文件: ${p}`);
}

/**
 * 读哨兵文件。无文件或解析失败返回 null（卸载时降级跳过）。
 */
export async function readSentinel(tool) {
  try {
    return JSON.parse(await readFile(sentinelPathFor(tool), 'utf8'));
  } catch {
    return null;
  }
}

// ============================================
// 文件系统工具
// ============================================

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
 * @param {string} destDir - 目标工具的 skills 目录（如 ~/.config/opencode/skills/）
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
