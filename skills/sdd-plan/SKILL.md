---
name: sdd-plan
description: 本 skill 在用户说"做 plan"/"写 design"/"拆任务"/"brainstorming"或已完成 spec 需要交互式产 design + tasks 时使用。SDD Ring 2——委托 superpowers:brainstorming（自动 chain 到 writing-plans）。
argument-hint: [slug 或 change-id]
---

# /sdd-plan —— SDD 第 2 环：交互式 design + tasks

> ⚠️ **本环交互式**：brainstorming 会问用户 design 问题、提方案、等 approve design。
> **输出位置强制**：design.md + tasks.md 必须写到 `openspec/changes/<slug>/`，**禁止**默认的 `docs/superpowers/specs/` 或 `docs/superpowers/plans/`。

**前置检查**：`openspec/changes/<slug>/proposal.md` + `specs/*.md` 必须存在（先 /sdd-spec）。

## 工作流

### 步骤 1：前置检查

- **iam 校验**：未授权停止
- **读上游**（`Read`）：proposal.md、specs/*.md、`.meta.json`（change_id、delta_capabilities）
- **读项目现状**：对每个 delta_capability，`Read("openspec/specs/<capability>/spec.md")`（如存在）

### 步骤 1.5：Constitution Check（设计前 gate）

> 本节是 design 阶段的合规门，**必须**在设计探索开始前完成，并在设计末尾再评估一次。

- **加载 baseline**：调用 `loadBaseline("content/enterprise-baseline.md")`（hooks/lib/constitution.js），取 `body` 扫描 HARD_RULE/SOFT_RULE 清单
- **规则触发判定**：根据 proposal.md + specs/*.md 的内容关键词匹配本 change 触发的规则。示例：
  - spec 涉及凭据/AK/SK/token/密码/`.env`/私钥 → 触发"安全与合规底线 §1 密钥与凭据"HARD_RULE
  - spec 涉及 `rm -rf`/`git push --force`/`drop database`/破坏性运维 → 触发"安全与合规底线 §5 越权命令"HARD_RULE
  - spec 涉及新 commit/分支策略 → 触发"提交规范"HARD_RULE
  - spec 涉及新 SDD 阶段流转/斜杠命令编排 → 触发"工具使用规范"SOFT_RULE
  - spec 涉及异步/HTTP/数据库/公共 API/README → 触发"推荐架构实践"SOFT_RULE
  - spec 涉及身份/能力/对外定位问答 → 触发"身份声明"HARD_RULE
- **写 design.md 顶部 Constitution Check 节**（**强制**，照搬 spec-kit `templates/plan-template.md:39-43` 结构）：

  ```markdown
  ## Constitution Check
  *GATE: Must pass before design phase. Re-check after design complete.*

  **Triggered HARD_RULEs**:
  - [列出本 change 触发的 HARD_RULE，引用 baseline 行号，如 "安全与合规底线 §1 密钥与凭据 (enterprise-baseline.md:36)"]

  **Triggered SOFT_RULEs**:
  - [列出本 change 触发的 SOFT_RULE，引用 baseline 行号]

  **Compliance Plan**:
  - [每条规则的合规策略，说明 design 如何满足或在 PR 中给出 [OVERRIDE] 理由]
  ```

- **未触发任何规则的兜底**：仍必须写 Constitution Check 节，明示 "No HARD_RULE/SOFT_RULE triggered by this change"，不得省略

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

### 步骤 5：本地进度标记（不调 dop CLI）

真实 dop 没有 `change update`——进度记录到 `.meta.json`：

`Edit("openspec/changes/<slug>/.meta.json")`：把 `dop_status` 设为 `"plan-ready"`，加 `dop_status_at: <ISO timestamp>`。

### 步骤 5.5：Constitution Check 再评估（设计后 gate）

> 设计阶段完成后，再次扫描 design.md + tasks.md 的实际内容，捕捉 brainstorming 探索过程中新触发的规则。

- 重新读 `content/enterprise-baseline.md`（`loadBaseline()`），对照 design.md 与 tasks.md 的关键词
- 任何**新触发**的 HARD_RULE/SOFT_RULE 必须追加到 design.md 的 Constitution Check 节，并在 Compliance Plan 列补充合规策略
- 若 design 期间有规则的合规策略发生变化（例如选择 `[OVERRIDE]`），同步更新
- 若无新触发且无变更：在 design.md Constitution Check 节末尾追加一行 "Re-check at design complete: no new rules triggered"，明示已做二次校验

## 强制规则

- ✅ iam 校验通过
- ✅ 委托 brainstorming（不直接调 writing-plans）
- ✅ 步骤 4.5 显式 commit
- ✅ design.md + tasks.md 写到 `openspec/changes/<slug>/`
- ✅ tasks.md 用 `### Task N:` + `- [ ]` checkbox
- ✅ 步骤 4c 自动修正 commit message 格式
- ✅ design.md 必须含 `## Constitution Check` 节（缺失则 plan 失败）
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
