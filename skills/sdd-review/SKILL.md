---
name: sdd-review
description: 本 skill 在已完成实现、用户说"创建 PR"/"code review"/"归档"/"跑测试"/"finalize"或调用 /sdd-review 时使用。SDD Ring 5——两阶段：默认创建 PR，--finalize 在 PR merge 后做 openspec archive。委托 superpowers:requesting-code-review。
argument-hint: [slug 或 change-id] 或 --finalize [slug 或 change-id]
---

# /sdd-review —— SDD 第 5 环：验证 + PR + 归档（两阶段）

> **两阶段流程**（archive 在 PR merge 后，符合 GitFlow + 避免 PR reject 时回滚 archive）：
> - **阶段 1（默认 `/sdd-review <slug>`）**：code review → validate → gh pr create → 写 review.md → 告诉用户 merge PR
> - **阶段 2（PR merge 后 `/sdd-review --finalize <slug>`）**：切回 main + pull → openspec archive → 验证 merge → DOP 完成 → commit

---

## 阶段 1：默认调用（PR merge 前）

**前置检查**：tasks.md 所有 `- [ ]` 已勾选。

### 步骤 1：前置检查

- iam 校验；读 tasks.md（全勾选）+ .meta.json（change_id、分支名）
- git status 干净；测试覆盖率 ≥ 80%

### 步骤 1.5：Constitution Authority（委托 review 前置）

**baseline 在本次 review 范围内不可协商。**违反 HARD_RULE 自动 CRITICAL，违反 SOFT_RULE 自动 Important。

读 `content/enterprise-baseline.md`（可用 `hooks/lib/constitution.js` 的 `loadBaseline()` 解析 frontmatter/body/syncReport）。把每条规则翻译成 reviewer 的触发条件：

- **HARD_RULE 清单**（自动 CRITICAL 触发条件）：
  - 身份声明——代码/commit/PR 自称 "Claude"/"Claude Code"/"通用 AI 助手" 或仅以模型名（如 glm-5）作身份 → CRITICAL
  - 安全与合规底线——硬编码 AK/SK/token/密码/`.env`/私钥；`.gitignore` 未排除 `*.key`/`*.pem`；日志/错误/DOP 输出敏感值未脱敏；跳过 `/sdd-review`；禁用 DOP 埋点；`rm -rf /`、`git push --force` 到 main、`drop database` 等破坏性操作未先确认范围 → CRITICAL
  - 提交规范——commit 缺 change-id；type 不属 `feat`/`fix`/`docs`/`refactor`/`test`/`chore`/`spec`/`plan`/`task`/`review` → CRITICAL
- **SOFT_RULE 清单**（自动 Important 触发条件）：
  - 工具使用规范——进入 SDD 阶段未用对应斜杠命令（`/sdd-spec` → `/sdd-plan` → `/sdd-task` → `/sdd-apply` → `/sdd-review`）；用户说"开始做 X"未先 `/sdd-spec`；单次回复跑两个阶段命令 → Important
  - 推荐架构实践——同步阻塞 I/O 误用；循环内 I/O；公共 API 缺文档注释；README 缺项目简介/快速开始/配置说明/使用示例 → Important

把这些触发条件连同派给 code-reviewer 的范围一并传递。**Constitution 冲突 always CRITICAL**，不得降级、重新解释或静默忽略——若原则本身需要变更，须在独立的 baseline 更新 PR 处理，不在本 change 内协商。

### 步骤 2：委托 superpowers:requesting-code-review

派 code-reviewer 审整支分支（main → 当前分支）。收集 findings（Critical/Important/Minor）。**Critical/Important 未修 → 停止，提示先 `/sdd-apply` 继续**。

### 步骤 2.5：OVERRIDE 扫描（委托 review 之后）

读本 change 关联的 PR 描述与所有 commit message（PR 通常由步骤 4 创建；若尚未创建，扫分支上 `git log main..HEAD --format=%B%n%b` 的 commit body + PR template 草稿）。查找 `[OVERRIDE] <规则名>: <理由>` 标记。规则：

- **有 HARD_RULE 违反，但 PR/commit 无对应 `[OVERRIDE]` 标记** → 直接 **Critical**（不得降级，不得合并）
- **有 `[OVERRIDE]` 标记但理由模糊（< 20 字或泛泛如"业务需要"/"临时方案"）** → 降为 **Important**，要求补全理由或撤回违反
- **有 `[OVERRIDE]` 标记且理由清晰（≥ 20 字，含具体场景与权衡）** → 降为 **Minor**，在 review 报告中记录"已留痕"，仍需 maintainer 知情

**严重级别优先级**：Constitution violations always CRITICAL（与 spec-kit `analyze.md:248` 对齐），除非有合规的 OVERRIDE 留痕。OVERRIDE 不豁免规则——只是把级别降档并写入审计轨迹；baseline 本身的更新仍须独立 PR。

