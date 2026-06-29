#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findClaudeOriginal } from '../hooks/lib/wrapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const PLUGIN_NAME = 'oh-my-sdd@oh-my-sdd';

// 超时配置
const NPM_TIMEOUT_MS = 60_000;  // npm install 可能较慢
const CLAUDE_TIMEOUT_MS = 30_000;

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

// 运行命令（带超时）
function runCommand(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();

    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: controller.signal,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        resolve({ code: -1, stdout: '', stderr: `超时 (${timeoutMs}ms)` });
      } else {
        resolve({ code: -1, stdout: '', stderr: err.message });
      }
    });
  });
}

function runClaude(args) {
  return runCommand('claude', args, CLAUDE_TIMEOUT_MS);
}

function runNpm(args) {
  return runCommand('npm', args, NPM_TIMEOUT_MS);
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

// 步骤 2: 更新 plugin（使用 claude plugin update）
async function updatePlugin() {
  announce('→ 更新 plugin');
  const result = await runClaude(['plugin', 'update', PLUGIN_NAME]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('not installed') || out.includes('not found')) {
      // plugin 未安装，尝试安装
      announce('  (plugin 未安装，尝试安装)');
      const installResult = await runClaude(['plugin', 'install', `${PLUGIN_NAME}@${PACKAGE_ROOT}`]);
      if (installResult.code !== 0) {
        warn(`plugin install 失败 (exit ${installResult.code})`);
        return false;
      }
      success('plugin 已安装');
      return true;
    }
    warn(`plugin update 失败 (exit ${result.code})`);
    warn(result.stderr || result.stdout || '(no output)');
    return false;
  }
  success('plugin 已更新');
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

  // 执行更新流程（简化版）
  const npmOk = await updateNpmPackage();
  const pluginOk = await updatePlugin();

  announce('');
  if (!npmOk || !pluginOk) {
    warn('部分步骤失败，请手动检查');
    announce('');
    announce('手动更新命令:');
    announce('  npm install -g @cli-tools/oh-my-sdd');
    announce(`  claude plugin update ${PLUGIN_NAME}`);
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
