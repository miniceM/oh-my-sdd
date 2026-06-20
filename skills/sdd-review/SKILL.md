---
name: sdd-review
description: 当用户在 SDD 流程中已完成实现、需要验证 + 创建 PR + 归档时使用。SDD Ring 5。委托 superpowers:requesting-code-review + openspec archive（各管一段）。
argument-hint: [slug 或 change-id]
---

# /sdd-review —— SDD 第 5 环：验证归档（薄包装 + 委托）

> ⚠️ **执行顺序关键**：
> 1. 先 **superpowers:requesting-code-review**（审代码质量，Critical/Important/Minor）
> 2. Critical/Important 未修 → **阻塞**，回 `/sdd-apply`
> 3. 全修后 **openspec archive**（merge delta 到 `openspec/specs/`，保鲜生效）
> 4. archive 成功 → gh PR + DOP 标记

参数 `$ARGUMENTS` 是变更标识。**前置检查**：`openspec/changes/<slug>/tasks.md` 所有 `- [ ]` 必须已勾选。

## 你的工作流

### 步骤 1：前置检查

- **iam 校验**
- **读上游**（用 `Read`）：
  - `openspec/changes/<slug>/tasks.md`（确认全勾选）
  - `.meta.json`（change_id, 分支名）
- **git 状态**：`Bash("git status")` 必须干净
- **测试覆盖率**：`Bash("npm test -- --coverage")` ≥ 80%。未达标阻塞归档

### 步骤 2：委托 superpowers:requesting-code-review

调用 **`superpowers:requesting-code-review`** skill：
- 派 code-reviewer subagent 审整支分支（base: main → head: 当前分支）
- 收集 findings（Critical / Important / Minor）

**如有 Critical/Important**：停止后续步骤，提示用户先修复（用 `/sdd-apply` 继续或直接修）。

### 步骤 3：openspec validate（保鲜前置检查）

- `Bash("openspec validate <slug> --strict")`
- 检查 spec 与代码一致 + delta 格式正确
- 失败 → 提示用户修 spec 或 code，再次 validate

### 步骤 4：openspec archive（保鲜核心！）

- **必须有 openspec CLI**：`Bash("openspec --version")`。未装 → **阻塞**，提示：
  > 保鲜需要 openspec archive 来 merge delta 到 openspec/specs/。
  > 安装：`npm install -g @fission-ai/openspec`
- 归档：`Bash("openspec archive <slug>")`——openspec 自动 merge change 的 delta 到 `openspec/specs/`
- **禁止用 `mv` 兜底**——mv 不会 merge，破坏保鲜承诺

### 步骤 5：验证 merge 结果

- 对每个 `.meta.json` 里 `delta_capabilities` 列出的 capability：
  - `Read("openspec/specs/<capability>/spec.md")` 确认 delta 已应用
  - 如未 merge，提示用户检查 `openspec validate <slug> --strict` 输出

### 步骤 6：gh 创建 PR

- `Bash("gh pr create --title '<change-title>' --body '<body>'")`
- PR body 必须含：
  - change-id（如 `Closes: ARD123456`）
  - proposal 摘要
  - 测试结果（`Bash("npm test")` 输出）
  - review findings 摘要 + merge 摘要（哪些 capability ADDED/MODIFIED/REMOVED）

### 步骤 7：DOP 完成标记

- 如有 change-id：`Bash("dop change update <id> --status review-done --pr <PR_URL>")`
- 把 PR URL 写回 `.meta.json`

### 步骤 8：写 review.md

`Write("openspec/changes/archive/<slug>/review.md")`：
- 实际工作量 vs 预估
- 偏离 spec/design 的地方（如有 RETRO.md，引用）
- merge 结果摘要（哪些 capability ADDED/MODIFIED/REMOVED）
- 后续 follow-up

### 步骤 8.5：显式 commit（**关键——禁止跳过！**）

> ⚠️ review.md / RETRO.md 必须落盘到 git，否则归档历史不完整。
> archive 操作（步骤 4）只移动文件，不创建 commit。

```bash
Bash("git add openspec/changes/archive/<slug>/review.md openspec/changes/<slug>/RETRO.md openspec/specs/ openspec/changes/<slug>/.meta.json 2>/dev/null || true")
Bash("git commit -m 'review(<slug>): ring 5 freeze - review summary + specs merged'")
```

**commit message 格式**：`review(<slug>): ring 5 freeze - <一句话摘要>`

**包含**：
- review.md（步骤 8 写的）
- RETRO.md（如有，apply 阶段产生）
- `openspec/specs/` 的 merge 结果（archive 步骤 4 已更新）
- `.meta.json`（含 PR URL 等更新）

## 强制规则

- ✅ 必须 superpowers:requesting-code-review 通过（无 Critical/Important）
- ✅ 必须创建 PR（gh 可用时）
- ✅ PR body 必须含 change-id 关联
- ✅ 必须 DOP 标记完成（change-id 模式）
- ✅ 测试覆盖率 ≥ 80%
- ✅ **归档必须用 openspec archive**（merge delta，保鲜生效）
- ✅ archive 后必须验证 openspec/specs/ 已更新
- ✅ **步骤 8.5 必须显式 commit 产物**（review.md + RETRO.md + specs merge + .meta 更新）
- ❌ 禁止跳过 code review
- ❌ 禁止删除归档（审计依据）
- ❌ 禁止在未归档状态下开始新 change 的 Ring 4
- ❌ 禁止用 `mv` 替代 `openspec archive`

## 何时不应使用

- tasks 还有未完成项
- 测试还在红
- Critical review findings 未修
- 覆盖率 < 80%

## 输出

完成后告诉用户：
> ✓ 变更 `<slug>` 已归档
> ✓ openspec/specs/ 已 merge delta（保鲜生效）
> ✓ PR: <PR_URL>
> ✓ DOP 状态：review-done
>
> 可以开始下一个 SDD 循环。运行 `/sdd-spec <new-change>`。
