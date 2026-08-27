---
description: SDD Ring 1 - 直调 openspec CLI 产 delta spec（保鲜生效）。用户说"写需求"/"写 spec"/"写规格"/"开始新功能"/"开 SDD 流程"时使用。
argument-hint: [change-id 或变更描述，可选]
---

# /sdd-spec — SDD 第 1 环：规格定义

Invocation arguments (verbatim): `$ARGUMENTS`

Execute the `sdd-spec` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-spec/SKILL.md` (parent project source)
- `.opencode/skills/sdd-spec/SKILL.md` (plugin-bundled mirror)
- `~/.config/opencode/skills/sdd-spec/SKILL.md` (global OpenCode install)
- `.agents/skills/sdd-spec/SKILL.md` (Claude-Code mirror)
- `~/.agents/skills/sdd-spec/SKILL.md`
- `.claude/skills/sdd-spec/SKILL.md`
- `~/.claude/skills/sdd-spec/SKILL.md`

Use the first existing path above. For every delegated skill, apply this mandatory
content-resolution contract:

1. Strip the namespace and colon to obtain `name-without-namespace`.
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
- Prerequisites checks (`iam`, `openspec`, `dop`, `gh`)
- All HARD_RULE / SOFT_RULE checks (security > compliance > stability > efficiency)
- `openspec` CLI invocation to produce delta spec
- Exit criteria and handoff to `/sdd-plan`

Pass any arguments provided after `/sdd-spec` to the skill unchanged (change-id or free-form description).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE, enforced by git `commit-msg` hook).
