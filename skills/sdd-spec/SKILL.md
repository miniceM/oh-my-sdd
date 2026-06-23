---
name: sdd-spec
description: 本 skill 在用户说"写需求"/"写 spec"/"写规格"/"开始新功能"/"开 SDD 流程"时使用。SDD Ring 1——直调 openspec CLI 产 delta spec（保鲜生效）。
argument-hint: [change-id 或变更描述，可选]
---

# /sdd-spec —— SDD 第 1 环：规格定义

**前置依赖**：`iam`（必需）、`openspec`（必需）、`dop`（只读）、`gh`（推荐）。
**不调 `/opsx:propose`**——直调 openspec CLI 避免重复创建 change。

## 工作流

### 步骤 1：前置检查

- **iam 校验**：`Bash("iam auth status --json")`。未授权（credentials 不足 2 个或非全 logged）→ 提示 `oms-login`，**停止**
- **openspec 检查**：`Bash("openspec --version")`。未装 → **阻塞**
- **dop 检查**：`Bash("dop change list")`。未装 → 警告（用自然语言模式）。dop 是**只读数据源**（真实 dop 无 update 子命令）
- **gh 检查**：`Bash("gh --version")`。未装 → 警告（跳过 issue/分支）
- **unfinalized 检查**：扫 `openspec/changes/*/.meta.json` 找 `dop_status=pr-created` 无 `archive_done_at`
  - 有 → 警告"N 个变更未 finalize（openspec/specs/ drift 风险），建议先跑 /sdd-review --finalize"
  - 让用户确认继续或停止

### 步骤 2：确定 change-id + slug（阻断性强制）

> **change-id 是阻断性强制**——所有 commit 必须以 `[<change-id>]` 开头。

- **`$ARGUMENTS` 匹配 `^[A-Z]{2,6}\d+$`**：直接用作 change-id；`dop change view $id` 拉详情（失败警告但允许继续）；slug = change-id
- **自然语言**：作为业务背景；`dop change list` + `AskUserQuestion` 让用户**选或输入** change-id；slug = change-id
- **空**：问"change-id 或描述"

### 步骤 3：读现状（保鲜关键）

- 对可能受影响的 capability：`Read("openspec/specs/<capability>/spec.md")`（如存在）
- 识别影响类型：**ADDED / MODIFIED / REMOVED / RENAMED**，与用户确认

### 步骤 4：创建 change + 拿模板

```bash
openspec new change <slug>
openspec instructions proposal --change <slug> --json   # 拿 proposal 模板
openspec instructions specs --change <slug> --json      # 拿 specs 模板（自带 delta 格式）
```

### 步骤 5：按模板填 + Write

- `Write("openspec/changes/<slug>/proposal.md")`：业务背景、范围、整体验收
  - **What Changes 段必须分类**：业务变更（capability 加/改/删）+ 脚手架（openspec init 产物，不算业务变更）
- `Write("openspec/changes/<slug>/specs/<capability>/spec.md")`：delta 格式（ADDED/MODIFIED/REMOVED/RENAMED）
  - **Scenario 质量原则**：success 必须可验证；**failure 必须实测**（不能凭推测——openspec/工具行为只有实测才准）
- `Write("openspec/changes/<slug>/.meta.json")`：`{change_id, slug, created_at, dop_status: "spec-in-progress", dry_run, delta_capabilities}`

> **不产 design.md**——由 /sdd-plan 的 brainstorming 交互式产出。

### 步骤 5.5：显式 commit（禁止跳过）

未 commit 的产物在 git 历史和 PR review 看来**等于不存在**。

```bash
git add openspec/changes/<slug>/proposal.md openspec/changes/<slug>/specs/ openspec/changes/<slug>/.meta.json openspec/changes/<slug>/.openspec.yaml
git commit -m '[<change-id>] spec: ring 1 freeze - proposal + delta specs'
```

### 步骤 6：gh 创建 issue + 分支（如有 gh）

> **执行顺序**：先按下面 body 模板填好，再 `gh issue create` 一次成型。**禁止** create 后再 edit。

issue 是整个变更的 tracking ticket（从 spec 到 review-done），**不是当前阶段汇报**。body 模板：

```markdown
## 变更背景
<来自 DOP change.description 或用户描述>

## 变更内容
<整个变更要交付什么——业务变更 vs 脚手架分类>

## 验收标准（整个变更完成的标准，不是当前阶段）
- [ ] <验收点 1>
- [ ] ...

## 关联
- DOP change: <change-id>
- openspec 目录: `openspec/changes/<slug>/`
- 分支: `<NNN>-<slug>`
```

- `Bash("gh issue create --title '[<change-id>] <title>' --body '<上面模板>'")`
- 解析 issue 编号 NNN
- `Bash("git checkout -b <NNN>-<slug>")`

### 步骤 7：本地进度标记（不调 dop CLI）

真实 dop 没有 `change update` 子命令——进度记录到 `.meta.json`：

`Edit("openspec/changes/<slug>/.meta.json")`：把 `dop_status` 设为 `"spec-in-progress"`，加 `dop_status_at: <ISO timestamp>`。

## 强制规则

- ✅ iam 校验未授权停止
- ✅ 用 `openspec new change` 创建（不手工 mkdir）
- ✅ specs 用 openspec delta 模板填（保鲜靠这）
- ✅ 步骤 5.5 显式 commit（spec freeze）
- ✅ gh issue body 含**整体**验收（非当前阶段），一次成型不 edit
- ✅ slug 用户确认（自然语言模式）
- ❌ 禁止跳到实现
- ❌ 禁止凭空捏造 DOP 数据
- ❌ 禁止直接编辑 `openspec/specs/`（只通过 archive merge）
- ❌ 禁止调 `/opsx:propose`（重复创建）
- ❌ 禁止 `git add -A`

## 何时不应使用

- 简单 bug fix / rename / 格式化
- 临时实验代码

## 输出

> ✓ 变更 `<slug>` 规格已生成（proposal + specs，delta 保鲜就绪）
> ✓ gh issue #<NNN> 已创建，分支 `<NNN>-<slug>` 已切换
> ✓ .meta.json 进度：spec-in-progress
>
> 运行 `/sdd-plan <slug>` 进入 Ring 2（brainstorming 交互式产 design + tasks）。
