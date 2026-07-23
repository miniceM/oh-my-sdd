// install-opencode.js — OpenCode 安装/卸载实现。
//
// 与 install-lingma.js / install-claude.js 对称。
//
// OpenCode 路径特有逻辑：
//   1. 编译 opencode/src/*.ts → opencode/dist/*.js（用根 build:opencode script）
//   2. 复制 opencode/dist/ → ~/.config/opencode/plugins/oh-my-sdd/
//   3. 在 ~/.config/opencode/opencode.json 加 "plugin": ["oh-my-sdd"]
//   4. 共享 ~/.oh-my-sdd/ 状态目录（与 Claude/Lingma 不变量）
//
// 卸载：
//   1. 删 ~/.config/opencode/plugins/oh-my-sdd/
//   2. 从 opencode.json 移除 "oh-my-sdd" 入口
//   3. 保留 ~/.oh-my-sdd/（除非 --purge）
//
// 与 lingma 路径不同：OpenCode 用 TypeScript 插件（运行时 .js 文件），
// 不是纯 skills/rules 复制。所以 install 流程包含 tsc 编译步骤。
//
// Windows 不支持：OpenCode 主要跑在 macOS/Linux，Windows 安装路径留 TODO。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';

const HOME = homedir();

// ============================================
// OpenCode 路径常量
// ============================================
const OPENCODE_CONFIG_DIR = join(HOME, '.config', 'opencode');
const OPENCODE_PLUGINS_DIR = join(OPENCODE_CONFIG_DIR, 'plugins');
const OPENCODE_PLUGIN_DIR = join(OPENCODE_PLUGINS_DIR, 'oh-my-sdd');
const OPENCODE_JSON = join(OPENCODE_CONFIG_DIR, 'opencode.json');

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
// 编译 opencode/src → opencode/dist
// ============================================
function buildOpencodePlugin(packageRoot) {
  announce('  编译 opencode TypeScript → JavaScript...');
  execFileSync('npm', ['run', 'build:opencode', '--silent'], {
    cwd: packageRoot,
    stdio: 'pipe',
  });
  announce('  ✓ 编译完成');
}

// ============================================
// 复制 opencode/dist → ~/.config/opencode/plugins/oh-my-sdd/
// ============================================
function copyDistToPluginDir(packageRoot) {
  const distDir = join(packageRoot, 'opencode', 'dist');
  if (!existsSync(distDir)) {
    throw new Error(`opencode/dist/ 不存在，请先跑 npm run build:opencode`);
  }
  mkdirSync(OPENCODE_PLUGIN_DIR, { recursive: true });
  const files = readdirSync(distDir);
  for (const f of files) {
    copyFileSync(join(distDir, f), join(OPENCODE_PLUGIN_DIR, f));
  }
  announce(`  ✓ 复制到: ${OPENCODE_PLUGIN_DIR}`);
}

// ============================================
// 复制 content/ → ~/.config/opencode/plugins/oh-my-sdd/content/
// baseline 注入需要 content/enterprise-baseline.md
// ============================================
function copyContentToPluginDir(packageRoot) {
  const srcContentDir = join(packageRoot, 'content');
  if (!existsSync(srcContentDir)) {
    announce('  ⚠️  content/ 目录不存在，跳过 content 复制');
    return;
  }
  const targetContentDir = join(OPENCODE_PLUGIN_DIR, 'content');
  mkdirSync(targetContentDir, { recursive: true });
  const files = readdirSync(srcContentDir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    copyFileSync(join(srcContentDir, f), join(targetContentDir, f));
  }
  announce(`  ✓ content 复制到: ${targetContentDir}`);
}

