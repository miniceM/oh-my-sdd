# Issue 40 可观察安装执行实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 #39 的安装 plan 以可见步骤、OMS ownership 和安全失败恢复方式应用到一个或多个宿主。

**架构：** 执行器接收 plan 与 adapter operation，生成严格的 `InstallStepResult` 生命周期；ownership manifest 只记录 OMS 资源和本次可恢复快照。adapter 继续实际写入，公共层负责事件、失败隔离、汇总及 renderer。

**技术栈：** Node.js ESM、Node 内置 `node:test`、现有 sentinel 与 resource ownership helpers。

---

## 文件结构

- 创建：`install/control-plane/executor.js` — 步骤状态机、逐宿主隔离、结果汇总。
- 创建：`install/control-plane/ownership.js` — 统一 ownership manifest、可恢复快照与安全 drift 判定。
- 修改：`install/control-plane/render.js`、`install/main.js`、`bin/oms-install.js` — 事件输出与确定退出码。
- 修改：`install/common/sentinel.js`、`install/common/fs.js` 与 adapters — 写入/读取统一 ownership metadata，保留现有恢复语义。
- 创建：`__tests__/unit/install/control-plane/executor.test.js`、`ownership.test.js`。
- 修改：`__tests__/integration/claude-install.test.js`、`__tests__/integration/install-targets.test.js`、`__tests__/integration/opencode/install.test.js`、`__tests__/integration/uninstall-dispatcher.test.js` — patch/copy/plugin 失败注入、重试和卸载回归。

### 任务 1：以失败测试定义步骤状态机

**文件：** 创建 `executor.js` 和 `executor.test.js`。

- [ ] **步骤 1：编写失败测试**

```js
test('executor emits running then succeeded for one OMS-owned resource', async () => {
  const events = await collect(executePlan(plan, { applyResource: async () => ({ owned: true }) }));
  assert.deepEqual(events.map(e => e.status), ['running', 'succeeded']);
});
test('a failed Claude step does not skip an independent OpenCode host', async () => {
  const result = await executePlan(twoHostPlan, failingClaudeAdapter);
  assert.equal(result.hosts.claude.status, 'failed');
  assert.equal(result.hosts.opencode.status, 'succeeded');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/control-plane/executor.test.js`

预期：FAIL，找不到 executor 模块。

- [ ] **步骤 3：实现最少状态机**

```js
export async function* executePlan(plan, { applyResource }) {
  for (const resource of plan.resources) {
    yield step(resource, 'running');
    try { yield step(resource, 'succeeded', await applyResource(resource)); }
    catch (error) { yield step(resource, 'failed', { reason: classifyError(error) }); }
  }
}
```

`step` 必须包含稳定 `id`、host、resource、action、owned、用户说明、机器原因、恢复动作和下一步；同一 host 的不可恢复失败可停止其剩余步骤，但不能停止其它 host。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/control-plane/executor.test.js`

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/control-plane/executor.js __tests__/unit/install/control-plane/executor.test.js && git commit -m "feat: add observable install executor" -m "Refs #40"`

### 任务 2：实现仅 OMS 资源的 ownership 与回滚保护

**文件：** 创建 `ownership.js`、`ownership.test.js`；修改 `sentinel.js`、`fs.js`。

- [ ] **步骤 1：编写失败的 ownership/drift 测试**

```js
test('rollback restores only a current OMS-owned resource with matching digest', async () => {
  const result = await rollback(step, manifest, io);
  assert.equal(result.status, 'rolled-back');
});
test('rollback preserves a user-modified resource and reports manual recovery', async () => {
  const result = await rollback(step, driftedManifest, io);
  assert.equal(result.status, 'warning');
  assert.match(result.next_action, /手动/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/control-plane/ownership.test.js`

预期：FAIL，找不到 ownership 模块。

- [ ] **步骤 3：实现 ownership manifest**

```js
export function recordOwnedResource(resource, before, after) {
  return { host: resource.host, path: resource.path, owned: true,
    before_digest: digest(before), after_digest: digest(after), backup: before };
}
```

manifest 放入已有 per-host sentinel metadata，设置 0600 权限；rollback 仅接受本 run 记录、`owned === true` 且当前 digest 与 `after_digest` 匹配的资源。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/control-plane/ownership.test.js __tests__/unit/install/common/sentinel.test.js __tests__/unit/install/common/fs.test.js`

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/control-plane/ownership.js install/common/sentinel.js install/common/fs.js __tests__/unit/install && git commit -m "feat: record OMS installation ownership" -m "Refs #40"`

