# oh-my-sdd 设计文档

**版本**：v0.1.0（设计阶段）
**日期**：2026-06-18
**作者**：miniceM（与 Claude 共同 brainstorming）
**状态**：待用户最终评审

---

## 1. 概述

### 1.1 项目目标

构建一个名为 **`@cli-tools/oh-my-sdd`** 的 npm 包，作为 Claude Code 插件向企业开发者下发：

1. **SDD 五阶段斜杠命令**：`/sdd-spec` `/sdd-plan` `/sdd-task` `/sdd-apply` `/sdd-review`
2. **企业级 Agent baseline**：注入到主会话 system prompt 的核心规则文本
3. **企业定制 skills**：API 设计、安全审计、文档写作等领域能力
4. **身份校验 Hook**：与企业统一身份认证系统（AIH，CLI 命令为 `iam`）对接
5. **绩效埋点 Hook**：与企业需求/绩效管理平台（DOP）对接，上报会话、命令、代码量

### 1.2 范围与定位

| 维度 | 选择 |
|------|------|
| 项目定位 | 全新项目，与已有 `enterprise-sdd-specs` 等无关（仅作参考资料） |
| 目标 Agent | Claude Code only（不支持 OpenCode） |
| 目标 OS | Windows 原生 + macOS + Linux（不支持 WSL、Windows on ARM） |
| AIH 语义 | 首次引导 + 静默续期（委托给 `iam` CLI，不自实现 OAuth） |
| SDD 阶段 | Spec / Plan / Task / Apply / Review（标准 SDD 五环） |
| DOP 埋点 | 会话级 + 斜杠命令调用 + 代码量（不包含工具调用级埋点） |
| Hook 实现 | Node CLI 统一（三端通用） |
| 分发模型 | Claude Code Plugin 模型（npm 包 + 本地 marketplace 注册） |

### 1.3 非目标（v0.1 明确不做）

- ❌ 不支持 OpenCode、WSL、Windows on ARM
- ❌ 不自实现 OAuth device flow（委托给 `iam` CLI）
- ❌ 不引第三方运行时依赖（零依赖是企业分发硬约束）
- ❌ 不做子 agent（`agents/` 目录留空）
- ❌ 不做工具调用级埋点（Read/Bash 等）
- ❌ 不做项目白名单（靠 `.sdd-no-telemetry` 反向标记）
- ❌ 不做实时代码量累加（用 `git diff` 在 session.end 聚合）
- ❌ 不做 resume 会话的 token 优化
- ❌ 不做插件公共发布（企业内部 registry only）

---

## 2. 整体架构