// ============================================
// 复制 hooks/ → ~/.config/opencode/plugins/oh-my-sdd/hooks/
// OpenCode plugin 通过 getHooksDir() 找 hooks/*.js，
// 路径解析：plugin 目录的上一级的 hooks/（与 Claude/Lingma 共享）
// 安装后 plugin 在 ~/.config/opencode/plugins/oh-my-sdd/，
// 所以需要把 repo 的 hooks/ 复制到 plugin 目录里
// ============================================
function copyHooksToPluginDir(packageRoot) {
  const srcHooksDir = join(packageRoot, 'hooks');
  if (!existsSync(srcHooksDir)) {
    announce('  ⚠️  hooks/ 目录不存在，跳过 hook 复制');
    return;
  }
  const targetHooksDir = join(OPENCODE_PLUGIN_DIR, 'hooks');
  mkdirSync(targetHooksDir, { recursive: true });

  // 复制 hooks/*.js 和 hooks/lib/*.js
  const hookFiles = readdirSync(srcHooksDir).filter(f => f.endsWith('.js'));
  for (const f of hookFiles) {
    copyFileSync(join(srcHooksDir, f), join(targetHooksDir, f));
  }

  // 复制 hooks/lib/
  const srcLibDir = join(srcHooksDir, 'lib');
  if (existsSync(srcLibDir)) {
    const targetLibDir = join(targetHooksDir, 'lib');
    mkdirSync(targetLibDir, { recursive: true });
    const libFiles = readdirSync(srcLibDir).filter(f => f.endsWith('.js'));
    for (const f of libFiles) {
      copyFileSync(join(srcLibDir, f), join(targetLibDir, f));
    }
  }

  announce(`  ✓ hooks 复制到: ${targetHooksDir}`);
}

