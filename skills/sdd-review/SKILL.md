---
name: sdd-review
description: 当用户在 SDD 流程中已完成实现、需要验证 + 创建 PR + 归档时使用。SDD Ring 5。两阶段——默认创建 PR，--finalize 在 PR merge 后做 openspec archive。委托 superpowers:requesting-code-review。
argument-hint: [slug 或 change-id] 或 --finalize [slug 或 change-id]
---

# /sdd-review —— SDD 第 5 环：验证 + PR + 归档（两阶段）

> ⚠️ **两阶段流程**（archive 移到 PR merge 后，符合 GitFlow + 避免 PR reject 时 archive 回滚）：
>
> **阶段 1（默认调用 `/sdd-review <slug>`）**：
> code review → validate → gh pr create → 写 review.md → 告诉用户 merge PR
>
> **阶段 2（PR merge 后调用 `/sdd-review --finalize <slug>`）**：
> 切回 main + pull → openspec archive → 验证 merge → DOP 完成 → commit archive 结果

---

## 阶段 1：默认调用 `/sdd-review <slug>`

参数 `$ARGUMENTS` 是变更标识（不含 `--finalize`）。**前置检查**：`openspec/changes/<slug>/tasks.md` 所有 `- [ ]` 必须已勾选。

### 步骤 1：前置检查

- **iam 校验**
- **读上游**：tasks.md（确认全勾选）、.meta.json（change_id、分支名）
- **git 状态**：`Bash("git status")` 必须干净
- **测试覆盖率**：`Bash("npm test -- --coverage")` ≥ 80%。未达标阻塞

### 步骤 2：委托 superpowers:requesting-code-review

调用 **`superpowers:requesting-code-review`** skill：
- 派 code-reviewer subagent 审整支分支（base: main → head: 当前分支）
- 收集 findings（Critical / Important / Minor）

**如有 Critical/Important**：停止后续步骤，提示用户先修复（用 `/sdd-apply` 继续）。

### 步骤 3：openspec validate（archive 前置检查）

- `Bash("openspec validate <slug> --strict")`
- 检查 spec 与代码一致 + delta 格式正确
- 失败 → 提示用户修 spec 或 code，再次 validate

### 步骤 4：gh 创建 PR（仅实现内容，**不含 archive**）

- `Bash("gh pr create --title '[<change-id>] <change-title>' --body '<body>'")`
- PR body 必须含：
  - change-id（如 `Closes: ARD123456`）
  - proposal 摘要
  - 测试结果（`Bash("npm test")` 输出）
  - review findings 摘要
- **PR diff 应该只含实现 + openspec/changes/<slug>/ 工件，不含 openspec/specs/ 改动或 archive 目录**——archive 是阶段 2 的事

### 步骤 5：DOP 标记（pr-created 状态）

- `Bash("dop change update <id> --status pr-created --pr <PR_URL>")`
- 把 PR URL 写回 `.meta.json`

### 步骤 6：写 review.md（pre-merge 版）

`Write("openspec/changes/<slug>/review.md")`：
- 实际工作量 vs 预估
- 偏离 spec/design 的地方（如有 RETRO.md，引用）
- review findings 摘要
- **不写 merge 结果**（archive 还没做）
- 后续 follow-up

### 步骤 6.5：显式 commit

```bash
Bash("git add openspec/changes/<slug>/review.md openspec/changes/<slug>/RETRO.md openspec/changes/<slug>/.meta.json 2>/dev/null || true")
Bash("git commit -m '[<change-id>] review: ring 5 freeze - review + PR created'")
Bash("git push origin <branch>")
```

### 步骤 7：告诉用户下一步

完成后告诉用户：
> ✓ 变更 `<slug>` PR 已创建：<PR_URL>
> ✓ DOP 状态：pr-created
>
> **下一步（人工）**：
> 1. 在 GitHub 上 review + merge PR
> 2. merge 完成后，运行 `/sdd-review --finalize <slug>` 完成 openspec archive

**阶段 1 结束。不调用 openspec archive。**

---

## 阶段 2：PR merge 后调用 `/sdd-review --finalize <slug>`

参数含 `--finalize`。**前置检查**：用户已 merge PR（用 `gh pr view <PR编号> --json state` 验证 state=MERGED）。

### 步骤 F1：切回 main + pull

```bash
Bash("git checkout main")
Bash("git pull origin main")
```

### 步骤 F2：openspec archive（保鲜核心）

- **必须有 openspec CLI**：`Bash("openspec --version")`。未装 → 阻塞
- `Bash("openspec archive <slug>")`——openspec 自动 merge change 的 delta 到 `openspec/specs/`
- **禁止用 `mv` 兜底**——破坏保鲜

### 步骤 F3：验证 merge 结果

- 对每个 `.meta.json` 里 `delta_capabilities` 列出的 capability：
  - `Read("openspec/specs/<capability>/spec.md")` 确认 delta 已应用
  - 如未 merge，提示用户检查 `openspec validate <slug> --strict` 输出

### 步骤 F4：更新 review.md（post-merge 版）

`Write("openspec/changes/archive/<slug>/review.md")`（archive 已移动文件到 archive/）：
- 追加 "Merge 结果摘要"（哪些 capability ADDED/MODIFIED/REMOVED）

### 步骤 F5：DOP 完成标记

- `Bash("dop change update <id> --status review-done")`

### 步骤 F6：显式 commit + push（在 main 上）

```bash
Bash("git add openspec/changes/archive/<slug>/ openspec/specs/ openspec/changes/<slug>/.meta.json 2>/dev/null || true")
Bash("git commit -m '[<change-id>] review: archive merge - specs updated'")
Bash("git push origin main")
```

### 步骤 F7：告诉用户完成

> ✓ 变更 `<slug>` 已 archive
> ✓ openspec/specs/ 已 merge delta（保鲜生效）
> ✓ DOP 状态：review-done
> ✓ main 已更新
>
> 可以开始下一个 SDD 循环。运行 `/sdd-spec <new-change>`。

---

## 强制规则（两阶段共用）

- ✅ 必须 superpowers:requesting-code-review 通过（无 Critical/Important）
- ✅ 必须创建 PR（gh 可用时）
- ✅ PR body 必须含 change-id 关联
- ✅ 必须 DOP 标记（change-id 模式）
- ✅ 测试覆盖率 ≥ 80%
- ✅ **阶段 1 不做 archive**（archive 在阶段 2，PR merge 后）
- ✅ **阶段 2 必须验证 PR 已 merge** 才执行 archive
- ✅ **archive 必须用 openspec archive**（merge delta，保鲜生效）
- ❌ 禁止跳过 code review
- ❌ 禁止删除归档（审计依据）
- ❌ 禁止在未归档状态下开始新 change 的 Ring 4
- ❌ 禁止用 `mv` 替代 `openspec archive`
- ❌ 禁止把 archive 放进 PR diff（应在 main 上单独 commit）

## 何时不应使用

- tasks 还有未完成项
- 测试还在红
- Critical review findings 未修
- 覆盖率 < 80%
- 阶段 2 时 PR 还未 merge

## 输出

阶段 1 输出见步骤 7，阶段 2 输出见步骤 F7。
