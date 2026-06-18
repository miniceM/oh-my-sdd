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
    process.stdout.write('⚠️  未检测到 claude CLI。请手动卸载：\n');
    process.stdout.write(`  claude plugin uninstall ${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
    return;
  }
  const result = await runClaude(['plugin', 'uninstall', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('not installed') || out.includes('not found')) {
      process.stdout.write('  (plugin 未安装，跳过)\n');
    } else {
      process.stdout.write(`⚠️  claude plugin uninstall 失败 (exit ${result.code}):\n`);
      process.stdout.write(result.stderr || result.stdout || '(no output)\n');
    }
    return;
  }
  process.stdout.write(`  ✓ 已卸载 plugin：${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
}

async function removeMarketplace() {
  if (!isClaudeInstalled()) {
    process.stdout.write('⚠️  请手动注销 marketplace：\n');
    process.stdout.write(`  claude plugin marketplace remove ${MARKETPLACE_NAME}\n`);
    return;
  }
  const result = await runClaude(['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]);
  if (result.code !== 0) {
    process.stdout.write(`⚠️  claude plugin marketplace remove 失败 (exit ${result.code}):\n`);
    process.stdout.write(result.stderr || result.stdout || '(no output)\n');
    return;
  }
  process.stdout.write(`  ✓ 已注销 marketplace：${MARKETPLACE_NAME}\n`);
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
      process.stdout.write('  ✓ 已清理 legacy settings.json 条目\n');
    } catch (err) {
      process.stdout.write(`  ⚠️  清理 settings.json 失败：${err.message}\n`);
    }
  }
}

// Legacy cleanup: old install.js copied files to ~/.claude/plugins/oh-my-sdd/
// (non-standard path that Claude Code doesn't read). Remove if exists.
async function cleanupLegacyFiles() {
  const dest = getPluginInstallDir();
  if (existsSync(dest)) {
    await rm(dest, { recursive: true, force: true });
    process.stdout.write('  ✓ 已清理 legacy 插件目录\n');
  }
}

async function main({ purge = false } = {}) {
  process.stdout.write('→ 卸载 plugin\n');
  await uninstallPlugin();

  process.stdout.write('→ 注销 marketplace\n');
  await removeMarketplace();

  process.stdout.write('→ 清理 legacy 安装产物\n');
  await cleanupLegacyFiles();
  await cleanupLegacySettings();

  if (purge) {
    process.stdout.write('→ --purge: 同时移除 ~/.oh-my-sdd/ 状态目录\n');
    await rm(getStateDir(), { recursive: true, force: true });
  } else {
    process.stdout.write('\n✓ oh-my-sdd 已卸载\n');
    process.stdout.write('  状态文件保留在 ~/.oh-my-sdd/，重装可复用\n');
    process.stdout.write('  彻底清理请运行：oms-uninstall --purge\n');
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
