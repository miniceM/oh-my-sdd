#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { getPluginInstallDir, getStateDir } from './hooks/lib/platform.js';
import { uninstallWrapper } from './hooks/lib/wrapper.js';

const MARKETPLACE_NAME = 'oh-my-sdd';
const PLUGIN_NAME = 'oh-my-sdd';

// announce writes user-facing messages to stderr so npm preuninstall doesn't
// swallow them. npm hides preuninstall stdout; stderr always shows.
function announce(msg) {
  process.stderr.write(msg + '\n');
}

function isClaudeInstalled() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['claude'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runClaude(args) {
  return new Promise((resolve) => {
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
  });
}

async function uninstallPlugin() {
  if (!isClaudeInstalled()) {
    announce('⚠️  未检测到 claude CLI。请手动卸载：');
    announce(`  claude plugin uninstall ${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
    return;
  }
  const result = await runClaude(['plugin', 'uninstall', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('not installed') || out.includes('not found')) {
      announce('  (plugin 未安装，跳过)');
    } else {
      announce(`⚠️  claude plugin uninstall 失败 (exit ${result.code}):`);
      announce('  ' + (result.stderr || result.stdout || '(no output)'));
    }
    return;
  }
  announce(`  ✓ 已卸载 plugin：${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
}

async function removeMarketplace() {
  if (!isClaudeInstalled()) {
    announce('⚠️  请手动注销 marketplace：');
    announce(`  claude plugin marketplace remove ${MARKETPLACE_NAME}`);
    return;
  }
  const result = await runClaude(['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]);
  if (result.code !== 0) {
    announce(`⚠️  claude plugin marketplace remove 失败 (exit ${result.code}):`);
    announce('  ' + (result.stderr || result.stdout || '(no output)'));
    return;
  }
  announce(`  ✓ 已注销 marketplace：${MARKETPLACE_NAME}`);
}

// Legacy cleanup: old install.js (commits before c753589) wrote an invalid
// extraKnownMarketplaces["oh-my-sdd"] entry to ~/.claude/settings.json. The
// new install.js doesn't write there, so we must manually clean it up.
async function cleanupLegacySettings() {
  const settingsPath = path.join(path.dirname(getPluginInstallDir()), '..', 'settings.json');
  if (!existsSync(settingsPath)) return;
  let settings;
  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch {
    return; // corrupt or unreadable — skip silently
  }
  if (settings.extraKnownMarketplaces?.[MARKETPLACE_NAME]) {
    delete settings.extraKnownMarketplaces[MARKETPLACE_NAME];
    try {
      await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      announce('  ✓ 已清理 legacy settings.json 条目');
    } catch (err) {
      announce(`  ⚠️  清理 settings.json 失败：${err.message}`);
    }
  }
}

// Legacy cleanup: old install.js copied files to ~/.claude/plugins/oh-my-sdd/
// (non-standard path that Claude Code doesn't read). Remove if exists.
async function cleanupLegacyFiles() {
  const dest = getPluginInstallDir();
  if (existsSync(dest)) {
    await rm(dest, { recursive: true, force: true });
    announce('  ✓ 已清理 legacy 插件目录');
  }
}

async function uninstallForClaude({ announce }) {
  announce('→ 卸载 plugin');
  await uninstallPlugin();

  announce('→ 注销 marketplace');
  await removeMarketplace();

  announce('→ 清理 legacy 安装产物');
  await cleanupLegacyFiles();
  await cleanupLegacySettings();

  announce('→ 卸载 Claude CLI wrapper');
  await uninstallWrapper(announce);
}

async function main({ purge = false, tool } = {}) {
  // 1. 卸载指定工具的钩子/配置（如果指定了 tool）
  if (tool) {
    if (tool === 'opencode') {
      const { uninstallForOpenCode: fn } = await import('./hooks/lib/install-opencode.js');
      await fn();
      return;
    }
    if (tool === 'lingma') {
      const { uninstallForLingma: fn } = await import('./hooks/lib/install-lingma.js');
      await fn();
      return;
    }
    if (tool !== 'claude') {
      process.stderr.write(`❌ 未知工具: ${tool}\n`);
      process.exit(1);
    }
    // tool === 'claude' 走下面的 Claude 卸载路径
  }

  // 2. 默认：完整卸载 Claude Code 路径
  await uninstallForClaude({ announce });

  // 3. 工具未指定时，也清理 OpenCode/Lingma（如果装过）
  if (!tool) {
    const { uninstallForOpenCode: fn1 } = await import('./hooks/lib/install-opencode.js');
    const { uninstallForLingma: fn2 } = await import('./hooks/lib/install-lingma.js');
    await fn1();
    await fn2();
  }

  if (purge) {
    announce('→ --purge: 同时移除 ~/.oh-my-sdd/ 状态目录');
    await rm(getStateDir(), { recursive: true, force: true });
  } else {
    announce('');
    announce('✓ oh-my-sdd 已卸载');
    announce('  状态文件保留在 ~/.oh-my-sdd/，重装可复用');
    announce('  彻底清理请运行：oms-uninstall --purge');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const purge = args.includes('--purge');
  const toolIdx = args.indexOf('--tool');
  const tool = toolIdx !== -1 ? args[toolIdx + 1] : null;
  main({ purge, tool }).catch((err) => {
    process.stderr.write(`❌ 卸载失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { main, uninstallPlugin, removeMarketplace, cleanupLegacyFiles, cleanupLegacySettings,
         uninstallForClaude };