### 2.1 三层模型

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3：内容层（声明式 Markdown）                              │
│  commands/*.md   skills/*/   content/*.md                       │
│  （5 SDD 命令）  （企业 skills）（被 hook 注入的文本）          │
└─────────────────────────────────────────────────────────────────┘
                            ↓ Claude Code 原生发现
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2：行为层（Hook 驱动）                                    │
│  hooks/*.js ──调用──► hooks/lib/{iam-cli,dop-client,...}.js     │
└─────────────────────────────────────────────────────────────────┘
                            ↓ spawn 子进程
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1：基础设施层（与外部系统通信）                           │
│  iam CLI（已存在）   DOP（HTTP 上报）   本地状态文件             │
└─────────────────────────────────────────────────────────────────┘
```

**核心设计理念**：
- Layer 3 是**声明式**（人可读、可 review、可手改），企业合规只看这一层
- Layer 2 是**纯 Node 脚本**，仅在 hook 触发时运行
- Layer 1 是**纯函数模块**（不直接做 I/O），便于单元测试
- Layer 1 完全委托外部系统（iam CLI 已有，DOP 是 HTTP），不自实现协议

### 2.2 安装生命周期

```
[1] npm install -g @cli-tools/oh-my-sdd
            ↓
[2] postinstall → install.js
            ↓
[3] install.js：
    ① 检测平台 + Node ≥ 18
    ② 检测 iam 是否在 PATH（不在则警告，不阻塞）
    ③ 复制 plugin 到 ~/.claude/plugins/oh-my-sdd/
    ④ 写入 marketplace.json
    ⑤ 在 settings.json 注册 extraKnownMarketplaces["oh-my-sdd"]
            ↓
[4] 用户启动 Claude Code
            ↓
[5] Claude Code 读 settings.json，自动加载 plugin
            ↓
[6] SessionStart hook 触发：
    ① iam auth status -json 校验身份
    ② 注入 baseline 到 system prompt
    ③ 上报 session.start 到 DOP（异步，失败入队）
            ↓
[7] 用户使用 /sdd-spec 等命令驱动 SDD 五阶段
```

---

## 3. 目录布局

```
oh-my-sdd/
├── plugin.json                     # Claude Code 插件清单
├── marketplace.json                # 本地 marketplace 索引
├── package.json                    # npm 元信息 + postinstall
├── install.js                      # postinstall 入口
├── uninstall.js                    # preuninstall 入口
│
├── bin/                            # 用户可调用的 CLI
│   ├── oms-install.js
│   ├── oms-uninstall.js
│   └── oms-login.js                # 包装 iam login
│
├── commands/                       # Layer 3：5 个 SDD 斜杠命令
│   ├── sdd-spec.md
│   ├── sdd-plan.md
│   ├── sdd-task.md
│   ├── sdd-apply.md
│   └── sdd-review.md
│
├── skills/                         # Layer 3：企业定制 skills
│   ├── api-design/SKILL.md
│   ├── security-check/SKILL.md
│   └── doc-writer/SKILL.md
│
├── content/                        # Layer 3：被 hook 注入的文本
│   ├── enterprise-baseline.md      # 主会话 system prompt 注入（≤ 1K token）
│   ├── welcome-message.md          # 首次启动引导
│   └── auth-required.md            # 未授权时提示
│
├── hooks/                          # Layer 2：行为层
│   ├── hooks.json                  # Hook → 脚本注册表
│   ├── session-start.js
│   ├── session-end.js
│   ├── user-prompt-submit.js
│   ├── post-tool-use.js
│   └── lib/
│       ├── iam-cli.js              # spawn iam + 解析 JSON
│       ├── dop-client.js           # HTTP 上报 DOP
│       ├── event-queue.js          # JSONL 队列 + 重试
│       ├── git-diff.js             # 解析 --numstat 算代码量
│       ├── platform.js             # 三平台路径/版本检测
│       └── log.js                  # 统一日志
│
├── __tests__/                      # 测试（见 § 8）
│   ├── unit/
│   └── integration/
│
└── README.md
```

**注意**：**没有 `agents/` 目录**。需求 #2 的"Agent 规范加载到 system prompt"指主会话人格注入，由 `session-start.js` 读 `content/enterprise-baseline.md` 后通过 hook 返回的 `additionalContext` 字段塞入，**不是**子 agent。子 agent 留到 v0.2。

---

## 4. plugin.json & hooks.json（草案）

### 4.1 plugin.json

```json
{
  "name": "oh-my-sdd",
  "version": "0.1.0",
  "description": "企业级 SDD 工作流 + iam 身份校验 + DOP 埋点",
  "commands": ["commands/*.md"],
  "skills": ["skills/*/SKILL.md"],
  "hooks": "hooks/hooks.json",
  "metadata": {
    "enterprise": true,
    "iamRequired": true,
    "dopTelemetry": true
  }
}
```

> ⚠️ **待实施时核实**：`commands`/`skills`/`hooks` 字段的精确拼写需对照 Claude Code 当前版本 plugin schema。

### 4.2 hooks/hooks.json

```json
{
  "SessionStart": [
    { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.js\"" }
  ],
  "SessionEnd": [
    { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-end.js\"" }
  ],
  "UserPromptSubmit": [
    { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-submit.js\"" }
  ],
  "PostToolUse": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.js\"",
      "matcher": "Edit|Write|MultiEdit"
    }
  ]
}
```

> ⚠️ **待实施时核实**：`SessionEnd` hook 在当前 Claude Code 版本的实际名称（可能是 `Stop` / `PreSessionEnd`）。

---

## 5. Baseline 注入机制

### 5.1 SessionStart hook 契约

**stdin 输入**（Claude Code 传入）：
```json
{
  "session_id": "uuid-...",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/Users/hosea/work/git/oh-my-sdd",
  "plugin_root": "/Users/hosea/.claude/plugins/oh-my-sdd",
  "source": "startup" | "resume" | "clear"
}
```

**stdout 输出**（hook 返回）：
```json
{
  "additionalContext": "<baseline 文本>",
  "hookSpecificOutput": {
    "hookEventName": "SessionStart"
  }
}
```

`additionalContext` 会被 Claude Code 拼到 system prompt（B 通道，无削弱声明）。

### 5.2 认证状态机

`session-start.js` 调用 `iam auth status -json`，解析后状态分流：

```
       ┌─────────────────────────────────────────────┐
       │ session-start.js 触发                       │
       └─────────────┬───────────────────────────────┘
                     ▼
       spawn: iam auth status -json
                     │
       ┌─────────────┼─────────────┬─────────────────┐
       ▼             ▼             ▼                 ▼
   [iam 不存在]   [解析成功]    [命令报错]       [超时]
       │             │             │                 │
       ▼             ▼             ▼                 ▼
   STATE:         查 credentials  STATE: ERROR    STATE: ERROR
   NO_CLI         里 system=      (服务异常)      (网络)
       │         aih_system_name       │
       │             │                 │
       │       ┌─────┴─────┐           │
       │       ▼           ▼           │
       │   status=logged  其他         │
       │       │           │           │
       │       ▼           ▼           │
       │   STATE: OK   STATE: NEED_LOGIN
       │       │           │           │
       ▼       ▼           ▼           ▼
   指引      baseline     auth-required.md
   装 iam    + DOP 上报   + stderr 强提示
                          + DOP 不上报
