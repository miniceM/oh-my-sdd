#!/usr/bin/env node
// install/main.js — oh-my-sdd 多工具调度入口。
//
// 架构：
//   install/main.js (本文件)   ← 纯调度：~30 行，0 switch-case
//     ├── host-registry.js      ← 注册表（getAdapter/listTools/detectDefault）
//     ├── host-adapter.js       ← 接口
//     └── hosts/<tool>-adapter.js ← per-host 实现
//
// 共享 utilities:
//   - install/common/sentinel.js — 哨兵系统（记录 baseline 注入位置）
//   - install/common/fs.js — 文件复制工具（sync/async）
//   - install/common/config-patcher.js — opencode.json 修改
//   - install/common/superpowers-installer.js — superpowers-zh 集成
//
// 工具特定前置检查（preflight）：
//   - claude:   iam CLI（oms-login）+ openspec CLI（/sdd-review 归档用）
//   - lingma:   lingma CLI / ~/.lingma/ 目录检测（不在则提示装通义灵码）
//   - opencode: opencode CLI / ~/.config/opencode/ 目录检测
//
// 向后兼容：
//   - 不传 --tool: 等价于 v0.1.0 的 npm postinstall 行为（自动检测 → claude）
//   - 传 --tool <name>: 显式选择工具
//   - installForClaude() 失败时仍创建 state dir（smoke-check 依赖此副作用）

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNodeVersion } from '../lib/platform.js';
import { ensureStateDir } from '../lib/state-dir.js';
import { getAdapter, detectDefault } from './host-registry.js';
import { ClaudeAdapter } from './hosts/claude-adapter.js';
import { LingmaAdapter } from './hosts/lingma-adapter.js';
import { OpenCodeAdapter } from './hosts/opencode-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = process.env.OMS_PACKAGE_ROOT ?? path.resolve(__dirname, '..');

// ============================================
// announce helper（stderr 输出）
// ============================================
function announce(msg) {
  process.stderr.write(msg + '\n');
}

// ============================================
// 向后兼容导出：isXxxInstalled
// ============================================
function isClaudeInstalled() { return ClaudeAdapter.isInstalled(); }
function isLingmaInstalled() { return LingmaAdapter.isInstalled(); }
function isOpenCodeInstalled() { return OpenCodeAdapter.isInstalled(); }

// ============================================
// 调度入口
// ============================================
async function main(options = {}) {
  // 共享前置：Node 版本
  if (!checkNodeVersion('18.0.0')) {
    process.stderr.write(`❌ Node 版本过低。需要 >= 18.0.0，当前 ${process.version}\n`);
    process.exit(1);
  }

  // 共享状态目录
  await ensureStateDir();

  // 工具选择：显式或自动检测
  const tool = options.tool ?? detectDefault();
  const Adapter = getAdapter(tool);
  const ctx = { PACKAGE_ROOT, announce };

  // 工具特定前置检查（警告不阻断）
  Adapter.preflight(ctx);

  // 工具安装
  return Adapter.install(ctx);
}

// ============================================
// 向后兼容导出：preflightFor
// ============================================
function preflightFor(tool) {
  if (!checkNodeVersion('18.0.0')) {
    process.stderr.write(`❌ Node 版本过低。需要 >= 18.0.0，当前 ${process.version}\n`);
    process.exit(1);
  }
  const Adapter = getAdapter(tool);
  Adapter.preflight({ PACKAGE_ROOT, announce });
}

// ============================================
// 向后兼容导出：detectDefaultTool
// ============================================
function detectDefaultTool() {
  return detectDefault();
}

// ============================================
// CLI 入口
// ============================================
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const toolIdx = args.indexOf('--tool');
  const tool = toolIdx >= 0 ? args[toolIdx + 1] : undefined;
  main({ tool }).catch((err) => {
    process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export {
  main,
  preflightFor,
  detectDefaultTool,
  isClaudeInstalled,
  isLingmaInstalled,
  isOpenCodeInstalled,
};