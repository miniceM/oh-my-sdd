---
name: sdd-plan
description: 当用户在 SDD 流程中已完成 spec（proposal + delta specs）、需要交互式产 design + tasks 时使用。SDD Ring 2。委托 superpowers:brainstorming（会自动 chain 到 writing-plans）。
argument-hint: [slug 或 change-id]
---

# /sdd-plan —— SDD 第 2 环：交互式 design + tasks

> ⚠️ **本环交互式**：brainstorming 会问用户 design 问题、提方案、等 approve design。
> **输出位置强制**：design.md + tasks.md 必须写到 `openspec/changes/<slug>/`，**禁止**默认的 `docs/superpowers/specs/` 或 `docs/superpowers/plans/`。

**前置检查**：`openspec/changes/<slug>/proposal.md` + `specs/*.md` 必须存在（先 /sdd-spec）。

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**：未授权停止
- **读上游**（`Read`）：proposal.md、specs/*.md、`.meta.json`（change_id、delta_capabilities）
- **读项目现状**：对每个 delta_capability，`Read("openspec/specs/<capability>/spec.md")`（如存在）

### 步骤 2：格式约束（避免后续冲突）

> **不要强行让 superpowers 用 openspec 模板**——会导致 /sdd-apply 阶段 task-brief 脚本找不到 task。

| 工件 | 用什么格式 | 为什么 |
|------|----------|------|
| design.md | brainstorming 原生 | 自由探索，不约束 |
| tasks.md | **writing-plans 原生 `### Task N:`** | subagent-driven-development 的 task-brief 脚本只认这个格式（强制！） |

openspec validate/archive 只看 tasks.md 存在 + 含 `- [ ]` checkboxes，不强制 header 格式。

### 步骤 3：委托 superpowers:brainstorming（关键）

调用 **`superpowers:brainstorming`** skill，传入：
- proposal.md + specs/*.md 路径（作为业务背景输入）
- **输出路径约束**：`openspec/changes/<slug>/design.md`（**禁止** docs/superpowers/specs/）
- **writing-plans 约束**（chain 时显式传）：
  - 输出路径：`openspec/changes/<slug>/tasks.md`（**禁止** docs/superpowers/plans/）
  - **保留 `### Task N:` 原生格式**（不用 openspec `## N.`）
  - **每个 task commit message 必须用 `[<change-id>] <type>: <task-id> - <subject>`**（change-id 大写原样，从 .meta.json 读）
  - **覆盖 writing-plans 默认 `feat(scope):` 格式**——在 Skill prompt 里给反例：
    ```
    ❌ feat(ard123456): add health check
    ✅ [ARD123456] feat: T1 - add health check
    ```

brainstorming 会：问问题 → 提方案 → 用户 approve → **自动 chain writing-plans** → 产 tasks 清单。

### 步骤 4：验证 + 自动修正

- **4a**：`Read("openspec/changes/<slug>/design.md")` + `tasks.md` 确认存在；`docs/superpowers/` 多了文件 → 移到 openspec 目录
- **4b**：tasks.md 含 `- [ ]` checkbox 格式
- **4c**：扫 tasks.md 所有 `git commit -m "..."` 行，发现错误格式（`feat(scope):` / `apply(scope):` / 小写 change-id）→ **立即 Edit 重写**为 `[<id>] <type>: <task-id> - <subject>`

### 步骤 4.5：显式 commit（禁止跳过）

brainstorming + writing-plans 自带 commit 是侥幸（可能 commit 错位置）。纠正后必须 commit openspec 版本：

```bash
git add openspec/changes/<slug>/design.md openspec/changes/<slug>/tasks.md
git commit -m '[<change-id>] plan: ring 2 freeze - design + tasks ready'
```

change-id 从 `.meta.json` 读。

### 步骤 5：DOP 标记

`Bash("dop change update <id> --status plan-ready")`，失败 warn。

## 强制规则

- ✅ iam 校验通过
- ✅ 委托 brainstorming（不直接调 writing-plans）
- ✅ 步骤 4.5 显式 commit
- ✅ design.md + tasks.md 写到 `openspec/changes/<slug>/`
- ✅ tasks.md 用 `### Task N:` + `- [ ]` checkbox
- ✅ 步骤 4c 自动修正 commit message 格式
- ❌ 禁止写到 `docs/superpowers/`
- ❌ 禁止跳过 brainstorming 的用户 approve 步骤
- ❌ 禁止改 specs/*.md / proposal.md（都是 input）
- ❌ 禁止 `git add -A`

## 何时不应使用

- proposal.md 或 specs/*.md 不存在（先 /sdd-spec）
- 简单 bug fix（不需要 design）

## 输出

> ✓ 变更 `<slug>` 计划已生成（brainstorming + writing-plans 协作）
> ✓ design.md + tasks.md 写到 `openspec/changes/<slug>/`
> ✓ DOP 状态：plan-ready
>
> 运行 `/sdd-task <slug>` 细化任务（可选），或 `/sdd-apply <slug>` 直接进入实现。