```

### 5.3 状态退化矩阵

| 状态 | additionalContext | stderr | DOP |
|------|------------------|--------|-----|
| OK | enterprise-baseline.md | 静默 | 上报 |
| NEED_LOGIN | auth-required.md | 红色强提示 | **不上报** |
| NO_CLI | 安装指引 | 红色强提示 | **不上报** |
| ERROR | 短提示 + 联系管理员 | 红色强提示 | **不上报**（带错误码入队） |

**核心原则**：只有 OK 状态才上报 DOP。其他状态都是"未授权使用"，上报无意义且污染绩效数据。

### 5.4 Baseline Token 预算

硬约束 **≤ 1000 tokens**（约 700-800 中文字）。板块分配：

| 板块 | 预算 | 必须包含 |
|------|------|---------|
| 身份声明 | ~50 tok | "你是企业 SDD Agent，遵守以下规则" |
| SDD 五阶段硬约束 | ~400 tok | 每阶段 80 tok：必须做的事 + 禁止做的事 |
| 安全/合规底线 | ~300 tok | 禁止外泄密钥、禁止跳过 review、禁止改 baseline |
| 工具使用规范 | ~150 tok | 必须用 `/sdd-*` 命令进入对应阶段 |
| Skills 引用 | ~100 tok | "详细规范见 skills/api-design、skills/security-check" |

**实施约束**：CI 加 token lint，超过 1K 直接 fail。

### 5.5 baseline 是软规则

明确：baseline 文本是**软规则**——用户/项目的 `CLAUDE.md` 优先级更高。如果企业需要"硬规则不可被覆盖"，要走 `PreToolUse` hook 返回 `block`（v0.2 考虑）。

### 5.6 异常容错

任何一步失败都**不能让会话起不来**：

```
baseline 文件读不出来 → 用内置兜底 baseline（几十字短文本）
iam verify 网络异常   → 当作 NEED_LOGIN，stderr 提示
DOP sessionStart 失败 → 写 event-queue，继续
hook 返回 JSON 格式错 → Claude Code 拒绝整个 hook，会话照常起（无 baseline）
```

---

## 6. iam 身份校验流程

### 6.1 委托 iam CLI

完全不自实现 OAuth、token 刷新、凭据存储。所有这些由 iam CLI 负责。

`hooks/lib/iam-cli.js` 是薄壳：

```js
async function getAuthStatus() {
  // spawn: iam auth status -json
  // 解析 stdout 为 JSON
  // 失败（命令不存在/超时/JSON 损坏）→ throw typed error
}

