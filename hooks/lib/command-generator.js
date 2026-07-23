/**
 * Command wrapper generator.
 *
 * Generates OpenCode slash command markdown files.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FILE_PERMISSIONS } from './constants.js';
import { OPENCODE_COMMANDS_DIR, OPENCODE_PLUGIN_DIR } from './paths.js';

/**
 * Announce message to stderr.
 * @param {string} msg - Message to announce
 */
function announce(msg) {
  process.stderr.write(msg + '\n');
}

/**
 * SDD slash commands configuration.
 */
export const SDD_COMMANDS = [
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
];

/**
 * Build command wrapper content.
 * @param {object} cmd - Command configuration
 * @returns {string} - Markdown content
 */
function buildCommandContent(cmd) {
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

/**
 * Install command wrapper files.
 * Creates markdown files in OpenCode commands directory.
 */
export function installCommandFiles() {
  mkdirSync(OPENCODE_COMMANDS_DIR, { recursive: true });

  // Clean up legacy sdd-*.md files (governance: sdd-constitution must not be exposed)
  if (existsSync(OPENCODE_COMMANDS_DIR)) {
    const allowedCmds = new Set(SDD_COMMANDS.map(c => `${c.name}.md`));
    const entries = [];
    try {
      const { readdirSync } = require('node:fs');
      entries.push(...readdirSync(OPENCODE_COMMANDS_DIR));
    } catch { /* ignore */ }

    for (const f of entries) {
      if (f.startsWith('sdd-') && f.endsWith('.md') && !allowedCmds.has(f)) {
        rmSync(join(OPENCODE_COMMANDS_DIR, f));
        announce(`  ✓ 清理遗留命令文件: ${f}`);
      }
    }
  }

  for (const cmd of SDD_COMMANDS) {
    const target = join(OPENCODE_COMMANDS_DIR, `${cmd.name}.md`);
    writeFileSync(target, buildCommandContent(cmd), { mode: FILE_PERMISSIONS.CONFIG_FILE });
  }
  announce(`  ✓ slash commands 安装到: ${OPENCODE_COMMANDS_DIR}`);
  for (const cmd of SDD_COMMANDS) {
    announce(`      /${cmd.name} — ${cmd.description}`);
  }
}