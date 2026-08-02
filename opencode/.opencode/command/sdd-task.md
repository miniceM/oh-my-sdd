---
description: SDD Ring 3 (optional) - 当 /sdd-plan 产出的 tasks.md 单 task > 30 分钟时拆细。粒度合适时可直接跳到 /sdd-apply。
argument-hint: [slug 或 change-id]
---

# /sdd-task — SDD 第 3 环：任务细化（可选）

Execute the `sdd-task` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-task/SKILL.md` (parent project source)
- `.opencode/skills/sdd-task/SKILL.md` (plugin-bundled mirror)
- `.agents/skills/sdd-task/SKILL.md` (Claude-Code mirror)

The skill file contains the authoritative step-by-step instructions for splitting coarse tasks (single task > 30 min) into implementable units. Skip this ring when tasks.md granularity is already suitable and go directly to `/sdd-apply`.

Pass any arguments provided after `/sdd-task` to the skill unchanged (slug or change-id).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
