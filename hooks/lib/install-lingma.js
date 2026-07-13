// install-lingma.js — 通义灵码 lingma CN 的安装/卸载实现。
//
// 与 install-claude.js / install-opencode.js 对称：每个工具一个独立模块。
//
// lingma 路径特有逻辑：
//   1. skills 复制到 ~/.lingma/skills/
//   2. baseline 写入 ~/.lingma/rules/oh-my-sdd.md（Always 类型规则自动生效）
//   3. 深度合并 hooks 到 ~/.lingma/settings.json（保留用户其他 hooks）
//   4. 写入哨兵文件 ~/.oh-my-sdd/baseline-lingma.sentinel
//
// 卸载：
//   1. 删 skills 目录
//   2. 删 rule 文件
//   3. 从 settings.json 精准删除 oms 注入的 4 个 hook 事件
//   4. 删哨兵文件
//
// 共享 utilities 见 install-shared.js。

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

import {
  writeSentinel, readSentinel, sentinelPathFor, copySkillsToDir,
} from './install-shared.js';

const HOME = homedir();

// ============================================
// 通义灵码路径常量
// ============================================
const LINGMA_DIR = join(HOME, '.lingma');
const LINGMA_SKILLS_DIR = join(LINGMA_DIR, 'skills');
const LINGMA_SETTINGS = join(LINGMA_DIR, 'settings.json');
const LINGMA_RULES_DIR = join(LINGMA_DIR, 'rules');
const LINGMA_RULE_FILE = join(LINGMA_RULES_DIR, 'oh-my-sdd.md');

// lingma 的 hook 事件名（与 Claude Code 同名）
// 卸载时只删这 4 个事件，保留用户的 CustomEvent 等
const OOMS_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];

function announce(msg) {
  process.stderr.write(msg + '\n');
}

function isHomeDir(p) {
  try {
    return resolve(p) === resolve(HOME);
  } catch {
    return false;
  }
}

// ============================================
// Baseline 写入：整体覆盖 rule 文件
// ============================================
async function injectLingmaBaseline(announce) {
  const baselinePath = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', 'baseline', 'lingma.md');
  const baseline = await readFile(baselinePath, 'utf8');
  // strip frontmatter（rules 不接受 frontmatter）
  const bodyOnly = baseline.replace(/^---[\s\S]*?---\n/, '');

  await mkdir(LINGMA_RULES_DIR, { recursive: true });
  await writeFile(LINGMA_RULE_FILE, bodyOnly, { mode: 0o644 });
  announce(`  ✓ baseline 已写入: ${LINGMA_RULE_FILE}`);
}

// ============================================
// settings.json 深度合并
// ============================================
async function generateLingmaSettings(packageRoot, announce) {
  const tplPath = join(packageRoot, 'scaffolding', 'lingma-settings.json');
  const tpl = JSON.parse(await readFile(tplPath, 'utf8'));

  // 替换 <PLUGIN_ROOT> 为绝对路径
  const tplStr = JSON.stringify(tpl).replaceAll('<PLUGIN_ROOT>', packageRoot);
  const omsHooks = JSON.parse(tplStr).hooks;

  // 深度合并到 ~/.lingma/settings.json
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
  // 覆盖 oms 注入的 4 个事件（不删除用户其他事件）
  for (const evt of OOMS_EVENTS) {
    existing.hooks[evt] = omsHooks[evt];
  }

  await mkdir(LINGMA_DIR, { recursive: true });
  await writeFile(LINGMA_SETTINGS, JSON.stringify(existing, null, 2) + '\n', { mode: 0o644 });
  announce(`  ✓ 通义灵码 settings.json 已更新: ${LINGMA_SETTINGS}`);
}

// ============================================
// 安装主入口
// ============================================
export async function installForLingma({ PACKAGE_ROOT, announce }) {
  if (isHomeDir(process.cwd())) {
    announce('⚠️  当前目录是 HOME 目录，建议 cd 到项目目录后再装');
  }

  announce('→ 安装通义灵码 lingma CN 适配');
  await copySkillsToDir(join(PACKAGE_ROOT, 'skills'), LINGMA_SKILLS_DIR, announce);
  await injectLingmaBaseline(announce);
  await writeSentinel('lingma', LINGMA_RULE_FILE, null, announce);
  await generateLingmaSettings(PACKAGE_ROOT, announce);

  announce('');
  announce('✓ oh-my-sdd (通义灵码) 安装完成');
  announce('');
  announce('下一步：');
  announce('  1. 重启通义灵码 IDE（加载新 skills + rules）');
  announce('  2. baseline 已写入 ~/.lingma/rules/oh-my-sdd.md（Always 类型规则自动生效）');
  announce('  3. hooks 已合并到 ~/.lingma/settings.json（保留你的其他 hook 事件）');
  announce('  4. 测试企业约束：问 "你的身份是什么？"，应回复"企业 SDD Agent"');
  announce('');
  announce('卸载：npm uninstall -g @cli-tools/oh-my-sdd && node uninstall.js --tool lingma');
}

// ============================================
// 卸载
// ============================================
async function rmIfExists(p) {
  if (existsSync(p)) {
    await rm(p, { recursive: true, force: true });
    return true;
  }
  return false;
}

export async function uninstallForLingma() {
  announce('→ 卸载通义灵码 lingma 适配');

  // 1. rm skills 目录
  const skillsRemoved = await rmIfExists(LINGMA_SKILLS_DIR);
  if (skillsRemoved) announce(`  ✓ 已删除: ${LINGMA_SKILLS_DIR}`);

  // 2. rm rules 文件
  const ruleRemoved = await rmIfExists(LINGMA_RULE_FILE);
  if (ruleRemoved) announce(`  ✓ 已删除: ${LINGMA_RULE_FILE}`);

  // 3. 从 settings.json 精准删除 oms 注入的 4 个事件
  if (existsSync(LINGMA_SETTINGS)) {
    let settings;
    try {
      settings = JSON.parse(await readFile(LINGMA_SETTINGS, 'utf8'));
    } catch {
      announce('  ⚠️  ~/.lingma/settings.json JSON 损坏，跳过');
      settings = null;
    }
    if (settings && settings.hooks) {
      let changed = false;
      for (const evt of OOMS_EVENTS) {
        if (settings.hooks[evt]) {
          delete settings.hooks[evt];
          changed = true;
        }
      }
      if (changed) {
        // 清理后若 hooks 为空，删除整个 hooks 键
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
        await writeFile(LINGMA_SETTINGS, JSON.stringify(settings, null, 2) + '\n', { mode: 0o644 });
        announce(`  ✓ 已从 settings.json 移除 oh-my-sdd hooks: ${LINGMA_SETTINGS}`);
      } else {
        announce('  (settings.json 无 oh-my-sdd hooks，跳过)');
      }
    }
  }

  // 4. 哨兵文件清理
  const sentinel = await readSentinel('lingma');
  if (sentinel) {
    await rmIfExists(sentinelPathFor('lingma'));
    announce(`  ✓ 已删除哨兵文件`);
  }
}