// ============================================
// 复制 skills → ~/.config/opencode/plugins/oh-my-sdd/skills/
// OpenCode 的 slash command 通过 ~/.config/opencode/commands/*.md 注册，
// 但 command 文件引用 skill 内容，所以要把 skills 复制到 plugin 目录
//
// 两类 skill 都要复制：
//   A. 主 SDD skills（顶层 skills/ 目录）：sdd-spec, sdd-plan, ...
//   B. 委托子技能（.claude/skills/ 目录）：brainstorming, writing-plans, ...
//      SDD skills 内部用 "委托 superpowers:xxx" 引用这些子技能，
//      agent 执行时需要读对应的 SKILL.md 才能继续。
//      （Claude Code 通过 Skill() API 动态加载；OpenCode 没有这个 API，
//      所以用命令 wrapper 的工具映射告知 agent 直接读磁盘文件）
// ============================================
function copySkillsToPluginDir(packageRoot) {
  const targetSkillsDir = join(OPENCODE_PLUGIN_DIR, 'skills');
  mkdirSync(targetSkillsDir, { recursive: true });

  // (A) 主 SDD skills（顶层 skills/ 目录）
  const skillsDir = join(packageRoot, 'skills');
  if (existsSync(skillsDir)) {
    const sddSkills = ['sdd-spec', 'sdd-plan', 'sdd-task', 'sdd-apply', 'sdd-review', 'sdd-doc']; // sdd-constitution 不复制——企业规则禁止项目组本地修改
    for (const skill of sddSkills) {
      const srcSkill = join(skillsDir, skill);
      if (existsSync(srcSkill)) {
        const targetSkill = join(targetSkillsDir, skill);
        mkdirSync(targetSkill, { recursive: true });
        // Copy SKILL.md
        const skillMd = join(srcSkill, 'SKILL.md');
        if (existsSync(skillMd)) {
          copyFileSync(skillMd, join(targetSkill, 'SKILL.md'));
        }
      }
    }
    // 清理上版本遗留的 sdd-* skill 目录（治理不变量：sdd-constitution 不得暴露给项目组）
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

  // (B) 委托子技能（.claude/skills/ 目录）
  // 这些是 sdd-plan/sdd-apply/sdd-review/sdd-task 内部 "委托 superpowers:xxx" 引用的技能
  //
  // 关键：`.claude/skills/` 是 Claude Code 运行时目录，**不在 git 里**。
  // 主仓库有这个目录，但 git worktree 没有（worktree 不共享 .claude/）。
  // 所以在 worktree 里跑 install 会找不到这些技能。
  // 解决：如果 packageRoot/.claude/skills/ 不存在，用 git rev-parse --git-common-dir
  // 找到主仓库的 .git 路径，从它的 parent 推出主仓库根，再试 <mainRepo>/.claude/skills/。
  const delegatedSkills = [
    'brainstorming',              // sdd-plan 委托
    'writing-plans',              // sdd-task 委托
    'executing-plans',            // sdd-apply 委托（简单任务）
    'subagent-driven-development',// sdd-apply 委托（复杂任务）
    'requesting-code-review',     // sdd-review 委托
  ];
  const candidateDirs = [join(packageRoot, '.claude', 'skills')];
  if (!existsSync(candidateDirs[0])) {
    // Worktree 兼容：从 git common-dir 推主仓库根
    try {
      const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
        cwd: packageRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim();
      // commonDir 可能是绝对路径 (/path/to/main/.git) 或相对路径 (.git)
      const commonDirAbs = isAbsolute(commonDir) ? commonDir : join(packageRoot, commonDir);
      const mainRepoRoot = dirname(commonDirAbs);
      const mainRepoSkills = join(mainRepoRoot, '.claude', 'skills');
      if (existsSync(mainRepoSkills)) {
        candidateDirs.push(mainRepoSkills);
      }
    } catch { /* not in a git repo or git not installed — ignore */ }
  }
  const claudeSkillsDir = candidateDirs.find(existsSync);
  if (claudeSkillsDir) {
    let copied = 0;
    for (const skill of delegatedSkills) {
      const srcSkill = join(claudeSkillsDir, skill);
      if (existsSync(srcSkill)) {
        const targetSkill = join(targetSkillsDir, skill);
        mkdirSync(targetSkill, { recursive: true });
        // 复制 SKILL.md（如有 scripts/ 等附加资源也一并复制）
        for (const entry of readdirSync(srcSkill)) {
          const src = join(srcSkill, entry);
          const dst = join(targetSkill, entry);
          // 只复制文件，不递归复制子目录（子技能里 scripts/ 等如有需要再说）
          try {
            copyFileSync(src, dst);
          } catch { /* skip directories for now */ }
        }
        copied++;
      }
    }
    const sourceNote = claudeSkillsDir === candidateDirs[0] ? 'packageRoot' : 'main repo (worktree fallback)';
    announce(`  ✓ 委托子技能复制到: ${targetSkillsDir} (${copied} 个: ${delegatedSkills.join(', ')}) [from ${sourceNote}]`);
  } else {
    announce(`  ⚠️  .claude/skills/ 目录不存在（packageRoot 与主仓库都无），跳过委托子技能复制`);
    announce(`      OpenCode 运行时 agent 会按命令 wrapper 的 fallback chain 走 inline-content-resolution`);
  }
}

// ============================================
// 在 ~/.config/opencode/commands/ 创建 SDD slash command 文件
//
// OpenCode 的斜杠命令通过 markdown 文件注册（不在 plugin hook 里）：
//   ~/.config/opencode/commands/<name>.md  → 变成 /<name> 斜杠命令
//
// 文件格式：YAML frontmatter (description) + markdown 正文（agent 看到的 prompt）
// 我们用 "wrapper" 模式：command 文件指示 agent 读 plugin 目录里的 SKILL.md
// （单一信息源，避免 skill 和 command 双写漂移）
// ============================================
const OPENCODE_COMMANDS_DIR = join(OPENCODE_CONFIG_DIR, 'commands');
const SDD_COMMANDS = [
  {
    name: 'sdd-spec',
    description: 'SDD 第 1 环：规格定义（直调 openspec）',
    skill: 'sdd-spec',
  },
  {
    name: 'sdd-plan',
    description: 'SDD 第 2 环：实现计划（基于 spec 生成 design.md）',
    skill: 'sdd-plan',
  },
  {
    name: 'sdd-task',
    description: 'SDD 第 2.5 环（可选）：任务拆分',
    skill: 'sdd-task',
  },
  {
    name: 'sdd-apply',
    description: 'SDD 第 3 环：执行实现（按 plan 写代码）',
    skill: 'sdd-apply',
  },
  {
    name: 'sdd-review',
    description: 'SDD 第 4 环：代码审查 + PR 创建',
    skill: 'sdd-review',
  },
  {
    name: 'sdd-doc',
    description: 'SDD 产出文档：把 spec + plan 转成企业模版 Markdown 需求规格说明书',
    skill: 'sdd-doc',
  },
  // 注意：sdd-constitution 故意不注册为 OpenCode 命令。
  // 企业级规则（enterprise-baseline.md）必须通过中央工具统一更新下发，
  // 禁止项目组本地修改（治理不变量）。sdd-constitution 仅在管理端
  // （Claude Code + 管理员权限）可用，OpenCode 作为执行端不暴露。
];

function buildCommandContent(cmd) {
  // wrapper prompt：agent 读 SKILL.md 并执行
  // 工具映射表让 agent 把 Claude Code 工具名翻译成 OpenCode 工具名
  //
  // 关键：Skill(name, args) 映射
  //   ❌ 旧：`ignore` —— agent 误以为"跳过整个委托步骤"（E2E spike 发现的 bug）
  //   ✅ 新：三级 fallback —— 去磁盘读 SKILL.md 并执行；文件不在就内联执行
  // 因为 SDD 主 skill（如 sdd-plan）内部会"委托 superpowers:brainstorming"，
  // 但 SKILL.md 里只有委托指令，真实内容在子技能文件里，必须加载。
  //
  // 三级 fallback 的 path 解释：
  //   1. plugin/skills/<name>/ — install 时最佳努力复制（用户同机有 Claude Code 时有）
  //   2. ~/.claude/skills/<name>/ — Claude Code 用户全局 runtime 目录（典型路径）
  //   3. inline — 文件都没有就基于主 SKILL.md 描述内联执行
  //
  // ⚠️ Issue #8 修复：disambiguate two "inline" meanings
  //   - "inline content resolution" (fallback #3): 文件没找到，从父 skill 描述推断意图
  //     → 这是关于**内容从哪里来**
  //   - "inline task execution": 当前 agent 直接写代码完成任务
  //     → 这是关于**谁执行工作**
  //   两者独立。fallback #3 触发不代表任务要在当前 agent 内联执行。
  //   当父 skill（如 sdd-apply）指定了 Orchestrator 适配（task() 委托 subagent），
  //   即使 skill 文件走 fallback #3，每个 task 仍必须用 task()/Agent() 委托。
  return `---
description: ${cmd.description}
---

You are now executing the /${cmd.name} skill for oh-my-sdd (enterprise SDD workflow).

**Instructions:**

1. Read the skill file at: \`${OPENCODE_PLUGIN_DIR}/skills/${cmd.skill}/SKILL.md\`
2. Follow all instructions in that file exactly
3. **Tool mapping** (Claude Code → OpenCode):
   - \`Bash(cmd)\` → use \`bash\` tool
   - \`Read(path)\` → use \`read\` tool
   - \`Write(content, path)\` → use \`write\` tool
   - \`Edit(path, old, new)\` → use \`edit\` tool
   - \`AskUserQuestion(...)\` → ask user directly in chat
   - \`Agent(...)\` / \`task(...)\` → OpenCode has no native subagent API.
     **Default**: execute inline (no subagent spawning).
     **Exception**: if the skill you're executing contains an
     "Orchestrator 运行环境适配" / "Orchestrator adaptation" section
     (see e.g. sdd-apply Step 2.5), follow THAT section's delegation
     strategy instead — it will tell you to spawn one subagent per task
     using \`task(...)\` / \`Agent(...)\`. In that case, subagent spawning
     IS allowed despite this default mapping.
   - \`Skill(name, args)\` or "delegate to superpowers:xxx" → OpenCode has no
     Skill() API. Do **NOT** skip the step. Instead resolve the delegated skill's
     content via this fallback chain:
       1. \`${OPENCODE_PLUGIN_DIR}/skills/<name-without-namespace>/SKILL.md\`
          (e.g. \`superpowers:brainstorming\` → \`${OPENCODE_PLUGIN_DIR}/skills/brainstorming/SKILL.md\`)
       2. \`~/.claude/skills/<name-without-namespace>/SKILL.md\`
          (Claude Code's runtime skill directory — present if user also uses Claude Code)
       3. If neither file exists, perform the step **inline-content-resolution**:
          use the framework, checklists, and goals described in the parent skill
          you're currently reading to reconstruct the delegated skill's intent
          (e.g. for brainstorming: propose 2-3 approaches, present a design,
          get user approval before coding). Mention in your output that you
          executed with inline-content-resolution because the delegated skill
          file was not found.

     **CRITICAL — disambiguate two "inline" meanings** (Issue #8):
     - "inline-content-resolution" (this fallback #3) answers: **where does the
       skill content come from?** → from parent skill description, not from file.
     - "inline task execution" answers: **who performs the work?** → current agent
       vs subagent. This is decided by the **parent skill's Orchestrator adaptation
       section**, NOT by this fallback chain.
     - These two are **independent**. Fallback #3 triggering does NOT mean "execute
       tasks in current agent". Example: \`/sdd-apply\` in Orchestrator mode →
       executing-plans content may come from fallback #3 (inline-content-resolution),
       BUT each task MUST still be delegated to a subagent via \`task(...)\` per
       sdd-apply Step 2.5. Never merge these two layers.

     **CRITICAL**: The delegated skill contains the actual checklists, templates,
     and step-by-step instructions. Resolving it is mandatory — only the content
     source (file vs inline) may change, never the work itself.
4. Execute the SDD workflow as described in the skill file

**Change ID / arguments:** $ARGUMENTS
`;
}

function installCommandFiles() {
  mkdirSync(OPENCODE_COMMANDS_DIR, { recursive: true });

  // 清理上版本遗留的 sdd-*.md 文件（如之前版本注册过 sdd-constitution，
  // 新版本不再暴露，必须从 commands/ 删除，否则 OpenCode 仍会识别为斜杠命令）
  // 治理不变量：sdd-constitution 不得暴露给项目组
  if (existsSync(OPENCODE_COMMANDS_DIR)) {
    const allowedCmds = new Set(SDD_COMMANDS.map(c => `${c.name}.md`));
    for (const f of readdirSync(OPENCODE_COMMANDS_DIR)) {
      if (f.startsWith('sdd-') && f.endsWith('.md') && !allowedCmds.has(f)) {
        rmSync(join(OPENCODE_COMMANDS_DIR, f));
        announce(`  ✓ 清理遗留命令文件: ${f}`);
      }
    }
  }

  for (const cmd of SDD_COMMANDS) {
    const target = join(OPENCODE_COMMANDS_DIR, `${cmd.name}.md`);
    writeFileSync(target, buildCommandContent(cmd), { mode: 0o644 });
  }
  announce(`  ✓ slash commands 安装到: ${OPENCODE_COMMANDS_DIR}`);
  for (const cmd of SDD_COMMANDS) {
    announce(`      /${cmd.name} — ${cmd.description}`);
  }
}

// ============================================
// 修改 opencode.json 加 "plugin": ["./plugins/oh-my-sdd/index.js"]
//
// OpenCode 的 plugin 字段解析规则（v1.x）：
//   - 以 './' 或 '/' 开头 → 文件路径（直接 import）
//   - 其他 → npm 包名（去 node_modules / registry 找）
// 所以必须用相对路径，裸字符串 "oh-my-sdd" 解析不到（不在 npm registry 里）
// 参考：同目录下的 caveman 也是用 './plugins/caveman/plugin.js'
// ============================================
const OPENCODE_PLUGIN_ENTRY = './plugins/oh-my-sdd/index.js';

function patchOpencodeJson() {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(OPENCODE_JSON, 'utf8'));
  } catch { /* fresh */ }
  const plugins = Array.isArray(cfg.plugin) ? [...cfg.plugin] : [];
  // 清理遗留：之前版本误注册过裸字符串 'oh-my-sdd'，这里顺手清掉避免 OpenCode 启动报错
  const cleaned = plugins.filter((p) => p !== 'oh-my-sdd' && p !== './plugins/oh-my-sdd/plugin.js');
  if (!cleaned.includes(OPENCODE_PLUGIN_ENTRY)) {
    cleaned.push(OPENCODE_PLUGIN_ENTRY);
  }
  cfg.plugin = cleaned;
  mkdirSync(dirname(OPENCODE_JSON), { recursive: true });
  writeFileSync(OPENCODE_JSON, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o644 });
  announce(`  ✓ opencode.json 已加 "plugin": ["${OPENCODE_PLUGIN_ENTRY}"]`);
}

