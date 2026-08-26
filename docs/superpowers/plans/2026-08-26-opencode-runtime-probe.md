# OpenCode runtime probe implementation plan

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 OpenCode doctor 的运行时证据可显式注入，使单测不再依赖 fake npm/PATH，同时保留默认生产校验。

**架构：** `install/hosts/opencode-adapter.js` 将把 activation 证据采集提取为可调用 probe；`inspectRuntime()` 接受可选 probe 并继续负责将证据映射为 doctor 状态。adapter 单测直接提供 probe 结果；真实 CLI E2E 保留默认 probe 与 npm 生命周期覆盖。

**技术栈：** Node.js ESM、`node:test`、`node:assert/strict`。

---

### 任务 1：为 adapter 的证据映射建立确定性测试

**文件：**

- 修改：`__tests__/unit/install/hosts/opencode-adapter.test.js`
- 修改：`install/hosts/opencode-adapter.js`

- [ ] **步骤 1：编写失败的测试**

将 `inspectDoctorWithActivation()` 改为向 `OpenCodeAdapter.inspectRuntime()` 和 `doctor()` 传入一个返回 activation 证据的 probe；测试 valid、missing write-before 与 degraded 三种记录，并断言测试不再创建 fake npm 包或 PATH launcher。

- [ ] **步骤 2：运行测试验证失败**

运行 `node --test __tests__/unit/install/hosts/opencode-adapter.test.js`。预期失败，因为 adapter 尚未读取注入的 probe。

- [ ] **步骤 3：实现最少生产代码**

在 `OpenCodeAdapter.inspectRuntime(ctx)` 中选择 `ctx.runtimeProbe`（若提供）或默认 activation probe。probe 返回与现有 `readActivation()` 相同的 `state/path/value/reason` 证据；默认行为不变。

- [ ] **步骤 4：运行单测验证通过**

运行 `node --test __tests__/unit/install/hosts/opencode-adapter.test.js`。预期全部通过，且不需要 child process、fake npm 或 PATH 劫持。

### 任务 2：保留默认 probe 的真实生命周期覆盖

**文件：**

- 修改：`__tests__/integration/opencode/real-cli-e2e.test.js`（仅在现有覆盖不足时）

- [ ] **步骤 1：确认真实 E2E 覆盖**

在真实隔离 npm 安装和 OpenCode 激活后，调用未注入 probe 的 `OpenCodeAdapter.inspectRuntime()`，断言其能读取真实 activation 并验证已安装包摘要。

- [ ] **步骤 2：补充缺失的默认 probe 断言**

只补充该断言；不把 PATH fake 或 unit-test fixture 引入 E2E。

- [ ] **步骤 3：运行 E2E 验证**

运行 `npm run test:e2e:opencode`。真实 OpenCode 环境可用时预期通过；否则记录环境限制。

### 任务 3：回归验证与提交

**文件：**

- 修改：`install/hosts/opencode-adapter.js`
- 修改：`__tests__/unit/install/hosts/opencode-adapter.test.js`
- 可选修改：`__tests__/integration/opencode/real-cli-e2e.test.js`

- [ ] **步骤 1：运行门禁**

运行 `node --test __tests__/unit/install/hosts/opencode-adapter.test.js`、`npm test`、`npm run test:coverage`、`npm run lint:baseline` 和 `git diff --check`。

- [ ] **步骤 2：检查暂存范围并提交**

暂存上述文件，运行 `git diff --cached --check`，并以 `test(opencode): inject runtime activation probe`（`Refs #74`）提交。
