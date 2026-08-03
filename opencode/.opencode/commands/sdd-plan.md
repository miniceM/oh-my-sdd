---
description: SDD Ring 2 - 委托 superpowers:brainstorming（自动 chain 到 writing-plans）产出 design + tasks。用户说"做 plan"/"写 design"/"拆任务"/"brainstorming"或已完成 spec 需要交互式产出时使用。
argument-hint: [slug 或 change-id]
---

# /sdd-plan — SDD 第 2 环：计划制定

Invocation arguments (verbatim): `$ARGUMENTS`

Execute the `sdd-plan` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-plan/SKILL.md` (parent project source)
- `.opencode/skills/sdd-plan/SKILL.md` (plugin-bundled mirror)
- `~/.config/opencode/skills/sdd-plan/SKILL.md` (global OpenCode install)
- `.agents/skills/sdd-plan/SKILL.md` (Claude-Code mirror)
- `~/.agents/skills/sdd-plan/SKILL.md`
- `.claude/skills/sdd-plan/SKILL.md`
- `~/.claude/skills/sdd-plan/SKILL.md`

Use the first existing path above. For every delegated skill, apply this mandatory
content-resolution contract:

1. Strip the namespace and colon to obtain `name-without-namespace`; for example,
   `superpowers:brainstorming` maps to `brainstorming/SKILL.md` and
   `superpowers:writing-plans` maps to `writing-plans/SKILL.md`.
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

The skill file contains the authoritative step-by-step instructions, including:
- Step 1.5 Constitution Check (HARD_RULE — forces `## Constitution Check` section in design.md)
- Delegation to `superpowers:brainstorming` then `superpowers:writing-plans`
- tasks.md granularity guidance (single task ≤ 30 min; else escalate to `/sdd-task`)
- Exit criteria and handoff to `/sdd-task` (optional) or `/sdd-apply`

Pass any arguments provided after `/sdd-plan` to the skill unchanged (slug or change-id).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
