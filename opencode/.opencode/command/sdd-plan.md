---
description: SDD Ring 2 - 委托 superpowers:brainstorming（自动 chain 到 writing-plans）产出 design + tasks。用户说"做 plan"/"写 design"/"拆任务"/"brainstorming"或已完成 spec 需要交互式产出时使用。
argument-hint: [slug 或 change-id]
---

# /sdd-plan — SDD 第 2 环：计划制定

Execute the `sdd-plan` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-plan/SKILL.md` (parent project source)
- `.opencode/skills/sdd-plan/SKILL.md` (plugin-bundled mirror)
- `.agents/skills/sdd-plan/SKILL.md` (Claude-Code mirror)

The skill file contains the authoritative step-by-step instructions, including:
- Step 1.5 Constitution Check (HARD_RULE — forces `## Constitution Check` section in design.md)
- Delegation to `superpowers:brainstorming` then `superpowers:writing-plans`
- tasks.md granularity guidance (single task ≤ 30 min; else escalate to `/sdd-task`)
- Exit criteria and handoff to `/sdd-task` (optional) or `/sdd-apply`

Pass any arguments provided after `/sdd-plan` to the skill unchanged (slug or change-id).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
