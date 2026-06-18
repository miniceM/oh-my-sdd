#!/usr/bin/env node
import { cp, mkdir, access, constants, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkNodeVersion, getPluginInstallDir, getStateDir, isIamInPath
} from './hooks/lib/platform.js';
import { saveConfig, DEFAULT_CONFIG } from './hooks/lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = __dirname;

async function preflight() {
  if (!checkNodeVersion('18.0.0')) {
    process.stderr.write(`❌ Node 版本过低。需要 >= 18.0.0，当前 ${process.version}\n`);
    process.exit(1);
  }
  if (!(await isIamInPath())) {
    process.stderr.write('⚠️  未检测到 iam CLI。可继续安装，但首次会话将提示安装。\n');
    process.stderr.write('    安装后请运行 oms-login 完成身份认证。\n');
  }
}

async function copyPluginFiles() {
  const dest = getPluginInstallDir();
  await mkdir(path.dirname(dest), { recursive: true });
  // Remove existing installation (if upgrading)
  if (existsSync(dest)) {
    await rm(dest, { recursive: true, force: true });
  }
  // Copy the relevant subdirs
  const subdirs = ['commands', 'skills', 'content', 'hooks', 'bin'];
  for (const sub of subdirs) {
    await cp(path.join(PACKAGE_ROOT, sub), path.join(dest, sub), { recursive: true });
  }
  // Copy .claude-plugin/ directory (contains plugin.json + marketplace.json manifests)
  await cp(path.join(PACKAGE_ROOT, '.claude-plugin'), path.join(dest, '.claude-plugin'), { recursive: true });
  // Copy other root manifests (skip any not yet shipped — forward-compatible during
  // staggered releases where e.g. README.md or uninstall.js lag behind)
  for (const f of ['package.json', 'install.js', 'uninstall.js', 'README.md']) {
    if (!existsSync(path.join(PACKAGE_ROOT, f))) continue;
    await cp(path.join(PACKAGE_ROOT, f), path.join(dest, f));
  }
  return dest;
}

async function ensureStateDir() {
  await mkdir(getStateDir(), { recursive: true, mode: 0o700 });
  // Initialize config with defaults if not present
  try {
    await access(path.join(getStateDir(), 'config.json'), constants.F_OK);
  } catch {
    await saveConfig(DEFAULT_CONFIG);
  }
}

async function isClaudeInstalled() {
  // Check if `claude` is in PATH
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['claude'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function registerMarketplace(dest) {
  if (!(await isClaudeInstalled())) {
    process.stdout.write('⚠️  未检测到 claude CLI。请手动注册 marketplace：\n');
    process.stdout.write(`    claude plugin marketplace add ${dest}\n`);
    process.stdout.write(`    或在 Claude Code 内：/plugin marketplace add ${dest}\n`);
    return;
  }
  process.stdout.write('→ 通过 claude CLI 注册本地 marketplace\n');
  const result = await new Promise((resolve) => {
    const child = spawn('claude', ['plugin', 'marketplace', 'add', dest], {
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
    process.stderr.write(`⚠️  claude plugin marketplace add 失败 (exit ${result.code}):\n`);
    process.stderr.write(result.stderr || result.stdout || '(no output)\n');
    process.stderr.write(`    请手动运行：claude plugin marketplace add ${dest}\n`);
  }
}

async function main() {
  await preflight();
  process.stdout.write('→ 检查 Node 版本与 iam CLI\n');
  process.stdout.write('→ 复制插件文件到 ~/.claude/plugins/oh-my-sdd/\n');
  const dest = await copyPluginFiles();
  process.stdout.write(`  完成：${dest}\n`);
  process.stdout.write('→ 初始化 ~/.oh-my-sdd/ 状态目录\n');
  await ensureStateDir();
  await registerMarketplace(dest);
  process.stdout.write('\n✓ oh-my-sdd 安装完成\n\n');
  process.stdout.write('下一步：\n');
  process.stdout.write('  1. 运行 `oms-login` 完成 iam 身份认证\n');
  process.stdout.write('  2. 重启 Claude Code\n');
  process.stdout.write('  3. 在新会话里使用 /sdd-spec 等命令\n');
}

// Only run main when invoked directly, not when imported
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { main, copyPluginFiles, ensureStateDir, registerMarketplace, preflight };
