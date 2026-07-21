# OpenCode Platform Adapter — 架构总设计

> **状态**：Draft（待用户审查）
> **日期**：2026-07-21
> **分支**：`worktree-opencode-platform-adapter`
> **作者**：brainstorming 会话
> **关联**：spike 1-5、`[OMSDROP]` 系列 commit（`1d877d7`...`331a9e4`）

## 0. 元数据

- **前置 spike**：5 项（装、插件格式、hook 协议、baseline 注入、真实 SDD 命令）
- **前置 commit 上下文**：`1d877d7 [OMSDROP] refactor: inline TRACKED_TOOLS`（OpenCode 在 5 个连续 commit 中被系统性移除）
- **设计选择**：A' 纯自适配（基于 spike 3 NO-GO + spike 2 install 路径复用事实）
- **估算工作量**：~1860 行（含测试）
- **目标交付**：MVP 完成后能在真 OpenCode 中跑通 `/sdd-spec` 完整流程

## 1. 背景与上下文

### 1.1 当前态

`@cli-tools/oh-my-sdd` 是企业 Claude Code / Lingma 插件，提供：

- 5 个 SDD 斜杠命令（`/sdd-spec` ... `/sdd-review`）
- 7 层洋葱强制约束（核心是 PreToolUse hard gate）
- 企业 baseline 注入到 system prompt
- IAM 认证 + DOP 遥测 + OpenSpec 集成

**当前支持 2 种工具**：Claude Code + 通义灵码 Lingma。OpenCode 在 2026-07-21 的 `[OMSDROP]` 5 个连续 commit 中被系统性移除（删除 `opencode/` 目录 7 个 TS 源文件 + `hooks/lib/install-opencode.js` 370 行 + build/smoke test/CI workflow，共 1967 行）。

### 1.2 重新评估的动因

用户希望将 OpenCode 重新加入支持矩阵，并明确选择 "纯自适配" 路径（不依赖 oh-my-openagent 作为运行时桥接）。

### 1.3 5 项 spike 事实摘要

| Spike | 结果 | 关键事实 |
|---|---|---|
| 1 装 + 结构 | ✅ GO | 用户级安装，目录结构清晰 |
| 2 插件格式 | ⚠️ 假设 | "oh-my-openagent 读 `~/.claude/`"（用户确认为事实，但本设计选 A' 后此事实**只影响 install 路径选择，不影响架构核心**） |
| 3 hook 协议 | ❌ **NO-GO** | hook 在 OpenCode 侧**不能完整 work**，HARD_RULE 强制失效 |
| 4 baseline 注入 | ✅ GO | 注入路径 work（具体机制下文详述） |
| 5 真实 SDD 命令 | ✅ GO | `/sdd-*` 命令能识别 |

**最终判定**：4 GO + 1 关键 NO-GO → 必须**自维护 hook 协议层**，不能依赖 oh-my-openagent。

## 2. 目标与非目标

### 2.1 目标（Goals）

- **G1**：让 OpenCode 用户能跑通 1 次完整 `/sdd-spec` 流程
- **G2**：**HARD_RULE 强制 100% 保留**（不因 OpenCode 协议不同而妥协）
- **G3**：enterprise-baseline 注入 system prompt，agent 知晓 [OMSxxxx] commit 格式 + `[OVERRIDE]` 逃生舱
- **G4**：与 Claude / Lingma 路径**共享** 5 个 hook JS（`hooks/*.js` 0 修改）
- **G5**：与 Claude / Lingma 路径**共享** `~/.oh-my-sdd/` 状态目录（session meta、config、IAM 凭据不重复）
- **G6**：fail-CLOSED 一致性（hook 异常 = 阻断工具，与 Claude 路径策略对齐）

### 2.2 非目标（Non-Goals）

