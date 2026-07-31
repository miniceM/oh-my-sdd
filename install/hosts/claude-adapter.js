// install/hosts/claude-adapter.js — Claude Code adapter.
//
// Claude-specific logic:
//   1. Register marketplace (`claude plugin marketplace add`)
//   2. Install plugin (`claude plugin install oh-my-sdd@oh-my-sdd`)
//   3. Install Claude CLI wrapper (intercepts `claude`, injects enterprise baseline)
//   4. Uninstall: remove plugin + wrapper

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';

import { HostAdapter } from '../host-adapter.js';
import { isCliInPath } from '../common/detect.js';
import { installWrapper, findClaudeOriginal } from '../../wrapper/wrapper.js';
import { ensureStateDir } from '../../lib/state-dir.js';
import { isIamInPath } from '../../lib/platform.js';

const MARKETPLACE_NAME = 'oh-my-sdd';
const PLUGIN_NAME = 'oh-my-sdd';

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
      // Create state dir before exiting — smoke-check depends on this side effect
      await ensureStateDir();
      process.exit(1);
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
    ctx.announce('→ 卸载 Claude Code 适配');

    // 1. Uninstall plugin via claude CLI
    const result = await this.#runClaude(['plugin', 'uninstall', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
    if (result.code !== 0) {
      const out = (result.stderr + result.stdout).toLowerCase();
      if (!out.includes('not installed') && !out.includes('not found')) {
        ctx.announce(`  ⚠️  claude plugin uninstall 失败 (exit ${result.code})`);
      }
    } else {
      ctx.announce(`  ✓ 已卸载 plugin: ${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
    }

    // 2. Remove wrapper
    const { uninstallWrapper } = await import('../../wrapper/wrapper.js');
    await uninstallWrapper(ctx.announce);
  }

  // ============================================
  // Private helpers
  // ============================================

  static #runClaude(args) {
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