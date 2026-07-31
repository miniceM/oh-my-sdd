// install/hosts/lingma-adapter.js — 通义灵码 lingma CN adapter.
//
// Lingma-specific logic:
//   1. Copy skills to ~/.lingma/skills/
//   2. Write baseline to ~/.lingma/rules/oh-my-sdd.md (Always-type rule)
//   3. Merge OMS handlers into ~/.lingma/settings.json (preserve user handlers)
//   4. Write sentinel to ~/.oh-my-sdd/baseline-lingma.sentinel
//   5. Record OMS-owned skills and hook commands for precise uninstall
//
// Uninstall:
//   1. Delete only OMS-owned skill subdirectories
//   2. Delete rule file
//   3. Surgically remove OMS handlers from hook events
//   4. Delete sentinel

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

import { HostAdapter } from '../host-adapter.js';
import { writeSentinel, readSentinel, sentinelPathFor } from '../common/sentinel.js';
import { copySkillsToDir, rmIfExists } from '../common/fs.js';
import { isCliInPath, isDirPresent } from '../common/detect.js';

const HOME = homedir();

// Lingma-specific paths
const LINGMA_DIR = join(HOME, '.lingma');
const LINGMA_SKILLS_DIR = join(LINGMA_DIR, 'skills');
const LINGMA_SETTINGS = join(LINGMA_DIR, 'settings.json');
const LINGMA_RULES_DIR = join(LINGMA_DIR, 'rules');
const LINGMA_RULE_FILE = join(LINGMA_RULES_DIR, 'oh-my-sdd.md');

// Hook events OMS injects. The event itself is shared with users; only OMS
// command handlers inside these arrays belong to this plugin.
const OOMS_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];

export class LingmaAdapter extends HostAdapter {
  static id = 'lingma';
  static displayName = '通义灵码 Lingma CN';

  static isInstalled() {
    // Lingma may not register a CLI; also check ~/.lingma/ presence
    if (isCliInPath('lingma')) return true;
    return isDirPresent(LINGMA_DIR);
  }

  static preflight(ctx) {
    if (!this.isInstalled()) {
      ctx.announce('⚠️  未检测到通义灵码 (lingma) IDE。已写入 rules + 合并 settings.json，但 IDE 不在时不生效。');
      ctx.announce('    安装：https://lingma.aliyun.com');
    }
  }

  static async install(ctx) {
    const { PACKAGE_ROOT, announce } = ctx;

    if (this.#isHomeDir(process.cwd())) {
      announce('⚠️  当前目录是 HOME 目录，建议 cd 到项目目录后再装');
    }

    announce('→ 安装通义灵码 lingma CN 适配');
    await copySkillsToDir(join(PACKAGE_ROOT, 'skills'), LINGMA_SKILLS_DIR, announce);
    const skillNames = await this.#listSkillNames(join(PACKAGE_ROOT, 'skills'));
    await this.#injectBaseline(announce);
    const hookCommands = await this.#generateSettings(PACKAGE_ROOT, announce);
    await writeSentinel('lingma', LINGMA_RULE_FILE, null, announce, {
      skill_names: skillNames,
      hook_commands: hookCommands,
    });

    announce('');
    announce('✓ oh-my-sdd (通义灵码) 安装完成');
    announce('');
    announce('下一步：');
    announce('  1. 重启通义灵码 IDE（加载新 skills + rules）');
    announce('  2. baseline 已写入 ~/.lingma/rules/oh-my-sdd.md（Always 类型规则自动生效）');
    announce('  3. hooks 已合并到 ~/.lingma/settings.json（保留你的其他 hook 事件）');
    announce('  4. 测试企业约束：问 "你的身份是什么？"，应回复"企业 SDD Agent"');
    announce('');
    announce('卸载（仅清 lingma）：oms-uninstall --tool lingma   # 保留 ~/.oh-my-sdd/ 状态目录');
    announce('完整卸载：npm uninstall -g @cli-tools/oh-my-sdd   # preuninstall 自动清三套产物');
  }

  static async uninstall(ctx) {
    const { announce } = ctx;

    announce('→ 卸载通义灵码 lingma 适配');

    const sentinel = await readSentinel('lingma');
    const packageRoot = ctx.PACKAGE_ROOT;
    const fallbackSkillsSource = packageRoot
      ? join(packageRoot, 'skills')
      : resolve(dirname(new URL(import.meta.url).pathname), '..', '..', 'skills');
    const skillNames = Array.isArray(sentinel?.skill_names)
      ? sentinel.skill_names
      : await this.#listSkillNames(fallbackSkillsSource);

    // 1. Delete only skill directories installed by OMS. ~/.lingma/skills is
    // shared with user-created skills and other plugins and must survive.
    let removedSkills = 0;
    for (const skillName of skillNames) {
      if (!this.#isSafeSkillName(skillName)) continue;
      if (await rmIfExists(join(LINGMA_SKILLS_DIR, skillName))) removedSkills++;
    }
    if (removedSkills > 0) {
      announce(`  ✓ 已删除 ${removedSkills} 个 oh-my-sdd skills`);
    }

    // 2. Delete rule file
    if (await rmIfExists(LINGMA_RULE_FILE)) {
      announce(`  ✓ 已删除: ${LINGMA_RULE_FILE}`);
    }

    // 3. Remove OMS hooks from settings.json
    let hookCommands = Array.isArray(sentinel?.hook_commands) ? sentinel.hook_commands : [];
    if (hookCommands.length === 0 && packageRoot) {
      hookCommands = await this.#readTemplateHookCommands(packageRoot);
    }
    await this.#removeOmsHooksFromSettings(hookCommands, announce);

    // 4. Clean up sentinel file
    if (sentinel) {
      await rmIfExists(sentinelPathFor('lingma'));
      announce('  ✓ 已删除哨兵文件');
    }
  }

  // ---- Private helpers ----

  static #isHomeDir(p) {
    try {
      return resolve(p) === resolve(HOME);
    } catch {
      return false;
    }
  }