- ❌ 全部 19 个 OpenCode hook 的实现（只 5 + experimental.chat.system.transform = 6 个）
- ❌ 自定义 OpenCode tools（baseline 走 experimental hook，不需 agent 主动调）
- ❌ 与 Lingma 路径的同步修改
- ❌ Cursor / Windsurf 适配
- ❌ oh-my-openagent 集成（A' 不依赖）
- ❌ v0.x 期间跨 Windows 深度适配（只 macOS/Linux 跑通）
- ❌ OpenCode SDK 内部修改

## 3. 架构总览

### 3.1 总体结构

```
              OpenCode 工具宿主
                     │
                     │ 19 个 hook（含 4 个 experimental）
                     ▼
       ┌──────────────────────────────┐
       │  opencode/src/index.ts        │  入口：export const OhMySddPlugin
       └──────────────┬───────────────┘
                      │
       ┌──────────────▼───────────────┐
       │  opencode/src/plugin.ts       │  19 hook 回调分派
       │  ├── tool.execute.before → 抛出/通过
       │  ├── tool.execute.after  → 通过
       │  ├── command.execute.before → 通过
       │  ├── event (session.*)   → 通过
       │  ├── experimental.chat.system.transform → 注入 baseline
       │  └── permission.ask     → (备用)
       └──────────────┬───────────────┘
                      │
       ┌──────────────▼───────────────┐
       │  opencode/src/mappers.ts      │  OpenCode 事件 → Claude hook JSON
       └──────────────┬───────────────┘
                      │ JSON stdin
       ┌──────────────▼───────────────┐
       │  opencode/src/runner.ts       │  child_process.spawn
       │  - 5s timeout                 │
       │  - 解析 stdout                │
       │  - permissionDecision="deny"  │
       │    → throw new Error()        │
       └──────────────┬───────────────┘
                      │ spawn
       ┌──────────────▼───────────────┐
       │  hooks/*.js (0 修改)          │
       │  pre-tool-use.js / ...        │
       └───────────────────────────────┘
```

### 3.2 关键设计原则

| 原则 | 实现 |
|---|---|
| **Zero modification to core** | `hooks/*.js` 和 `hooks/lib/*.js` 全部 0 改动 |
| **Single source of truth** | 5 HARD_RULE 规则只在 `hooks/lib/rules.js` 写一次 |
| **Fail-CLOSED** | hook 任何异常 → 阻断工具执行 |
| **Type safety** | OpenCode SDK 有 TypeScript 类型，编译期捕获协议漂移 |
| **Timeout 兜底** | 5s 强 kill（与 Claude hook timeout 一致），超时 → 阻断 |
| **Shared state** | `~/.oh-my-sdd/` 状态目录与 Claude/Lingma 路径复用 |

## 4. 组件清单

### 4.1 文件结构

```
opencode/                              ← 新建顶层目录
├── src/                               ← TypeScript 源
│   ├── index.ts                       # 入口：export const OhMySddPlugin
│   ├── plugin.ts                      # hook 回调分派
│   ├── mappers.ts                     # OpenCode event → Claude hook JSON
│   ├── runner.ts                      # child_process.spawn + 输出翻译
│   ├── baseline.ts                    # baseline 加载 + system prompt 格式化
│   ├── permission.ts                  # permission.ask 备用通道
│   ├── logger.ts                      # 文件日志
│   ├── paths.ts                       # 路径解析
│   ├── config.ts                      # 读 ~/.oh-my-sdd/config.json
│   └── types.ts                       # SDK + Claude hook 类型
├── dist/                              ← tsc 编译产物
├── tsconfig.json
└── package.json

hooks/lib/
└── install-opencode.js                # 新增：opencode 路径的 install 实现

install.js / uninstall.js              ← 加 `--tool opencode` 分支

__tests__/
├── unit/opencode/                     # 单元测试
└── integration/opencode/              # 集成测试
```

### 4.2 关键组件契约

#### 4.2.1 `mappers.ts` — 事件映射器

