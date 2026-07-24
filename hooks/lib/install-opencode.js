// install-opencode.js — OpenCode 安装/卸载入口。
//
// 主入口：协调各子模块完成安装流程。
// 具体逻辑已拆分到：
//   - constants.js — 命名常量
//   - paths.js — 路径常量
//   - builder.js — TypeScript 编译
//   - copy-utils.js — 文件复制工具
//   - superpowers-installer.js — superpowers-zh 集成
//   - command-generator.js — 命令 wrapper 模板
//   - config-patcher.js — opencode.json 修改
//
// Windows 不支持：OpenCode 主要跑在 macOS/Linux。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OPENCODE_PLUGIN_DIR, OPENCODE_COMMANDS_DIR, OPENCODE_CONFIG_DIR } from './paths.js';
import { buildOpencodePlugin } from './builder.js';
import { copyDir } from './copy-utils.js';
import { installSuperpowersZh, findDelegatedSkillsSource } from './superpowers-installer.js';
import { SDD_COMMANDS, installCommandFiles } from './command-generator.js';
import { patchOpencodeJson, unpatchOpencodeJson } from './config-patcher.js';

/**
 * Announce message to stderr.
 * @param {string} msg - Message to announce
 */
function announce(msg) {
  process.stderr.write(msg + '\n');
}

// ============================================
// 探测 OpenCode 是否安装
// ============================================
export function isOpenCodeInstalled() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['opencode'], { stdio: 'ignore' });
    return true;
  } catch {
    // fallback: 检测 ~/.config/opencode/ 目录
    return existsSync(OPENCODE_CONFIG_DIR);
  }
}

// ============================================
// 复制 opencode/dist → ~/.config/opencode/plugins/oh-my-sdd/
// ============================================
function copyDistToPluginDir(packageRoot) {
  const distDir = join(packageRoot, 'opencode', 'dist');
  if (!existsSync(distDir)) {
    throw new Error(`opencode/dist/ 不存在，请先跑 npm run build:opencode`);
  }
  const count = copyDir(distDir, OPENCODE_PLUGIN_DIR);
  if (count === 0) {
    throw new Error(`opencode/dist/ 目录为空，请先跑 npm run build:opencode`);
  }
  announce(`  ✓ 复制到: ${OPENCODE_PLUGIN_DIR} (${count} 个文件)`);
}

// ============================================
// 复制 content/ → ~/.config/opencode/plugins/oh-my-sdd/content/
// ============================================
function copyContentToPluginDir(packageRoot) {
  const srcContentDir = join(packageRoot, 'content');
  if (!existsSync(srcContentDir)) {
    announce('  ⚠️  content/ 目录不存在，跳过 content 复制');
    return;
  }
  const targetContentDir = join(OPENCODE_PLUGIN_DIR, 'content');
  const count = copyDir(srcContentDir, targetContentDir, {
    filter: (f) => f.endsWith('.md')
  });
  announce(`  ✓ content 复制到: ${targetContentDir} (${count} 个文件)`);
}

// ============================================
// 复制 hooks/ → ~/.config/opencode/plugins/oh-my-sdd/hooks/
// ============================================
function copyHooksToPluginDir(packageRoot) {
  const srcHooksDir = join(packageRoot, 'hooks');
  if (!existsSync(srcHooksDir)) {
    announce('  ⚠️  hooks/ 目录不存在，跳过 hook 复制');
    return;
  }
  const targetHooksDir = join(OPENCODE_PLUGIN_DIR, 'hooks');

  // 复制 hooks/*.js (顶层)
  const topLevelCount = copyDir(srcHooksDir, targetHooksDir, {
    filter: (f) => f.endsWith('.js')
  });

  // 复制 hooks/lib/*.js
  const srcLibDir = join(srcHooksDir, 'lib');
  if (existsSync(srcLibDir)) {
    const libCount = copyDir(srcLibDir, join(targetHooksDir, 'lib'), {
      filter: (f) => f.endsWith('.js')
    });
    announce(`  ✓ hooks 复制到: ${targetHooksDir} (${topLevelCount} + ${libCount} 文件)`);
  } else {
    announce(`  ✓ hooks 复制到: ${targetHooksDir} (${topLevelCount} 文件)`);
  }
}

// ============================================
// 复制单个委托子技能
// ============================================
function copyDelegatedSkill(srcSkill, targetSkill) {
  if (!existsSync(srcSkill)) {
    return 0;
  }

  mkdirSync(targetSkill, { recursive: true });
  let copied = 0;

  for (const entry of readdirSync(srcSkill)) {
    const src = join(srcSkill, entry);
    const dst = join(targetSkill, entry);
    try {
      const stat = statSync(src);
      if (stat.isDirectory()) {
        // 递归复制子目录（如 scripts/）
        copied += copyDir(src, dst, { recursive: true });
      } else {
        copyFileSync(src, dst);
        copied++;
      }
    } catch (copyErr) {
      announce(`  ⚠️  复制文件失败: ${src} → ${dst} (${copyErr.message})`);
    }
  }

  return copied;
}

