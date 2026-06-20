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

### 步骤 2：解析参数 + 确定 change-id + slug

> ⚠️ **change-id 是阻断性强制要求**——所有 git commit message 必须以 `[<change-id>]` 开头。无 change-id 不能进入下一步。

- **如果 `$ARGUMENTS` 匹配 change-id 格式**（如 `^[A-Z]{2,6}\d+$`）：
  - 直接用作 change-id
  - `Bash("dop change view $ARGUMENTS")` 拉详情
  - **如果 dop 失败**：警告用户但允许继续（用户可能知道内部 id 不在 DOP 里）
  - slug = `$ARGUMENTS`（如 `ARD123456`）

- **如果是自然语言描述**（不匹配 change-id 格式）：
  - 描述作为业务背景
  - **必须获取 change-id**：
    - 跑 `Bash("dop change list")` 拉当前用户名下所有 open change
    - 用 `AskUserQuestion` 让用户从列表中**选一个**，或**自己输入**新 change-id
    - 列表格式示例：
      ```
      选 1: ARD123456 - 用户测试demo
      选 2: ARD222222 - 信用卡积分兑换功能
      选 3: 自己输入 change-id
      ```
    - 用户选 1/2 → 用对应 id
    - 用户选 3 → 问"请输入 change-id"，验证格式 `^[A-Z]{2,6}\d+$`
  - slug = change-id（统一用 change-id 当目录名，便于追溯）

- **如果 `$ARGUMENTS` 为空**：
  - 先问"change-id 或描述"（用户可能直接给 id）
  - 收到答案后按上面两种模式处理

### 步骤 3：读现状（保鲜关键）

- 对可能受影响的 capability：`Read("openspec/specs/<capability>/spec.md")`（如存在）
- 识别本次变更对每个 capability 的影响类型：**ADDED** / **MODIFIED** / **REMOVED** / **RENAMED**
- 与用户确认变更类型清单

### 步骤 4：创建 change + 拿模板（直调 openspec CLI）

- `Bash("openspec new change <slug>")`——创建 `openspec/changes/<slug>/` 骨架
- `Bash("openspec instructions proposal --change <slug> --json")` 拿 proposal 模板
- `Bash("openspec instructions specs --change <slug> --json")` 拿 specs 模板
  - **template 字段自带 delta 格式（ADDED/MODIFIED/REMOVED）**——直接按模板填，不需要额外格式指令
  - **保鲜靠这里**：specs 用 delta 格式，archive 时 merge 到 openspec/specs/

### 步骤 5：按模板填 + Write（proposal + specs 两件套）

- `Write("openspec/changes/<slug>/proposal.md")`：业务背景、范围、整体验收（模板字段）
  - **What Changes 段必须分类声明**：
    - 业务变更：capability 加/改/删（在 `Capabilities` 子段列）
    - **脚手架/工具链产物**：openspec 自动生成的 `openspec/config.yaml`、`.openspec.yaml`、`.claude/commands/opsx/*` 等。**显式列**为"脚手架（openspec init 产物，不算业务变更）"
    - 这样 code reviewer 看到 commit 里有 openspec/config.yaml 不会困惑——proposal 已说明它是脚手架
- `Write("openspec/changes/<slug>/specs/<capability>/spec.md")`：**delta 格式**，按模板填
  - ADDED Requirements：新需求 + scenario
  - MODIFIED Requirements：复制完整旧块 + 改新内容
  - REMOVED Requirements：reason + migration
  - RENAMED Requirements：FROM: / TO:
  - **Scenario 写作质量（重要）**：
    - **success scenario**：描述系统正常行为，必须可验证（如 `WHEN X THEN Y`）
    - **failure scenario**：描述失败/边界条件，**必须基于实测，不能凭推测**
      - 例：写"openspec validate 失败当 X"之前，**实际跑一次** X 看 openspec 是否真失败
      - 没法立即测 → 标 `<!-- TODO: 实测验证 -->` 或改为"假设性行为"语气，不要写"系统 SHALL 失败"
      - 推测性 scenario 会被 /sdd-apply 实施时发现是错的，触发 RETRO 浪费时间
    - 避免列举"想当然"的失败触发条件——openspec/工具行为只有实测才准
- `Write("openspec/changes/<slug>/.meta.json")`：`{change_id, slug, created_at, dop_status, dry_run, delta_capabilities}`

> **注意**：本步骤不产 design.md——design 由 /sdd-plan 的 brainstorming 交互式产出。
> proposal + specs 已满足 openspec 保鲜条件（archive 时 merge specs/ delta）。
- `Write("openspec/changes/<slug>/.meta.json")`：`{change_id, slug, created_at, dop_status, dry_run, delta_capabilities}`