| Mapper | 输入（OpenCode） | 输出（Claude hook stdin） | 失败模式 |
|---|---|---|---|
| `mapSessionStart(input)` | `{ sessionID, directory }` | `{ session_id, cwd }` | 缺字段 → fallback (`oms-opencode-${Date.now()}` / `process.cwd()`) |
| `mapSessionEnd(input)` | 同上 | 同上 | 同上 |
| `mapPreToolUse(input, output)` | `{ tool, sessionID, callID }` + `output.args` | `{ tool_name, tool_input, session_id }` | tool 不在 TOOL_MAP → 返回 null（不调 hook） |
| `mapPostToolUse(input)` | `{ tool, sessionID, callID, args }` | 同上 | 同上 |
| `mapUserPromptSubmit(input, output)` | `{ command, sessionID, arguments }` + `output.parts` | `{ session_id, prompt, cwd }` | 缺 command → 返回 null |

**TOOL_MAP**：OpenCode 小写 (`write`/`edit`/`apply_patch`) → Claude 大写 (`Write`/`Edit`/`MultiEdit`)。

**args 归一化**：`args.new_string` → `args.newString`（snake_case → camelCase，hooks 期望 camelCase）。

#### 4.2.2 `runner.ts` — hook 进程执行器

```text
runHook(scriptName: string, payload: object, opts: { timeoutMs?, cwd?, env? }): Promise<HookResult | null>
```

- 5s timeout（可配置，env var `OMS_HOOK_TIMEOUT_MS`，与 Claude 路径同）
- spawn 优先 `Bun.spawn`（OpenCode 用 Bun），fallback `node:child_process.spawn`（兼容非 Bun 环境）
- stdin: `JSON.stringify(payload)`
- 解析 stdout 为 JSON
- 解析失败 → fail-CLOSED
- `permissionDecision: "deny"` → throw new Error(reason)
- **超时 = 阻断**（不放过）

#### 4.2.3 `baseline.ts` — system prompt 注入器

```text
loadBaseline(pluginRoot: string): string[]
buildSystemPrompt(sections: string[], model: Model): string[]
```

- 读 `content/enterprise-baseline.md`
- 移除 YAML frontmatter 和 Sync Impact Report
- 按 `## ` 切分 → string[]
- 推入 `experimental.chat.system.transform` 的 `output.system`
- **降级策略**：SDK 升级后此 hook 消失 → 写 `~/.config/opencode/AGENTS.md` + `shell.env` 设 `ENTERPRISE_BASELINE_PATH`
- **版本检测**：plugin 启动时探测 SDK 是否含此 hook

#### 4.2.4 `paths.ts` — 路径解析

| 方法 | 输出 |
|---|---|
| `getPluginRoot()` | opencode 插件根（npm-style `process.env.PLUGIN_ROOT` 或 fallback 探测） |
| `getHooksDir()` | `../../hooks/`（相对 plugin root） |
| `getBaselinePath()` | `../../content/enterprise-baseline.md` |
| `getStateDir()` | `~/.oh-my-sdd/`（**与 Claude/Lingma 路径共享**） |
| `getLogFile()` | `~/.oh-my-sdd/logs/opencode.log` |

#### 4.2.5 `permission.ts` — 备用阻断通道

- `handlePermissionAsk(input, output)`：设置 `output.status = "deny"`
- 当前为 stub（YAGNI），OpenCode 引入 permission UI 时启用

### 4.3 共享 utilities（0 改动）

| 模块 | 用途 |
|---|---|
| `hooks/lib/rules.js` | 5 HARD_RULE + 2 SOFT_RULE 规则集 |
| `hooks/lib/config.js` | config.json 加载 |
| `hooks/lib/iam-cli.js` | 企业 IAM 认证 |
| `hooks/lib/dop-client.js` | DOP 遥测 |
| `hooks/lib/event-queue.js` | session meta 队列 |

### 4.4 Install 集成

