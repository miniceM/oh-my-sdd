---
description: SDD Ring 3 (optional) - 当 /sdd-plan 产出的 tasks.md 单 task > 30 分钟时拆细。粒度合适时可直接跳到 /sdd-apply。
argument-hint: [slug 或 change-id]
---

# /sdd-task — SDD 第 3 环：任务细化（可选）

Invocation arguments (verbatim): `$ARGUMENTS`

Execute the `sdd-task` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-task/SKILL.md` (parent project source)
- `.opencode/skills/sdd-task/SKILL.md` (plugin-bundled mirror)
- `~/.config/opencode/skills/sdd-task/SKILL.md` (global OpenCode install)
- `.agents/skills/sdd-task/SKILL.md` (Claude-Code mirror)
- `~/.agents/skills/sdd-task/SKILL.md`
- `.claude/skills/sdd-task/SKILL.md`
- `~/.claude/skills/sdd-task/SKILL.md`

Use the first existing path above. For every delegated skill, apply this mandatory
content-resolution contract:

1. Strip the namespace and colon to obtain `name-without-namespace` (for example,
   `superpowers:writing-plans` maps to `writing-plans/SKILL.md`).
2. Read the first existing `SKILL.md` from
   `~/.config/opencode/skills/<name-without-namespace>/`,
   `.opencode/skills/<name-without-namespace>/`,
   `skills/<name-without-namespace>/`, `.agents/skills/<name-without-namespace>/`,
   `~/.agents/skills/<name-without-namespace>/`,
   `.claude/skills/<name-without-namespace>/`, then
   `~/.claude/skills/<name-without-namespace>/`.
3. If no file exists, do not stop or require a separate installation. Perform
   **inline-content-resolution** from the parent skill's goals, constraints,
   checklists, and expected outputs, and state that this fallback was used.

This contract only selects the source of skill content. It does not select who
executes a task. Continue to obey the parent skill's execution-mode, Orchestrator,
and subagent rules; missing content never authorizes inline task execution.

The skill file contains the authoritative step-by-step instructions for splitting coarse tasks (single task > 30 min) into implementable units. Skip this ring when tasks.md granularity is already suitable and go directly to `/sdd-apply`.

Pass any arguments provided after `/sdd-task` to the skill unchanged (slug or change-id).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
