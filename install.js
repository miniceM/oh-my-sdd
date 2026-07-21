#!/usr/bin/env node
// install.js — oh-my-sdd 多工具调度入口。
//
// 架构：
//   install.js (本文件)        ← 纯调度：preflightFor(tool) + main(options) + detectDefaultTool
//     ├── hooks/lib/install-claude.js    ← Claude Code 路径（marketplace + plugin + wrapper）
//     ├── hooks/lib/install-lingma.js    ← 通义灵码 Lingma CN 路径（skills 复制 + rules 写入 + settings.json 合并）
//     └── hooks/lib/install-shared.js   ← 共享 utilities（哨兵、copyDirRecursive、copySkillsToDir）
//
// 工具特定前置检查（preflightFor）：
//   - claude:   iam CLI（oms-login）+ openspec CLI（/sdd-review 归档用）
//   - lingma:    lingma CLI / ~/.lingma/ 目录检测（不在则提示装通义灵码）
//
// 向后兼容：
//   - 不传 --tool: 等价于 v0.1.0 的 npm postinstall 行为（自动检测 → claude）
//   - 传 --tool <name>: 显式选择工具
//   - installForClaude() 失败时仍创建 state dir（smoke-check 依赖此副作用）

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkNodeVersion, isIamInPath } from './hooks/lib/platform.js';
import { ensureStateDir } from './hooks/lib/state-dir.js';
import { installForClaude, isClaudeInstalled } from './hooks/lib/install-claude.js';
import { installForLingma } from './hooks/lib/install-lingma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = __dirname;

// ============================================
// 前置检查（所有工具共用 Node；工具特定检查在 preflightFor 中分发）
// ============================================
function preflightFor(tool) {
  if (!checkNodeVersion('18.0.0')) {
    process.stderr.write(`❌ Node 版本过低。需要 >= 18.0.0，当前 ${process.version}\n`);
    process.exit(1);
  }

  // 工具特定检查：避免给 lingma 用户打印 iam/openspec 等 Claude 专属提示
  switch (tool) {
    case 'claude':
      if (!isIamInPath()) {
        process.stderr.write('⚠️  未检测到 iam CLI。可继续安装，但首次会话将提示安装。\n');
        process.stderr.write('    安装后请运行 oms-login 完成身份认证。\n');
      }
      // openspec 是 spec 保鲜的核心——/sdd-review 归档阶段必须用它 merge delta
      try {
        const cmd = process.platform === 'win32' ? 'where' : 'which';
        execFileSync(cmd, ['openspec'], { stdio: 'ignore' });
      } catch {
        process.stderr.write('⚠️  未检测到 openspec CLI。可继续安装，但 /sdd-review 归档阶段会阻塞。\n');
        process.stderr.write('    安装：npm install -g @fission-ai/openspec\n');
        process.stderr.write('    作用：archive 时 merge delta 到 openspec/specs/，保持项目 specs 反映系统现状\n');
      }
      break;
    case 'lingma':
      if (!isLingmaInstalled()) {
        process.stderr.write('⚠️  未检测到通义灵码 (lingma) IDE。已写入 rules + 合并 settings.json，但 IDE 不在时不生效。\n');
        process.stderr.write('    安装：https://lingma.aliyun.com\n');
      }
      break;
  }
}

// ============================================
// 工具检测
// ============================================
function isLingmaInstalled() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['lingma'], { stdio: 'ignore' });
    return true;
  } catch {
    // fallback: 通义灵码可能未注册 lingma CLI，检测 ~/.lingma/ 目录
    try {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) {
        execFileSync('test', ['-d', path.join(home, '.lingma')], { stdio: 'ignore' });
        return true;
      }
    } catch { /* fallthrough */ }
    return false;
  }
}

function detectDefaultTool() {
  // 自动检测用户主要使用的 AI 工具
  if (isClaudeInstalled()) return 'claude';
  if (isLingmaInstalled()) return 'lingma';
  return 'claude'; // fallback（向后兼容 v0.1）
}

// ============================================
// 调度入口
// ============================================
async function main(options = {}) {
  // 跨工具共享：所有路径都需要 ~/.oh-my-sdd/ 存在（哨兵、config.json）
  await ensureStateDir();

  const tool = options.tool ?? detectDefaultTool();
  preflightFor(tool);

  switch (tool) {
    case 'claude':
      return installForClaude({ PACKAGE_ROOT });
    case 'lingma':
      return installForLingma({ PACKAGE_ROOT, announce });
    default:
      process.stderr.write(`❌ 未知工具: ${tool}\n`);
      process.stderr.write('  支持: claude, lingma\n');
      process.exit(1);
  }
}

// ============================================
// announce helper（仅 install.js 直接使用；install-targets.js 内部已自包含）
// ============================================
function announce(msg) {
  process.stderr.write(msg + '\n');
}

// Only run main when invoked directly, not when imported
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { main, preflightFor, detectDefaultTool,
         isClaudeInstalled, isLingmaInstalled };
