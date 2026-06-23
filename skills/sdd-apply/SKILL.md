---
name: sdd-apply
description: 本 skill 在已完成 plan、用户说"开始实现"/"写代码"/"执行任务"/"做 TDD"时使用。SDD Ring 4——根据任务复杂度选 superpowers:subagent-driven-development（复杂多任务）或 executing-plans（简单任务）。
argument-hint: [slug 或 change-id]
---

# /sdd-apply —— SDD 第 4 环：实现执行（薄包装 + 委托）

> ⚠️ **核心约束**：
> - plan 文件是 `openspec/changes/<slug>/tasks.md`（**不是** superpowers 默认 plan 位置）
> - 禁止修改 specs/*.md + design.md（都是 input）
> - 每个 task 完成后必须把 tasks.md 里 `- [ ]` 改成 `- [x]`
> - commit message 格式：`[<change-id>] <type>: <task-id> - <subject>`（直接用 tasks.md 里的 commit message，不自创）

**前置检查**：tasks.md 必须存在，所有 `- [ ]` 已逐个评估。

## 工作流

### 步骤 1：前置检查

- iam 校验；读 tasks.md（统计 task 数）+ design.md + specs/*.md（参考）+ .meta.json（change_id）

### 步骤 2：评估复杂度 + 让用户选执行模式

数 tasks.md 里的 `### Task N:` heading：

| 评估 | 推荐模式 | 理由 |
|------|---------|------|
| ≤ 3 task 或 ≤ 30 分钟 | **executing-plans** | 简单任务用 subagent 是 overkill |
| 4+ task 或 > 30 分钟 | **subagent-driven-development** | 需要 fresh context + 两阶段 review |
| 跨多 capability / 大量文件 | **subagent-driven-development** | 即使 task 数少，复杂度高也用 |

用 `AskUserQuestion` 让用户**确认或覆盖**推荐。

**模式区别**：
- `executing-plans`：当前 session 内批量执行 + 人工 checkpoint。简单直接。
- `subagent-driven-development`：每 task 派 fresh subagent + 两阶段 review（spec compliance + code quality）。质量高但开销大。

### 步骤 3：委托选定模式

调用选定 skill（executing-plans 或 subagent-driven-development），传入：
- **plan 文件**：`openspec/changes/<slug>/tasks.md`（显式指定）
- **执行约束**（两种模式共用）：
  ```
  1. 完成每个 task 后把 tasks.md 对应的 - [ ] 改成 - [x]
  2. 禁止修改 specs/*.md 和 design.md
  3. commit message 格式：[<change-id>] <type>: <task-id> - <subject>
     （直接用 tasks.md 里的 commit message，不要自创）
  4. 测试红就回到测试，不绕过
  ```
- subagent 模式额外：每个 subagent 必须遵守上述约束

### 步骤 4：处理 spec/design 矛盾

执行中报告"实现时发现 spec/design 矛盾"：
- **停止当前 task**（不绕过）
- 在 `openspec/changes/<slug>/RETRO.md` 记录矛盾点
- 提示用户：改 spec/design（回 /sdd-spec 或 /sdd-plan）或改 task 假设（RETRO 写理由）
- 等用户决定后继续

### 步骤 5：本地进度标记（不调 dop CLI）

每个 commit 触发 PostToolUse hook 自动 HTTP 上报到 DOP（已实现，非 CLI）。完成所有 task 后**本地标记**：

`Edit("openspec/changes/<slug>/.meta.json")`：把 `dop_status` 设为 `"apply-done"`，加 `dop_status_at: <ISO timestamp>`。

## 强制规则

- ✅ iam 校验通过
- ✅ plan 用 `openspec/changes/<slug>/tasks.md`
- ✅ 让用户选执行模式（不自作主张）
- ✅ 每 task 勾 `- [ ]` → `- [x]`
- ✅ commit message 用 tasks.md 里的格式（`[<change-id>] <type>: <task-id> - <subject>`）
- ✅ spec/design 矛盾写 RETRO.md 停止
- ❌ 禁止修改 baseline / CLAUDE.md / specs/*.md / design.md
- ❌ 禁止跨 task 共用 commit
- ❌ 禁止跳过 TDD（RED → GREEN → REFACTOR）
- ❌ 禁止 `git add -A`

## 何时不应使用

- tasks.md 还有未评估的 `- [ ]` / spec/design 严重矛盾 / 测试还在红

## 输出

> ✓ 变更 `<slug>` 所有 tasks 已完成（用了 <executing-plans|subagent-driven-development> 模式）
> ✓ tasks.md 所有 `- [ ]` 已勾选
> ✓ DOP 状态：apply-done
>
> 运行 `/sdd-review <slug>` 进入 Ring 5（验证 + 归档 + 创建 PR）。