async function login(username, password) {
  // spawn: iam login -u <username> -p <password>
  // 解析退出码 + stdout
  // 返回 { ok: boolean, error?: string }
}
```

**5 分钟缓存**：同一进程内 `getAuthStatus()` 结果缓存，避免每个 hook 都 spawn。

### 6.2 username 提取

`event.user` 字段来自 `iam auth status --json` 的 credentials：

```js
const status = await iam.getAuthStatus();
const cred = status.credentials.find(c => c.system === config.aih_system_name)
          ?? status.credentials[0];  // fallback
const username = cred?.username;
```

session-start.js 解析后，把 username 缓存到 `~/.oh-my-sdd/sessions/<session_id>.json`，后续 hook 直接读。

### 6.3 首次引导（bin/oms-login.js）

```
[1] 检测 iam 是否在 PATH → 否则提示安装链接，exit 1
[2] 交互式读 username
[3] 交互式读 password（getpass 隐藏输入）
[4] spawn: iam login -u <user> -p <pass>
[5] 解析退出码：
    ├─ 成功 → "✓ 登录成功，请重启 Claude Code"
    └─ 失败 → 打印 iam 返回的错误，exit 1
```

用户手动运行 `oms-login`，或通过 `/sdd-login` 斜杠命令触发。

### 6.4 install.js 的 iam 检测

postinstall 时：
- ✅ 检测 Node ≥ 18（强制）
- ⚠️ 检测 iam 是否在 PATH（**警告但不阻塞**，因为用户可能晚些才装 iam）
- 复制 plugin + 注册 marketplace
- 打印下一步指引："请运行 oms-login 完成认证"

---

## 7. DOP 埋点流水线

### 7.1 三种事件 schema

**session.start**
```json
{
  "event": "session.start",
  "session_id": "uuid-from-claude",
  "user": "alice",
  "cwd": "/Users/hosea/work/git/x",
  "git_branch": "001-credit-card-equity",
  "git_remote": "git@gitlab.../x.git",
  "plugin_version": "0.1.0",
  "timestamp": "2026-06-18T10:44:00+08:00"
}
```

**session.end**
```json
{
  "event": "session.end",
  "session_id": "uuid-from-claude",
  "user": "alice",
  "duration_sec": 1834,
  "code_delta": {
    "files_changed": 7,
    "lines_added": 142,
    "lines_deleted": 38,
    "by_lang": { "ts": 120, "md": 22 }
  },
  "slash_commands_used": ["sdd-spec", "sdd-plan", "sdd-apply"],
  "timestamp": "2026-06-18T11:14:34+08:00"
}
```

**slash.invoked**
```json
{
  "event": "slash.invoked",
  "session_id": "uuid-from-claude",
  "user": "alice",
  "command": "sdd-plan",
  "args": "001-credit-card-equity",
  "timestamp": "2026-06-18T10:51:12+08:00"
}
```

**会话 ID 关键约束**：必须用 Claude Code 传给 hook 的 `session_id`（不能自生成），否则 session.start 与 session.end 在 DOP 后端无法关联。

### 7.2 代码量采集（L2 方案）

用 git diff 在 session.end 聚合：

```
session-start.js：
  spawn: git rev-parse HEAD → 记录 start_sha
  写入 ~/.oh-my-sdd/sessions/<session_id>.json

session-end.js：
  读 start_sha
  spawn: git diff <start_sha>..HEAD --numstat
  解析 "<added>\t<deleted>\t<path>" 每行
  按扩展名聚合 → code_delta
  清理 session 文件
