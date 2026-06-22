#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, access, constants, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

import { checkNodeVersion, getStateDir, isIamInPath } from './hooks/lib/platform.js';
import { saveConfig, DEFAULT_CONFIG } from './hooks/lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = __dirname;
const MARKETPLACE_NAME = 'oh-my-sdd';
const PLUGIN_NAME = 'oh-my-sdd';

// CLAUDE.md baseline injection — plugin's own CLAUDE.md is NOT auto-loaded,
// and plugin SessionStart hook additionalContext is silently dropped (Anthropic
// bug #16538). The only reliable always-load path is the user-level CLAUDE.md.
const USER_CLAUDE_MD = path.join(os.homedir(), '.claude', 'CLAUDE.md');
const BEGIN_MARKER = '<!-- BEGIN oh-my-sdd:enterprise-baseline -->';
const END_MARKER = '<!-- END oh-my-sdd:enterprise-baseline -->';

// announce writes progress messages to BOTH stdout and stderr.
//
// Why both:
//   - npm postinstall swallows stdout on success → stderr carries the message
//   - Windows PowerShell sometimes swallows child-process stderr → stdout carries it
//   - Direct CLI runs (oms-install) → stdout is the natural stream
//
// Duplication is intentional and harmless in all three scenarios. Users see
// each message once in their terminal regardless of platform.
function announce(msg) {
  process.stdout.write(msg + '\n');
  process.stderr.write(msg + '\n');
}

async function preflight() {
  if (!checkNodeVersion('18.0.0')) {
    process.stderr.write(`❌ Node 版本过低。需要 >= 18.0.0，当前 ${process.version}\n`);
    process.exit(1);
  }
  if (!(await isIamInPath())) {
    process.stderr.write('⚠️  未检测到 iam CLI。可继续安装，但首次会话将提示安装。\n');
    process.stderr.write('    安装后请运行 oms-login 完成身份认证。\n');
  }
  // openspec 是 spec 保鲜的核心——/sdd-review 归档阶段必须用它 merge delta
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['openspec'], { stdio: 'ignore', timeout: 5_000 });
  } catch {
    process.stderr.write('⚠️  未检测到 openspec CLI。可继续安装，但 /sdd-review 归档阶段会阻塞。\n');
    process.stderr.write('    安装：npm install -g @fission-ai/openspec\n');
    process.stderr.write('    作用：archive 时 merge delta 到 openspec/specs/，保持项目 specs 反映系统现状\n');
  }
}

function isClaudeInstalled() {
  if (process.platform === 'win32') {
    // Windows: claude 通常是 npm shim (.cmd)。多试几种扩展名，应对 PATHEXT 被改的情况。
    for (const name of ['claude', 'claude.exe', 'claude.cmd', 'claude.bat']) {
      try {
        execFileSync('where', [name], { stdio: 'ignore', timeout: 5_000 });
        return true;
      } catch { /* try next */ }
    }
    return false;
  }
  try {
    execFileSync('which', ['claude'], { stdio: 'ignore', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function runClaude(args) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    // Windows: claude 是 npm shim (.cmd)，必须用 shell:true 让 cmd.exe 解析。
    // Unix: 直接 spawn。
    const child = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });

    // 30s timeout：claude plugin install 一般 < 10s，超时说明 hang 了。
    // 超时后杀子进程，返回错误而不是让整个 install 永远卡住。
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      resolve({
        code: -1,
        stdout,
        stderr: stderr + `\n⏱ claude 命令超时 (30s)，已强制终止`,
      });
    }, 30_000);
    timer.unref?.();

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message });
    });
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

