# oh-my-sdd v0.2 内网实测 Runbook

> **目标读者**：在企业内网真实环境验证 oh-my-sdd v0.2（含 2026-06-22 iam/dop 契约对齐改造）能否跑通的同学。
>
> **与 `real-env-verification-checklist.md` 区别**：那份是 v0.1 发布前完整验证（含 npm 发布流程），本 runbook 聚焦**契约对齐改造**——只验证 iam/dop 真实输出是否和我们改后的代码契合。
>
> **预计耗时**：1-2 小时（顺利）/ 半天（碰到字段偏差需现场改代码）。

---

## 背景：本次改造动了什么

2026-06-22 根据内网真实 iam/dop CLI 截图，重写了 mock 和 hook 契约：

| 模块 | 改动 | 风险等级 |
|------|------|---------|
| **iam CLI flag** | `-json` → `--json` | 🔴 高（hooks/skills 都依赖） |
| **iam JSON 结构** | 删 `total` 字段；删 `system` 字段；加 `is_api_key_true` | 🔴 高 |
| **iam 登录命令** | `iam login` → `iam auth login --system <X>` | 🟡 中（flag 名是猜的） |
| **iam 判定逻辑** | "任意 logged" → "≥2 个且全 logged"（devops + gitee） | 🟡 中（依赖多账号语义） |
| **oms-login** | 自动登 devops + gitee，不让用户选 | 🟢 低 |
| **dop `change update`** | **删除**（真实 dop 只有 create/list/view） | 🔴 高（skills 全改成写 .meta.json） |
| **dop 全局 flag** | 加 `--endpoint` / `-j` | 🟢 低 |
| **5 个 skill 进度上报** | `dop change update` → 写 `.meta.json` 的 `dop_status` 字段 | 🟡 中 |

---

## 前置条件

- [ ] 内网账号 + 密码（devops 和 gitee 都要有，**两个都要**）
- [ ] 真实 iam CLI 已装（联系 IT）
- [ ] 真实 dop CLI 已装
- [ ] openspec CLI 已装（`npm install -g @fission-ai/openspec`）
- [ ] Claude Code 已装
- [ ] gh CLI 已装（推荐，用于 issue/PR）
- [ ] 本仓库最新代码已在内网机器拉下（含本批改造）

---

## 已知风险点（最容易翻车的 3 件事）

`★ Insight ─────────────────────────────────────`
**这 3 件事现场翻车概率最高**，所以 Phase A 优先探测真实输出，再跑后续流程。
`─────────────────────────────────────────────────`

1. **`is_api_key_true` 语义未知**：我假设"用户登录 devops + gitee 后，credentials 数组返回 2 条"。**如果真实只返回 1 条**（比如两个系统共享一个 token），`required_systems=2` 会误报 NEED_LOGIN——所有后续 Phase 跑不通。

2. **`iam auth login --system <X>` flag 名是猜的**：真实可能叫 `-s` / `--target` / `--subsystem` / 位置参数。需要跑 `iam auth login --help` 确认。

3. **dop `change view` 字段名风格未知**：mock 是 snake_case（`created_at`）。真实可能是 PascalCase（`CreatedAt`）或 camelCase（`createdAt`）。如果不对，skills 里 `.title`/`.description` 的引用会扑空。

---

## 测试矩阵（按风险从高到低）

### Phase A：iam CLI 真实输出探测（5 分钟，**最先做**）

**为什么先做**：所有后续 Phase 都依赖 iam 判定逻辑，如果 `is_api_key_true` 语义错了，全盘皆错。

| 步骤 | 命令 | 期望 | 失败处理 |
|------|------|------|---------|
| A1 | `iam auth status` | 文本输出含 `Total: N credential(s)` | 看错误提示 |
| A2 | `iam auth status --json` | JSON 输出 | 见下方分支 |
| A3 | 观察 `credentials.length` | 2 条（devops + gitee 各 1） | 见下方分支 |
| A4 | `iam auth login --help` | 看到 `--system` 或等价 flag | 见下方分支 |

**分支 A2-1：`--json` 报 unknown flag**
- 真实 iam 用别的 flag 名
- 跑 `iam auth status --help` 看真实 flag（可能 `-j` / `--output json` / `-o json`）
- 改 `hooks/lib/iam-cli.js` line 70 的 `['auth', 'status', '--json']`
- 改 5 个 skill 里的 `iam auth status --json` 引用

