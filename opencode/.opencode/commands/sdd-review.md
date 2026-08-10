---
description: SDD Ring 5 - 两阶段：默认创建 PR 并委托 superpowers:requesting-code-review；--finalize 在 PR merge 后做 openspec archive。用户说"创建 PR"/"code review"/"归档"/"跑测试"/"finalize"时使用。
argument-hint: "[slug 或 change-id] 或 --finalize [slug 或 change-id]"
---

# /sdd-review — SDD 第 5 环：评审与归档

Invocation arguments (verbatim): `$ARGUMENTS`

Execute the `sdd-review` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-review/SKILL.md` (parent project source)
- `.opencode/skills/sdd-review/SKILL.md` (plugin-bundled mirror)
- `~/.config/opencode/skills/sdd-review/SKILL.md` (global OpenCode install)
- `.agents/skills/sdd-review/SKILL.md` (Claude-Code mirror)
- `~/.agents/skills/sdd-review/SKILL.md`
- `.claude/skills/sdd-review/SKILL.md`
- `~/.claude/skills/sdd-review/SKILL.md`

Use the first existing path above. For every delegated skill, apply this mandatory
content-resolution contract:

1. Strip the namespace and colon to obtain `name-without-namespace` (for example,
   `superpowers:requesting-code-review` maps to `requesting-code-review/SKILL.md`).
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
- Two-phase execution:
  - **Default (no flag)**: create PR + delegate to `superpowers:requesting-code-review`
  - **`--finalize`**: after PR merge, run `openspec archive` to merge specs back to source of truth
- HARD_RULE: CRITICAL findings must be fixed or downgraded via `[OVERRIDE] <rule>: <reason>` in PR body
- `openspec` is required (no `mv` fallback — mv doesn't merge, breaks "specs reflect system truth" invariant)
- Exit criteria: specs archived, PR merged, dop telemetry flushed

Pass any arguments provided after `/sdd-review` to the skill unchanged (slug/change-id, or `--finalize` plus slug/change-id).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
