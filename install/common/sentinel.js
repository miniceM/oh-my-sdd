// sentinel.js — 哨兵系统：记录 baseline 注入位置，支持卸载时精准定位。
//
// 提供：
//   - SENTINEL_BEGIN/END 标记（HTML 注释包裹）
//   - sentinelPathFor(tool): 哨兵文件路径
//   - writeSentinel(tool, dest, blockMarker, announce): 写入哨兵元数据
//   - readSentinel(tool): 读取哨兵元数据
//
// 用法：install/hosts/lingma-adapter.js 在注入 baseline 后调用 writeSentinel，
//      卸载时调用 readSentinel 获取注入位置。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
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