```text
oms-install --tool opencode
  1. check Node >= 18
  2. tsc 编译 opencode/src/*.ts → opencode/dist/*.js
  3. 复制 dist/ 到 ~/.config/opencode/plugins/oh-my-sdd/
  4. 写 ~/.config/opencode/opencode.json 含 "plugin": ["oh-my-sdd"]
  5. 共享 ~/.oh-my-sdd/ 状态目录
  6. 写 logs/ 目录
  7. (可选) OpenCode 客户端探测

oms-uninstall --tool opencode
  1. 删 ~/.config/opencode/plugins/oh-my-sdd/
  2. 从 opencode.json 移除 "oh-my-sdd" 入口（保留其他 plugin）
  3. 保留 ~/.oh-my-sdd/ 状态（除非 --purge）
  4. 不动 Claude/Lingma 路径的任何文件
```

## 5. 数据流

### 5.1 PreToolUse 强制（HARD_RULE 关键路径）

**场景**：agent 调用 Edit 工具，文件内容含 `AKIAIOSFODNN7EXAMPLE`

```
OpenCode 工具宿主
   │  (1) tool.execute.before 事件
   │      input = { tool: "edit", sessionID: "abc123", callID: "..." }
   │      output.args = { file_path: "src/auth.ts", newString: "...AKIAIOSFODNN7EXAMPLE..." }
   ▼
plugin.ts: handleToolExecuteBefore(input, output)
   │  (2) 调 mapper
   ▼
mappers.ts: mapPreToolUse(input, output)
   │  - tool_name: "edit" → "Edit" (TOOL_MAP)
   │  - args.new_string → args.newString (normalize)
   │  - 返回: { tool_name: "Edit", tool_input: { file_path, newString, oldString }, session_id: "abc123" }
   ▼
runner.ts: runHook("pre-tool-use.js", payload, { timeoutMs: 5000 })
   │  (3) child_process.spawn("node", ["hooks/pre-tool-use.js"], { timeout: 5000 })
   │  (4) stdin.write(JSON.stringify(payload))
   │  (5) 等待 stdout
   ▼
hooks/pre-tool-use.js
   │  (6) 读 stdin → payload
   │  (7) hooks/lib/rules.js 规则匹配
   │      - 检测到 newString 含 "AKIAIOSFODNN7EXAMPLE" → AK 硬编码规则命中
   │  (8) stdout.write(JSON.stringify({
   │        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
   │          permissionDecisionReason: "HARD_RULE: AWS AccessKeyId 硬编码" }
   │      }))
   ▼
runner.ts: 解析 stdout JSON
   │  (9) permissionDecision === "deny"
   │  (10) throw new Error(reason)
   ▼
plugin.ts: 抛错透传
   ▼
OpenCode 工具宿主
   │  (12) catch Error → 工具调用被阻止
   │  (13) 文件 NOT MODIFIED
```

**关键属性**：
- 同步路径（对 OpenCode 是单次 await）
- 写前阻断（保证文件不被修改）
- 错误信息透传（agent 能写 `[OVERRIDE]` 重新尝试）

### 5.2 SessionStart + baseline 注入

**场景**：用户启动 OpenCode，需要把 enterprise-baseline 注入 system prompt

```
OpenCode 工具宿主
   │  (1) 新会话创建
   ▼
plugin.ts: 入口 OhMySddPlugin(input)
   │  (2) plugin 初始化：paths.ts 解析所有路径
   │  (3) 注册所有 hook 回调
   │  (4) 注册 experimental.chat.system.transform 回调
   │  (5) 返回 Hooks 对象
   ▼
OpenCode 工具宿主
   │  (6) 准备第一次 LLM 调用
   ▼
plugin.ts: handleSystemTransform(input, output)
   │  (7) baseline.ts.loadBaseline(pluginRoot)
   │      - 读 content/enterprise-baseline.md
   │      - 移除 YAML frontmatter + Sync Impact Report
   │      - 按 ## 切分 → string[]
   │  (8) output.system.push(...baselineSections)
   ▼
OpenCode 工具宿主
   │  (9) 把 output.system 拼到 LLM 的 system prompt
   ▼
LLM
   │  (10) 看到完整 system prompt（含 baseline）
```

