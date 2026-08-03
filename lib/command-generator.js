/**
 * Command wrapper generator.
 *
 * Generates OpenCode slash command markdown files.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FILE_PERMISSIONS } from './constants.js';
import { OPENCODE_COMMANDS_DIR } from './paths.js';

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
    description: 'SDD 第 3 环（可选）：任务拆分',
    skill: 'sdd-task',
  },
  {
    name: 'sdd-apply',
    description: 'SDD 第 4 环：执行实现（按 plan 写代码）',
    skill: 'sdd-apply',
  },
  {
    name: 'sdd-review',
    description: 'SDD 第 5 环：代码审查 + PR 创建',
    skill: 'sdd-review',
  },
  {
    name: 'sdd-doc',
    description: 'SDD 产出文档：把 spec + plan 转成企业模版 Markdown 需求规格说明书',
    skill: 'sdd-doc',
  },
];

/**
 * Runtime contract embedded in every generated command wrapper.
 * Keep this in sync with the npm-packed command markdown files.
 */
const SKILL_RESOLUTION_CONTRACT = `**Runtime skill-resolution contract:**

- For the main skill, read the first existing \`SKILL.md\` in this order:
  1. \`skills/<main-skill>/SKILL.md\`
  2. \`.opencode/skills/<main-skill>/SKILL.md\`
  3. \`~/.config/opencode/skills/<main-skill>/SKILL.md\`
  4. \`.agents/skills/<main-skill>/SKILL.md\`
  5. \`~/.agents/skills/<main-skill>/SKILL.md\`
  6. \`.claude/skills/<main-skill>/SKILL.md\`
  7. \`~/.claude/skills/<main-skill>/SKILL.md\`
- For \`Skill(name, args)\` or "delegate to \`namespace:name\`":
  1. Normalize the name by removing the namespace prefix and colon to obtain
     \`name-without-namespace\` (for example, \`superpowers:brainstorming\` maps
     to \`brainstorming/SKILL.md\` and \`superpowers:writing-plans\` maps to
     \`writing-plans/SKILL.md\`).
  2. Read the first existing \`SKILL.md\` from
     \`~/.config/opencode/skills/<normalized>/\`, \`.opencode/skills/<normalized>/\`,
     \`skills/<normalized>/\`, \`.agents/skills/<normalized>/\`,
     \`~/.agents/skills/<normalized>/\`, \`.claude/skills/<normalized>/\`, then
     \`~/.claude/skills/<normalized>/\`.
  3. If none exists, do not stop or require a separately installed skill. Perform
     **inline-content-resolution**: reconstruct and execute the delegated step from
     the parent skill's stated goals, constraints, checklists, and expected outputs;
     explicitly report that this content fallback was used.
- Content resolution and task execution are independent. The fallback above only
  decides where instructions come from. The parent skill still decides whether the
  current agent or a subagent performs the work; missing content never authorizes
  inline task execution or bypasses an Orchestrator/subagent requirement.`;

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

1. Resolve and read the \`${cmd.skill}\` main skill using the contract below.
2. Follow all instructions in that file exactly
3. **Tool mapping** (Claude Code → OpenCode):
   - \`Bash(cmd)\` → use \`bash\` tool
   - \`Read(path)\` → use \`read\` tool
   - \`Write(content, path)\` → use \`write\` tool
   - \`Edit(path, old, new)\` → use \`edit\` tool
   - \`AskUserQuestion(...)\` → ask user directly in chat
   - \`Agent(...)\` / \`task(...)\` → use the host's available delegation tool.
     Follow the parent skill's execution-mode and Orchestrator rules; if the host
     cannot delegate, follow the parent skill's explicit delegation-failure path.
   - \`Skill(name, args)\` or "delegate to namespace:name" → resolve and execute
     the delegated content using the contract below. Do not skip the step.
4. Execute the SDD workflow as described in the skill file

${SKILL_RESOLUTION_CONTRACT}

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
