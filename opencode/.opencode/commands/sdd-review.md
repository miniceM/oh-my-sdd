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

For delegated skills, strip the namespace and colon, then read the first available `SKILL.md` from the configured OpenCode, project, agents, or Claude skill locations. If none exists, resolve the parent skill's goals, constraints, checklists, and expected outputs inline; missing content never authorizes inline task execution.

The selected skill is authoritative. It requires HARD_RULE/OVERRIDE review gates, `openspec archive` (no `mv` fallback), canonical-spec verification, and an issue-branch PR containing implementation plus archive artifacts. Pass arguments unchanged: a slug/change-id, or `--retry-dop <slug>`.

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
