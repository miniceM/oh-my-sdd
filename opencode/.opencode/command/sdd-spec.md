---
description: SDD Ring 1 - 直调 openspec CLI 产 delta spec（保鲜生效）。用户说"写需求"/"写 spec"/"写规格"/"开始新功能"/"开 SDD 流程"时使用。
argument-hint: [change-id 或变更描述，可选]
---

# /sdd-spec — SDD 第 1 环：规格定义

Execute the `sdd-spec` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-spec/SKILL.md` (parent project source)
- `.opencode/skills/sdd-spec/SKILL.md` (plugin-bundled mirror)
- `.agents/skills/sdd-spec/SKILL.md` (Claude-Code mirror)

The skill file contains the authoritative step-by-step instructions, including:
- Prerequisites checks (`iam`, `openspec`, `dop`, `gh`)
- All HARD_RULE / SOFT_RULE checks (security > compliance > stability > efficiency)
- `openspec` CLI invocation to produce delta spec
- Exit criteria and handoff to `/sdd-plan`

Pass any arguments provided after `/sdd-spec` to the skill unchanged (change-id or free-form description).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE, enforced by git `commit-msg` hook).