### 任务 3：将 adapters 写入映射为可回滚步骤

**文件：** 修改四个 `install/hosts/*-adapter.js`；修改对应 unit tests 和安装 integration tests。

- [ ] **步骤 1：编写失败的失败注入测试**

```js
test('OpenCode reports plugin registration, resource sync, and pending load separately', async () => {
  const events = await installOpenCodeWithFakeNpm();
  assert.deepEqual(events.map(e => e.action), ['register-plugin', 'sync-resource', 'verify']);
  assert.equal(events.at(-1).status, 'warning');
});
test('a failed config patch leaves pre-existing user configuration intact', async () => {
  await assert.rejects(() => installWithFailingPatch());
  assert.equal(await readFile(settings), userConfig);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/hosts/claude-adapter.test.js __tests__/unit/install/hosts/opencode-adapter.test.js __tests__/unit/install/hosts/lingma-adapter.test.js __tests__/unit/install/hosts/kilocode-adapter.test.js __tests__/integration/claude-install.test.js __tests__/integration/install-targets.test.js __tests__/integration/opencode/install.test.js __tests__/integration/uninstall-dispatcher.test.js`

预期：FAIL，缺少事件或错误地覆盖用户文件。

- [ ] **步骤 3：适配 adapter operation 接口**

```js
static async applyResource(resource, ctx) {
  if (resource.type === 'npm-plugin') return ctx.registerPlugin(resource);
  if (resource.type === 'baseline') return ctx.patchBaseline(resource);
  return ctx.copyOwnedResource(resource);
}
```

在既有 install 内部复用该接口；每个写入前捕获最小原始内容，成功后写 ownership；失败交给执行器回滚。不得替换用户无 marker 的区块。

- [ ] **步骤 4：运行测试验证通过**

运行：同步骤 2 命令。

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/hosts __tests__/unit/install/hosts __tests__/integration/claude-install.test.js __tests__/integration/install-targets.test.js __tests__/integration/opencode/install.test.js __tests__/integration/uninstall-dispatcher.test.js && git commit -m "feat: report adapter install resources" -m "Refs #40"`

### 任务 4：将事件与汇总公开给 CLI，验证重试/卸载

**文件：** 修改 `render.js`、`main.js`、`bin/oms-install.js`；修改 CLI tests 和 integration tests。

- [ ] **步骤 1：编写失败的 JSON/退出码测试**

```js
test('json install output contains the same step events and partial-failure summary', async () => {
  const output = await runOmsInstall(['--json', '--tool', 'all']);
  assert.equal(output.summary.status, 'partial-failure');
  assert.equal(output.exitCode, 1);
});
test('retry after a rolled-back step is idempotent', async () => {
  assert.equal((await retryInstall()).summary.status, 'succeeded');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/bin/oms-install.test.js __tests__/integration/claude-install.test.js __tests__/integration/install-targets.test.js __tests__/integration/opencode/install.test.js __tests__/integration/uninstall-dispatcher.test.js`

预期：FAIL，JSON 没有步骤/汇总或重试失败。

- [ ] **步骤 3：实现 renderer、退出码与重试路径**

```js
return { type: 'installation-result', plan, events, summary:
  { status: hasFailures ? 'partial-failure' : 'succeeded', next_actions } };
```

文本按事件输出开始、完成、警告、失败和恢复动作；JSON 每次输出一个最终 result envelope；部分失败退出码为 1、完全成功为 0、用户取消为 2。

- [ ] **步骤 4：运行测试验证通过**

运行：同步骤 2 命令。

预期：PASS。

- [ ] **步骤 5：提交与全量验证**

运行：`git add -- install/control-plane/render.js install/main.js bin/oms-install.js __tests__/unit/bin/oms-install.test.js __tests__/integration/claude-install.test.js __tests__/integration/install-targets.test.js __tests__/integration/opencode/install.test.js __tests__/integration/uninstall-dispatcher.test.js && git commit -m "feat: surface installation execution results" -m "Refs #40" && npm test && npm run lint:baseline && git diff --check`

预期：全部 PASS。
