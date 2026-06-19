---
description: 当用户在 SDD 流程中已完成 tasks.md、要按任务列表执行实现时使用。SDD Ring 4。委托 superpowers:executing-plans 或 subagent-driven-development。
argument-hint: [slug 或 change-id]
---

# /sdd-apply —— SDD 第 4 环：实现执行（薄包装 + 委托）

参数 `$ARGUMENTS` 是变更标识。**前置检查**：`openspec/changes/<slug>/tasks.md` 必须存在，所有 `- [ ]` 已逐个评估。

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**
- **读上游**（用 `Read`）：
  - `tasks.md`（任务清单）
  - `.meta.json`（拿 change_id 和分支名）
- **分支确认**：当前 git 分支必须是 `<NNN>-<slug>` 格式，否则提示用户先 `git checkout` 到正确分支

### 步骤 2：选择执行模式

询问用户：
- **简单模式（推荐小变更）**：调用 **`superpowers:executing-plans`**
- **复杂模式（推荐大变更）**：调用 **`superpowers:subagent-driven-development`**（每个 task 派 subagent，两阶段 review）

让用户选择后调用对应 skill。

### 步骤 3：执行（委托给 superpowers）

superpowers 会：
- 按顺序处理每个 task
- 每个 task 走 TDD 循环（红 → 绿 → commit）
- 自动勾选 tasks.md checkbox

我们的 SessionStart/PostToolUse hook 会**自动**：
- 上报 session.start + slash.invoked 到 DOP
- 增量记录 code_delta
- 触发 session.end 上报

### 步骤 4：commit 包装

每个 commit message 必须含：
- 任务 ID（如 `T3:`）
- change-id（如 `[ARD123456]`）
- 简述

示例：`T3: 实现积分兑换 API [ARD123456]`

superpowers 的 executing-plans 会负责 commit 节奏，我们在 commit message 格式上指导。

### 步骤 5：处理 spec/design 矛盾

如 superpowers 报告 spec/design 矛盾：
- 停止当前 apply
- 在 `openspec/changes/<slug>/RETRO.md` 记录矛盾点
- 提示用户回到 `/sdd-spec` 或 `/sdd-plan` 修订上游
- **不要**擅自改 spec/design

### 步骤 6：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status apply-done")`

## 强制规则

- ✅ 必须按 tasks.md 顺序（除非 task 显式标注可并行）
- ✅ 每个 task 独立 commit
- ✅ commit message 含 change-id + 任务 ID
- ✅ 矛盾时写 RETRO.md，不擅自改上游
- ❌ 禁止跳过 task（除非标 optional）
- ❌ 禁止 multi-task 一个 commit
- ❌ 禁止改用户 `~/.claude/CLAUDE.md` oh-my-sdd 段

## 何时不应使用

- tasks 还没生成（先 `/sdd-task` 或 `/sdd-plan`）
- ad-hoc 修复（不走 SDD）

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 实现完成（N 个 task 全绿）
> ✓ commit 历史含 change-id [ARD123456]
> ✓ DOP 状态：apply-done
>
> 运行 `/sdd-review <slug>` 进入 Ring 5（验证归档）。
