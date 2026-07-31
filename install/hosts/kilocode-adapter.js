// install/hosts/kilocode-adapter.js — Kilo Code adapter.
//
// Kilo Code does NOT have a hooks system — critical difference from Claude Code.
// Baseline injection is advisory only via AGENTS.md. No enforcement mechanism.
//
// Implementation based on research notes at:
// docs/superpowers/research/2026-07-31-kilocode-plugin-model.md

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

import { HostAdapter } from '../host-adapter.js';
import { writeSentinel, readSentinel, sentinelPathFor } from '../common/sentinel.js';
import { copySkillsToDir, rmIfExists } from '../common/fs.js';
import { isCliInPath, isDirPresent } from '../common/detect.js';

const HOME = homedir();

// Kilo Code paths
const KILO_DIR = join(HOME, '.kilo');
const KILO_SKILLS_DIR = join(KILO_DIR, 'skills');
const KILO_CONFIG_DIR = join(HOME, '.config', 'kilo');
const KILO_AGENTS_MD = join(KILO_CONFIG_DIR, 'AGENTS.md');

export class KiloCodeAdapter extends HostAdapter {
  static id = 'kilocode';
  static displayName = 'Kilo Code';

  // Capability flags for callers to inspect
  static capabilities = {
    hooks: false,
    baselineEnforcement: 'advisory',
  };

  static isInstalled() {
    if (isCliInPath('kilo')) return true;
    return isDirPresent(KILO_DIR) || isDirPresent(KILO_CONFIG_DIR);
  }

  static preflight(ctx) {
    ctx.announce('⚠️  Kilo Code 无 hooks 系统，HARD_RULE 无法在 hook 层强制执行。');
    ctx.announce('    baseline 通过 AGENTS.md 注入，为建议性约束（advisory-only）。');
    ctx.announce('    安全洋葱模型第 3-5 层（hook 强制）不适用于 Kilo Code。');

    if (!this.isInstalled()) {
      ctx.announce('⚠️  未检测到 Kilo Code。安装后运行 /reload 加载 skills。');
      ctx.announce('    安装: https://kilo.ai');
    }
  }

  static async install(ctx) {
    const { PACKAGE_ROOT, announce } = ctx;

    announce('→ 安装 Kilo Code 适配');

    // Step 1: Copy skills to ~/.kilo/skills/
    await copySkillsToDir(join(PACKAGE_ROOT, 'skills'), KILO_SKILLS_DIR, announce);

    // Step 2: Inject baseline via AGENTS.md (advisory only)
    await this.#injectBaseline(PACKAGE_ROOT, announce);

    // Step 3: Write sentinel for uninstall tracking
    await writeSentinel('kilocode', KILO_AGENTS_MD, null, announce);

    announce('');
    announce('✓ oh-my-sdd (Kilo Code) 安装完成');
    announce('');
    announce('限制说明：');
    announce('  - 无 hooks 系统，HARD_RULE 无法在 hook 层强制执行');
    announce('  - baseline 为建议性约束（AGENTS.md），agent 可能忽略或覆盖');
    announce('  - 安全洋葱模型第 3-5 层（hook 强制）不适用');
    announce('');
    announce('下一步：');
    announce('  1. 在 Kilo Code 中运行 /reload 加载新 skills');
    announce('  2. AGENTS.md 在 ~/.config/kilo/AGENTS.md（自动发现）');
    announce('');
    announce('卸载：oms-uninstall --tool kilocode');
  }

  static async uninstall(ctx) {
    const { announce } = ctx;

    announce('→ 卸载 Kilo Code 适配');

    // Step 1: Delete skills directory
    if (await rmIfExists(KILO_SKILLS_DIR)) {
      announce(`  ✓ 已删除: ${KILO_SKILLS_DIR}`);
    }

    // Step 2: Delete AGENTS.md baseline
    if (await rmIfExists(KILO_AGENTS_MD)) {
      announce(`  ✓ 已删除: ${KILO_AGENTS_MD}`);
    }

    // Step 3: Clean up sentinel file
    const sentinel = await readSentinel('kilocode');
    if (sentinel) {
      await rmIfExists(sentinelPathFor('kilocode'));
      announce('  ✓ 已删除哨兵文件');
    }
  }

  // ---- Private helpers ----

  static async #injectBaseline(packageRoot, announce) {
    const baselinePath = resolve(
      dirname(new URL(import.meta.url).pathname),
      '..',
      '..',
      'content',
      'enterprise-baseline.md'
    );
    const baseline = await readFile(baselinePath, 'utf8');

    // Kilo Code AGENTS.md doesn't accept frontmatter — strip it
    const bodyOnly = baseline.replace(/^---[\s\S]*?---\n/, '');

    await mkdir(KILO_CONFIG_DIR, { recursive: true });
    await writeFile(KILO_AGENTS_MD, bodyOnly, { mode: 0o644 });
    announce(`  ✓ baseline 已写入: ${KILO_AGENTS_MD}`);
  }
}