```

**理由**：简单（5 行 shell）、覆盖所有变更（含 Agent 跑 git 命令改的）、纳入用户手改部分合理。

### 7.3 事件队列

`hooks/lib/event-queue.js`：

```js
enqueue(event)   // 追加到 ~/.oh-my-sdd/queue.jsonl
flush()          // 尝试上传所有积压，成功则清空
size()           // 当前积压数
```

触发时机：
- 每次 enqueue 后立即 flush（准实时）
- session-start.js 第一步先 flush 上次会话遗留
- flush 失败保留队列，下次重试

**JSONL 格式**：append-only，损坏一行不影响其他。

### 7.4 退出机制（两层）

| 层级 | 控制 | 实现 |
|------|------|------|
| 用户全局 | `~/.oh-my-sdd/config.json` 里 `telemetry_disabled: true` | `dop-client.report()` 直接 return |
| 项目级 | 项目根目录有 `.sdd-no-telemetry` 文件 | session-start.js 检测到后，整个 session 不上报 |

**额外硬规则**：iam 状态 ≠ OK 时**完全不上报**（不算退出机制，是系统级约束）。

### 7.5 SessionEnd 不可靠的降级

Claude Code 的会话结束 hook 在终端关闭、Ctrl+C、kill 时可能不触发。降级：

1. **PostToolUse(Edit|Write)** 增量记录 code_delta 到 session 文件
2. 即使 session.end 没跑，下次 session.start 时读遗留 session 文件，补传 session.end
3. slash.invoked 实时上传（不等 session.end）
4. session.start 清理 7 天前的孤儿 session 文件

### 7.6 配置文件

`~/.oh-my-sdd/config.json`（install.js 创建）：

```json
{
  "dop_endpoint": "https://dop.enterprise.com",
  "aih_system_name": "sdd",
  "log_level": "info",
  "telemetry_disabled": false
}
```

---

## 8. 跨平台 & npm 分发

### 8.1 Node 版本与依赖

- **强制 Node ≥ 18.0.0**（内置 fetch / crypto.randomUUID / fs.cp）
- **零运行时依赖**（`dependencies: {}`）
- 仅用 Node 内置模块：`fs/promises`、`child_process.spawn`、`fetch`、`crypto`、`path`、`os`

### 8.2 路径规范

- 所有路径用 `path.join()`，禁止硬编码 `/` 或 `\`
- 主目录：`os.homedir()`（三端通用）
- 插件目录：`path.join(os.homedir(), '.claude', 'plugins', 'oh-my-sdd')`
- 状态目录：`path.join(os.homedir(), '.oh-my-sdd')`

### 8.3 文件权限

| 平台 | 状态目录 | 文件 |
|------|---------|------|
| Unix | `fs.mkdir(mode: 0o700)` | `fs.writeFile(mode: 0o600)` |
| Windows | 继承用户 profile ACL | 同上 |

### 8.4 package.json

```json
{
  "name": "@cli-tools/oh-my-sdd",
  "version": "0.1.0",
  "description": "企业级 SDD 工作流 + iam 身份校验 + DOP 埋点（Claude Code 插件）",
  "main": "install.js",
  "bin": {
    "oms-install": "./bin/oms-install.js",
    "oms-uninstall": "./bin/oms-uninstall.js",
    "oms-login": "./bin/oms-login.js"
  },
  "scripts": {
    "postinstall": "node install.js",
    "preuninstall": "node uninstall.js"
  },
  "files": [
    "plugin.json", "marketplace.json",
    "install.js", "uninstall.js",
    "bin/", "commands/", "skills/", "content/", "hooks/",
    "README.md"
  ],
  "publishConfig": {
    "registry": "https://npm.enterprise.com/",
    "access": "restricted"
  },
  "engines": { "node": ">=18.0.0", "npm": ">=9.0.0" },
  "os": ["win32", "darwin", "linux"],
  "cpu": ["x64", "arm64"],
  "keywords": ["sdd", "claude-code", "plugin", "enterprise"],
  "license": "UNLICENSED",
  "private": false,
  "dependencies": {}
}
```

### 8.5 升级流程

```
npm update -g @cli-tools/oh-my-sdd
    ↓ postinstall（新版）
install.js 检测 ~/.claude/plugins/oh-my-sdd/ 已存在
    → 视为升级，覆盖文件
    → ~/.oh-my-sdd/ 不动（保留 state）
    → 更新 marketplace.json 的 version
    → settings.json 注册项已存在，跳过
