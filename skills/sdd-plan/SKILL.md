---
name: sdd-plan
description: 当用户在 SDD 流程中已完成 spec（proposal + delta specs）、需要交互式产 design + tasks 时使用。SDD Ring 2。委托 superpowers:brainstorming（会自动 chain 到 writing-plans）。
argument-hint: [slug 或 change-id]
---

# /sdd-plan —— SDD 第 2 环：交互式 design + tasks（薄包装 + 委托）

> ⚠️ **本环会与用户交互式对话**：
> brainstorming 会问用户 design 问题、提多个方案、等用户 approve design。
> 这是 SDD plan 阶段本来就需要的——design 必须用户确认才能进入实现。
>
> ⚠️ **输出位置强制**：
> brainstorming 默认写到 `docs/superpowers/specs/`，writing-plans 默认写到
> `docs/superpowers/plans/`。两者都必须改写到 `openspec/changes/<slug>/`：
> - design 输出 → `openspec/changes/<slug>/design.md`
> - tasks 输出 → `openspec/changes/<slug>/tasks.md`

参数 `$ARGUMENTS` 是变更标识（slug 或 change-id）。**前置检查**：
- `openspec/changes/<slug>/proposal.md` 必须存在（先 /sdd-spec）
- `openspec/changes/<slug>/specs/*.md` 必须存在（先 /sdd-spec，delta 格式）

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**：未授权停止
- **读上游**（用 `Read`）：
  - `openspec/changes/<slug>/proposal.md`（业务背景、整体验收）
  - `openspec/changes/<slug>/specs/*.md`（delta 格式需求——ADDED/MODIFIED/REMOVED）
  - `.meta.json`（change_id、delta_capabilities）
  - **读项目现状**：对每个 delta_capability，`Read("openspec/specs/<capability>/spec.md")`（如存在）

### 步骤 2：拿 openspec design/tasks 模板（用于约束 brainstorming/writing-plans 输出格式）

- `Bash("openspec instructions design --change <slug> --json")` 拿 design 模板
- `Bash("openspec instructions tasks --change <slug> --json")` 拿 tasks 模板
- 解析 JSON 的 template 字段——让 brainstorming/writing-plans 按这个格式输出

### 步骤 3：委托 superpowers:brainstorming（关键步骤）

调用 **`superpowers:brainstorming`** skill，传入：
- **proposal.md 路径**（业务背景）
- **specs/*.md 路径**（delta 格式需求）
- **openspec design 模板**（步骤 2 拿的）——告诉 brainstorming 输出 design.md 时按此格式
- **明确的输出路径约束**：`openspec/changes/<slug>/design.md`（**禁止** docs/superpowers/specs/）
- **writing-plans 的约束**（chain 时传递）：
  - 输出路径：`openspec/changes/<slug>/tasks.md`（**禁止** docs/superpowers/plans/）
  - **每个 task 的 commit message 必须用格式 `[<change-id>] apply: <task-id> - <subject>`**（与 spec/plan/review 风格一致，避免 /sdd-apply 阶段冲突）
  - change-id 从 .meta.json 读

brainstorming 会：
1. 读 proposal + specs（不用从零开始，已有 spec 直接进 design 探索）
2. 问用户 design 问题（一次一个，多选优先）
3. 提 2-3 个备选方案 + 推荐
4. 用户 approve design
5. **自动 chain 到 superpowers:writing-plans**（brainstorming 的 terminal state）

writing-plans 会接着：
- 基于 design 产 tasks 清单（TDD 友好、bite-sized）
- 每个 task 的 commit 步骤用上面约定的格式
- 输出到 `openspec/changes/<slug>/tasks.md`

### 步骤 4：验证输出位置（关键兜底）

- `Read("openspec/changes/<slug>/design.md")` 确认存在
- `Read("openspec/changes/<slug>/tasks.md")` 确认存在
- 检查 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 是否多了文件
  - **如多了**：移动到 openspec 目录，提示用户"已纠正 superpowers 默认输出"
- 检查 tasks.md 用 `- [ ]` checkbox 格式（openspec archive 期望）

### 步骤 4.5：显式 commit（**关键——禁止跳过！**）

> ⚠️ brainstorming + writing-plans 自带 commit 是侥幸——它们 commit 的可能是
> docs/superpowers/ 路径的文件（步骤 4 已纠正）。**纠正后必须再 commit openspec/ 版本**，
> 否则 git 历史里 design.md/tasks.md "无根"。

```bash
Bash("git add openspec/changes/<slug>/design.md openspec/changes/<slug>/tasks.md")
Bash("git commit -m '[<change-id>] plan: ring 2 freeze - design + tasks ready'")
```

**commit message 格式**：`[<change-id>] plan: ring 2 freeze - <一句话摘要>`

> change-id 从 `.meta.json` 的 `change_id` 字段读（/sdd-spec 阶段已写入）

**禁止**：
- ❌ 跳过此步骤（"brainstorming 已经 commit 过了"——可能 commit 的是错位置）
- ❌ 用 `git add -A`

### 步骤 5：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status plan-ready")` 或类似
- 失败不阻塞（warn）

## 强制规则

- ✅ iam 校验通过才能继续
- ✅ **必须委托 superpowers:brainstorming**（不是直接调 writing-plans）
- ✅ brainstorming 会 chain 到 writing-plans——一次调用产出 design + tasks 两件套
- ✅ **步骤 4.5 必须显式 commit 产物**（即使 brainstorming/writing-plans 已 commit，可能是错位置）
- ✅ design.md + tasks.md 都必须写到 `openspec/changes/<slug>/`
- ✅ tasks.md 用 `- [ ]` checkbox 格式（openspec archive 期望）
- ❌ 禁止写到 `docs/superpowers/specs/` 或 `docs/superpowers/plans/`
- ❌ 禁止跳过 brainstorming 的用户 approve 步骤（design 必须用户确认）
- ❌ 禁止改 specs/*.md 或 proposal.md（都是 input）

## 何时不应使用

- proposal.md 不存在（先 /sdd-spec）
- specs/*.md 不存在（先 /sdd-spec）
- 简单 bug fix（不需要 design）
- 用户明确说"跳过 design 直接 task"（少数情况，但仍要写 design.md，可简化）

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 计划已生成（brainstorming + writing-plans 协作）
> ✓ design.md + tasks.md 写到 `openspec/changes/<slug>/`
> ✓ DOP 状态：plan-ready
>
> 运行 `/sdd-task <slug>` 细化任务（可选），或 `/sdd-apply <slug>` 直接进入实现。
