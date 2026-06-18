#!/usr/bin/env node
import { rm } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPluginInstallDir } from './hooks/lib/platform.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETPLACE_ID = 'oh-my-sdd';

async function removePluginFiles() {
  const dest = getPluginInstallDir();
  await rm(dest, { recursive: true, force: true });
}

async function isClaudeInstalled() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['claude'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function deregisterMarketplace() {
  if (!(await isClaudeInstalled())) {
    process.stdout.write('⚠️  未检测到 claude CLI。请手动注销 marketplace：\n');
    process.stdout.write(`    claude plugin marketplace remove ${MARKETPLACE_ID}\n`);
    return;
  }
  process.stdout.write('→ 通过 claude CLI 注销 marketplace\n');
  const result = await new Promise((resolve) => {
    const child = spawn('claude', ['plugin', 'marketplace', 'remove', MARKETPLACE_ID], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
  });
  if (result.code !== 0) {
    process.stdout.write(`⚠️  claude plugin marketplace remove 失败 (exit ${result.code}):\n`);
    process.stdout.write(result.stderr || result.stdout || '(no output)\n');
  }
}

async function main({ purge = false } = {}) {
  process.stdout.write('→ 移除 ~/.claude/plugins/oh-my-sdd/\n');
  await removePluginFiles();
  await deregisterMarketplace();
  if (purge) {
    const { getStateDir } = await import('./hooks/lib/platform.js');
    process.stdout.write('→ --purge: 同时移除 ~/.oh-my-sdd/ 状态目录\n');
    const { rm } = await import('node:fs/promises');
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

export { main };
