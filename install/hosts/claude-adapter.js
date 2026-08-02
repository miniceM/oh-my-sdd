// install/hosts/claude-adapter.js — Claude Code adapter.
//
// Claude-specific logic:
//   1. Register marketplace (`claude plugin marketplace add`)
//   2. Install plugin (`claude plugin install oh-my-sdd@oh-my-sdd`)
//   3. Install Claude CLI wrapper (intercepts `claude`, injects enterprise baseline)
//   4. Uninstall: remove plugin, marketplace registration, legacy artifacts + wrapper

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { HostAdapter } from '../host-adapter.js';
import { isCliInPath } from '../common/detect.js';
import { installWrapper, findClaudeOriginal, uninstallWrapper } from '../../wrapper/wrapper.js';
import { ensureStateDir } from '../../lib/state-dir.js';
import { getPluginInstallDir, isIamInPath } from '../../lib/platform.js';

const MARKETPLACE_NAME = 'oh-my-sdd';
const PLUGIN_NAME = 'oh-my-sdd';

export function buildClaudeInvocation(
  args,
  { platform = process.platform, comspec = process.env.ComSpec } = {},
) {
  if (platform === 'win32') {
    return {
      command: comspec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'claude.cmd', ...args],
    };
  }
  return { command: 'claude', args };
}

export class ClaudeAdapter extends HostAdapter {
  static id = 'claude';
  static displayName = 'Claude Code';

  static isInstalled() {
    return isCliInPath('claude');
  }

  static preflight(ctx) {
    if (!isIamInPath()) {
      ctx.announce('⚠️  未检测到 iam CLI。可继续安装，但首次会话将提示安装。');
      ctx.announce('    安装后请运行 oms-login 完成身份认证。');
    }
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(cmd, ['openspec'], { stdio: 'ignore' });
    } catch {
      ctx.announce('⚠️  未检测到 openspec CLI。可继续安装，但 /sdd-review 归档阶段会阻塞。');
      ctx.announce('    安装：npm install -g @fission-ai/openspec');
    }
  }

  static async install(ctx) {
    const { PACKAGE_ROOT, announce } = ctx;

    if (!this.isInstalled()) {
      announce('\n❌ 未检测到 claude CLI。请手动执行：');
      announce(`  claude plugin marketplace add ${PACKAGE_ROOT}`);
      announce(`  claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
      // Create state dir before reporting failure — smoke-check depends on it.
      await ensureStateDir();
      const error = new Error('未检测到 claude CLI');
      error.code = 'OMS_CLAUDE_NOT_FOUND';
      throw error;
    }

    announce('→ 初始化 ~/.oh-my-sdd/ 状态目录');
    await ensureStateDir();

    announce('→ 注册 marketplace');
    await this.#registerMarketplace(PACKAGE_ROOT, announce);

    announce('→ 安装 plugin');
    await this.#installPlugin(announce);

    const originalClaude = findClaudeOriginal();
    if (originalClaude) {
      announce('→ 安装 Claude CLI wrapper（企业规则自动注入）');
      await installWrapper(PACKAGE_ROOT, announce);
    } else {
      announce('⚠️  Claude CLI wrapper 未安装（未找到原 claude 二进制）');
      announce('    1) 安装 Claude Code: https://claude.com/download');
      announce('    2) 运行: npm reinstall @cli-tools/oh-my-sdd（重新触发 wrapper 安装）');
    }

    announce('');
    announce('✓ oh-my-sdd (Claude Code) 安装完成');
    announce('');
    announce('下一步：');
    announce('  1. 重启终端（使 PATH 生效）');
    announce('  2. 运行 `oms-login` 完成 iam 身份认证');
    announce('  3. 重启 Claude Code (或 /reload-plugins)');
    announce('  4. 测试企业约束: claude "你的身份是什么？"');
    announce('');
    announce('绕过企业约束: claude --no-enterprise ...');
  }

  static async uninstall(ctx) {
    const { announce } = ctx;
    announce('→ 卸载 Claude Code 适配');

    if (this.isInstalled()) {
      announce('→ 卸载 plugin');
      await this.#uninstallPlugin(announce);

      announce('→ 注销 marketplace');
      await this.#removeMarketplace(announce);
    } else {
      announce('⚠️  未检测到 claude CLI。请手动卸载：');
      announce(`  claude plugin uninstall ${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
      announce('⚠️  请手动注销 marketplace：');
      announce(`  claude plugin marketplace remove ${MARKETPLACE_NAME}`);
    }

    announce('→ 清理 legacy 安装产物');
    await this.#cleanupLegacyFiles(announce);
    await this.#cleanupLegacySettings(announce);

    announce('→ 卸载 Claude CLI wrapper');
    await uninstallWrapper(announce);
  }

  // ============================================
  // Private helpers
  // ============================================

  static #runClaude(args) {
    return new Promise((resolve) => {
      const invocation = buildClaudeInvocation(args);
      const child = spawn(invocation.command, invocation.args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c) => { stdout += c; });
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
    });
  }

  static async #uninstallPlugin(announce) {
    const result = await this.#runClaude(['plugin', 'uninstall', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
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

  static async #removeMarketplace(announce) {
    const result = await this.#runClaude(['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]);
    if (result.code !== 0) {
      announce(`⚠️  claude plugin marketplace remove 失败 (exit ${result.code}):`);
      announce('  ' + (result.stderr || result.stdout || '(no output)'));
      return;
    }
    announce(`  ✓ 已注销 marketplace：${MARKETPLACE_NAME}`);
  }

  static async #cleanupLegacyFiles(announce) {
    const dest = getPluginInstallDir();
    if (existsSync(dest)) {
      await rm(dest, { recursive: true, force: true });
      announce('  ✓ 已清理 legacy 插件目录');
    }
  }

  static async #cleanupLegacySettings(announce) {
    const settingsPath = path.join(path.dirname(getPluginInstallDir()), '..', 'settings.json');
    if (!existsSync(settingsPath)) return;

    let settings;
    try {
      settings = JSON.parse(await readFile(settingsPath, 'utf8'));
    } catch {
      return;
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

  static async #registerMarketplace(packageRoot, announce) {
    const result = await this.#runClaude(['plugin', 'marketplace', 'add', packageRoot]);
    if (result.code !== 0) {
      const out = (result.stderr + result.stdout).toLowerCase();
      if (out.includes('already') || out.includes('exists') || out.includes('replace')) {
        announce('  (marketplace 已注册，跳过)');
      } else {
        process.stderr.write(`⚠️  claude plugin marketplace add 失败 (exit ${result.code}):\n`);
        process.stderr.write(result.stderr || result.stdout || '(no output)\n');
        process.stderr.write(`    请手动运行：claude plugin marketplace add ${packageRoot}\n`);
      }
      return;
    }
    announce(`  ✓ 已注册 marketplace：${packageRoot}`);
  }

  static async #installPlugin(announce) {
    const result = await this.#runClaude(['plugin', 'install', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
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
}