  static async #injectBaseline(announce) {
    const baselinePath = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', 'content', 'lingma-baseline.md');
    const baseline = await readFile(baselinePath, 'utf8');
    // Strip frontmatter (rules don't accept frontmatter)
    const bodyOnly = baseline.replace(/^---[\s\S]*?---\n/, '');

    await mkdir(LINGMA_RULES_DIR, { recursive: true });
    await writeFile(LINGMA_RULE_FILE, bodyOnly, { mode: 0o644 });
    announce(`  ✓ baseline 已写入: ${LINGMA_RULE_FILE}`);
  }

  static async #generateSettings(packageRoot, announce) {
    const tplPath = join(packageRoot, 'install', 'common', 'fixtures', 'lingma-settings.json');
    const tpl = JSON.parse(await readFile(tplPath, 'utf8'));

    // Replace <PLUGIN_ROOT> with absolute path
    const tplStr = JSON.stringify(tpl).replaceAll('<PLUGIN_ROOT>', packageRoot);
    const omsHooks = JSON.parse(tplStr).hooks;
    const currentCommands = this.#hookCommands(omsHooks);
    const previousOwnership = await readSentinel('lingma');
    const ownedCommands = new Set([
      ...currentCommands,
      ...(previousOwnership?.hook_commands ?? []),
    ]);

    // Deep merge into ~/.lingma/settings.json
    let existing = {};
    if (existsSync(LINGMA_SETTINGS)) {
      try {
        existing = JSON.parse(await readFile(LINGMA_SETTINGS, 'utf8'));
      } catch {
        announce('  ⚠️  现有 ~/.lingma/settings.json JSON 损坏，将备份并重写');
        existing = {};
      }
    }

    if (!existing.hooks) existing.hooks = {};
    // Remove only previously installed OMS handlers, then append the current
    // template. This makes reinstall idempotent without taking ownership of an
    // entire event array that may also contain user handlers.
    for (const evt of OOMS_EVENTS) {
      const userEntries = this.#withoutOwnedHandlers(existing.hooks[evt], ownedCommands);
      existing.hooks[evt] = [...userEntries, ...(omsHooks[evt] ?? [])];
    }

    await mkdir(LINGMA_DIR, { recursive: true });
    await writeFile(LINGMA_SETTINGS, JSON.stringify(existing, null, 2) + '\n', { mode: 0o644 });
    announce(`  ✓ 通义灵码 settings.json 已更新: ${LINGMA_SETTINGS}`);
    return currentCommands;
  }

  static async #removeOmsHooksFromSettings(hookCommands, announce) {
    if (!existsSync(LINGMA_SETTINGS)) return;

    let settings;
    try {
      settings = JSON.parse(await readFile(LINGMA_SETTINGS, 'utf8'));
    } catch {
      announce('  ⚠️  ~/.lingma/settings.json JSON 损坏，跳过');
      return;
    }
    if (!settings.hooks) return;

    const ownedCommands = new Set(hookCommands);
    let changed = false;
    for (const evt of OOMS_EVENTS) {
      if (!settings.hooks[evt]) continue;
      const before = JSON.stringify(settings.hooks[evt]);
      const remaining = this.#withoutOwnedHandlers(settings.hooks[evt], ownedCommands);
      if (remaining.length === 0) {
        delete settings.hooks[evt];
      } else {
        settings.hooks[evt] = remaining;
      }
      if (JSON.stringify(remaining) !== before) {
        changed = true;
      }
    }
    if (changed) {
      // Clean up empty hooks object
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
      await writeFile(LINGMA_SETTINGS, JSON.stringify(settings, null, 2) + '\n', { mode: 0o644 });
      announce(`  ✓ 已从 settings.json 移除 oh-my-sdd hooks: ${LINGMA_SETTINGS}`);
    } else {
      announce('  (settings.json 无 oh-my-sdd hooks，跳过)');
    }
  }

  static #hookCommands(hooks) {
    return OOMS_EVENTS.flatMap(evt => hooks[evt] ?? [])
      .flatMap(entry => Array.isArray(entry.hooks) ? entry.hooks : [])
      .map(hook => hook?.command)
      .filter(command => typeof command === 'string');
  }

  static #withoutOwnedHandlers(entries, ownedCommands) {
    if (!Array.isArray(entries)) return [];
    return entries.flatMap(entry => {
      if (!Array.isArray(entry?.hooks)) return [entry];
      const hooks = entry.hooks.filter(hook => !ownedCommands.has(hook?.command));
      return hooks.length > 0 ? [{ ...entry, hooks }] : [];
    });
  }

  static async #listSkillNames(skillsSrc) {
    if (!existsSync(skillsSrc)) return [];
    const entries = await readdir(skillsSrc, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && existsSync(join(skillsSrc, entry.name, 'SKILL.md')))
      .map(entry => entry.name);
  }

  static async #readTemplateHookCommands(packageRoot) {
    try {
      const tplPath = join(packageRoot, 'install', 'common', 'fixtures', 'lingma-settings.json');
      const tpl = JSON.parse((await readFile(tplPath, 'utf8')).replaceAll('<PLUGIN_ROOT>', packageRoot));
      return this.#hookCommands(tpl.hooks ?? {});
    } catch {
      return [];
    }
  }

  static #isSafeSkillName(skillName) {
    return typeof skillName === 'string'
      && skillName !== '.'
      && skillName !== '..'
      && !skillName.includes('/')
      && !skillName.includes('\\');
  }
}
