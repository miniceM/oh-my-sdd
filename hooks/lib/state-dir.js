// state-dir.js — oh-my-sdd 跨工具共享状态目录管理。
//
// 为何独立成文件：~/.oh-my-sdd/ 是 oh-my-sdd 的**跨工具共享状态目录**（不只是
// Claude 用的）。所有工具路径（claude/opencode/qoder）的安装入口都应调用
// ensureStateDir()，保证 ~/.oh-my-sdd/ 存在。
//
// 当前内容：
//   - config.json: 跨工具共享配置（dop_endpoint, log_level 等）
//   - baseline-{tool}.sentinel: 卸载时精准定位 baseline 注入位置
//   - sessions/{session-id}.json: session 元数据（Claude 用，但 OpenCode/Qoder
//     也可能用同一文件锁做 event-queue）
//
// 未来扩展：所有工具的配置统一在此目录，~ 端不污染用户文件系统。

import { mkdir, access, constants } from 'node:fs/promises';
import path from 'node:path';
import { getStateDir } from './platform.js';
import { saveConfig, DEFAULT_CONFIG } from './config.js';

/**
 * 确保 ~/.oh-my-sdd/ 状态目录存在，并写入默认 config.json（如缺失）。
 *
 * - 目录权限 0o700（用户私有，避免 dop_endpoint 泄露）
 * - config.json 文件权限 0o600
 * - 幂等：多次调用不会覆盖已有 config.json
 *
 * 此函数不抛错——state dir 创建失败仅记录 stderr，调用方可继续。
 * (smoke-check 等场景依赖副作用存在性而非严格成功。)
 */
export async function ensureStateDir() {
  try {
    await mkdir(getStateDir(), { recursive: true, mode: 0o700 });
  } catch (err) {
    process.stderr.write(`⚠️  无法创建状态目录 ${getStateDir()}: ${err.message}\n`);
    return;
  }
  try {
    await access(path.join(getStateDir(), 'config.json'), constants.F_OK);
  } catch {
    try {
      await saveConfig(DEFAULT_CONFIG);
    } catch (err) {
      process.stderr.write(`⚠️  无法写入 config.json: ${err.message}\n`);
    }
  }
}
