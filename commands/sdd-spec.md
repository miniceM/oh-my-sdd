---
description: 当用户请求"写需求/规格/spec"或开始新功能/变更的 SDD 流程时使用。支持 change-id 或自然语言。SDD Ring 1。委托 superpowers:brainstorming。
argument-hint: [change-id 或变更描述，可选]
---

# /sdd-spec —— SDD 第 1 环：规格定义（薄包装 + 委托）

**前置依赖**：
- iam CLI（必需——身份校验）
- dop CLI（必需——拉 change 详情）
- gh CLI（推荐——创建 issue + 分支）
- superpowers 插件（必需——委托 brainstorming）

参数 `$ARGUMENTS` 完全可选，三种输入：change-id / 自然语言 / 空。

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**：`Bash("iam auth status -json")`。未授权或失败 → 提示用户跑 `oms-login`，**停止后续步骤**。
- **dop 检查**：`Bash("dop --version")`。未安装 → 提示用户用自然语言模式（跳过 DOP 拉取）。
- **gh 检查**：`Bash("gh --version")`。未安装 → 警告（不阻塞，跳过 issue/分支创建）。

### 步骤 2：解析参数 + 确定 slug

- **如果 `$ARGUMENTS` 匹配 change-id**（如 `^[A-Z]{2,6}\d+$`）：
  - `Bash("dop change view $ARGUMENTS")` 拉详情
  - 从输出提取：标题、业务背景、验收点
  - **如果 dop 失败**：降级为自然语言模式（把 change-id 当描述）
  - slug = `$ARGUMENTS`（如 `ARD123456`）

- **如果是自然语言**：
  - 把 `$ARGUMENTS` 作为业务背景
  - 生成 slug 建议（kebab-case 英文摘要 + 日期：`credit-card-points-2026-06-19`）
  - **必须让用户确认 slug** 再继续

- **如果为空**：问用户"change-id 或描述"

### 步骤 3：委托 superpowers:brainstorming

调用 **`superpowers:brainstorming`** skill，输入参数：
- 业务背景（步骤 2 提取的）
- 项目上下文（cwd、git 状态）

让 superpowers 完成"提问 → 方案 → 设计"完整 brainstorming 流程。

### 步骤 4：读现状（保鲜关键）

- `Read("openspec/specs/<capability>/spec.md")`（如存在）—— 这是项目的权威 specs
- 识别本次变更对每个 capability 的影响类型：
  - **ADDED**：新 capability 或新 requirement/scenario
  - **MODIFIED**：现有 requirement 文字改了
  - **REMOVED**：deprecated requirement
- 与用户确认变更类型清单

### 步骤 5：包装输出（delta 格式）

- 创建目录：`Bash("mkdir -p openspec/changes/<slug>/specs")` 或 `openspec new change <slug>`
- 写 `proposal.md`（用 `Write`）：
  - 业务背景（来自 DOP 或用户描述）
  - 范围边界（in/out scope）
  - 验收标准（来自 DOP 或与用户确认）
- 写 `specs/*.md`——**必须用 delta 格式**（不是全量重写）：

  ```markdown
  # Spec Delta: <capability-name>

  ## ADDED Requirements
  ### Requirement: <new name>
  The system SHALL ...
  #### Scenario: <name>
  - GIVEN / WHEN / THEN ...

  ## MODIFIED Requirements
  ### Requirement: <existing name>
  **Was**:
  <引用 openspec/specs/ 里的旧文字>
  **Now**:
  <新文字>

  ## REMOVED Requirements
  ### Requirement: <deprecated name>
  Reason: <why>
  ```

  这样 `/sdd-review` 跑 `openspec archive` 时会自动 merge delta 到 `openspec/specs/`，保鲜生效。

- 写 `.meta.json`：`Write("openspec/changes/<slug>/.meta.json", {change_id, slug, created_at, dop_status, dry_run, delta_capabilities: [<受影响的 capability 名>]})`

### 步骤 6：gh 创建 issue + 分支（如有 gh）

- 创建 issue：`Bash("gh issue create --title '<change-title>' --body '<proposal摘要>'")`
- 解析 issue 编号（如 `1234`）
- 创建分支：`Bash("git checkout -b <NNN>-<slug>")`（NNN = issue 编号）

### 步骤 7：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status spec-in-progress")` 或类似命令
- 失败不阻塞（warn）

## 强制规则

- ✅ 必须先做 iam 校验（未授权直接停止）
- ✅ change-id 模式必须尝试 `dop change view`，失败降级告知用户
- ✅ brainstorming skill 的对话流程不能跳过
- ✅ slug 必须由用户确认（自然语言模式）
- ✅ **spec 输出必须用 delta 格式（ADDED/MODIFIED/REMOVED）**——这是 openspec archive merge 的前提
- ❌ 禁止跳到实现（那是 Ring 4）
- ❌ 禁止凭空捏造 DOP 数据
- ❌ 禁止直接编辑 `openspec/specs/`（项目 specs 只能通过 archive merge 更新）

## 何时不应使用

- 简单 bug fix / rename / 格式化
- 临时实验代码

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 规格已生成
> ✓ gh issue #<NNN> 已创建，分支 `<NNN>-<slug>` 已切换
> ✓ DOP 状态更新：spec-in-progress
>
> 运行 `/sdd-plan <slug>` 进入 Ring 2（技术计划）。