**分支 A3-1：`credentials.length === 1`（即使两个系统都登过）**
- 真实 iam 只暴露一个"主账号"
- 改 `hooks/lib/config.js`：`required_systems: 2` → `required_systems: 1`
- 改 mock iam：`OMS_MOCK_HALF_LOGIN` 模式变成默认（只登 devops）
- **不要**删 `isFullyAuthenticated`——保留逻辑，只改阈值

**分支 A3-2：`credentials.length === 0`（明明登录过）**
- 检查是否登错系统（`iam auth status` 文本格式应显示已登系统名）
- 重新 `oms-login`

**分支 A4-1：`--system` flag 不存在**
- 看 `--help` 找等价 flag（如 `-s`、`--target`、`--subsystem`）
- 改 `hooks/lib/iam-cli.js` 的 `login()` 函数：`['auth', 'login', '-u', ..., '--system', system]`
- 改 `bin/oms-login.js`（如果改了 login 函数签名）

---

### Phase B：oms-login 两系统自动登录（10 分钟）

**前置**：Phase A 通过。

| 步骤 | 命令 | 期望 |
|------|------|------|
| B1 | `iam auth logout`（如有）| 清掉之前的凭据 |
| B2 | `oms-login` | 提示"用户名:" |
| B3 | 输入用户名，回车 | 提示"密码:"（隐藏输入） |
| B4 | 输入密码，回车 | 看到 `✓ devops 系统登录成功` + `✓ gitee 系统登录成功` |
| B5 | `iam auth status --json` | credentials 数组有 2 条 |

**分支 B4-1：devops 成功，gitee 失败**
- 当前逻辑：devops 失败阻塞，gitee 失败警告可继续
- 但 Phase C 的 session-start 会 NEED_LOGIN（因为 credentials 不足 2 条）
- **短期**：改 `required_systems=1` 跑通流程
- **长期**：联系 IT 排查 gitee 登录问题

**分支 B4-2：devops 失败（阻塞）**
- 看错误信息（密码错？账号锁？系统不可达？）
- 修不了就别继续，联系 IT

**分支 B4-3：两个都失败，但密码是对的**
- 怀疑 `--system` flag 名错（Phase A4 没修正）
- 回 Phase A4 重测

---

### Phase C：session-start hook 判定（3 分钟）

**前置**：Phase B 通过（已登两系统）。

| 步骤 | 命令 | 期望 |
|------|------|------|
| C1 | 启动 Claude Code（`claude` 命令） | 5 秒内进入交互，不卡死 |
| C2 | 观察启动时 stderr | 无"未授权"或"超时"警告 |
| C3 | 问 Claude "你是谁" | 回答含"企业 SDD Agent"（baseline 注入成功） |
| C4 | 问 Claude "你能做什么" | 回答含 SDD 五阶段 |

**分支 C1-1：卡死超过 10 秒**
- `IAM_AUTH_TIMEOUT_MS = 5000` 太短？改 `hooks/session-start.js` line 19 调大重测
- 或者真实 iam hang，检查 `~/.oh-my-sdd/logs/`

**分支 C3-1：不含"企业 SDD Agent"**
- baseline 没注入
- 检查 `~/.claude/CLAUDE.md` 是否有 BEGIN/END 标记
- 跑 `oms-install` 重新注入
- 查 `~/.oh-my-sdd/sessions/` 看 session meta 的 `state` 字段

---

### Phase D：dop CLI 只读可用（5 分钟）

**前置**：Phase C 通过。

| 步骤 | 命令 | 期望 |
|------|------|------|
| D1 | `dop --help` | 子命令含 create / list / view，**不含 update** |
| D2 | `dop change list` | 返回 JSON（或加 `-j`） |
| D3 | `dop change view <id>` | 返回单条 JSON |
| D4 | `dop change update X --status Y` | **应该报错** "unknown command" |
| D5 | 记录 `dop change view` 的字段名风格 | snake_case / camelCase / PascalCase？ |

**分支 D3-1：字段名风格不对（如真实是 PascalCase）**
- 记录真实字段名映射表
- 更新 `scripts/dop` mock 对齐
- skills 里若有 `.title`/`.description` 等字段引用，需要相应改（搜 `dop change view`）