**关键属性**：
- 每次 chat turn 都调（baseline 改了，下一轮生效）
- idempotent（累加，不覆盖）
- 降级路径（hook 消失时写 AGENTS.md + shell.env）

### 5.3 错误处理流

```
runner.ts: runHook(...)
   │  错误情形 1: spawn 失败 → log error → throw  ← fail-CLOSED
   │  错误情形 2: 5s 超时 → kill (SIGTERM) + log warn → throw  ← fail-CLOSED
   │  错误情形 3: stdout 非合法 JSON → log error → throw  ← fail-CLOSED
   │  错误情形 4: stdout 是 JSON 但缺 permissionDecision 字段 → 视为"无意见" → 工具继续  ← fail-OPEN（仅此处）
   │  错误情形 5: mapper 返回 null → 跳过此 hook → 工具继续  ← 正常跳过
   │  错误情形 6: hook exit code ≠ 0 (含段错误 SIGSEGV 139 / SIGKILL 137) → log error → throw  ← fail-CLOSED
   ▼
plugin.ts: 抛错透传给 OpenCode
   ▼
OpenCode 工具宿主: 工具被阻止
```

**fail-CLOSED 一致性**：
- 任何"hook 本身出问题"→ 阻断
- 例外"hook 显式不参与"（null / 缺 permissionDecision）→ 放行
- 绝不因 hook 异常放过

## 6. 错误处理

### 6.1 错误分类与处理矩阵

| ID | 错误类型 | 触发条件 | 处理策略 | 日志 | DOP | 测试 |
|---|---|---|---|---|---|---|
| E1 | HARD_RULE 命中 | rules.js 匹配 | 阻断（throw） | info | ✅ blocked | 必测，每条规则 |
| E2 | SOFT_RULE 警告 | README/API 缺规范 | 通过（warn 注入 additionalContext） | warn | ✅ warned | 必测 |
| E3 | hook crash | spawn 失败 / 段错误 | 阻断（fail-CLOSED） | error | ✅ hook_error | 必测 |
| E4 | hook timeout | > 5s | 阻断（fail-CLOSED） | warn | ✅ hook_timeout | 必测 |
| E5 | stdout 非 JSON | parse 失败 | 阻断（fail-CLOSED） | error | ✅ hook_protocol_error | 必测 |
| E6 | stdout 缺 permissionDecision | hook 没明确意见 | 通过（fail-OPEN，仅此处） | debug | ❌ | 必测 |
| E7 | mapper 返回 null | tool 不在 TOOL_MAP | 跳过此 hook | debug | ❌ | 必测 |
| E8 | SDK 类型不匹配 | SDK 升级 | 阻断 + log 含版本号 | error | ✅ sdk_mismatch | 必测 |
| E9 | baseline 文件缺失 | content/enterprise-baseline.md 找不到 | 不注入 | warn | ❌ | 必测 |
| E10 | experimental hook 消失 | SDK v2 改名/移除 | 降级到 AGENTS.md + shell.env | warn | ✅ fallback_engaged | 必测 |
| E11 | 路径越界 | session_id 含非法字符 | 阻断 + log sanitized | error | ✅ path_traversal_attempt | 必测 |

### 6.2 统一错误类型

```text
HookError extends Error {
  category: 'HARD_RULE' | 'TIMEOUT' | 'CRASH' | 'PROTOCOL' | 'SDK_MISMATCH' | 'PATH_TRAVERSAL';
  sessionId: string;       // sanitized
  toolName?: string;
  reason: string;          // 人类可读
  hookScript: string;      // 哪个 hook 出错
  originalError?: Error;
}
```

### 6.3 日志策略

- 文件：`~/.oh-my-sdd/logs/opencode.log`（与 Claude 路径**同目录**）
- 格式：JSON Lines（一行一个事件）
- 轮转：单文件 > 10MB 自动 rotate
- **不写 stdout**（plugin 可能在 TUI 里）
- **不写载荷全文**（避免泄密——只写 hash + 长度 + 字段名）

