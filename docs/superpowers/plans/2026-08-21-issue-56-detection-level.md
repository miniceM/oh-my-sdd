# Issue #56 检测状态一致性实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans（简单任务可内联执行）。本计划按 TDD 执行。

**目标：** 让四个宿主 adapter 的 `host_runtime.level` 与检测结果一致，并验证 OpenCode 漂移资源不会被 repair 覆盖。

**架构：** 保留各 adapter 现有探测逻辑，只修正 capability level 的状态映射；OpenCode 漂移测试复用现有 ownership manifest、doctor、repair 控制面和临时 HOME 模式。

**技术栈：** Node.js ESM、`node:test`、Node 内置断言、现有 install control-plane。

---

### 任务 1：添加失败回归测试

**文件：**

- 修改：`__tests__/unit/install/opencode-closure.test.js`
- 修改：`__tests__/unit/install/hosts/claude-adapter.test.js`
- 修改：`__tests__/unit/install/hosts/lingma-adapter.test.js`
- 修改：`__tests__/unit/install/hosts/kilocode-adapter.test.js`

- [ ] 在四个 adapter 的未检测场景中断言 `describe().detected === false` 且 `describe().capabilities.host_runtime.level === 'missing'`。
- [ ] 添加 OpenCode ownership manifest 漂移场景，断言 `doctor()` 返回 `resource-drifted`、两个 digest 和人工处理动作。
- [ ] 使用 `npm test -- --test-name-pattern` 或对应单文件命令运行新增测试，确认旧实现因 `detected` level 不一致而失败。

### 任务 2：实现最小修复

**文件：**

- 修改：`install/hosts/claude-adapter.js:107`
- 修改：`install/hosts/lingma-adapter.js:101`
- 修改：`install/hosts/kilocode-adapter.js:91`
- 修改：`install/hosts/opencode-adapter.js:206`

- [ ] 将 Claude 的 `cli.state` 映射为 `available → detected`、`missing → missing`、`unknown → unknown`。
- [ ] 将其他三个 adapter 的 `detectionState` 直接作为 `host_runtime.level`，保留既有 `detected` 和 evidence 字段。
- [ ] 运行新增定向测试确认通过。

### 任务 3：完成验证

**文件：** 无新增文件。

- [ ] 运行 `node --test __tests__/unit/install/opencode-closure.test.js __tests__/unit/install/hosts/claude-adapter.test.js __tests__/unit/install/hosts/lingma-adapter.test.js __tests__/unit/install/hosts/kilocode-adapter.test.js`。
- [ ] 运行 `npm test`、`npm run test:coverage`、`npm run lint:baseline`。
- [ ] 运行 `npm --prefix opencode run build`，确认工作区无构建副作用并执行 `git diff --check`。
