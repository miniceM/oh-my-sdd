# Issue 39 安装计划实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在任何安装写入前，向四个宿主提供一致、可渲染和可自动化消费的结构化预检与安装计划。

**架构：** `install/control-plane/plan.js` 将 HostAdapter 的只读宿主事实标准化为一个版本化 plan；CLI 只选择宿主、构建 plan 和渲染它。适配器保持实际安装职责，但新增无副作用的 describe 接口；人类和 JSON 输出由同一 plan 生成。

**技术栈：** Node.js ESM、Node 内置 `node:test`、现有 HostAdapter/registry/sentinel 约定。

---

## 文件结构

- 创建：`install/control-plane/plan.js` — plan schema、依赖检测、四宿主归一化、dry-run 计划构建。
- 创建：`install/control-plane/render.js` — 人类文本与 JSON envelope 渲染。
- 修改：`install/host-adapter.js` — 声明无副作用的 `describe(ctx)` adapter 合约。
- 修改：`install/hosts/{claude,opencode,lingma,kilocode}-adapter.js` — 返回宿主事实、能力、风险和候选资源。
- 修改：`install/main.js` — 导出 plan 构建入口；dry-run 不进入 `install()`。
- 修改：`bin/oms-install.js` — 解析 `--dry-run`、`--json`、多宿主选择并渲染计划。
- 创建：`__tests__/unit/install/control-plane/plan.test.js`、`render.test.js` — schema、分类和输出契约。
- 修改：`__tests__/unit/install/host-adapter.test.js`、`__tests__/unit/install/hosts/*-adapter.test.js`、`__tests__/unit/bin/oms-install.test.js` — adapter 与 CLI 行为测试。

### 任务 1：建立版本化 plan schema 与 renderer

**文件：** 创建 `install/control-plane/plan.js`、`install/control-plane/render.js`；测试 `__tests__/unit/install/control-plane/plan.test.js`、`render.test.js`。

- [ ] **步骤 1：编写失败的 schema/renderer 测试**

```js
test('buildInstallationPlan returns a versioned plan with normalized host facts', () => {
  const plan = buildInstallationPlan({ adapters: [FakeAdapter] });
  assert.equal(plan.schema_version, 1);
  assert.deepEqual(plan.hosts[0].capabilities.write_prevention, {
    supported: false, evidence: 'host lacks PreToolUse', level: 'advisory',
  });
});

test('renderJson serializes exactly the installation-plan envelope', () => {
  assert.deepEqual(JSON.parse(renderJson(plan)), { type: 'installation-plan', plan });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/control-plane/plan.test.js __tests__/unit/install/control-plane/render.test.js`

预期：FAIL，`ERR_MODULE_NOT_FOUND` 指向 `install/control-plane/plan.js`。

- [ ] **步骤 3：编写最少 schema 与 renderer 实现**

```js
export function buildInstallationPlan({ adapters, ctx }) {
  return { schema_version: 1, hosts: adapters.map(Adapter => normalizeHost(Adapter.describe(ctx))) };
}
export const renderJson = plan => JSON.stringify({ type: 'installation-plan', plan }) + '\n';
```

`normalizeHost` 必须填充 `dependencies`、`capabilities`、`resources`、`risks` 和 `recommendation` 的空数组/明确值；`renderText` 从同一对象逐项打印宿主、保护等级、资源、风险和下一步。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/control-plane/plan.test.js __tests__/unit/install/control-plane/render.test.js`

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/control-plane __tests__/unit/install/control-plane && git commit -m "feat: add installation plan contract" -m "Refs #39"`

### 任务 2：为 HostAdapter 加入只读 describe 合约

**文件：** 修改 `install/host-adapter.js`；测试 `__tests__/unit/install/host-adapter.test.js`。

- [ ] **步骤 1：编写失败的抽象 adapter 测试**

```js
test('abstract adapter describe returns an explicit unsupported host fact', () => {
  assert.deepEqual(HostAdapter.describe(ctx).capabilities, []);
  assert.equal(HostAdapter.describe(ctx).recommendation.action, 'skip');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/host-adapter.test.js`

预期：FAIL，`HostAdapter.describe is not a function`。

- [ ] **步骤 3：实现最少的 adapter contract**

```js
static describe() {
  return { id: this.id, display_name: this.displayName, detected: this.isInstalled(),
    dependencies: [], capabilities: [], resources: [], risks: [],
    recommendation: { action: 'skip', reason: 'adapter has no plan facts' } };
}
```

不得从 `describe` 调用 `install`、`writeFile`、npm 或 config patcher。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/host-adapter.test.js`

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/host-adapter.js __tests__/unit/install/host-adapter.test.js && git commit -m "feat: add host plan description contract" -m "Refs #39"`

### 任务 3：实现四宿主计划快照与保护语义

**文件：** 修改四个 `install/hosts/*-adapter.js` 和相应 `__tests__/unit/install/hosts/*-adapter.test.js`。

