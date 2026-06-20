---
name: sdd-plan
description: 当用户在 SDD 流程中已完成 spec（含 design）、需要把 design 拆成可执行任务清单时使用。SDD Ring 2。委托 superpowers:writing-plans。
argument-hint: [slug 或 change-id]
---

# /sdd-plan —— SDD 第 2 环：任务拆分（薄包装 + 委托）

> ⚠️ **职责边界（重要）**：
> - 本命令**只产出 `tasks.md`**（任务清单）——不产 design（design 在 Ring 1 已完成）
> - **输入**：`openspec/changes/<slug>/` 下的 `proposal.md` + `specs/*.md` + **`design.md`**
> - **输出**：`openspec/changes/<slug>/tasks.md`（用 `- [ ]` checkbox 格式）
> - writing-plans 是"任务分解专家"，给它 design 它就能拆出高质量 task 清单
>
> ⚠️ **输出位置强制**：tasks.md 必须写到 `openspec/changes/<slug>/`，**禁止**写到
> superpowers 默认的 `docs/superpowers/plans/`。如 `superpowers:writing-plans`
> 试图写到默认位置，**立即纠正**并改写到 openspec 目录。

参数 `$ARGUMENTS` 是变更标识（slug 或 change-id）。**前置检查**：
- `openspec/changes/<slug>/proposal.md` 必须存在（先 /sdd-spec）
- `openspec/changes/<slug>/design.md` 必须存在（先 /sdd-spec 含 design）
- 如缺 design.md → 提示用户回到 `/sdd-spec` 补 design

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**：未授权停止
- **读上游**（用 `Read`）：
  - `openspec/changes/<slug>/proposal.md`（业务背景）
  - `openspec/changes/<slug>/design.md`（**关键输入**——技术决策、Goals、Risks）
  - `openspec/changes/<slug>/specs/*.md`（delta 格式，作为参考）
  - `.meta.json`（change_id、delta_capabilities）
  - **读项目现状**：对每个 delta_capability，`Read("openspec/specs/<capability>/spec.md")`

### 步骤 2：拿 openspec tasks 模板

- `Bash("openspec instructions tasks --change <slug> --json")` 拿 tasks 模板
- 解析 JSON 的 template 字段——这是 openspec 期望的 `- [ ]` checkbox 格式

### 步骤 3：委托 superpowers:writing-plans

调用 **`superpowers:writing-plans`** skill，传入：
- **design.md 路径**（主输入——writing-plans 根据 design 拆 task）
- specs/proposal 路径（参考）
- openspec tasks 模板（步骤 2 拿的）
- **明确的输出路径**：`openspec/changes/<slug>/tasks.md`（**唯一**输出文件）

让 superpowers 把 design 拆成 TDD 友好的 task 清单（每个 task 有验收点 + 依赖）。

### 步骤 4：验证输出位置 + 格式

- `Read("openspec/changes/<slug>/tasks.md")` 确认存在
- 检查内容用 `- [ ]` checkbox 格式（openspec archive 期望）
- 检查 `docs/superpowers/plans/` 是否多了文件——**如多了**，移动到 openspec 目录并提示"已纠正"
- 检查**是否误产 design.md**——如有，删掉并提示用户"design 已在 Ring 1 完成，本步骤只产 tasks"

### 步骤 5：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status plan-ready")` 或类似
- 失败不阻塞（warn）

## 强制规则

- ✅ iam 校验通过才能继续
- ✅ **只产 tasks.md**——design.md 已在 Ring 1 完成，本步骤不动
- ✅ tasks.md 必须写到 `openspec/changes/<slug>/`
- ✅ tasks.md 用 `- [ ]` checkbox 格式（openspec archive 期望格式）
- ✅ 必须基于 openspec 提供的 tasks 模板填，不要自创格式
- ✅ writing-plans 必须读 design.md 作为主输入
- ❌ 禁止写到 `docs/superpowers/plans/`
- ❌ 禁止跳过 superpowers:writing-plans（它的 task 拆分质量高）
- ❌ 禁止改 specs/*.md 或 design.md（都是 input）
- ❌ 禁止在本步骤产 design.md（重复劳动）

## 何时不应使用

- proposal.md 不存在（先 /sdd-spec）
- design.md 不存在（先回 /sdd-spec 补 design）
- 简单 bug fix（不需要任务清单）

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 任务清单已生成（tasks.md）
> ✓ 写到 `openspec/changes/<slug>/tasks.md`
> ✓ DOP 状态：plan-ready
>
> 运行 `/sdd-task <slug>` 细化任务（可选），或 `/sdd-apply <slug>` 直接进入实现。