// ============================================
// 安装主入口
// ============================================
export async function installForOpencode({ PACKAGE_ROOT, announce: ann = announce }) {
  ann('→ 安装 OpenCode 适配');

  // soft check: OpenCode 是否在
  if (!isOpenCodeInstalled()) {
    ann('⚠️  未检测到 OpenCode。继续安装（plugin 写到目录里等用户用），但 OpenCode 不在时不生效。');
    ann('    安装: https://opencode.ai');
  }

  buildOpencodePlugin(PACKAGE_ROOT);
  copyDistToPluginDir(PACKAGE_ROOT);
  copyHooksToPluginDir(PACKAGE_ROOT);
  copyContentToPluginDir(PACKAGE_ROOT);
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
  ann('卸载（仅清 opencode）：oms-uninstall --tool opencode');
  ann('完整卸载：npm uninstall -g @cli-tools/oh-my-sdd');
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

  // 1. 删 plugin 目录（包含 dist + skills）
  if (rmIfExists(OPENCODE_PLUGIN_DIR)) {
    announce(`  ✓ 已删除: ${OPENCODE_PLUGIN_DIR}`);
  }

  // 2. 删 command 文件（~/.config/opencode/commands/sdd-*.md）
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
      announce(`  ✓ 已删除 ${removed} 个 slash command 文件: ${OPENCODE_COMMANDS_DIR}/sdd-*.md`);
    }
  }

  // 2. 从 opencode.json 移除 "oh-my-sdd"
  if (existsSync(OPENCODE_JSON)) {
    let cfg;
    try {
      cfg = JSON.parse(readFileSync(OPENCODE_JSON, 'utf8'));
    } catch {
      announce('  ⚠️  opencode.json JSON 损坏，跳过');
      cfg = null;
    }
    if (cfg && Array.isArray(cfg.plugin)) {
      // 三种历史 entry 都清掉：裸字符串 'oh-my-sdd' (v1 bug)、旧 './plugins/oh-my-sdd/plugin.js'、新 './plugins/oh-my-sdd/index.js'
      const toRemove = new Set(['oh-my-sdd', './plugins/oh-my-sdd/plugin.js', OPENCODE_PLUGIN_ENTRY]);
      cfg.plugin = cfg.plugin.filter((p) => !toRemove.has(p));
      if (cfg.plugin.length === 0) delete cfg.plugin;
      writeFileSync(OPENCODE_JSON, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o644 });
      announce(`  ✓ 已从 opencode.json 移除 oh-my-sdd 相关条目`);
    }
  }

  // 3. 保留 ~/.oh-my-sdd/ 状态目录（除非 --purge 由 caller 处理）
}
