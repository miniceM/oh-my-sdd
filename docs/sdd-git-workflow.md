# SDD 产物 Git 提交规则与工作流

> **目的**：明确企业项目用 oh-my-sdd 跑 SDD 流程时，**哪些产物进 git、哪些不进、怎么进**。
>
> **适用**：所有用 oh-my-sdd 的项目（不只是 oh-my-sdd plugin 本身）。

---

## 1. 产物分类

### ✅ 必须提交（团队共享 + 审计依据）

这些是 SDD 的核心资产，**必须进 git**——新人 onboarding、code review、合规审计都靠它们。

| 路径 | 用途 |
|------|------|
| `openspec/specs/<capability>/spec.md` | **保鲜资产**——项目权威 specs，反映系统现状 |
| `openspec/specs/` 整个目录 | archive merge 后所有 capability 的累计 specs |
| `openspec/changes/<slug>/proposal.md` | 变更业务背景、整体验收标准 |
| `openspec/changes/<slug>/specs/*.md` | delta 格式（ADDED/MODIFIED/REMOVED），archive 输入 |
| `openspec/changes/<slug>/design.md` | 技术决策记录（含被否决的备选方案） |
| `openspec/changes/<slug>/tasks.md` | 任务清单 + 进度 checkbox |
| `openspec/changes/<slug>/RETRO.md` | spec/design 矛盾记录，避免重复犯错 |
| `openspec/changes/<slug>/review.md` | review 总结，PR 描述素材 |
| `openspec/changes/<slug>/.meta.json` | change 元数据（change_id 关联 DOP） |
| `openspec/changes/<slug>/.openspec.yaml` | openspec schema 配置 |
| `openspec/changes/archive/<slug>/` | 归档历史（完成的变更） |
| `openspec/config.yaml` | 项目级 openspec 配置 |
| `.claude/commands/opsx/*` | openspec init 产出的项目级命令（团队共享） |
| `.claude/settings.json` | 项目级 Claude Code 配置（如启用 oh-my-sdd） |

### ❌ 不能提交（机器本地 / 用户私有 / 可重新生成）

这些是用户环境状态，**提交会污染团队仓库**。

| 路径 | 为什么不提交 |
|------|------------|
| `~/.oh-my-sdd/` 整个目录 | 用户级状态（config.json / logs/ / sessions/ / queue.jsonl） |
| `~/.claude/CLAUDE.md` | 用户级（含 oh-my-sdd 注入的 baseline 段） |
| `~/.claude/plugins/` | plugin cache（每台机器不同） |
| `~/.claude/settings.json` | 用户级 settings（个人偏好） |
| `.claude/settings.local.json` | 项目级 local override（gitignored by Claude Code 默认） |
| `node_modules/` | 可重新生成 |
| `*.tgz` | npm 包产物 |
| `.DS_Store` / `Thumbs.db` | OS 元数据 |

### ⚠️ 灰色地带（看情况判断）

| 路径 | 通常是否提交 | 判断标准 |
|------|------------|---------|
| `openspec/changes/<slug>/.meta.json` 含 `dry_run: true` | **不提交** | 演练数据，DOP 后端会过滤；演练完手动删 change 目录或单独 commit 到演示分支 |
| `docs/superpowers/plans/` | **不提交** | superpowers 误产的位置；应该移到 `openspec/changes/<slug>/` 后提交 openspec 版本 |
| `docs/superpowers/specs/` | **看用途** | 用户主动用 superpowers 不走 SDD：可提交；误产：移走 |
| Mock 测试项目（如 devops-demo） | **看团队** | 参考实现/教学：提交；纯个人实验：不提交 |

---

## 2. 推荐 `.gitignore` 模板

每个用 oh-my-sdd 的项目根 `.gitignore` 应包含：

```gitignore
# === SDD user-level state (machine-local, never commit) ===
.oh-my-sdd/

# === Claude Code local override ===
.claude/settings.local.json

# === Node ===
node_modules/
*.tgz

# === OS ===
.DS_Store
Thumbs.db

# === IDE ===
.idea/
.vscode/

# === superpowers 误产位置（防止误提交；如团队主动用 superpowers 则删此两行） ===
docs/superpowers/plans/
docs/superpowers/specs/
```

