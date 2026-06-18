#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, access, constants } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkNodeVersion, getStateDir, isIamInPath } from './hooks/lib/platform.js';
import { saveConfig, DEFAULT_CONFIG } from './hooks/lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = __dirname;
const MARKETPLACE_NAME = 'oh-my-sdd';
const PLUGIN_NAME = 'oh-my-sdd';

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

async function ensureStateDir() {
  await mkdir(getStateDir(), { recursive: true, mode: 0o700 });
  try {
    await access(path.join(getStateDir(), 'config.json'), constants.F_OK);
  } catch {
    await saveConfig(DEFAULT_CONFIG);
  }
}

async function registerMarketplace() {
  // Register (or refresh) the marketplace pointing at our package directory.
  // `claude plugin marketplace add` is idempotent — re-running on upgrade just
  // refreshes the cache.
  const result = await runClaude(['plugin', 'marketplace', 'add', PACKAGE_ROOT]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('already') || out.includes('exists') || out.includes('replace')) {
      process.stdout.write('  (marketplace 已注册，跳过)\n');
    } else {
      process.stderr.write(`⚠️  claude plugin marketplace add 失败 (exit ${result.code}):\n`);
      process.stderr.write(result.stderr || result.stdout || '(no output)\n');
      process.stderr.write(`    请手动运行：claude plugin marketplace add ${PACKAGE_ROOT}\n`);
    }
    return;
  }
  process.stdout.write(`  ✓ 已注册 marketplace：${PACKAGE_ROOT}\n`);
}

async function installPlugin() {
  const result = await runClaude(['plugin', 'install', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('already') || out.includes('installed')) {
      process.stdout.write('  (plugin 已安装，跳过)\n');
    } else {
      process.stderr.write(`⚠️  claude plugin install 失败 (exit ${result.code}):\n`);
      process.stderr.write(result.stderr || result.stdout || '(no output)\n');
      process.stderr.write(`    请手动运行：claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
    }
    return;
  }
  process.stdout.write(`  ✓ 已安装 plugin：${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
}

async function main() {
  await preflight();
  process.stdout.write('→ 检查 Node 版本与 iam CLI\n');

  if (!isClaudeInstalled()) {
    process.stderr.write('\n❌ 未检测到 claude CLI。请手动执行：\n');
    process.stderr.write(`  claude plugin marketplace add ${PACKAGE_ROOT}\n`);
    process.stderr.write(`  claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
    process.exit(1);
  }

  process.stdout.write('→ 初始化 ~/.oh-my-sdd/ 状态目录\n');
  await ensureStateDir();

  process.stdout.write('→ 注册 marketplace\n');
  await registerMarketplace();

  process.stdout.write('→ 安装 plugin\n');
  await installPlugin();

  process.stdout.write('\n✓ oh-my-sdd 安装完成\n\n');
  process.stdout.write('下一步：\n');
  process.stdout.write('  1. 运行 `oms-login` 完成 iam 身份认证\n');
  process.stdout.write('  2. 重启 Claude Code (或 /reload-plugins)\n');
  process.stdout.write('  3. 在新会话里使用 /sdd-spec 等命令\n');
}

// Only run main when invoked directly, not when imported
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { main, preflight, ensureStateDir, registerMarketplace, installPlugin, isClaudeInstalled };
