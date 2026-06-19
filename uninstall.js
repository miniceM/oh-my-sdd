#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPluginInstallDir, getStateDir } from './hooks/lib/platform.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

async function main({ purge = false } = {}) {
  announce('→ 卸载 plugin');
  await uninstallPlugin();

  announce('→ 注销 marketplace');
  await removeMarketplace();

  announce('→ 清理 legacy 安装产物');
  await cleanupLegacyFiles();
  await cleanupLegacySettings();

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
  const purge = process.argv.includes('--purge');
  main({ purge }).catch((err) => {
    process.stderr.write(`❌ 卸载失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { main, uninstallPlugin, removeMarketplace, cleanupLegacyFiles, cleanupLegacySettings };
