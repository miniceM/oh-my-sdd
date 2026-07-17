# Spike: OpenCode plugin hook 路径性能评估

**状态**:⏸️ 暂停决策(等待业务反馈或性能瓶颈显现)
**日期**:2026-07-15
**关联**:`opencode/dist/plugin.js`、`hooks/pre-tool-use.js`、`hooks/post-tool-use.js`
**类型**:性能分析 / 重构候选

## 背景

`opencode/dist/plugin.js` 采用 **adapter 模式**:把 OpenCode 的 in-process plugin 事件翻译回 Claude Code 风格的 `stdin/stdout` 进程协议,通过 `child_process.spawn` 调用原始的 `hooks/*.js`。这是为**保持单源真相**——`hooks/` 目录同时被 Claude Code 和 OpenCode 复用,业务逻辑不复制。

但这个选择带来一个**架构税**——每次 hook 触发都要 fork 一个 Node 进程,无论实际工作多轻。

## 量化分析

### Hook 路径开销分解(单次调用)

| 路径 | 实际工作 | 估算耗时 | spawn 税占比 | 触发频率 |
|---|---|---|---|---|
| `PreToolUse` | `JSON.parse` + 提取 content + `matchRules()`(242 行纯函数,无 IO) | 1-10ms | **~90%+** | 每个 Edit/Write 一次 |
| `PostToolUse` | 读 session meta 文件 + 修改 + 写回 | 5-30ms | **~80%** | 每个 Edit/Write 一次 |
| `SessionStart` | iam CLI spawn + dop 网络请求 + readdir + readFile | 50-500ms | 30-50% | 每 session 1 次 |
| `SessionEnd` | 读 meta + dop 上报 + git diff | 30-200ms | 40-60% | 每 session 1 次 |

### 关键证据

- `hooks/lib/rules.js`:242 行,只导出 `ALL_RULES` 常量 + `matchPatternRule` + `matchRules`,**纯函数,无 IO**
- `hooks/pre-tool-use.js:28`:`STDIN_TIMEOUT_MS = 5_000` — 内部已经有 5s stdin 容忍
- `plugin.js:50-54`:外层 adapter 还有 5s `timeoutMs` 兜底
- `plugin.js:53-54` 注释:"超时 → 空响应(不阻断 OpenCode session)"

### 影响估算

假设一个 agent session 完成 10 次 Edit/Write:

- **当前**:10 × ~150ms(spawn 税)+ 10 × ~5ms(实际工作) ≈ **1.55s 纯税**
- **in-process 后**:10 × ~5ms ≈ **50ms**
- **节省**:~1.5s / session,主观响应感显著提升

复杂 refactor(30+ edits)节省可达 ~4.5s。

## 失去的能力(adapter 模式的隐性代价)

`plugin.js` 注释里没用到但 OpenCode 原生支持的:
- `output.args` — 可以**改写**工具入参(Claude hook 协议不支持)
- 原生 in-process 回调(避免 IPC 序列化整个 file content)

高频路径上,这些能力都被 adapter 屏蔽了。

## 推荐方案(待决策)

### 方案 A:高频路径 in-process,低频路径维持 spawn ⭐ 推荐

- `plugin.js` 启动时 `import` `hooks/lib/rules.js`
- `tool.execute.before` / `tool.execute.after` 走 in-process handler
- 仍保留 Claude 协议翻译 + `deny → throw` 转换
- `session.created` / `session.deleted` 维持 spawn(低频,IO 重,重构 ROI 低)
- `hooks/*.js` 不动,继续服务 Claude Code

**保留单源真相**:规则定义(`ALL_RULES` 数组)依然只有一份。

### 方案 B:全部 in-process,hooks/ 只服务 Claude

- 性能最优
- 风险:plugin.js 与 hooks/*.js 业务逻辑双实现,长期漂移风险高
- 违反 oh-my-sdd 团队"单源真相"价值观

### 方案 C:维持现状

- 零风险
- 高频路径永远背负 90%+ 的 spawn 税

## 主要 Trade-off

| 维度 | 方案 A | 方案 B | 方案 C |
|---|---|---|---|
| 性能(高频路径) | 30x 提升 | 30x 提升 | 不变 |
| 单源真相 | ✅ 保留 | ❌ 双实现 | ✅ 保留 |
| 实施成本 | 中(plugin.js 加 in-process 分支) | 高(全部重写) | 0 |
| 维护成本 | 低(spawn 作为 fallback) | 中-高(两套实现同步) | 低 |
| 失去的 OpenCode 能力 | 部分(`output.args` 仍未用) | 全部用上 | 全部丢失 |

## 决策点

**是否进入实施阶段?**

- [ ] **继续方案 A**:在 `plugin.js` 加 PreToolUse 一条路径的 in-process POC(预估 5-10 行核心改动),用 benchmark 验证 ~30x 提速
- [ ] **维持方案 C**:等性能瓶颈被用户报告后再回头
- [ ] **走方案 B**:仅在团队明确放弃单源真相后才考虑

## 实施 Checklist(若选 A)

- [ ] PreToolUse POC:plugin.js 启动时 `import { matchRules }` 路径下的 rules.js
- [ ] 保留 spawn 作为 fallback(出错时降级)
- [ ] benchmark 验证:简单 Edit × 100 次,对比前后耗时
- [ ] PostToolUse 同样处理(但需要迁移 fs IO 逻辑)
- [ ] 文档更新:plugin.js 注释说明"高频路径 in-process,低频路径 spawn"
- [ ] 回归测试:确认 Claude 协议行为不变(`/sdd-review` 应过)

## 参考

- 对比依据:`opencode/dist/plugin.js:1-14`(设计意图注释)
- 单源真相约束:CLAUDE.md 反馈"Prefer contract over pragmatic workaround"
- 同类 spike 文档:`docs/spike-posttooluse-deny.md`
