---
description: SDD Ring 5 — 单阶段归档、原子 PR 提交与 DOP 完成。用户说"创建 PR"/"code review"/"归档"/"跑测试"时使用。
argument-hint: "[slug 或 change-id] 或 --retry-dop <slug>"
---

# /sdd-review — SDD 第 5 环：原子 PR 交付

Invocation arguments (verbatim): `$ARGUMENTS`

Execute the `sdd-review` skill following its full workflow. Ring 5 ends when the atomic PR is created successfully; PR review and merge are outside SDD. The default flow is review → validate → archive → canonical-spec verification → commit/push issue branch → atomic PR → `dop change done`. `--retry-dop <slug>` reads the archived change-id and only retries that DOP command.

Locate and follow the first existing skill definition:
- `skills/sdd-review/SKILL.md` (parent project source)
- `.opencode/skills/sdd-review/SKILL.md` (plugin-bundled mirror)
- `~/.config/opencode/skills/sdd-review/SKILL.md` (global OpenCode install)
- `.agents/skills/sdd-review/SKILL.md` (Claude-Code mirror)
- `~/.agents/skills/sdd-review/SKILL.md`
- `.claude/skills/sdd-review/SKILL.md`
- `~/.claude/skills/sdd-review/SKILL.md`

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

The selected skill is authoritative. It requires HARD_RULE/OVERRIDE review gates, `openspec archive` (no `mv` fallback), canonical-spec verification, and an issue-branch PR containing implementation plus archive artifacts. Pass arguments unchanged: a slug/change-id, or `--retry-dop <slug>`.

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
