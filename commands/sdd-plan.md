---
description: 当用户在 SDD 流程中已完成 spec、需要写技术计划时使用。SDD Ring 2。委托 superpowers:writing-plans。
argument-hint: [slug 或 change-id]
---

# /sdd-plan —— SDD 第 2 环：技术计划（薄包装 + 委托）

> ⚠️ **输出位置强制**：本命令产出的 `design.md` + `tasks.md` 必须写到
> `openspec/changes/<slug>/`，**禁止**写到 superpowers 默认的
> `docs/superpowers/plans/`。如 `superpowers:writing-plans` 试图写到默认位置，
> **立即纠正**并改写到 openspec 目录。

参数 `$ARGUMENTS` 是变更标识（slug 或 change-id）。**前置检查**：`openspec/changes/<slug>/proposal.md` 必须存在，否则提示先跑 `/sdd-spec`。

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**：未授权停止
- **读上游**（用 `Read`）：
  - `openspec/changes/<slug>/proposal.md`
  - `openspec/changes/<slug>/specs/*.md`（delta 格式：ADDED/MODIFIED/REMOVED）
  - `.meta.json`（change_id、delta_capabilities）
  - **读项目现状**：对每个 delta_capability，`Read("openspec/specs/<capability>/spec.md")`——design 决策必须基于现状

### 步骤 2：拿 openspec design/tasks 模板

- `Bash("openspec instructions design --change <slug> --json")` 拿 design 模板
- `Bash("openspec instructions tasks --change <slug> --json")` 拿 tasks 模板
- 解析 JSON 的 template 字段——这是 openspec 期望的格式

### 步骤 3：委托 superpowers:writing-plans

调用 **`superpowers:writing-plans`** skill，传入：
- 上游 spec/proposal 路径
- openspec 提供的 design/tasks 模板（步骤 2 拿的）
- **明确的输出路径**：`openspec/changes/<slug>/design.md` + `openspec/changes/<slug>/tasks.md`

让 superpowers 产出完整的实施计划（design + 任务清单），但**写到 openspec 目录**。

### 步骤 4：验证输出位置（防止 superpowers 写到默认位置）

- `Read("openspec/changes/<slug>/design.md")` 确认存在
- `Read("openspec/changes/<slug>/tasks.md")` 确认存在
- 检查 `docs/superpowers/plans/` 是否多了文件——**如多了**，移动到 openspec 目录并提示用户"已纠正 superpowers 默认输出"

### 步骤 5：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status plan-ready")` 或类似
- 失败不阻塞（warn）

## 强制规则

- ✅ iam 校验通过才能继续
- ✅ **design.md + tasks.md 必须写到 `openspec/changes/<slug>/`**
- ✅ tasks.md 用 `- [ ]` checkbox 格式（openspec archive 期望格式）
- ✅ 必须基于 openspec 提供的模板填，不要自创格式
- ❌ 禁止写到 `docs/superpowers/plans/`
- ❌ 禁止跳过 superpowers:writing-plans（它的 task 拆分质量高）
- ❌ 禁止改 specs/*.md（spec 是 input）

## 何时不应使用

- proposal.md 不存在（先 /sdd-spec）
- 简单 bug fix（不需要 design）

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 计划已生成
> ✓ design.md + tasks.md 写到 `openspec/changes/<slug>/`
> ✓ DOP 状态：plan-ready
>
> 运行 `/sdd-task <slug>` 细化任务（可选），或 `/sdd-apply <slug>` 直接进入实现。
