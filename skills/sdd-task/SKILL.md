---
name: sdd-task
description: 本 skill 在 /sdd-plan 产出的 tasks.md 粒度过粗（单 task > 30 分钟）需要拆细时使用。SDD Ring 3 可选环节——粒度合适时直接用 /sdd-apply 即可，无需经过本环。
argument-hint: [slug 或 change-id]
---

# /sdd-task —— SDD 第 3 环：任务细化（可选环节）

> **默认跳过此命令**——/sdd-plan 已通过 brainstorming → writing-plans 链产出 tasks.md，粒度通常合适。
>
> 仅当 tasks.md 里某些 task 明显过大（> 30 分钟）且用户明确反馈"粒度不够细"时才用本环。
> 粒度合适时直接 `/sdd-apply <slug>`。

**前置检查**：tasks.md 必须存在（先 /sdd-plan）。

## 你的工作流

### 步骤 1：前置检查 + 跳过判断

- iam 校验；读 design.md + tasks.md
- **粒度评估**：扫 tasks.md 估算每个 task 工作量
  - 所有 task ≤ 30 分钟 → **建议跳过**，提示直接 `/sdd-apply`
  - 有 task > 30 分钟 → 继续步骤 2

### 步骤 2：委托 superpowers:writing-plans 细化

传入：现有 design.md（不重新设计）、现有 tasks.md（要细化的对象）、明确指令"**不重新做 design，只把过粗的拆细**"、用户粒度要求（默认 ≤ 30 分钟/task）、输出位置 `openspec/changes/<slug>/tasks.md`（**禁止** docs/superpowers/plans/）。

### 步骤 3：包装输出 + 验证

- `Write("openspec/changes/<slug>/tasks.md")`：覆盖更新
- 验证写入成功 + `docs/superpowers/plans/` 未被污染

### 步骤 3.5：显式 commit（禁止跳过）

```bash
git add openspec/changes/<slug>/tasks.md
git commit -m '[<change-id>] task: ring 3 refine - tasks细化'
```

### 步骤 4：本地进度标记（不调 dop CLI）

真实 dop 没有 `change update`——进度记录到 `.meta.json`：

`Edit("openspec/changes/<slug>/.meta.json")`：把 `dop_status` 设为 `"tasks-ready"`，加 `dop_status_at: <ISO timestamp>` 和 `"task_phase": "refined"`。

## 强制规则

- ✅ 基于 design（不重新设计）
- ✅ 任务 ID 用 `T1, T2, ...`（与 Ring 2 一致）
- ✅ tasks.md 写到 `openspec/changes/<slug>/`
- ✅ 步骤 3.5 显式 commit
- ❌ 禁止写实现代码（hint OK）
- ❌ 禁止重新做 design
- ❌ 禁止改 design.md / specs/*.md
- ❌ 禁止 `git add -A`

## 何时跳过此命令（绝大多数情况）

- tasks.md 粒度合适 → 直接 `/sdd-apply`
- 用户没明确要求细化 → 直接 `/sdd-apply`
- 简单变更（< 5 个 task） → 直接 `/sdd-apply`
- design 未冻结 → 先回 `/sdd-plan`

**跳过时记录**：`.meta.json` 加 `"task_phase": "skipped - plan was sufficient"`，不强制产 commit。

## 输出

> ✓ 变更 `<slug>` 任务清单已细化（N 个任务，平均 X 分钟/task）
> ✓ DOP 状态：tasks-ready
>
> 运行 `/sdd-apply <slug>` 开始实现。
