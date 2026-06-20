---
name: sdd-task
description: 极少使用——仅当 /sdd-plan 产出的 tasks.md 粒度过粗（每个 task > 30 分钟）时才用。SDD Ring 3 可选环节。99% 情况请直接 /sdd-apply。
argument-hint: [slug 或 change-id]
---

# /sdd-task —— SDD 第 3 环：任务细化（可选，极少用）

> ⚠️ **99% 情况应跳过此命令**。
>
> /sdd-plan 已经通过 brainstorming → writing-plans 链产出 tasks.md（粒度通常合适）。
> 仅当满足以下**全部**条件时才用 /sdd-task：
> 1. tasks.md 里某些 task 明显过大（> 30 分钟一个）
> 2. 用户明确反馈"task 粒度不够细"
> 3. 想重新细化而非全部重写
>
> 不满足以上条件 → 直接运行 `/sdd-apply <slug>` 进入 Ring 4。

参数 `$ARGUMENTS` 是变更标识。**前置检查**：`openspec/changes/<slug>/tasks.md` 必须存在（先 /sdd-plan）。

## 你的工作流

### 步骤 1：前置检查 + 跳过判断

- **iam 校验**
- **读上游**（用 `Read`）：
  - `openspec/changes/<slug>/design.md`
  - `openspec/changes/<slug>/tasks.md`（Ring 2 产出的）
- **粒度评估**：扫一遍 tasks.md，估算每个 task 工作量
  - 如所有 task ≤ 30 分钟：**建议跳过**，提示用户直接 `/sdd-apply`
  - 如有 task > 30 分钟：继续步骤 2

### 步骤 2：委托 superpowers:writing-plans 细化

调用 **`superpowers:writing-plans`** skill，传入：
- 现有 design.md（作为 design context，不重新设计）
- 现有 tasks.md（要细化的对象）
- 明确指令："**不要重新做 design，只把现有 tasks 里过粗的拆细**"
- 用户对粒度的要求（默认 ≤ 30 分钟/task）
- **输出位置约束**：`openspec/changes/<slug>/tasks.md`（覆盖现有，**禁止**写到 docs/superpowers/plans/）

### 步骤 3：包装输出 + 验证

- `Write("openspec/changes/<slug>/tasks.md")`：覆盖更新（不是新建）
  - 每个任务：标题、文件路径、验收测试、依赖任务 ID
  - Markdown checkbox 格式（`- [ ] T1: ...`）
  - 粒度 ≤ 30 分钟
- `Read("openspec/changes/<slug>/tasks.md")` 验证写入成功
- 检查 `docs/superpowers/plans/` 没被污染

### 步骤 3.5：显式 commit（**关键——禁止跳过！**）

> ⚠️ writing-plans 内置 commit 可能 commit 错位置（docs/superpowers/）。
> 必须自己 commit openspec/ 版本。

```bash
Bash("git add openspec/changes/<slug>/tasks.md")
Bash("git commit -m '[<change-id>] task: ring 3 refine - tasks细化'")
```

### 步骤 4：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status tasks-ready")`
- 在 `.meta.json` 加 `"task_phase": "refined"` 标记细化过

## 强制规则

- ✅ 必须基于 design（不重新设计）
- ✅ writing-plans skill 的 TDD 任务设计原则不能违背（每个任务有测试）
- ✅ 任务 ID 用 `T1, T2, ...`（与 Ring 2 一致）
- ✅ tasks.md 必须覆盖到 `openspec/changes/<slug>/tasks.md`
- ❌ 禁止写实现代码（hint OK）
- ❌ 禁止跳过测试覆盖检查
- ❌ 禁止重新做 design（design 已在 Ring 2 由 brainstorming 完成）
- ❌ 禁止改 design.md 或 specs/*.md

## 何时跳过此命令（绝大多数情况）

- tasks.md 已存在且粒度合适 → 直接 `/sdd-apply`
- 用户没明确要求"细化 task" → 直接 `/sdd-apply`
- 简单变更（< 5 个 task） → 直接 `/sdd-apply`
- design 还没冻结 → 先回 `/sdd-plan`

**跳过时记录**：在 `.meta.json` 加 `"task_phase": "skipped - plan was sufficient"`，便于 DOP 统计跳过率。不强制产 commit。

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 任务清单已细化（N 个任务，平均 X 分钟/task）
> ✓ DOP 状态：tasks-ready
>
> 运行 `/sdd-apply <slug>` 开始实现。
