# OpenCode Platform Adapter 实现摘要

> **快速导航**：本文档是完整实现计划的摘要版本（< 300行），详细实现细节请参考 [完整计划文档](./2026-07-21-opencode-platform-adapter.md)

## 项目概览

**目标**：在 OpenCode 工具宿主上跑通 oh-my-sdd 的 5 个 SDD 命令与 7 层洋葱强制约束，**HARD_RULE 100% 保留**

**状态**：✅ 已完成

**架构选择**：A' 纯自适配——TypeScript 插件层复用现有 hooks/*.js（0 修改）

**技术栈**：
- TypeScript 5.9（`opencode/src/*.ts` → `opencode/dist/*.js`）
- Node.js child_process
- `@opencode-ai/plugin` SDK 1.15+
- 现有 `hooks/lib/*` JS 工具集

---

## 架构设计

### 核心设计决策

**架构 A'：纯自适配**
- TypeScript 插件层（`opencode/src/*.ts`）做 OpenCode 事件到 Claude hook JSON 的转译
- 通过 `child_process.spawn` 复用 `hooks/*.js`（0 修改）
- baseline 注入走 `experimental.chat.system.transform`
- 阻断语义：`throw new Error`
- 状态目录 `~/.oh-my-sdd/` 与 Claude/Lingma 路径共享

**关键不变量**：
1. **HARD_RULE 强制保留**：所有安全规则 100% 生效
2. **Fail-CLOSED 安全模型**：任何 hook 错误都阻断工具执行
3. **共享状态**：`~/.oh-my-sdd/` 与 Claude/Lingma 共享，保证一致性
4. **无 stdout 污染**：logger 只写文件，不污染 OpenCode TUI

---

## 文件结构

### 新建文件（Production）

| 路径 | 职责 |
|------|------|
| `opencode/tsconfig.json` | TS 编译配置（ES2022 / strict / outDir=dist） |
| `opencode/package.json` | 局部包定义（name=`oh-my-sdd-opencode`，private） |
| `opencode/src/index.ts` | 入口：`export const OhMySddPlugin` |
| `opencode/src/types.ts` | SDK 类型重导出 + 内部类型 |
| `opencode/src/paths.ts` | 路径解析（plugin root / hooks / baseline / state / log） |
| `opencode/src/logger.ts` | 文件日志（JSON Lines，10MB 轮转，不写 stdout） |
| `opencode/src/config.ts` | 包装 `hooks/lib/config.js`，OpenCode 路径特有 defaults |
| `opencode/src/mappers.ts` | OpenCode event → Claude hook stdin JSON |
| `opencode/src/runner.ts` | child_process.spawn + timeout + stdout 解析 + permissionDecision 转 throw |
| `opencode/src/baseline.ts` | 读 enterprise-baseline.md + 推 `output.system` + 降级到 AGENTS.md |
| `opencode/src/plugin.ts` | hook 回调分派（6 个 handler：5 lifecycle + system.transform） |
| `opencode/src/permission.ts` | permission.ask stub（YAGNI，返回 null） |
| `opencode/dist/**` | tsc 编译产物（运行时使用） |
| `hooks/lib/install-opencode.js` | opencode 路径 install/uninstall/disable/enable |

### 新建文件（Tests）

| 路径 | 职责 | 用例数 |
|------|------|--------|
| `__tests__/unit/opencode/paths.test.js` | 路径解析 | 6 |
| `__tests__/unit/opencode/logger.test.js` | 日志 | 5 |
| `__tests__/unit/opencode/config.test.js` | 配置加载 | 4 |
| `__tests__/unit/opencode/mappers.test.js` | 事件映射 | 15 |
| `__tests__/unit/opencode/runner.test.js` | hook spawn | 12 |
| `__tests__/unit/opencode/baseline.test.js` | baseline 注入 | 8 |
| `__tests__/unit/opencode/types.test.js` | SDK 版本断言 | 3 |
| `__tests__/unit/opencode/permission.test.js` | stub | 4 |
| `__tests__/integration/opencode/full-flow.test.js` | mock SDK 全链路 | 15 |
| `__tests__/spike/opencode-e2e.md` | 真 OpenCode 跑通 spike 报告 | - |

### 修改文件

| 路径 | 修改内容 |
|------|---------|
| `package.json` | devDeps 加 `@opencode-ai/plugin`；scripts 加 `build:opencode`；files 加 `opencode/dist/` |
| `install.js` | `preflightFor('opencode')` soft check；`main()` switch 加 `'opencode'` 分支 |
| `uninstall.js` | 加 `uninstallForOpencode()` 动态 import 分支 |
| `README.md` | 加 "OpenCode" 章节（与现有 Claude / Lingma 对称） |
| `docs/roadmap/v0.2-backlog.md` | 加 v0.3 OpenCode 任务标记为完成 |

### 不修改的文件

- `hooks/*.js`（5 个 lifecycle 0 修改）
- `hooks/lib/rules.js`（HARD_RULE 单一源）
- `wrappers/claude.{sh,ps1,bat}`（OpenCode 无 wrapper 概念）
- `skills/*/SKILL.md`（17 个 skills markdown，OpenCode 直接读）
- `install-claude.js` / `install-lingma.js`（独立模块，不动）

---

## 实现任务摘要

### Phase 分解