### 6.4 DOP 上报

- 复用 `hooks/lib/dop-client.js`（**不重写**）
- 新增事件类型：`opencode_hook_blocked` / `opencode_hook_warned` / `opencode_hook_error` / `opencode_hook_timeout` / `opencode_sdk_mismatch` / `opencode_fallback_engaged` / `opencode_path_traversal_attempt`
- 与 Claude 事件**平级**（不进独立 DOP 通道），方便聚合分析

## 7. 测试策略

### 7.1 测试金字塔

```
                    ┌──────────────┐
                    │   E2E 测试    │  ~5 cases
                    │  (真 OpenCode)│  smoke / spike 验证
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  集成测试     │  ~15 cases
                    │ (mock SDK 事件)│
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  单元测试     │  ~60 cases
                    │  (纯函数)     │
                    └──────────────┘
```

### 7.2 单元测试（`__tests__/unit/opencode/`）

| 模块 | 测试用例数 | 关键 case |
|---|---|---|
| mappers.test.js | 15 | tool 映射 / args normalize / 缺字段 fallback / null 跳过 |
| runner.test.js | 12 | 成功路径 / 各种超时 / crash / stdout 非 JSON / permissionDecision 转译 |
| baseline.test.js | 8 | frontmatter 移除 / 切分 / 缺失降级 / 大小截断 |
| permission.test.js | 4 | (stub，YAGNI) |
| paths.test.js | 6 | 跨平台路径 / 不存在插件根 / 路径越界防护 |
| types.test.js | 3 | SDK 版本断言 / 编译期类型检查 |
| logger.test.js | 5 | 不写 stdout / JSON Lines 格式 / rotate 触发 |

### 7.3 集成测试（`__tests__/integration/opencode/`）

- `full-flow.test.js` — 15 cases，模拟 5 个 hook 全链路
- 关键 case：
  - 写一个含 AK 的文件 → 验证 PreToolUse 阻断 + 文件未变
  - 启动 session → 验证 baseline 进入 system prompt（mock LLM 验证）
  - hook crash → 验证工具被阻断 + DOP 上报

### 7.4 E2E 测试（`__tests__/spike/opencode-e2e.md`）

5 个 case 跑在**真 OpenCode**：
1. 完整 `/sdd-spec` 流程跑通
2. HARD_RULE 5 条都验过（不只 AK 一条）
3. baseline 注入实际看到（看 OpenCode UI 或 LLM 响应里 baseline 痕迹）
4. 性能：spawn 50 次 hook，P95 延迟
5. **协议漂移检测**：故意用错 SDK 版本启动，验证降级路径

### 7.5 覆盖率目标

- mappers / runner / baseline 必须 100%
- logger / paths ≥ 90%
- permission stub ≥ 50%（YAGNI 接受）
- **整体 ≥ 80%**（与 oh-my-sdd 现有基线一致）

### 7.6 CI 集成

- `npm test` 加 `--test-reporter=spec`，opencode 测试**自动**跑
- E2E 测试**不进 CI**（依赖真 OpenCode），只在 spike 阶段手动跑
- 协议漂移测试**不进 CI**（需要特定旧版本 SDK），放到 `docs/spike-protocol-drift.md`

### 7.7 TDD 顺序

1. mappers.test.js（无外部依赖，先跑通）
2. runner.test.js（mock child_process）
3. baseline.test.js（mock fs）
4. 集成测试（mock OpenCode SDK 事件）
5. E2E spike（最后，写在 docs/ 下作为 spike 报告）

## 8. 分期交付

### 8.1 Phase 1: MVP