- [ ] **步骤 1：为每个宿主编写失败的 describe 测试**

```js
test('KiloCode plan is advisory and never claims write prevention', () => {
  const host = KiloCodeAdapter.describe(ctx);
  assert.equal(capability(host, 'write_prevention').level, 'advisory');
  assert.equal(capability(host, 'write_prevention').supported, false);
});
test('OpenCode plan separates plugin registration from runtime enforcement', () => {
  const host = OpenCodeAdapter.describe(ctx);
  assert.equal(resource(host, 'npm-plugin').action, 'register-plugin');
  assert.match(host.risks.join(' '), /加载|load/i);
});
```

Claude 必须声明 PreToolUse 可验证条件；Lingma 必须分别标记文档适配和实机证据；每个适配器应列出配置/skills/plugin 候选资源、宿主 CLI/目录、依赖和建议。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/hosts/claude-adapter.test.js __tests__/unit/install/hosts/opencode-adapter.test.js __tests__/unit/install/hosts/lingma-adapter.test.js __tests__/unit/install/hosts/kilocode-adapter.test.js`

预期：FAIL，`describe is not a function` 或缺少断言字段。

- [ ] **步骤 3：实现每个 adapter 的 describe**

```js
static describe(ctx) {
  return { id: this.id, display_name: this.displayName, detected: this.isInstalled(),
    dependencies: [{ name: 'node', required: true, state: nodeState(ctx) }],
    capabilities: [{ name: 'write_prevention', supported: false, level: 'advisory', evidence: '...' }],
    resources: [{ type: 'baseline', path: BASELINE_PATH, action: 'update', owned: true }],
    risks: ['...'], recommendation: { action: 'install', reason: '...' } };
}
```

路径必须复用 adapters 现有常量；检测失败转换为 `{ state: 'unknown', reason }`，不得抛出未分类异常。

- [ ] **步骤 4：运行宿主测试验证通过**

运行：同步骤 2 命令。

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/hosts __tests__/unit/install/hosts && git commit -m "feat: describe host installation capabilities" -m "Refs #39"`

### 任务 4：让 installer main 构建 plan 且 dry-run 零写入

**文件：** 修改 `install/main.js`；测试 `__tests__/unit/install/entrypoints.test.js`。

- [ ] **步骤 1：编写失败的 dry-run 测试**

```js
test('dry run returns a plan without invoking adapter install', async () => {
  const install = mock.fn();
  const result = await main({ tool: 'fake', dryRun: true, getAdapter: () => ({ describe, install }) });
  assert.equal(result.schema_version, 1);
  assert.equal(install.mock.calls.length, 0);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/entrypoints.test.js`

预期：FAIL，测试观察到 `install` 被调用或没有 plan。

- [ ] **步骤 3：实现 plan-first main 流程**

```js
const plan = buildInstallationPlan({ adapters: selectedAdapters, ctx });
if (options.dryRun) return plan;
if (options.confirm && !await options.confirm(plan)) return { ...plan, cancelled: true };
return Adapter.install({ ...ctx, plan });
```

显式 `tool` 选择一个 adapter；无 `tool` 时只在单宿主检测到时默认选择，否则返回 `selection_required` plan，不能静默选择。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/entrypoints.test.js`

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/main.js __tests__/unit/install/entrypoints.test.js && git commit -m "feat: build installation plan before apply" -m "Refs #39"`

### 任务 5：扩展 oms-install CLI、JSON 与交互确认

**文件：** 修改 `bin/oms-install.js`；测试 `__tests__/unit/bin/oms-install.test.js`。

- [ ] **步骤 1：编写失败的 CLI 解析与输出测试**

```js
test('oms-install --dry-run --json prints one JSON plan and never applies', async () => {
  const { stdout, installer } = await runOmsInstall(['--tool', 'kilocode', '--dry-run', '--json']);
  assert.equal(installer.installCalls, 0);
  assert.equal(JSON.parse(stdout).type, 'installation-plan');
});
test('multiple detected hosts require an explicit selection before apply', async () => {
  await assert.rejects(() => runOmsInstall([]), /选择.*--tool/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/bin/oms-install.test.js`

预期：FAIL，选项未识别或 installer 被调用。

- [ ] **步骤 3：实现 flag 与渲染分支**

```js
return { tool, dryRun: argv.includes('--dry-run'), json: argv.includes('--json') };
```

在执行前把 `renderText(plan)` 写入 stderr；仅接受确认后调用 main apply；`--json` 写入 stdout，所有日志/提示保留 stderr。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/bin/oms-install.test.js`

预期：PASS。

- [ ] **步骤 5：提交与全量验证**

运行：`git add -- bin/oms-install.js __tests__/unit/bin/oms-install.test.js && git commit -m "feat: expose installation plan CLI" -m "Refs #39" && npm test && npm run lint:baseline && git diff --check`

预期：全部 PASS，工作树仅包含本 Issue 范围的变更。