---

## 3. Git 分支策略

每个 SDD change 用独立 feature branch，避免多变更互相干扰。

### 3.1 标准流程

```bash
# /sdd-spec 阶段创建分支（命令自动跑）
git checkout -b NNN-<slug>
# NNN = gh issue 编号，slug = kebab-case 变更名

# 在分支上跑 /sdd-plan /sdd-task /sdd-apply
# openspec/changes/<slug>/ 产物都在此分支累积

# /sdd-review 阶段（命令自动跑）
gh pr create --base main --head NNN-<slug>
# PR body 含整体验收 + change-id 关联（来自 /sdd-spec 步骤 6）

# PR review 通过 + merge 后
# 1. openspec/changes/<slug>/ 被 archive 到 openspec/changes/archive/
# 2. openspec/specs/ 被 merge 更新（保鲜生效）
# 3. main 分支拿到所有产物 + 最新项目 specs
```

### 3.2 main 分支应有 / 不应有

**应有**：
- `openspec/specs/` 反映最新系统状态
- `openspec/changes/archive/` 完整变更历史
- `.claude/commands/opsx/` 团队共享命令
- `openspec/config.yaml` + `.claude/settings.json`

**不应有**：
- `openspec/changes/<active-slug>/` 未归档的变更（应该在 feature branch）
- `docs/superpowers/` 误产文件
- `.oh-my-sdd/` 用户状态（这是 `~/.oh-my-sdd/`，但有时项目目录也有 `.oh-my-sdd/`——确保 `.gitignore` 覆盖）

### 3.3 多变更并行

每个 change 一个 branch，互不干扰：

```
main
 ├── NNN-100-add-health-check      (change A)
 ├── NNN-101-credit-card-points    (change B)
 └── NNN-102-refactor-auth         (change C)
```

merge 顺序按完成时间。**注意**：如果两个 change 改同一 capability，第二个 merge 时可能 conflict（archive merge 时 specs delta 重叠）——这是设计内的提醒，要求变更按顺序完成。

---

## 4. 敏感数据规则

### 4.1 绝对不进 git

baseline 已强制规则：
- AK/SK / access key / secret key
- token / bearer token / JWT
- 密码 / 数据库连接串
- `.env` 文件内容
- 私钥 / 证书

### 4.2 需脱敏后才能进 git

| 数据类型 | 脱敏方式 |
|---------|---------|
| 内部系统 URL / IP | 用 `<internal-service>` / `<internal-ip>` 占位 |
| 客户名 / 商业案例 | 用 `<customer-A>` / `<case-X>` 占位 |
| 员工个人邮箱 | 用 `<dev>` 或公司角色（"backend team lead"） |
| 内部 wiki 链接 | 用 `<internal-wiki:topic>` 占位 |
| 业务 KPI 数值 | 用 `<KPI-target>` 占位（具体数字脱敏） |

### 4.3 通常可提交

- 员工 username（git blame 本来就有）
- 公开的业务逻辑描述
- 行业通用术语
- 架构设计（不涉及具体客户数据）

### 4.4 DOP 数据脱敏

`/sdd-spec` 拉 DOP change 详情时，**proposal.md 不能直接复制 DOP 原文**（可能含敏感数据）。Agent 必须：
1. 读 DOP change.description
2. **脱敏处理**（按上面规则）
3. 写入 proposal.md

baseline 强制规则已含："读到敏感值时立即脱敏（保留前后 4 位）"。

---

## 5. 演练数据处理

`dry_run: true` 标记的变更是演练数据，**通常不进 main 仓库**：

```bash
# 演练完后清理选项（按场景选）：

# 选项 A：演练目录在 feature branch，直接弃 branch
git checkout main
git branch -D NNN-<演练-slug>

# 选项 B：演练目录已合 main，手动删除
rm -rf openspec/changes/archive/<演练-slug>/
# 同时 openspec/specs/ 里演练 merge 的内容也要 revert（用 git revert）

# 选项 C：演练在独立 demo 仓库（如 devops-demo），main 仓库不受影响
# 推荐做法——demo 与 prod 隔离
```