| 交付物 | 验收标准 | 估计代码量 |
|---|---|---|
| `opencode/src/index.ts` + `plugin.ts` | 5 hook 回调能注册 | ~100 行 |
| `opencode/src/mappers.ts` | 5 mapper + 单测通过 | ~250 行 |
| `opencode/src/runner.ts` | spawn + timeout + 解析 + fail-CLOSED | ~200 行 |
| `opencode/src/baseline.ts` | experimental.chat.system.transform 注入 | ~150 行 |
| `opencode/src/logger.ts` | 文件日志 | ~80 行 |
| `opencode/src/paths.ts` | 跨平台路径 | ~100 行 |
| `opencode/src/config.ts` | config.json 加载 | ~50 行 |
| `opencode/src/types.ts` | SDK 类型重导出 | ~50 行 |
| `hooks/lib/install-opencode.js` | install/uninstall/disable/enable | ~300 行 |
| `install.js` / `uninstall.js` 加分支 | `--tool opencode` 工作 | ~50 行 |
| `opencode/tsconfig.json` + `package.json` | tsc 编译通过 | ~30 行 |
| 单元 + 集成测试 | 覆盖 ≥ 80% | ~500 行 |
| `__tests__/spike/opencode-e2e.md` | 真 OpenCode 跑通 /sdd-spec | spike 报告 |
| README + docs/ 更新 | `--tool opencode` 安装说明 | docs |

**MVP 总计**：~1860 行（含测试）

**MVP 验收**：
- ✅ `oms-install --tool opencode` 无错
- ✅ 启动 OpenCode，5 个 hook 全部触发
- ✅ PreToolUse 阻断 AK 硬编码（**安全承诺可验证**）
- ✅ baseline 进入 system prompt（**HARD_RULE 写入可观察**）
- ✅ DOP 上报正常
- ✅ oms-uninstall 干净

**MVP 不做**：
- ❌ 全部 19 hook（只 5 + experimental.chat.system.transform = 6 个）
- ❌ permission.ts stub 实现（YAGNI）
- ❌ Windows 路径深度测试
- ❌ payload 大小优化
- ❌ oh-my-openagent 集成

### 8.2 Phase 2: 协议硬化

| 交付物 | 触发条件 |
|---|---|
| 类型守卫 + 协议版本探测 | SDK v2 任何变更 |
| baseline 降级到 AGENTS.md 的完整实现 | experimental hook 消失 |
| 跨 Windows 路径测试 | 收到 Win 用户 issue |
| 19 hook 中剩余 13 个按需补 | 用户请求 |

### 8.3 Phase 3: 生态整合（v0.4+）

- 与 oh-my-openagent 共存安装
- Lingma 路径的等价物
- 性能优化（spawn → 直接 import）
- 自定义 tool 体系

## 9. 开放问题（实现阶段确认）

| 问题 | 当前最佳猜测 | 验证方式 |
|---|---|---|
| OpenCode SDK 目标版本 | pin `@opencode-ai/plugin: ^1.15.13` | 装 npm 后跑 spike 验证 hook 都在 |
| 安装路径优先级 | 全局 `~/.config/opencode/plugins/oh-my-sdd/`（默认） + 项目 `.opencode/plugins/oh-my-sdd/`（可选） | install.js 加 `--project` flag？或默认全局 |
| payload 大小限制 | 推测 1MB（OpenCode SDK 默认） | 实测：写 5MB 文件看是否被截断 |
| Windows 路径 | `os.homedir()` 走 `process.env.USERPROFILE` | 在 Win 跑 spike 1 验证 |
| DOP event schema 兼容性 | 复用 Claude 路径 schema + 新增 opencode_* 事件类型 | dop-client 单元测试覆盖 |
| session_id 格式 | OpenCode 是 UUID，hooks 期望 `[A-Za-z0-9_-]+` | 实测 + paths.ts 验证 |
| `opencode.json` 是否要写 | 是——加 `"plugin": ["oh-my-sdd"]` 让 OpenCode 自动加载 | install.js 末尾写 |
| baseline 的语言 | 与 Claude 路径同源中文（**保留**——企业强制） | baseline.ts 不做翻译 |
| 多版本共存 | 单实例 only，第二个 install 覆盖 | uninstall 提示 |
| tool.execute.before 阻断后如何恢复 | agent 看到 Error 自己改；如果用户想 force 怎么办？ | 当前不实现，v2 加 `/oms-force-bypass` 内部命令 |

