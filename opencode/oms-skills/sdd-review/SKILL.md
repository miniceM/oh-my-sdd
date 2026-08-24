---
name: sdd-review
description: 本 skill 在已完成实现、用户说"创建 PR"/"code review"/"归档"/"跑测试"或调用 /sdd-review 时使用。SDD Ring 5 在原子 PR 成功创建时结束，并完成 DOP。
argument-hint: "[slug 或 change-id] 或 --retry-dop <slug>"
---

# /sdd-review —— SDD 第 5 环：审查、归档与原子 PR 交付

Ring 5 是**单阶段**：code review → validate → archive → 验证 canonical specs → commit/push issue branch → 创建含实现、`openspec/specs/` 和 archive 工件的 PR → DOP done。PR 审核和合并不属于 SDD。

## 默认流程

**前置检查**：tasks.md 所有 `- [ ]` 已勾选；iam 校验；读 change `.meta.json` 的 change_id 和当前 issue branch；工作树仅含本 change 待提交工件；测试覆盖率 ≥ 80%。执行 `gh auth status`，确认仓库上下文为 `<owner/repo>`；用 `gh issue view <issue-number> --repo <owner/repo> --json title,body,state,url` 确认 Issue 为 OPEN、含验收标准 checklist，并逐项保留测试命令输出或人工检查证据。任一不满足即停止。

### 步骤 1：前置检查

确认上述前置检查通过；不通过即停止。

### 步骤 1.5：Constitution Authority（委托 review 前置）

读 `content/enterprise-baseline.md`，将每条规则作为 reviewer 的触发条件：违反 **HARD_RULE** 自动 **CRITICAL**；违反 **SOFT_RULE** 自动 **Important**。HARD_RULE 包括身份声明、安全/合规底线和提交规范；SOFT_RULE 包括 SDD 工具使用与推荐架构实践。Constitution 冲突 always CRITICAL，不得重新解释或静默忽略。

### 步骤 2：委托 superpowers:requesting-code-review

派 reviewer 审整支 issue branch（main → 当前分支），收集 Critical/Important/Minor。Critical 或 Important 未修则停止并提示 `/sdd-apply`；不得进入归档或 PR 创建。

### 步骤 2.5：OVERRIDE 扫描

扫描 commit message 和 PR body 草稿中的 `[OVERRIDE] <规则名>: <理由>`：无标记的 HARD_RULE 违反为 **Critical**；理由少于 20 字或模糊为 **Important**；理由清晰（至少 20 字且说明场景与权衡）为 **Minor**。OVERRIDE 只形成审计留痕，不豁免 baseline；将结果合并入 findings 后决定是否阻断。

### 步骤 3：validate 与归档

1. `Bash("openspec validate <slug> --strict")`；失败即停止。
2. 在归档**之前**，向 `openspec/changes/<slug>/.meta.json` 写入：`dop_completion:{status:'pending',prepared_at:<ISO timestamp>,prepared_head:<git rev-parse HEAD>}`。
3. `Bash("openspec archive <slug>")`；禁止用 `mv` 兜底。
4. 在 `openspec/changes/archive/<slug>/.meta.json` 写入 `archive_done_at:<ISO timestamp>`，保留 `dop_completion`。
5. 对每个 delta capability 读取 `openspec/specs/<capability>/spec.md`，确认 delta 已进入 canonical specs；任一失败即停止，不能创建 PR。

### 步骤 4：提交、推送与创建原子 PR

PR 必须同时含实现、`openspec/specs/`、`openspec/changes/archive/<slug>/` 及其 archive meta。PR body 含 change-id、proposal 摘要、测试结果、review findings 和 archive/canonical-spec 验证结果。

```bash
git add <本 change 的实现文件> openspec/specs/ openspec/changes/archive/<slug>/
git commit -m '[<change-id>] review: ring 5 archive and atomic PR delivery'
git push origin <issue-branch>
gh pr create --repo <owner/repo> --base main --head <issue-branch> --body-file <pr-body-file>
```

`gh pr create` 失败时停止并报告错误；不得调用 DOP done。

### 步骤 5：PR 创建成功后完成 DOP

仅在 `gh pr create` 成功返回 PR URL 后调用 `dop change done <change-id>`；change_id 仅从 archive meta 读取。

- 成功：保持 archive meta 中预 PR 写入的 `dop_completion.status:'pending'` 不变；输出 PR URL 和 Ring 5 完成。
- 失败：保持 archive meta 中预 PR 写入的 pending 状态不变；**DOP done 失败绝不撤销 PR，也不报告五环完成**。输出 PR URL、错误摘要和 `/sdd-review --retry-dop <slug>`。

## `--retry-dop <slug>`：仅重试 DOP 完成

只从 archive meta 读 change_id，然后只调用 `dop change done <change-id>`。不得 archive、审核、合并、创建或修改 PR，也不得编辑 archive meta。

## 强制规则

- ✅ 必须通过 code review（无 Critical/Important）并读 baseline HARD_RULE/SOFT_RULE 作为触发条件
- ✅ 必须扫描 `[OVERRIDE]`；Critical、Important、Minor 的分级和 20 字理由门槛必须执行
- ✅ 必须先 archive 并验证 canonical specs，再提交、推送 issue branch 和创建原子 PR
- ✅ archive 前必须写 pending `dop_completion`（prepared_at、prepared_head），archive 后必须写 archive_done_at
- ✅ 成功 PR 后才可调用 DOP done，且 change_id 仅来自 archive meta
- ❌ 禁止跳过 code review、删除归档、用 mv 替代 archive、`git add -A`
- ❌ 禁止在 Ring 5 审核、合并或操作默认分支

## 何时不应使用

- tasks 未完成、测试红、Critical/Important findings 未修、覆盖率不足，或 canonical specs 验证失败。
