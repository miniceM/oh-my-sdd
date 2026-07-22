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

### 步骤 2.5：Orchestrator 运行环境适配

> **何时触发**：若当前 agent 的系统 prompt 含 "You NEVER write code yourself" / "Orchestrator" / "orchestration mode"
> 等类似约束（即 agent 本身被禁止直接写文件 / 改代码），必须走本节适配路径。
> 否则（普通单 agent 上下文）跳过本步骤，直接进入步骤 3。

**识别信号**（任一命中即视为 Orchestrator 模式）：
- 系统 prompt 明确禁止 agent 直接调用 `Write` / `Edit` / `Bash` 修改业务代码
- 系统 prompt 自述为 "orchestrator" / "coordinator" / "planner"，要求通过子 agent 完成实现
- 当前 session 已通过 `Agent(...)` / `task(...)` 调用本 skill

**适配策略**：

| 选定模式 | Orchestrator 下的执行方式 | 原因 |
|---------|-------------------------|------|
| `executing-plans` | **不要 inline 写文件**。对 tasks.md 中每个 task，用 `Agent(...)` / `task(...)` 委托一个 `build` 或 `quick` 类型 subagent 执行（每个 subagent 处理一个 task）。subagent 的 prompt 必须包含下方"执行约束"4 条 + 对应 task 的完整内容。 | executing-plans 原生假设当前 agent 直接写代码，与 Orchestrator 的"不直接写代码" HARD_RULE 冲突；委托 subagent 是唯一的合规路径 |
| `subagent-driven-development` | **保持不变** —— 原本就是每 task 派 fresh subagent 执行 | 与 Orchestrator 无冲突 |

**委托 subagent 时的强制 prompt 片段**（executing-plans 模式下每个 subagent 必带）：
```
你是执行 subagent。严格遵守以下约束：
1. 完成本 task 后把 tasks.md 对应的 - [ ] 改成 - [x]
2. 禁止修改 specs/*.md 和 design.md
3. commit message 用 tasks.md 里给的格式：[<change-id>] <type>: <task-id> - <subject>
4. TDD 强制：若 task 中缺少 RED/GREEN/REFACTOR 步骤，先按步骤 2.6 注入再执行
5. 测试红就回到测试，不绕过
```

### 步骤 2.6：TDD 合规检查（tasks.md 守门）

> **目的**：兜底 `/sdd-plan` 阶段未强制注入 TDD 的情况。在委托执行模式前，扫描 tasks.md，确保每个 task 都含 RED → GREEN → REFACTOR 三阶段。

**2.6.1 扫描判定**

`Read("openspec/changes/<slug>/tasks.md")`，对每个 `### Task N:` 块：
- **TDD 就绪信号**（任一命中即视为就绪）：
  - 含 `- [ ] **Write test**` / `- [ ] **编写失败的测试**` 等测试步骤
  - 含 `test_` / `_test.` / `.test.` / `.spec.` / `spec/` 路径关键字
  - 显式出现 `RED` / `GREEN` / `REFACTOR` 字样
- **未命中上述任何信号** → 视为 **TDD 缺失**，进入 2.6.2

**2.6.2 自动注入 RED/REFACTOR 步骤**

对 TDD 缺失的 task，用 `Edit` 在其步骤序列中插入：
- **在 task 第一个实现步骤之前**插入 RED 步骤：
  ```
  - [ ] **Step RED: 编写最小失败测试**
        写一个最小测试文件（如 `tests/test_<feature>.py` 或 `<feature>.test.js`），
        断言预期行为。此时测试必须失败（因为实现尚未写）。运行测试确认失败。
  ```
- **在 task 的"验证/提交"步骤之前**插入 REFACTOR 步骤：
  ```
  - [ ] **Step REFACTOR: 重构并回归**
        在 GREEN（所有测试通过）之后，重构实现代码以提升可读性/性能，
        运行全套测试确认仍为 GREEN，再提交。
  ```
- 注入完成后，终端打印：`⛓️ TDD steps auto-injected for Task N in tasks.md`

**2.6.3 强制约束**

- 即使 task 本身看起来"太简单不需要测试"（如加常量、改配置），仍**必须有最小测试文件**
- 注入失败（如无法识别 task 边界）→ 停止，提示用户手动补 TDD 步骤后再继续
- 注入后必须 commit：`git add tasks.md && git commit -m '[<change-id>] chore: TDD steps auto-injected for Task N'`

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
  5. TDD 强制：每 task 必须含 RED（写测试预期失败）→ GREEN（最小实现通过测试）→ REFACTOR 三阶段
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
- ✅ **Orchestrator 模式检测**：若当前 agent 系统 prompt 禁止直接写代码，必须走步骤 2.5 适配（executing-plans 改为 `task()`/`Agent()` 委托 subagent）
- ✅ **TDD 守门**：步骤 2.6 必须在委托前扫描 tasks.md；缺失 TDD 步骤则自动注入 RED/REFACTOR
- ❌ 禁止修改 baseline / CLAUDE.md / specs/*.md / design.md
- ❌ 禁止跨 task 共用 commit
- ❌ 禁止跳过 TDD（RED → GREEN → REFACTOR）—— 包括"看起来太简单不需要测试"的 task
- ❌ 禁止 `git add -A`
- ❌ **Orchestrator 模式下禁止 inline 写代码**（必须委托 subagent）

## 何时不应使用

- tasks.md 还有未评估的 `- [ ]` / spec/design 严重矛盾 / 测试还在红

## 输出

> ✓ 变更 `<slug>` 所有 tasks 已完成（用了 <executing-plans|subagent-driven-development> 模式）
> ✓ tasks.md 所有 `- [ ]` 已勾选
> ✓ DOP 状态：apply-done
>
> 运行 `/sdd-review <slug>` 进入 Ring 5（验证 + 归档 + 创建 PR）。
