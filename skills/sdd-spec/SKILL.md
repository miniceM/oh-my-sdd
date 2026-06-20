---
name: sdd-spec
description: 当用户请求"写需求/规格/spec"或开始新功能/变更的 SDD 流程时使用。SDD Ring 1。直调 openspec CLI 产 delta spec（保鲜生效）。
argument-hint: [change-id 或变更描述，可选]
---

# /sdd-spec —— SDD 第 1 环：规格定义（薄包装 + openspec 直调）

**前置依赖**：
- `iam` CLI（必需——身份校验）
- `openspec` CLI（必需——产 delta spec + 后续 archive merge）
- `dop` CLI（必需——拉 change 详情）
- `gh` CLI（推荐——创建 issue + 分支）

参数 `$ARGUMENTS` 完全可选，三种输入：change-id / 自然语言 / 空。

> ⚠️ **不调用 `/opsx:propose`**——本命令直调 openspec CLI（`openspec new change` + `openspec instructions`）实现等效功能，避免与项目本地的 /opsx:* 命令重复创建 change。用户想用 /opsx:propose 跳过企业包装时可直接调它。

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**：`Bash("iam auth status -json")`。未授权或失败 → 提示用户跑 `oms-login`，**停止后续步骤**。
- **openspec 检查**：`Bash("openspec --version")`。未装 → **阻塞**，提示 `npm install -g @fission-ai/openspec`。
- **dop 检查**：`Bash("dop --version")`。未装 → 提示用自然语言模式（跳过 DOP 拉取）。
- **gh 检查**：`Bash("gh --version")`。未装 → 警告（不阻塞，跳过 issue/分支创建）。

### 步骤 2：解析参数 + 确定 slug

- **如果 `$ARGUMENTS` 匹配 change-id**（如 `^[A-Z]{2,6}\d+$`）：
  - `Bash("dop change view $ARGUMENTS")` 拉详情
  - **如果 dop 失败**：降级为自然语言模式
  - slug = `$ARGUMENTS`（如 `ARD123456`）
- **如果是自然语言**：作为业务背景；生成 slug 建议（kebab-case + 日期）；**必须让用户确认 slug**
- **如果为空**：问用户"change-id 或描述"

### 步骤 3：读现状（保鲜关键）

- 对可能受影响的 capability：`Read("openspec/specs/<capability>/spec.md")`（如存在）
- 识别本次变更对每个 capability 的影响类型：**ADDED** / **MODIFIED** / **REMOVED** / **RENAMED**
- 与用户确认变更类型清单

### 步骤 4：创建 change + 拿模板（直调 openspec CLI）

- `Bash("openspec new change <slug>")`——创建 `openspec/changes/<slug>/` 骨架
- `Bash("openspec instructions proposal --change <slug> --json")` 拿 proposal 模板
- `Bash("openspec instructions specs --change <slug> --json")` 拿 specs 模板
  - **template 字段自带 delta 格式（ADDED/MODIFIED/REMOVED）**——直接按模板填，不需要额外格式指令

### 步骤 5：按模板填 + Write

- `Write("openspec/changes/<slug>/proposal.md")`：业务背景、范围、验收（模板字段）
- `Write("openspec/changes/<slug>/specs/<capability>/spec.md")`：**delta 格式**，按模板填
  - ADDED Requirements：新需求 + scenario
  - MODIFIED Requirements：复制完整旧块 + 改新内容
  - REMOVED Requirements：reason + migration
  - RENAMED Requirements：FROM: / TO:
- `Write("openspec/changes/<slug>/.meta.json")`：`{change_id, slug, created_at, dop_status, dry_run, delta_capabilities}`

### 步骤 6：gh 创建 issue + 分支（如有 gh）

- 创建 issue：`Bash("gh issue create --title '<change-title>' --body '<proposal摘要>'")`
- 解析 issue 编号
- 创建分支：`Bash("git checkout -b <NNN>-<slug>")`

### 步骤 7：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status spec-in-progress")` 或类似
- 失败不阻塞（warn）

## 强制规则

- ✅ 必须先做 iam 校验
- ✅ **必须用 openspec CLI 创建 change**（`openspec new change`），不要手工 `mkdir`
- ✅ specs 必须用 openspec instructions 提供的 delta 模板填
- ✅ slug 必须由用户确认（自然语言模式）
- ❌ 禁止跳到实现
- ❌ 禁止凭空捏造 DOP 数据
- ❌ 禁止直接编辑 `openspec/specs/`（项目 specs 只能通过 archive merge 更新）
- ❌ 禁止调用 `/opsx:propose`（与本项目创建重复）

## 何时不应使用

- 简单 bug fix / rename / 格式化
- 临时实验代码

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 规格已生成（delta 格式）
> ✓ gh issue #<NNN> 已创建，分支 `<NNN>-<slug>` 已切换
> ✓ DOP 状态更新：spec-in-progress
>
> 运行 `/sdd-plan <slug>` 进入 Ring 2（技术计划）。