| Phase | 名称 | 任务数 | 说明 |
|-------|------|--------|------|
| Phase 0 | Project skeleton | 2 | 创建 `opencode/` 目录 + tsconfig + package.json |
| Phase 1 | Foundations | 4 | types.ts, paths.ts, logger.ts, config.ts |
| Phase 2 | Mappers | 5 | OpenCode event → Claude hook JSON 映射 |
| Phase 3 | Runner | 2 | child_process 调度 + fail-CLOSED 安全模型 |
| Phase 4 | Baseline | 3 | system prompt 注入 + 降级策略 |
| Phase 5 | Plugin dispatcher | 3 | hook 回调分派 + 6 个 handler |
| Phase 6 | Build + install | 4 | build:opencode 脚本 + install.js 集成 |
| Phase 7 | Integration tests | 1 | full-flow.test.js（mock SDK 端到端） |
| Phase 8 | E2E spike | 1 | 真 OpenCode 跑通验证 |

**总计**：25 个任务，约 1860 行代码

### TDD 实践

每个任务遵循严格的 TDD 流程：
1. 写测试（RED）
2. 跑测试（应 FAIL）
3. 写实现
4. 跑测试（应 PASS）
5. commit

---

## 核心模块说明

### 1. Mappers（`opencode/src/mappers.ts`）

**职责**：OpenCode event payload → Claude hook stdin JSON

**关键映射**：
- `session.created` → `session-start.js`
- `session.deleted` → `session-end.js`
- `tool.execute.before` → `pre-tool-use.js`
- `tool.execute.after` → `post-tool-use.js`
- `command.execute.before` → `user-prompt-submit.js`

**工具名映射**：
- OpenCode: `write` → Claude: `Write`
- OpenCode: `edit` → Claude: `Edit`
- OpenCode: `apply_patch` → Claude: `MultiEdit`

### 2. Runner（`opencode/src/runner.ts`）

**职责**：Spawn hooks/*.js as child process + fail-CLOSED 安全模型

**关键行为**：
- `permissionDecision: "deny"` → throw HookError（阻断工具）
- `permissionDecision: "allow"` → return HookResult（允许执行）
- Hook crash / timeout / 非 JSON → throw HookError（fail-CLOSED）
- 5s timeout（可配置）

### 3. Baseline（`opencode/src/baseline.ts`）

**职责**：加载 enterprise-baseline.md 并注入 system prompt

**注入策略**：
- 优先：`experimental.chat.system.transform` hook（SDK 1.15+）
- 降级：写入 `~/.config/opencode/AGENTS.md`

**处理流程**：
1. 读取 `content/enterprise-baseline.md`
2. 去除 YAML frontmatter
3. 去除 Sync Impact Report
4. 按章节分割
5. 推入 `output.system`

---

## 测试策略

### 测试金字塔

```
        E2E Spike（1个）
            ↑
    Integration Tests（1个）
            ↑
      Unit Tests（9个文件，57个用例）
```

**目标覆盖率**：≥ 80%

### 测试类型

1. **单元测试**：每个模块独立测试，mock 外部依赖
2. **集成测试**：mock SDK 端到端验证
3. **Spike 验证**：真 OpenCode 环境手动验证

---

## 安装使用

### 安装步骤

```bash
# 1. 全局安装
npm install -g --foreground-scripts @cli-tools/oh-my-sdd

# 2. 显式选择工具
oms-install --tool opencode

# 3. 启动 OpenCode
#    plugin 自动加载到 ~/.config/opencode/plugins/oh-my-sdd/
#    baseline 通过 experimental.chat.system.transform 注入
#    /sdd-spec <change-name>
```

### 前置依赖

- OpenCode（`npm install -g opencode` 或从 https://opencode.ai 下载）
- `@opencode-ai/plugin` SDK 1.15+（oms-install 时自动安装）

---

## 关键决策记录

### 决策 1：为什么选择架构 A'（纯自适配）？

**原因**：
- ✅ **零修改复用**：不修改任何现有 hooks/*.js，降低维护成本
- ✅ **语义一致**：HARD_RULE 强制语义 100% 保留
- ✅ **快速落地**：只新增 opencode/ 目录，风险可控

**替代方案**：
- 架构 B：抽象 adapter 层（改动大，风险高）
- 架构 C：重新实现（违反 DRY）

### 决策 2：为什么使用 TypeScript？

**原因**：
- SDK 提供 TypeScript 类型定义，类型安全
- 编译期检查，减少运行时错误
- 易于维护和重构

### 决策 3：为什么 Fail-CLOSED？

**原因**：
- **安全优先**：任何 hook 错误都应阻断工具，避免绕过安全检查
- **符合企业基线**："安全 > 合规 > 稳定 > 效率"
- **Fail-safe 模式**：错误时 deny，而非 allow

---

## 详细文档

完整的任务列表、代码示例和测试用例请参考：

- **完整实现计划**：[2026-07-21-opencode-platform-adapter.md](./2026-07-21-opencode-platform-adapter.md)（2766行）
- **设计规范**：[../specs/2026-07-21-opencode-platform-adapter-design.md](../specs/2026-07-21-opencode-platform-adapter-design.md)

---

## 附录：快速命令参考

```bash
# 构建 OpenCode 插件
cd opencode && npm install && npx tsc

# 运行单元测试
node --test __tests__/unit/opencode/

# 运行集成测试
node --test __tests__/integration/opencode/full-flow.test.js

# 检查覆盖率
node --test --experimental-test-coverage __tests__/unit/opencode/

# 本地安装测试
npm run build:opencode
oms-install --tool opencode
```

---

**最后更新**：2026-07-24
**文档维护者**：oh-my-sdd 团队