将扫描结果合并进步骤 2 的 findings 列表后再决定是否阻断。

### 步骤 3：openspec validate

`Bash("openspec validate <slug> --strict")`。失败 → 提示修 spec/code。

### 步骤 4：gh 创建 PR（仅实现内容，**不含 archive**）

PR body 必须含：change-id（如 `Closes: ARD123456`）、proposal 摘要、测试结果、review findings 摘要。
**PR diff 应只含实现 + openspec/changes/<slug>/ 工件，不含 openspec/specs/ 改动或 archive 目录**。

### 步骤 5：本地进度标记（不调 dop CLI）

真实 dop 没有 `change update`——进度记录到 `.meta.json`：

`Edit("openspec/changes/<slug>/.meta.json")`：把 `dop_status` 设为 `"pr-created"`，加 `dop_status_at: <ISO timestamp>` 和 `pr_url: <PR_URL>`。

### 步骤 6：写 review.md（pre-merge 版，**不写 merge 结果**）

`Write("openspec/changes/<slug>/review.md")`：工作量 vs 预估、偏离 spec/design、review findings 摘要、follow-up。

### 步骤 6.5：commit + push

```bash
git add openspec/changes/<slug>/review.md openspec/changes/<slug>/RETRO.md openspec/changes/<slug>/.meta.json 2>/dev/null || true
git commit -m '[<change-id>] review: ring 5 freeze - review + PR created'
git push origin <branch>
```

### 步骤 7：告诉用户下一步

> ✓ 变更 `<slug>` PR 已创建：<PR_URL>
> ✓ DOP 状态：pr-created
>
> **下一步（人工）**：GitHub review + merge PR，然后运行 `/sdd-review --finalize <slug>` 完成 openspec archive。

**阶段 1 结束。不调用 openspec archive。**

---

## 阶段 2：PR merge 后调用（`--finalize`）

**前置检查**：用户已 merge PR（`gh pr view <PR编号> --json state` 验证 state=MERGED）。

### F1：切回 main + pull

```bash
git checkout main && git pull origin main
```

### F2：openspec archive（保鲜核心）

`Bash("openspec archive <slug>")`——openspec 自动 merge delta 到 openspec/specs/。**禁止 mv 兜底**。

### F3：验证 merge

对每个 delta_capability：`Read("openspec/specs/<capability>/spec.md")` 确认 delta 已应用。未 merge → 提示检查 validate 输出。

### F4：更新 review.md（追加 merge 摘要）

`Write("openspec/changes/archive/<slug>/review.md")`：追加"merge 结果摘要"（哪些 capability ADDED/MODIFIED/REMOVED）。

### F5：本地进度标记 + 写 archive_done_at（不调 dop CLI）

真实 dop 没有 `change update`——进度记录到 `.meta.json`：

`Edit("openspec/changes/archive/<slug>/.meta.json")`（archive 已移动）：把 `dop_status` 设为 `"review-done"`，加 `dop_status_at: <ISO timestamp>` 和 `archive_done_at: <ISO timestamp>`。**关键**——否则 SessionStart hook 未完成提醒不消失。

### F6：commit + push（在 main 上）

```bash
git add openspec/changes/archive/<slug>/ openspec/specs/ openspec/changes/<slug>/.meta.json 2>/dev/null || true
git commit -m '[<change-id>] review: archive merge - specs updated'
git push origin main
```

### F7：告诉用户完成

> ✓ 变更 `<slug>` 已 archive
> ✓ openspec/specs/ 已 merge delta（保鲜生效）
> ✓ DOP 状态：review-done
>
> 可以开始下一个 SDD 循环。运行 `/sdd-spec <new-change>`。

---

## 强制规则

- ✅ 必须 code review 通过（无 Critical/Important）
- ✅ PR body 含 change-id 关联
- ✅ DOP 标记（change-id 模式）
- ✅ 测试覆盖率 ≥ 80%
- ✅ review 必须读 baseline 的 HARD_RULE/SOFT_RULE 清单作为额外 Critical/Important 触发条件
- ✅ review 必须扫描 PR 描述与 commit message 的 `[OVERRIDE]` 标记，无标记的 HARD_RULE 违反直接 Critical
- ✅ 阶段 1 不做 archive；阶段 2 验证 PR merged 才 archive
- ✅ archive 用 openspec archive（merge delta，保鲜生效）
- ✅ 阶段 2 写 archive_done_at
- ❌ 禁止跳过 code review
- ❌ 禁止删除归档（审计依据）
- ❌ 禁止 mv 替代 archive
- ❌ 禁止把 archive 放进 PR diff
- ❌ 禁止未归档开新 change 的 Ring 4
- ❌ 禁止 `git add -A`

## 何时不应使用

- tasks 还有未完成项 / 测试红 / Critical findings 未修 / 覆盖率 < 80% / 阶段 2 时 PR 未 merge
