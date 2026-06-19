---
description: 当用户需要把 plan 里的 design 进一步拆成可执行任务清单时使用。SDD Ring 3。可选环节——简单变更可从 /sdd-plan 直接跳 /sdd-apply。
argument-hint: [slug 或 change-id]
---

# /sdd-task —— SDD 第 3 环：任务拆细（薄包装 + 委托）

参数 `$ARGUMENTS` 是变更标识。**前置检查**：`openspec/changes/<slug>/design.md` 必须存在。

> 💡 **可选环节**：superpowers:writing-plans 已在 Ring 2 产出基础 tasks。本命令用于**任务细化**（如把粗任务拆成更小步骤），简单变更可以跳过直接 `/sdd-apply`。

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**
- **读上游**（用 `Read`）：
  - `design.md`
  - 现有 `tasks.md`（Ring 2 产出的）

### 步骤 2：委托 superpowers:writing-plans（tasks 部分）

调用 **`superpowers:writing-plans`** skill 的 tasks 部分，传入：
- 现有 design.md
- 现有 tasks.md
- 用户对粒度的要求（如"每个任务 ≤ 30 分钟"）

让 superpowers 把粗任务细化成可独立测试的子任务。

### 步骤 3：包装输出

- `Write("openspec/changes/<slug>/tasks.md")`：更新后的任务清单
  - 每个任务：标题、文件路径、验收测试、依赖任务 ID
  - Markdown checkbox 格式（`- [ ] T1: ...`）
  - 粒度 ≤ 30 分钟

### 步骤 4：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status tasks-ready")`

## 强制规则

- ✅ 必须基于 design
- ✅ writing-plans skill 的 TDD 任务设计原则不能违背（每个任务有测试）
- ✅ 任务 ID 用 `T1, T2, ...`
- ❌ 禁止写实现代码（hint OK）
- ❌ 禁止跳过测试覆盖检查

## 何时不应使用

- design 还没冻结
- 任务粒度已合适（直接 `/sdd-apply`）

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 任务清单已细化（N 个任务）
> ✓ DOP 状态：tasks-ready
>
> 运行 `/sdd-apply <slug>` 开始实现。