Claude Code 下次启动自动 reload plugin
```

### 8.6 卸载流程

`uninstall.js`（preuninstall 触发）：
1. 删除 `~/.claude/plugins/oh-my-sdd/`
2. 从 `settings.json` 移除 `extraKnownMarketplaces["oh-my-sdd"]`
3. **保留** `~/.oh-my-sdd/`（用户可能重装）
4. 打印提示（彻底清理需 `oms-uninstall --purge`）

### 8.7 版本号策略

| 变更类型 | semver | 例子 |
|---------|--------|------|
| Hook 契约破坏（输出 schema 变） | MAJOR | 0.x → 1.0 |
| 新增 SDD 命令 / 新 skill | MINOR | 0.1 → 0.2 |
| baseline 文本调整 | MINOR | 0.1.0 → 0.2.0 |
| Bug 修复、文案修正 | PATCH | 0.1.0 → 0.1.1 |

> 0.x 阶段允许 minor 版本里的小破坏；1.0 起严格 semver。

---

## 9. 测试策略

### 9.1 三层金字塔

```
       ┌────────────────────┐
       │ Manual smoke test  │  发布前三平台各跑一次
       └────────────────────┘
     ┌──────────────────────────┐
     │ Integration tests        │  模拟 Claude Code 调用 hook
     │ （stub iam + stub DOP）   │  + stub 外部系统
     └──────────────────────────┘
   ┌─────────────────────────────────┐
   │ Unit tests（hooks/lib/*）        │  覆盖率 > 80%
   └─────────────────────────────────┘
```

### 9.2 测试框架

- **`node:test` + `node:assert`**（Node 内置，零依赖）
- 不引 vitest/jest/chai

### 9.3 单元测试覆盖

| 模块 | 关键测试点 |
|------|----------|
| `iam-cli.js` | 解析多 system / 缺字段 / JSON 损坏；spawn 失败容错；5 分钟缓存 |
| `dop-client.js` | 成功路径；fetch 失败 throw；`telemetry_disabled` return |
| `event-queue.js` | JSONL 追加；flush 多事件清空；flush 失败保留；损坏行跳过 |
| `platform.js` | 三平台 path.join；Node 版本检测；iam 在 PATH 检测 |
| `git-diff.js` | 解析 `--numstat`；按扩展名聚合；无 git 仓库降级 |

### 9.4 集成测试模式

模拟 Claude Code 调用 hook：

```js
const tmpHome = mkdtempSync(...);  // 隔离 HOME
const stubIam = createStubIam({ status: 'logged', username: 'alice' });
const dopServer = startStubDopServer();

const result = await spawnHook('session-start.js', {
  stdin: { session_id: 'test-uuid', cwd: '/path', source: 'startup' },
  env: { HOME: tmpHome, PATH: `${stubIam.dir}:${process.env.PATH}` }
});

assert(result.stdout.additionalContext).contains('企业 SDD Agent');
assert(dopServer.receivedEvents).length(1);
```

### 9.5 CI 矩阵

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    node: [18, 20, 22]
```

9 格全绿才能发布。Windows CI 注意：stub 脚本配 `.cmd`、用 `path.sep`、归一化 CRLF。

### 9.6 手动冒烟清单（发布前必跑）

维护在 `docs/smoke-test-checklist.md`：

```
□ 1. npm install -g @cli-tools/oh-my-sdd（无报错）
□ 2. 启动 Claude Code，baseline 注入可见
□ 3. 未登录：stderr 红色提示，无 baseline
□ 4. oms-login 后重启 Claude Code，baseline 注入
□ 5. /sdd-spec 命令可用且内容正确
□ 6. /sdd-plan 命令可用且内容正确
□ 7. 改文件 → session.end 触发 → DOP 收到 session.end（含 code_delta）
□ 8. 项目根目录建 .sdd-no-telemetry → 重启 → DOP 不上报
□ 9. 断网跑 session.end → 重连后下次 session.start 上传积压
□ 10. npm uninstall → ~/.claude/plugins/oh-my-sdd/ 已删
```

### 9.7 不测的部分

| 不测 | 理由 |
|------|------|
| Claude Code 自身的 hook 调用机制 | 假设 Claude Code 正确调用 |
| 真实 iam CLI 的行为 | 假设按 schema 返回 |
| 真实 DOP 服务的可用性 | 假设 HTTP 契约稳定 |
| Markdown 内容文案 | 由人工 review |

---

## 10. 风险登记

| 风险 | 影响 | 概率 | 缓解 |
|------|------|------|------|
| Claude Code 的 hooks schema 在交付前变更 | 高 | 中 | 实施第一步核对 + plugin-dev:plugin-validator |
| iam CLI 改 `auth status -json` 输出 schema | 高 | 低 | iam-cli.js 加 schema 校验，未知字段不崩 |
| SessionEnd hook 不触发 | 中 | 高 | PostToolUse 增量记录 + 下次 session.start 补传 |
| Windows hook 命令字符串引号转义失败 | 高 | 中 | postinstall 检测平台生成对应字符串 + Windows CI 必跑 |
| enterprise npm registry 网络不稳 | 中 | 中 | zero-deps 让 install 即使网络抖也完成 |
| `${CLAUDE_PLUGIN_ROOT}` 变量改名 | 高 | 低 | install.js fallback 用绝对路径 |
| 用户 Node 版本 < 18 | 中 | 中 | engines 字段 + install.js 双重检查 |
| DOP 把 code_delta 误读为生产力 | 中（治理） | 高 | spec/README 明确"参考指标非考核"；培训强调 |
| baseline 挤占 system prompt token | 中 | 中 | 1K 预算硬约束 + CI lint |
| 企业法务要求审计日志 | 中 | 中 | hooks/lib/log.js 写本地日志，后续可加导出 |

---

## 11. 待实施时核实项

实施第 1 天必须做的核实（不能在 spec 阶段凭假设）：

| 待核实项 | 核实方法 |
|---------|---------|
| Claude Code `plugin.json` 当前 schema 字段名 | 官方文档 + `plugin-dev:plugin-structure` skill |
| `${CLAUDE_PLUGIN_ROOT}` 在 hooks command 里的支持 | 文档 + Windows/Unix 各跑一次 |
| SessionEnd hook 在当前版本的实际名称 | 同上（可能是 `Stop` / `PreSessionEnd`） |
| iam CLI 的 system 字段值（"sdd"？） | 用户提供 + 实测 `iam auth status -json` |
| DOP 服务 endpoint + 鉴权方式 | 用户提供 / DOP 团队 |
| Claude Code 是否拒绝 hook 输出多余字段 | 文档 + 实测 |
| marketplace.json 的字段 schema | 官方文档 + superpowers 包结构参考 |

---

## 12. 未来工作（v0.2+）

| 版本 | 功能 | 触发条件 |
|------|------|---------|
| v0.2 | 显式子 agent（`agents/security-auditor.md` 等） | 企业需"按需深度审计" |
| v0.2 | resume 会话 token 优化 | baseline 真成 token 瓶颈 |
| v0.2 | `oms dashboard` 本地命令查自己的 DOP 数据 | 开发者反馈想看自己统计 |
| v0.3 | OpenCode 支持（生成第二套产物） | 企业引入 OpenCode |
| v0.3 | 企业私有 plugin marketplace 服务（HTTP 替代 npm） | npm registry 不稳或需细粒度控制 |
| v0.4 | CI 模式（hook 退化为"什么都不做"） | 企业 CI 也跑 Claude Code |
| v0.4 | baseline 多语言（中英文切换） | 跨国团队使用 |

---

## 13. 成功标准

v0.1 发布后**全部满足**才算成功：

- ✅ 三平台（mac/linux/windows）5 分钟内完成"npm install → oms-login → 首次会话 baseline 注入"
- ✅ DOP 后端 7 天内收到的 session.end 事件覆盖率 ≥ 90%
- ✅ 企业内部 1 个月内 ≥ 50 个开发者安装使用
- ✅ baseline token 占用稳定 ≤ 1K（CI lint 保护）
- ✅ 零运行时依赖、零 native module 编译
- ✅ 9 格 CI 矩阵全绿持续 4 周

---

## 附录 A：参考资料

- **enterprise-sdd-specs** (`@zybank/sdd-specs`)：已有 SDD 斜杠命令实现，本项目参考资料（不依赖）
- **Agent-Config-Design.md**：Claude Code / OpenCode 的 system prompt 注入槽位研究（B/C 通道、S0-S7）
- **oh-my-openagent**：Bun 构建的多平台 OpenCode 插件，跨平台分发参考
- **superpowers plugin**：Claude Code 插件 + marketplace 实现范本
