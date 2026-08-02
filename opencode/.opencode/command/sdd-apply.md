---
description: SDD Ring 4 - 根据任务复杂度选 superpowers:subagent-driven-development（复杂多任务）或 executing-plans（简单任务）执行 TDD 实现。用户说"开始实现"/"写代码"/"执行任务"/"做 TDD"时使用。
argument-hint: [slug 或 change-id]
---

# /sdd-apply — SDD 第 4 环：实现执行

Execute the `sdd-apply` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-apply/SKILL.md` (parent project source)
- `.opencode/skills/sdd-apply/SKILL.md` (plugin-bundled mirror)
- `.agents/skills/sdd-apply/SKILL.md` (Claude-Code mirror)

The skill file contains the authoritative step-by-step instructions, including:
- Complexity-based delegation:
  - Complex multi-task → `superpowers:subagent-driven-development`
  - Simple task → `superpowers:executing-plans`
- TDD cycle enforcement (red → green → refactor)
- HARD_RULE preflight: baseline token budget ≤ 1000, no hardcoded secrets, no `.env` edits
- Exit criteria and handoff to `/sdd-review`

Pass any arguments provided after `/sdd-apply` to the skill unchanged (slug or change-id).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
