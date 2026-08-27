---
description: SDD 产出文档 - 把 spec + plan 转成企业模版 Markdown 需求规格说明书。
argument-hint: [slug 或 change-id]
---

# /sdd-doc — 生成企业需求规格说明书

Invocation arguments (verbatim): `$ARGUMENTS`

Execute the `sdd-doc` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-doc/SKILL.md` (parent project source)
- `.opencode/skills/sdd-doc/SKILL.md` (plugin-bundled mirror)
- `~/.config/opencode/skills/sdd-doc/SKILL.md` (global OpenCode install)
- `.agents/skills/sdd-doc/SKILL.md` (Claude-Code mirror)
- `~/.agents/skills/sdd-doc/SKILL.md`
- `.claude/skills/sdd-doc/SKILL.md`
- `~/.claude/skills/sdd-doc/SKILL.md`

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

Pass any arguments provided after `/sdd-doc` to the skill unchanged.
