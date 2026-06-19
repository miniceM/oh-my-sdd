---
description: 当用户在 SDD 流程中已完成 spec、需要写技术设计时使用。SDD Ring 2。委托 superpowers:writing-plans。
argument-hint: [slug 或 change-id]
---

# /sdd-plan —— SDD 第 2 环：技术计划（薄包装 + 委托）

参数 `$ARGUMENTS` 是变更标识（slug 或 change-id）。**前置检查**：`openspec/changes/<slug>/proposal.md` 必须存在，否则提示先跑 `/sdd-spec`。

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**：未授权停止。
- **读上游**（用 `Read`）：
  - `openspec/changes/<slug>/proposal.md`
  - `openspec/changes/<slug>/specs/*.md`（delta 格式）
  - `.meta.json`（拿 change_id、delta_capabilities）
  - **读项目现状**：对每个 delta_capability，`Read("openspec/specs/<capability>/spec.md")`（如存在）—— design 决策必须基于现状，不能凭空

### 步骤 2：委托 superpowers:writing-plans

调用 **`superpowers:writing-plans`** skill，传入：
- spec 文件路径
- 项目上下文

让 superpowers 产出完整的实施 plan（含 design + tasks）。

### 步骤 3：包装输出

把 superpowers 的 plan 拆分写到我们企业约定的结构：

- `Write("openspec/changes/<slug>/design.md")`：架构决策 + tradeoff + 替代方案
- `Write("openspec/changes/<slug>/tasks.md")`：TDD 任务清单（含 `- [ ]` checkbox）

文件结构遵循企业约定，方便后续 `/sdd-task` 细化或 `/sdd-apply` 直接执行。

### 步骤 4：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status plan-ready")`

## 强制规则

- ✅ 必须基于 Ring 1 的 specs
- ✅ writing-plans skill 的流程不能跳过
- ✅ design.md 必须含至少 1 个被否决的备选方案
- ❌ 禁止写实现代码（伪代码 OK）
- ❌ 禁止凭空设计（必须读上游）

## 何时不应使用

- spec 还没冻结（先 `/sdd-spec`）
- 变更极简单（直接 `/sdd-task` 或 `/sdd-apply`）

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 计划已生成（design.md + tasks.md）
> ✓ DOP 状态：plan-ready
>
> 运行 `/sdd-task <slug>` 拆细任务，或 `/sdd-apply <slug>` 直接执行。
