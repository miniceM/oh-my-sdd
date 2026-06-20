---
name: sdd-apply
description: 当用户在 SDD 流程中已完成 plan、需要实现任务时使用。SDD Ring 4。委托 superpowers:subagent-driven-development（TDD + subagent + 两阶段 review）。
argument-hint: [slug 或 change-id]
---

# /sdd-apply —— SDD 第 4 环：实现执行（薄包装 + 委托）

> ⚠️ **核心约束**：
> - **plan 文件是 `openspec/changes/<slug>/tasks.md`**（不是 superpowers 默认 plan 位置）
> - **禁止修改 `openspec/changes/<slug>/specs/*.md`**（spec 是 input）
> - **禁止修改 `openspec/changes/<slug>/design.md`**（design 是 input）
> - 每个 task 完成后必须把 tasks.md 里的 `- [ ]` 改成 `- [x]`
> - commit message 格式：`[<change-id>] <task-id>: <subject>`（强制以 change-id 开头）

参数 `$ARGUMENTS` 是变更标识。**前置检查**：`openspec/changes/<slug>/tasks.md` 必须存在，所有 `- [ ]` 已逐个评估。

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**：未授权停止
- **读上游**（用 `Read`）：
  - `openspec/changes/<slug>/tasks.md`（plan 文件）
  - `openspec/changes/<slug>/design.md`（design 决策）
  - `openspec/changes/<slug>/specs/*.md`（参考，**不能改**）
  - `.meta.json`（change_id、分支名）

### 步骤 2：委托 superpowers:subagent-driven-development

调用 **`superpowers:subagent-driven-development`** skill，**关键参数**：
- **plan 文件**：`openspec/changes/<slug>/tasks.md`（**显式指定**，不要让 skill 找默认位置）
- **per-task subagent 约束**（在 skill 调用 prompt 里写明）：
  ```
  每个 subagent 必须：
  1. 完成后把 openspec/changes/<slug>/tasks.md 对应的 - [ ] 改成 - [x]
  2. 禁止修改 specs/*.md 和 design.md（这些是 input）
  3. commit message 格式：`[<change-id>] <task-id>: <subject>`
  4. 测试红就回到测试，不绕过
  ```

skill 会派 fresh subagent per task + 两阶段 review（implementer + reviewer）。

### 步骤 3：处理 spec/design 矛盾

如 subagent 报告"实现时发现 spec/design 矛盾"：
- **停止当前 task**（不绕过）
- 在 `openspec/changes/<slug>/RETRO.md` 记录矛盾点
- 提示用户：要么改 spec/design（回 `/sdd-spec` 或 `/sdd-plan`），要么改 task 假设（在 RETRO 写理由）
- 等用户决定后继续

### 步骤 4：DOP 实时上报

每个 commit 触发 PostToolUse hook 自动上报 slash.invoked / code_delta（已实现，无需手工）。
可选：完成所有 task 后跑 `Bash("dop change update <id> --status apply-done")`。

## 强制规则

- ✅ iam 校验通过
- ✅ **plan 必须用 `openspec/changes/<slug>/tasks.md`**
- ✅ 每个 task 完成必须勾 `- [ ]` → `- [x]`
- ✅ commit message 必须以 `[<change-id>]` 开头（阻断性强制）
- ✅ spec/design 矛盾时写 RETRO.md 停止
- ❌ 禁止修改 `content/enterprise-baseline.md` 或用户 `~/.claude/CLAUDE.md`
- ❌ 禁止修改 specs/*.md / design.md
- ❌ 禁止跨 task 共用 commit
- ❌ 禁止跳过 TDD（subagent 必须 RED → GREEN → REFACTOR）

## 何时不应使用

- tasks.md 还有未评估的 `- [ ]`（先评估）
- spec/design 严重矛盾未解决（先回上游）
- 测试还在红

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 所有 tasks 已完成
> ✓ tasks.md 所有 `- [ ]` 已勾选
> ✓ DOP 状态：apply-done
>
> 运行 `/sdd-review <slug>` 进入 Ring 5（验证 + 归档 + 创建 PR）。