**DOP 后端处理**：含 `dry_run: true` 的事件会被过滤，不进生产报表。

---

## 6. 项目初始化 checklist

新项目首次用 oh-my-sdd 时：

```bash
# 1. 项目根创建 .gitignore（参考第 2 节模板）
cp /path/to/template.gitignore .gitignore

# 2. openspec init（生成 openspec/ + .claude/commands/opsx/）
openspec init --tools claude

# 3. 首次提交 baseline 结构
git add .gitignore openspec/ .claude/commands/
git commit -m "chore: 初始化 SDD 工作流（openspec + oh-my-sdd 集成）"

# 4. 推到远端
git push origin main

# 5. 团队成员 clone 后就能用 /sdd-spec 开始第一个变更
```

---

## 7. 常见错误与修复

### 7.1 误把 `.oh-my-sdd/` 提交了

```bash
# 从 git 移除但保留本地文件
git rm -r --cached .oh-my-sdd/
echo ".oh-my-sdd/" >> .gitignore
git add .gitignore
git commit -m "fix: 移除误提交的 .oh-my-sdd 用户状态"
```

### 7.2 误把 DOP 敏感数据写进 proposal.md

```bash
# 立即从 git 历史删除（如果已 push，需要 force push + 通知团队）
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch openspec/changes/<slug>/proposal.md' \
  --prune-empty --tag-name-filter cat -- --all

# 重写 proposal.md（脱敏版）
# 重新 commit
```

**预防**：code review 时检查 proposal.md 是否含 URL/IP/客户名。

### 7.3 多 change merge 后 specs 冲突

两个 change 都改了同一 capability 的同一 requirement：

```bash
# merge 第二个 PR 时 openspec archive 会失败
# 解决：
# 1. rebase 第二个 PR 到最新 main
# 2. 手动合并 specs delta（保留两边的 ADDED/MODIFIED）
# 3. 重新跑 openspec validate --strict
# 4. 重新 archive
```

---

## 8. 与 CI/CD 集成建议

```yaml
# .github/workflows/sdd-check.yml（推荐）
name: SDD Check
on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g @fission-ai/openspec
      - run: openspec validate --all --strict
        # 防止 spec drift（specs 与代码不一致）

  sensitive-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          # 检查 openspec/ 里有没有敏感数据
          grep -rE "(AKIA|sk-|password|secret|token)[=:][^[:space:]]" openspec/ && exit 1 || exit 0
```

---

## 9. 参考实现

oh-my-sdd plugin 本身的项目结构就是这个文档的范例：
- `openspec/specs/` 反映当前 plugin 的能力
- `openspec/changes/archive/` 完整变更历史
- `.gitignore` 覆盖 `.oh-my-sdd/` 等用户状态
- 每个 change 用 feature branch

详见 [oh-my-sdd 仓库](https://git.enterprise.com/cli-tools/oh-my-sdd)。

---

## 附录 A：检查清单（PR 提交前）

跑 `/sdd-review` 前，验证：

- [ ] `.gitignore` 含 `.oh-my-sdd/` + `.claude/settings.local.json`
- [ ] `openspec/changes/<slug>/.meta.json` 不含敏感数据
- [ ] `proposal.md` 中 DOP 数据已脱敏（无内部 URL/IP/客户名）
- [ ] `design.md` 决策记录完整（含被否决方案）
- [ ] `tasks.md` 所有 `- [ ]` 已勾选
- [ ] 分支名格式 `NNN-<slug>`
- [ ] PR body 含 change-id + 整体验收

---

## 附录 B：与 openspec 官方建议对比

openspec 官方推荐：
- `openspec/` 整个提交（与我们一致）
- `openspec/changes/archive/` 提交（与我们一致）
- 项目级 `.claude/commands/opsx/` 提交（与我们一致）

oh-my-sdd 额外要求：
- `.oh-my-sdd/` 不提交（用户状态）
- DOP 数据脱敏后才能进 proposal
- 演练数据（dry_run）单独处理