// Inject baseline into ~/.claude/CLAUDE.md so it's auto-loaded into every
// session's system prompt. Plugin SessionStart hook additionalContext is
// broken (Anthropic bug #16538), so this is the only reliable path.
// Idempotent: replaces content between BEGIN/END markers; preserves user's
// other CLAUDE.md content.
async function injectBaseline() {
  const baselinePath = path.join(PACKAGE_ROOT, 'content', 'enterprise-baseline.md');
  let baseline;
  try {
    baseline = await readFile(baselinePath, 'utf8');
  } catch (err) {
    process.stderr.write(`⚠️  读取 baseline 失败: ${err.message}\n`);
    process.stderr.write('    CLAUDE.md 未注入。请检查 package 是否完整。\n');
    return;
  }

  const section = `${BEGIN_MARKER}\n${baseline.trim()}\n${END_MARKER}\n`;

  let existing = '';
  if (existsSync(USER_CLAUDE_MD)) {
    try {
      existing = await readFile(USER_CLAUDE_MD, 'utf8');
    } catch (err) {
      process.stderr.write(`⚠️  读取 ${USER_CLAUDE_MD} 失败: ${err.message}\n`);
      return;
    }
  }

  const beginIdx = existing.indexOf(BEGIN_MARKER);
  const endIdx = existing.indexOf(END_MARKER);
  let updated;
  if (beginIdx >= 0 && endIdx > beginIdx) {
    // Replace existing section (upgrade path)
    const before = existing.slice(0, beginIdx);
    const after = existing.slice(endIdx + END_MARKER.length);
    updated = before + section + after;
  } else {
    // Append (new install)
    updated = existing + (existing.endsWith('\n') || existing === '' ? '' : '\n') + '\n' + section;
  }

  await mkdir(path.dirname(USER_CLAUDE_MD), { recursive: true });
  await writeFile(USER_CLAUDE_MD, updated);
  announce(`  ✓ 已注入 baseline 到 ${USER_CLAUDE_MD}`);
}

async function registerMarketplace() {
  // Register (or refresh) the marketplace pointing at our package directory.
  // `claude plugin marketplace add` is idempotent — re-running on upgrade just
  // refreshes the cache.
  const result = await runClaude(['plugin', 'marketplace', 'add', PACKAGE_ROOT]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('already') || out.includes('exists') || out.includes('replace')) {
      announce('  (marketplace 已注册，跳过)');
    } else {
      process.stderr.write(`⚠️  claude plugin marketplace add 失败 (exit ${result.code}):\n`);
      process.stderr.write(result.stderr || result.stdout || '(no output)\n');
      process.stderr.write(`    请手动运行：claude plugin marketplace add ${PACKAGE_ROOT}\n`);
    }
    return;
  }
  announce(`  ✓ 已注册 marketplace：${PACKAGE_ROOT}`);
}

async function installPlugin() {
  const result = await runClaude(['plugin', 'install', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('already') || out.includes('installed')) {
      announce('  (plugin 已安装，跳过)');
    } else {
      process.stderr.write(`⚠️  claude plugin install 失败 (exit ${result.code}):\n`);
      process.stderr.write(result.stderr || result.stdout || '(no output)\n');
      process.stderr.write(`    请手动运行：claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
    }
    return;
  }
  announce(`  ✓ 已安装 plugin：${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
}

async function main() {
  await preflight();
  announce('→ 检查 Node 版本与 iam CLI');

  if (!isClaudeInstalled()) {
    process.stderr.write('\n❌ 未检测到 claude CLI。请手动执行：\n');
    process.stderr.write(`  claude plugin marketplace add ${PACKAGE_ROOT}\n`);
    process.stderr.write(`  claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
    process.exit(1);
  }

  announce('→ 初始化 ~/.oh-my-sdd/ 状态目录');
  await ensureStateDir();

  announce('→ 注册 marketplace');
  await registerMarketplace();

  announce('→ 安装 plugin');
  await installPlugin();

  announce('→ 注入 baseline 到 ~/.claude/CLAUDE.md');
  await injectBaseline();

  announce('');
  announce('✓ oh-my-sdd 安装完成');
  announce('');
  announce('下一步：');
  announce('  1. 运行 `oms-login` 完成 iam 身份认证');
  announce('  2. 重启 Claude Code (或 /reload-plugins)');
  announce('  3. 在新会话里使用 /sdd-spec 等命令');
}

// Only run main when invoked directly, not when imported
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { main, preflight, ensureStateDir, registerMarketplace, installPlugin, isClaudeInstalled };