## 10. 决策记录

| 决策 | 选择 | 否决备选 | 否决理由 |
|---|---|---|---|
| 整体架构 | A' 纯自适配 | A oh-my-openagent 桥接 / B 协议抽象层 | spike 3 NO-GO + 增量 1967+ 行 |
| baseline 注入机制 | experimental.chat.system.transform | wrapper / custom tool / compaction hook | 唯一干净的官方机制 |
| 阻断语义 | throw new Error | permissionDecision 字段 | OpenCode 协议只有前者 |
| 状态目录 | 共享 ~/.oh-my-sdd/ | 独立 ~/.oh-my-sdd-opencode/ | 避免凭据重复 |
| hook 协议 | spawn child_process (复用 hooks/*.js) | 直接 import SDK | 与 Lingma/Claude 路径同构 |
| 包发布 | 单 oh-my-sdd 仓库内 opencode/ 子目录 | 独立 npm 包 | 与 Lingma 路径一致 |
| 阻断失败时错误信息 | 含 HARD_RULE 章节引用 | 仅"blocked" | agent 需要知道怎么 OVERRIDE |

## 11. 风险登记

| 风险 | 触发条件 | 缓解 |
|---|---|---|
| `experimental.chat.system.transform` 改名/移除 | OpenCode SDK 升级到 v2 | baseline.ts 单点改动 + 降级到 AGENTS.md + shell.env |
| OpenCode 工具名变化 | SDK 大版本 | TOOL_MAP 单点维护 |
| `command.execute.before` 改名/移除 | SDK 大版本 | mappers.ts 改映射函数 |
| @opencode-ai/plugin v2 协议变更 | SDK 重大版本 | types.ts 重导出，编译期捕获 |
| 安装路径 Windows 不同 | 跨平台 | paths.ts 走 os.homedir()，单测覆盖 Win/Mac/Linux |
| 5s timeout 误杀慢 hook | hook 慢但非 hang | 暴露 timeoutMs env var（与 Claude 路径同） |
| OpenCode 客户端不存在 | 用户先装 oh-my-sdd 后装 OpenCode | install.js 仅做 soft check（warn 不退出），写 plugin 到目录等用户用 |
| oh-my-openagent 协议漂移 | 不可控（已选 A' 不依赖） | N/A——A' 解耦 |

## 12. 关键不变量（实现必须保持）

- **HARD_RULE 强制永不绕过**（除用户显式 `[OVERRIDE]`，v2 才做）
- **baseline 内容永不修改**（`content/enterprise-baseline.md` 是 SoT）
- **~/.oh-my-sdd/ 状态目录三路径共享**
- **失败默认 = fail-CLOSED**（除 E2/E6/E7 明确场景）
- **日志不写 stdout**
- **payload 全文不进日志**

## 13. 引用

- 官方 OpenCode 插件文档：https://opencode.ai/docs/zh-cn/plugins/
- @opencode-ai/plugin SDK types：https://unpkg.com/@opencode-ai/plugin@1.15.13/dist/index.d.ts
- 7954dec 历史 mappers：`git show 7954dec:opencode/src/mappers.ts`
- 7954dec 历史 plugin.ts：`git show 7954dec:opencode/src/plugin.ts`
- 7954dec 历史 types.ts：`git show 7954dec:opencode/src/types.ts`
- oh-my-openagent README：https://github.com/code-yeongyu/oh-my-openagent
- oh-my-sdd 现有 baseline：`content/enterprise-baseline.md`
- oh-my-sdd 7 层洋葱：README §"强制约束体系（洋葱模型）"
- 现有 hooks 协议：`hooks/hooks.json` + `hooks/lib/`

---

**版本**：v1.0-draft
**下次审查**：用户书面审查 → 修订 → writing-plans
