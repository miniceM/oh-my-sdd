---
description: SDD Ring 5 - 两阶段：默认创建 PR 并委托 superpowers:requesting-code-review；--finalize 在 PR merge 后做 openspec archive。用户说"创建 PR"/"code review"/"归档"/"跑测试"/"finalize"时使用。
argument-hint: [slug 或 change-id] 或 --finalize [slug 或 change-id]
---

# /sdd-review — SDD 第 5 环：评审与归档

Execute the `sdd-review` skill following its full workflow.

Locate and follow the skill definition at one of:
- `skills/sdd-review/SKILL.md` (parent project source)
- `.opencode/skills/sdd-review/SKILL.md` (plugin-bundled mirror)
- `.agents/skills/sdd-review/SKILL.md` (Claude-Code mirror)

The skill file contains the authoritative step-by-step instructions, including:
- Two-phase execution:
  - **Default (no flag)**: create PR + delegate to `superpowers:requesting-code-review`
  - **`--finalize`**: after PR merge, run `openspec archive` to merge specs back to source of truth
- HARD_RULE: CRITICAL findings must be fixed or downgraded via `[OVERRIDE] <rule>: <reason>` in PR body
- `openspec` is required (no `mv` fallback — mv doesn't merge, breaks "specs reflect system truth" invariant)
- Exit criteria: specs archived, PR merged, dop telemetry flushed

Pass any arguments provided after `/sdd-review` to the skill unchanged (slug/change-id, or `--finalize` plus slug/change-id).

Commit format reminder: `[<change-id>] <type>: <subject>` (HARD_RULE).
