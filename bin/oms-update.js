#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findClaudeOriginal } from '../hooks/lib/wrapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const MARKETPLACE_NAME = 'oh-my-sdd';
const PLUGIN_NAME = 'oh-my-sdd';

// announce 输出到 stderr
function announce(msg) {
  process.stderr.write(msg + '\n');
}

function warn(msg) {
  process.stderr.write(`⚠️  ${msg}\n`);
}

function success(msg) {
  process.stderr.write(`✓ ${msg}\n`);
}

// 运行 Claude 命令
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

// 运行 npm 命令
function runNpm(args) {
  return new Promise((resolve) => {
    const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
  });
}

// 步骤 1: npm install 更新包
async function updateNpmPackage() {
  announce('→ 更新 npm 包');
  const result = await runNpm(['install', '-g', '@cli-tools/oh-my-sdd']);
  if (result.code !== 0) {
    warn(`npm install 失败 (exit ${result.code})`);
    warn(result.stderr || result.stdout || '(no output)');
    return false;
  }
  success('npm 包已更新');
  return true;
}

// 步骤 2: 卸载旧 plugin
async function uninstallPlugin() {
  announce('→ 卸载旧 plugin');
  const result = await runClaude(['plugin', 'uninstall', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('not installed') || out.includes('not found')) {
      announce('  (plugin 未安装，跳过)');
      return true;
    }
    warn(`plugin uninstall 失败 (exit ${result.code})`);
    return false;
  }
  success('旧 plugin 已卸载');
  return true;
}

// 步骤 3: 重新注册 marketplace
async function registerMarketplace() {
  announce('→ 注册 marketplace');
  const result = await runClaude(['plugin', 'marketplace', 'add', PACKAGE_ROOT]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('already') || out.includes('exists') || out.includes('replace')) {
      announce('  (marketplace 已注册)');
      return true;
    }
    warn(`marketplace add 失败 (exit ${result.code})`);
    return false;
  }
  success('marketplace 已注册');
  return true;
}

// 步骤 4: 安装新 plugin
async function installPlugin() {
  announce('→ 安装新 plugin');
  const result = await runClaude(['plugin', 'install', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
  if (result.code !== 0) {
    warn(`plugin install 失败 (exit ${result.code})`);
    warn(result.stderr || result.stdout || '(no output)');
    return false;
  }
  success('新 plugin 已安装');
  return true;
}

async function main() {
  announce('');
  announce('oh-my-sdd 自动更新');
  announce('');

  // 检查 Claude 是否可用
  const originalClaude = findClaudeOriginal();
  if (!originalClaude) {
    warn('未找到 Claude CLI');
    announce('请确保 Claude Code 已安装');
    process.exit(1);
  }

  // 执行更新流程
  const steps = [
    { name: 'npm', fn: updateNpmPackage },
    { name: 'uninstall', fn: uninstallPlugin },
    { name: 'marketplace', fn: registerMarketplace },
    { name: 'install', fn: installPlugin },
  ];

  let failed = false;
  for (const step of steps) {
    const ok = await step.fn();
    if (!ok && step.name !== 'uninstall') {
      // uninstall 失败可继续（可能未安装）
      failed = true;
    }
  }

  announce('');
  if (failed) {
    warn('部分步骤失败，请手动检查');
    announce('');
    announce('手动更新命令:');
    announce('  npm install -g @cli-tools/oh-my-sdd');
    announce(`  claude plugin marketplace add ${PACKAGE_ROOT}`);
    announce(`  claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
    process.exit(1);
  }

  success('更新完成');
  announce('');
  announce('下一步:');
  announce('  1. 运行 /reload-plugins 或重启 Claude Code');
  announce('  2. 重启终端（使 wrapper PATH 生效）');
  announce('');
}

main().catch((err) => {
  process.stderr.write(`❌ 更新失败：${err.stack ?? err.message}\n`);
  process.exit(1);
});