**分支 D4-1：`update` 没报错（真实 dop 其实有 update）**
- 太好了——可以恢复原方案，skills 重新调 `dop change update`
- 但当前代码已迁到 `.meta.json`，**短期保留现状**，联系产品线讨论是否切回

---

### Phase E：SDD 完整流程（30-60 分钟）

**前置**：Phase A-D 全通过。

```bash
mkdir /tmp/sdd-test-$(date +%Y%m%d)
cd /tmp/sdd-test-$(date +%Y%m%d)
git init
openspec init  # 如果还没初始化
```

在 Claude Code 里依次跑：

| 环 | 命令 | 期望产物 | 关键检查 |
|----|------|---------|---------|
| 1 | `/sdd-spec 用户测试demo` 或 `/sdd-spec ARD123456` | `proposal.md` + `specs/*.md` + commit + gh issue + 分支 | commit msg 含 `[<change-id>]`；`.meta.json` 的 `dop_status: "spec-in-progress"` |
| 2 | `/sdd-plan <slug>` | `design.md` + `tasks.md`（`### Task N:` 格式） | brainstorming 启动；`.meta.json` 的 `dop_status: "plan-ready"` |
| 3 | （可选）`/sdd-task <slug>` | 细化 tasks.md | `.meta.json` 的 `dop_status: "tasks-ready"` |
| 4 | `/sdd-apply <slug>` | 每个 task 的 TDD 实现 + commit | 每 task commit 含 `[<change-id>] <type>: T<N> - <subject>`；`.meta.json` 的 `dop_status: "apply-done"` |
| 5 | `/sdd-review <slug>` | PR 创建 | `.meta.json` 的 `dop_status: "pr-created"` + `pr_url` |
| 6 | （PR merge 后）`/sdd-review --finalize <slug>` | openspec archive 成功 | `.meta.json` 的 `dop_status: "review-done"` + `archive_done_at` |

**关键断言**：
- 每个 commit 的 message **必须**以 `[<change-id>]` 开头
- `.meta.json` 的 `dop_status` 字段每环都应更新（写文件，非 CLI 调用）
- Phase 6 完成后，下次启动 Claude Code **不应**再有"未完成审查"提醒

---

## 回滚策略

如果某 Phase 失败且现场无法修：

```bash
# 回到 v0.2.2-alpha（iam/dop 契约改造前的稳定版）
git stash  # 保存当前未提交的修复尝试
git checkout v0.2.2-alpha -- scripts/iam scripts/dop hooks/ skills/ bin/ __tests__/
npm test  # 确认回滚后测试全绿
```

**重要**：回滚后 mock 是**旧契约**（`-json` / 有 `total` / 有 `system`），跑本地测试 OK，但真实环境会失败（因为真实 iam 用 `--json`）。所以回滚只是恢复"开发环境可跑"，真实环境要等修复后才能测。

---

## 数据收集

每个 Phase 完成后记录到 `docs/runbook-results/2026-06-22-<姓名>.md`：

```markdown
## Phase X 结果（YYYY-MM-DD HH:MM）
- 测试人: <name>
- 平台: <macOS/Linux/Windows + 版本>
- iam 版本: <`iam --version` 输出>
- dop 版本: <`dop --version` 或 `dop --help` 首行>
- 结果: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL
- 命令输出: <paste 关键片段>
- 偏差: <如果有，描述真实契约 vs 我们假设>
- 修复: <如果做了临时修复，diff 摘要>
```

---

## 联系升级

发现契约偏差无法现场修复时：
1. 截图真实 CLI 输出（`iam auth status --json` / `dop change view`）
2. 记录 `iam --version` / `dop --version` / 平台 / Node 版本
3. 联系 oh-my-sdd 维护者
4. 紧急情况回滚到 v0.2.2-alpha

---

## 通过判定

| Phase | 必须通过 | 说明 |
|-------|---------|------|
| A | ✅ | 后续全靠它 |
| B | ✅ | devops 必过，gitee 可 PARTIAL（改 required_systems=1） |
| C | ✅ | baseline 注入是核心价值 |
| D | D1/D2 必过，D4 报错必过 | D3 字段风格偏差可现场修 |
| E | 至少跑到 Ring 4 | Ring 5/6 视 PR merge 时间 |

全绿可 tag `v0.2.3-alpha`（内网验证版）。
