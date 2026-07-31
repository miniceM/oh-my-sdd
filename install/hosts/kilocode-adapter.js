// install/hosts/kilocode-adapter.js — Kilo Code adapter.
//
// Kilo Code does NOT have a hooks system — critical difference from Claude Code.
// Baseline injection is advisory only via AGENTS.md. No enforcement mechanism.
//
// Implementation based on research notes at:
// docs/superpowers/research/2026-07-31-kilocode-plugin-model.md

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HostAdapter } from '../host-adapter.js';
import {
  removeSentinelBlock,
  upsertSentinelBlock,
  writeSentinel,
  readSentinel,
  sentinelPathFor,
} from '../common/sentinel.js';
import {
  installSkillsWithOwnership,
  restoreSkillsFromOwnership,
  rmIfExists,
  skillOwnershipFromSentinel,
} from '../common/fs.js';
import { isCliInPath, isDirPresent } from '../common/detect.js';

const HOME = homedir();

// Kilo Code paths
const KILO_DIR = join(HOME, '.kilo');
const KILO_SKILLS_DIR = join(KILO_DIR, 'skills');
const KILO_CONFIG_DIR = join(HOME, '.config', 'kilo');
const KILO_AGENTS_MD = join(KILO_CONFIG_DIR, 'AGENTS.md');
const KILO_SKILLS_BACKUP_DIR = join(HOME, '.oh-my-sdd', 'backups', 'kilocode', 'skills');

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
    const skillsSource = join(PACKAGE_ROOT, 'skills');
    const installedSkillNames = await this.#getSkillNames(skillsSource);
    const previousSentinel = await readSentinel('kilocode');
    const skillOwnership = await installSkillsWithOwnership(
      skillsSource,
      KILO_SKILLS_DIR,
      KILO_SKILLS_BACKUP_DIR,
      skillOwnershipFromSentinel(previousSentinel),
      announce,
    );

    // Step 2: Inject baseline via AGENTS.md (advisory only)
    await this.#injectBaseline(PACKAGE_ROOT, announce);

    // Step 3: Write sentinel for uninstall tracking
    await writeSentinel('kilocode', KILO_AGENTS_MD, null, announce, {
      skill_names: installedSkillNames,
      skill_ownership: skillOwnership,
    });

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

    const sentinel = await readSentinel('kilocode');

    // Step 1: Delete only skill directories installed by oh-my-sdd.
    // Never remove the shared ~/.kilo/skills directory.
    const fallbackSkillsSource = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'skills'
    );
    if (Array.isArray(sentinel?.skill_ownership)) {
      const result = await restoreSkillsFromOwnership(
        KILO_SKILLS_DIR,
        KILO_SKILLS_BACKUP_DIR,
        sentinel.skill_ownership,
      );
      if (result.removed > 0) announce(`  ✓ 已删除 ${result.removed} 个 oh-my-sdd skills`);
      if (result.restored > 0) announce(`  ✓ 已恢复 ${result.restored} 个用户 skills`);
    } else {
      const skillNames = Array.isArray(sentinel?.skill_names)
        ? sentinel.skill_names
        : await this.#getSkillNames(fallbackSkillsSource);
      let removedSkills = 0;
      for (const skillName of skillNames) {
        if (!this.#isSafeSkillName(skillName)) continue;
        if (await rmIfExists(join(KILO_SKILLS_DIR, skillName))) removedSkills++;
      }
      if (removedSkills > 0) announce(`  ✓ 已删除 ${removedSkills} 个 oh-my-sdd skills`);
    }

    // Step 2: Remove only the OMS block from AGENTS.md.
    await this.#removeBaselineBlock(sentinel?.dest ?? KILO_AGENTS_MD, announce);

    // Step 3: Clean up sentinel file
    if (sentinel) {
      await rmIfExists(sentinelPathFor('kilocode'));
      announce('  ✓ 已删除哨兵文件');
    }
  }

  // ---- Private helpers ----

  static async #injectBaseline(packageRoot, announce) {
    const baselinePath = join(packageRoot, 'content', 'enterprise-baseline.md');
    const baseline = await readFile(baselinePath, 'utf8');

    // Kilo Code AGENTS.md doesn't accept frontmatter — strip it
    const bodyOnly = baseline.replace(/^---[\s\S]*?---\n/, '');

    let existing = '';
    try {
      existing = await readFile(KILO_AGENTS_MD, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    await mkdir(KILO_CONFIG_DIR, { recursive: true });
    await writeFile(KILO_AGENTS_MD, upsertSentinelBlock(existing, bodyOnly), { mode: 0o644 });
    announce(`  ✓ baseline 已写入: ${KILO_AGENTS_MD}`);
  }

  static async #removeBaselineBlock(agentsPath, announce) {
    let existing;
    try {
      existing = await readFile(agentsPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }

    const cleaned = removeSentinelBlock(existing);
    if (cleaned.length === 0) {
      await rmIfExists(agentsPath);
    } else {
      await writeFile(agentsPath, cleaned, { mode: 0o644 });
    }
    announce(`  ✓ 已移除 baseline 块: ${agentsPath}`);
  }

  static async #getSkillNames(skillsSource) {
    let entries;
    try {
      entries = await readdir(skillsSource, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }

    return entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(join(skillsSource, entry.name, 'SKILL.md')))
      .map((entry) => entry.name);
  }

  static #isSafeSkillName(skillName) {
    return typeof skillName === 'string'
      && skillName !== '.'
      && skillName !== '..'
      && !skillName.includes('/')
      && !skillName.includes('\\');
  }
}