// ============================================
// 复制 skills → ~/.config/opencode/plugins/oh-my-sdd/skills/
// ============================================
function copySkillsToPluginDir(packageRoot) {
  const targetSkillsDir = join(OPENCODE_PLUGIN_DIR, 'skills');
  mkdirSync(targetSkillsDir, { recursive: true });

  // (A) 主 SDD skills（顶层 skills/ 目录）
  const skillsDir = join(packageRoot, 'skills');
  if (existsSync(skillsDir)) {
    const sddSkills = ['sdd-spec', 'sdd-plan', 'sdd-task', 'sdd-apply', 'sdd-review', 'sdd-doc'];
    for (const skill of sddSkills) {
      const srcSkill = join(skillsDir, skill);
      if (existsSync(srcSkill)) {
        const targetSkill = join(targetSkillsDir, skill);
        const skillMd = join(srcSkill, 'SKILL.md');
        if (existsSync(skillMd)) {
          mkdirSync(targetSkill, { recursive: true });
          copyFileSync(skillMd, join(targetSkill, 'SKILL.md'));
        }
      }
    }
    // 清理遗留 skill 目录
    const allowedSkills = new Set(sddSkills);
    for (const entry of readdirSync(targetSkillsDir)) {
      if (entry.startsWith('sdd-') && !allowedSkills.has(entry)) {
        rmSync(join(targetSkillsDir, entry), { recursive: true, force: true });
        announce(`  ✓ 清理遗留 skill 目录: ${entry}`);
      }
    }
    announce(`  ✓ SDD skills 复制到: ${targetSkillsDir}`);
  } else {
    announce('  ⚠️  skills/ 目录不存在，跳过 SDD skill 复制');
  }

  // (B) 委托子技能
  const delegatedSkills = [
    'brainstorming',
    'writing-plans',
    'executing-plans',
    'subagent-driven-development',
    'requesting-code-review',
  ];

  const chosen = findDelegatedSkillsSource(packageRoot);
  if (!chosen) {
    announce(`  ⚠️  委托子技能来源均不可用`);
    announce(`      OpenCode 运行时 agent 会按 fallback chain 走 inline-content-resolution`);
    return;
  }

  let copied = 0;
  for (const skill of delegatedSkills) {
    const srcSkill = join(chosen.path, skill);
    const targetSkill = join(targetSkillsDir, skill);
    if (copyDelegatedSkill(srcSkill, targetSkill) > 0) {
      copied++;
    }
  }
  announce(`  ✓ 委托子技能复制到: ${targetSkillsDir} (${copied} 个) [from ${chosen.source}]`);

  // 清理 staging 区（已在 superpowers-installer.js 中处理）
}

// ============================================
// 安装主入口
// ============================================
export async function installForOpencode({ PACKAGE_ROOT, announce: ann = announce }) {
  ann('→ 安装 OpenCode 适配');

  if (!isOpenCodeInstalled()) {
    ann('⚠️  未检测到 OpenCode。继续安装，但 OpenCode 不在时不生效。');
    ann('    安装: https://opencode.ai');
  }

  buildOpencodePlugin(PACKAGE_ROOT);
  copyDistToPluginDir(PACKAGE_ROOT);
  copyHooksToPluginDir(PACKAGE_ROOT);
  copyContentToPluginDir(PACKAGE_ROOT);
  installSuperpowersZh();
  copySkillsToPluginDir(PACKAGE_ROOT);
  installCommandFiles();
  patchOpencodeJson();

  ann('');
  ann('✓ oh-my-sdd (OpenCode) 安装完成');
  ann('');
  ann('下一步：');
  ann('  1. 启动 OpenCode（自动加载 oh-my-sdd 插件）');
  ann('  2. 在 OpenCode 中试 /sdd-spec <change-name>');
  ann('  3. 测试 HARD_RULE：写一个含 AKIA 硬编码的文件，应被阻断');
  ann('');
  ann('卸载：oms-uninstall --tool opencode');
}

// ============================================
// 卸载
// ============================================
function rmIfExists(p) {
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    return true;
  }
  return false;
}

export async function uninstallForOpencode() {
  announce('→ 卸载 OpenCode 适配');

  // 1. 删 plugin 目录
  if (rmIfExists(OPENCODE_PLUGIN_DIR)) {
    announce(`  ✓ 已删除: ${OPENCODE_PLUGIN_DIR}`);
  }

  // 2. 删 command 文件
  if (existsSync(OPENCODE_COMMANDS_DIR)) {
    let removed = 0;
    for (const cmd of SDD_COMMANDS) {
      const f = join(OPENCODE_COMMANDS_DIR, `${cmd.name}.md`);
      if (existsSync(f)) {
        rmSync(f);
        removed++;
      }
    }
    if (removed > 0) {
      announce(`  ✓ 已删除 ${removed} 个 slash command 文件`);
    }
  }

  // 3. 从 opencode.json 移除
  unpatchOpencodeJson();

  // 4. 保留 ~/.oh-my-sdd/（除非 --purge 由 caller 处理）
}