### 步骤 5.5：显式 commit（**关键——禁止跳过！**）

> ⚠️ 未 commit 的产物在 git 历史和 PR review 看来**等于不存在**。
> /sdd-spec 不委托任何带 commit 的 skill，所以**必须自己 commit**。

```bash
Bash("git add openspec/changes/<slug>/proposal.md openspec/changes/<slug>/specs/ openspec/changes/<slug>/.meta.json openspec/changes/<slug>/.openspec.yaml")
Bash("git commit -m '[<change-id>] spec: ring 1 freeze - proposal + delta specs'")
```

**commit message 格式**：`[<change-id>] spec: ring 1 freeze - <一句话摘要>`

**禁止**：
- ❌ 跳过此步骤（"反正 gh issue 创建了就行"——错，issue 不含 spec 内容）
- ❌ 把 design.md / tasks.md 一起 commit（它们是 Ring 2 的产物）
- ❌ 用 `git add -A`（会带无关文件，违反 baseline）

### 步骤 6：gh 创建 issue + 分支（如有 gh）

> ⚠️ **执行顺序关键**：
> 1. **先读完整 body 模板**（下方），把内容**填好**（用文本编辑器或 mental buffer）
> 2. **再调用 `gh issue create`** 
> 3. **禁止**先创建一个 issue 再用 `gh issue edit` 改 body——这是 API 浪费 + issue 历史污染 + 用户困惑

**issue 是整个变更的 tracking ticket**（从 spec 到 review-done），不是当前阶段汇报。body 必须用以下结构（填好后一次性提交）：

```markdown
## 变更背景
<来自 DOP change.description 或用户自然语言描述>

## 变更内容
<整个变更要交付什么 - 来自 proposal.md 的 What Changes 部分>
- 新增 capability: ...
- 修改 capability: ...
- 删除 capability: ...

## 验收标准（整个变更完成的标准，不是当前阶段）
<来自 DOP change.acceptance_criteria 或与用户确认的整体目标>
- [ ] <验收点 1>
- [ ] <验收点 2>
- [ ] ...

## 关联
- DOP change: <change-id>
- openspec 目录: `openspec/changes/<slug>/`
- 分支: `<NNN>-<slug>`
```

**禁止包含**：
- ❌ 当前阶段（Ring 1）的小结或验收（如"proposal.md 已写"）
- ❌ "下一环 /sdd-plan..."提示（issue 不引导阶段切换，那是命令输出的事）
- ❌ 实现细节（设计/任务/代码——那是 plan/apply 阶段的事）

调用（一次完成）：
- `Bash("gh issue create --title '[<change-id>] <change-title>' --body '<上面模板>'")`
- 解析 issue 编号（如 `1234`）
- 创建分支：`Bash("git checkout -b <NNN>-<slug>")`（NNN = issue 编号，slug 用 kebab-case）

### 步骤 7：DOP 标记

- 如有 change-id：`Bash("dop change update <id> --status spec-in-progress")` 或类似
- 失败不阻塞（warn）

## 强制规则

- ✅ 必须先做 iam 校验
- ✅ **必须用 openspec CLI 创建 change**（`openspec new change`），不要手工 `mkdir`
- ✅ specs 必须用 openspec instructions 提供的 delta 模板填
- ✅ slug 必须由用户确认（自然语言模式）
- ✅ **步骤 5.5 必须显式 commit 产物**（spec freeze 是 git 历史的离散事件）
- ✅ **gh issue body 必须含整体验收标准（不是当前阶段），不含"下一环"提示**
- ❌ 禁止跳到实现
- ❌ 禁止凭空捏造 DOP 数据
- ❌ 禁止直接编辑 `openspec/specs/`（项目 specs 只能通过 archive merge 更新）
- ❌ 禁止调用 `/opsx:propose`（与本项目创建重复）
- ❌ 禁止把当前阶段小结/验收写进 gh issue body（issue 是整个变更的 tracking）
- ❌ **禁止 gh issue create 后又 gh issue edit 改 body**——一次成型（API 浪费 + 历史污染 + 用户困惑）

## 何时不应使用

- 简单 bug fix / rename / 格式化
- 临时实验代码

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 规格已生成（proposal + specs 两件套，delta 格式保鲜就绪）
> ✓ gh issue #<NNN> 已创建，分支 `<NNN>-<slug>` 已切换
> ✓ DOP 状态更新：spec-in-progress
>
> 运行 `/sdd-plan <slug>` 进入 Ring 2（brainstorming 交互式产 design + tasks）。
