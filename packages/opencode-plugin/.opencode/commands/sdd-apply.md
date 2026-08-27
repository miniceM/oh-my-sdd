---
description: SDD Ring 4 - 根据任务复杂度选 superpowers:subagent-driven-development（复杂多任务）或 executing-plans（简单任务）执行 TDD 实现。用户说"开始实现"/"写代码"/"执行任务"/"做 TDD"时使用。
argument-hint: [slug 或 change-id]
---

# /sdd-apply — SDD 第 4 环：实现执行

Invocation arguments (verbatim): `$ARGUMENTS`

Execute the `sdd-apply` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-apply/SKILL.md` (parent project source)
- `.opencode/skills/sdd-apply/SKILL.md` (plugin-bundled mirror)
- `~/.config/opencode/skills/sdd-apply/SKILL.md` (global OpenCode install)
- `.agents/skills/sdd-apply/SKILL.md` (Claude-Code mirror)
- `~/.agents/skills/sdd-apply/SKILL.md`
- `.claude/skills/sdd-apply/SKILL.md`
- `~/.claude/skills/sdd-apply/SKILL.md`

Use the first existing path above. For every delegated skill, apply this mandatory
content-resolution contract:

1. Strip the namespace and colon to obtain `name-without-namespace` (for example,
   `superpowers:executing-plans` maps to `executing-plans/SKILL.md`).
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
- Complexity-based delegation:
  - Complex multi-task → `superpowers:subagent-driven-development`
  - Simple task → `superpowers:executing-plans`
- TDD cycle enforcement (red → green → refactor)
- HARD_RULE preflight: baseline token budget ≤ 1000, no hardcoded secrets, no `.env` edits
- Exit criteria and handoff to `/sdd-review`

Pass any arguments provided after `/sdd-apply` to the skill unchanged (slug or change-id).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
