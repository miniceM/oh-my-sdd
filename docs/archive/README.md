# docs/archive — 历史设计文档归档

本目录存放 v0.1 阶段的设计文档与实施计划。v0.2 已发布后，原始 spec/plan 不再用于日常开发，但作为 v0.1 → v0.2 演化的历史记录保留。

## 文档清单

| 文件 | 来源 | 行数 | 作用 |
|------|------|------|------|
| `v0.1-design.md` | 原 `docs/superpowers/specs/2026-06-18-oh-my-sdd-design.md` | 740 | v0.1 阶段产品设计 spec（3 层模型、SDD 五环、hook 系统、Token 预算） |
| `v0.1-plan.md` | 原 `docs/superpowers/plans/2026-06-18-oh-my-sdd-v0.1.md` | 3431 | v0.1 实施计划（含 Open Questions 决策记录、Task 1-N 实现细节） |
| `v0.1-real-env-checklist.md` | 原 `docs/real-env-verification-checklist.md` | 1298 | v0.1 发布前真实环境验证 checklist（macOS/Linux/Windows 三平台 × Phase 0-10）。v0.2 验证用 `docs/release/runbook-internal-test-v0.2.md` |

## 阅读建议

- **了解架构起源**：先读 `v0.1-design.md` §2（整体架构）+ §3（核心模块）
- **回顾决策历史**：`v0.1-plan.md` 的 "Open Questions to Verify" 表记录了 plugin.json schema、`${CLAUDE_PLUGIN_ROOT}` 兼容性、SessionEnd 事件名等关键调研结论
- **对比当前实现**：v0.2 backlog 演进过程见 `docs/roadmap/v0.2-backlog.md`

## 维护原则

- 归档文档**不再修改**——如发现错误，修改当前活跃文档（README.md / AGENTS.md）并在 v0.2+ roadmap 中说明
- 实施计划类文档**不**作为新功能开发依据——新功能按当前活跃流程（/sdd-spec → /sdd-plan → /sdd-task → /sdd-apply → /sdd-review）
