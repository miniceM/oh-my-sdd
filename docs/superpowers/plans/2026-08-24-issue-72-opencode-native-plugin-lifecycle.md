# OpenCode 原生插件生命周期实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 OMS 通过 OpenCode 原生 `opencode plugin` CLI 安装/更新插件，并由插件加载生命周期完成发现资源 bootstrap 与 doctor activation 验证。

**架构：** OMS 的 OpenCode adapter 不再调用配置补丁器，而是调用 `opencode plugin @cli-tools/oh-my-sdd-opencode --global --force`。OpenCode 加载插件后，插件从自身 npm 包初始化仅限宿主发现所需的技能和命令资源，注册包内 hooks，并写入 activation 记录；doctor 通过该记录验证 `loaded` 和 `enforced`。

**技术栈：** Node.js ESM、Node 内置测试运行器、OpenCode npm Plugin API、`opencode plugin` CLI。

---

## 文件结构

- 修改：`install/hosts/opencode-adapter.js` — 调用原生 CLI、读取 activation、生成健康状态。
- 修改：`opencode/src/index.ts` — 在返回 Hooks 前运行插件 bootstrap。
- 创建：`opencode/src/bootstrap.ts` — 运行包内资源 bootstrap 并写 activation 记录。
- 创建：`opencode/src/activation.ts` — activation JSON 的路径、schema 与原子写入。
- 创建：`opencode/scripts/resource-bootstrap.mjs` — 从已安装插件包投影 OpenCode 发现资源，复用所有权保护。
- 修改：`opencode/scripts/postinstall.mjs` — 降为 shared bootstrap 的兼容入口，不再是正确安装路径。
- 修改：`opencode/package.json` — 保证 bootstrap 运行时所需的文件随插件包发布。
- 修改：`__tests__/unit/install/hosts/opencode-adapter.test.js` — 原生 CLI 调用和 activation 健康状态测试。
- 创建：`__tests__/unit/opencode/bootstrap.test.js` — bootstrap、漂移保护和 activation 测试。
- 修改：`__tests__/unit/install/control-plane/health.test.js` — `loaded` / `enforced` doctor 映射测试。
- 修改：`__tests__/integration/opencode/install.test.js` — 原生安装、重启加载和打包资源回归测试。

### 任务 1：以失败测试锁定原生 OpenCode 安装调用

**文件：**

- 修改：`__tests__/unit/install/hosts/opencode-adapter.test.js`
- 修改：`install/hosts/opencode-adapter.js`

- [ ] **步骤 1：编写失败的 adapter 测试**

```js
test('OpenCode install invokes the native global plugin command', async () => {
  const calls = [];
  const result = await OpenCodeAdapter.applyResource(
    { action: 'install-plugin-native', type: 'npm-plugin', phase: 'install' },
    { runCommand: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: 'installed', stderr: '' };
    } },
  );

  assert.deepEqual(calls[0].args, [
    'plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force',
  ]);
  assert.equal(calls[0].command, 'opencode');
  assert.equal(result.status, 'succeeded');
});

test('OpenCode install reports a native CLI failure without patching config', async () => {
  const result = await OpenCodeAdapter.applyResource(
    { action: 'install-plugin-native', type: 'npm-plugin', phase: 'install' },
    { runCommand: () => ({ status: 1, stdout: '', stderr: 'registry unavailable' }) },
  );

  assert.equal(result.status, 'failed');
  assert.match(result.reason, /registry unavailable/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：FAIL，因为 adapter 尚未接受 `install-plugin-native` 或执行 `opencode plugin`。

- [ ] **步骤 3：编写最少实现代码**

在 adapter 中增加可注入命令执行器；生产实现使用非交互调用，并保留 stdout/stderr 作为安装事件证据：

```js
function installNativePlugin(runCommand = runOpenCodeCommand) {
  const args = ['plugin', OPENCODE_PLUGIN_ENTRY, '--global', '--force'];
  const result = runCommand('opencode', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    return {
      status: 'failed',
      owned: false,
      message: 'OpenCode native plugin installation failed.',
      reason: result.stderr || result.stdout || `opencode exited ${result.status}`,
      next_action: `Retry: opencode plugin ${OPENCODE_PLUGIN_ENTRY} --global --force`,
    };
  }
  return {
    status: 'succeeded',
    owned: false,
    message: 'OpenCode installed and registered the npm plugin through its native CLI.',
    next_action: DEFERRED_LOAD_ACTION,
  };
}
```

将 `describe().resources` 收敛为一个 `install-plugin-native` install 资源；删除安装路径中对 `patchOpencodeJson()` 的调用。保留卸载路径的兼容清理，不在本任务重写卸载协议。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：PASS，且测试断言没有直接配置补丁调用。

- [ ] **步骤 5：提交**

```bash
git add install/hosts/opencode-adapter.js __tests__/unit/install/hosts/opencode-adapter.test.js
git commit -m "fix(opencode): install through native plugin CLI" -m "Refs: #72"
```

### 任务 2：以失败测试实现插件加载 bootstrap 与漂移保护

**文件：**

- 创建：`opencode/src/activation.ts`
- 创建：`opencode/src/bootstrap.ts`
- 创建：`opencode/scripts/resource-bootstrap.mjs`
- 修改：`opencode/src/index.ts`
- 修改：`opencode/scripts/postinstall.mjs`
- 创建：`__tests__/unit/opencode/bootstrap.test.js`

- [ ] **步骤 1：编写失败的 bootstrap 测试**

```js
test('plugin bootstrap projects discovery resources and records registered hooks', async () => {
  const result = await bootstrapPluginResources({
    pluginRoot,
    home,
    registeredHooks: ['tool.execute.before', 'tool.execute.after', 'event'],
  });

  assert.equal(result.state, 'verified');
  assert.ok(existsSync(join(home, '.config', 'opencode', 'skills', 'sdd-review', 'SKILL.md')));
  assert.deepEqual(readActivation(home).registered_hooks, [
    'tool.execute.before', 'tool.execute.after', 'event',
  ]);
});

test('plugin bootstrap preserves a user-modified managed skill and records degradation', async () => {
  installOwnedSkill(home, 'sdd-review', 'old content');
  writeFileSync(join(home, '.config', 'opencode', 'skills', 'sdd-review', 'SKILL.md'), 'user content');

  const result = await bootstrapPluginResources({ pluginRoot, home, registeredHooks: ['tool.execute.before'] });

  assert.equal(result.state, 'degraded');
  assert.equal(readFileSync(target, 'utf8'), 'user content');
  assert.deepEqual(readActivation(home).drifted_resources, [target]);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/bootstrap.test.js`

预期：FAIL，因为 bootstrap、activation schema 和资源投影尚不存在。

- [ ] **步骤 3：编写最少实现代码**

从 `postinstall.mjs` 提取所有权检查和目录复制为 `resource-bootstrap.mjs` 的显式 API。该 API 只处理 `oms-skills`、`.opencode/commands` 与委托技能；`hooks`、`lib`、`content`、`dist` 只在 npm 包根目录中使用。返回：

```js
{
  state: 'verified' | 'degraded' | 'failed',
  resource_digest: '<sha256>',
  drifted_resources: ['/absolute/path'],
  failed_resources: [],
}
```

在 `activation.ts` 用临时同目录文件加 `rename` 原子写入：

```ts
export type OpenCodeActivation = {
  schema_version: 1;
  plugin_version: string;
  resource_digest: string;
  activated_at: string;
  registered_hooks: string[];
  state: 'verified' | 'degraded' | 'failed';
  drifted_resources: string[];
  failed_resources: string[];
};
```

`bootstrap.ts` 校验包内 `hooks`、`lib`、`content` 和发现资源源目录存在，执行 shared bootstrap，并写 activation。 `index.ts` 在构造 hooks 后、返回 Hooks 前调用它：

```ts
export const OhMySddPlugin: Plugin = async () => {
  const hooks = createPlugin();
  const activation = await bootstrapPluginResources({
    pluginRoot: getPluginRoot(),
    registeredHooks: Object.keys(hooks),
  });
  if (activation.state === 'failed') throw new Error(activation.reason);
  log('info', 'oh-my-sdd opencode plugin loaded', { activation: activation.state });
  return hooks;
};
```

`degraded` 不阻止 hooks 注册，但必须记录并供 doctor 报告。 `postinstall.mjs` 仅保留调用 shared bootstrap 的兼容入口及告警；正确的生产路径是插件加载。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/bootstrap.test.js && (cd opencode && npm run typecheck)`

预期：PASS，TypeScript 无类型错误。

- [ ] **步骤 5：提交**

```bash
git add opencode/src/index.ts opencode/src/bootstrap.ts opencode/src/activation.ts opencode/scripts/resource-bootstrap.mjs opencode/scripts/postinstall.mjs __tests__/unit/opencode/bootstrap.test.js
git commit -m "feat(opencode): bootstrap discovery resources on plugin load" -m "Refs: #72"
```

### 任务 3：以失败测试将 activation 映射到 doctor 状态

**文件：**

- 修改：`install/hosts/opencode-adapter.js`
- 修改：`install/control-plane/health.js`
- 修改：`__tests__/unit/install/control-plane/health.test.js`
- 修改：`__tests__/unit/install/hosts/opencode-adapter.test.js`

- [ ] **步骤 1：编写失败的 doctor 测试**

```js
test('OpenCode doctor verifies loaded and enforced after matching activation', async () => {
  writeActivation(home, {
    schema_version: 1,
    plugin_version: '0.2.2',
    resource_digest: 'fixture-digest',
    activated_at: new Date().toISOString(),
    registered_hooks: ['tool.execute.before', 'tool.execute.after', 'event'],
    state: 'verified',
    drifted_resources: [],
    failed_resources: [],
  });

  const report = await doctor({ adapters: [OpenCodeAdapter] });
  assert.equal(report.hosts[0].evidence.loaded.state, 'verified');
  assert.equal(report.hosts[0].evidence.enforced.state, 'verified');
  assert.equal(report.findings.some((finding) => finding.code === 'runtime-loaded-unknown'), false);
});

test('OpenCode doctor keeps enforcement unknown without a write-before hook', async () => {
  writeActivation(home, validActivation({ registered_hooks: ['event'] }));

  const report = await doctor({ adapters: [OpenCodeAdapter] });
  assert.equal(report.hosts[0].evidence.loaded.state, 'verified');
  assert.equal(report.hosts[0].evidence.enforced.state, 'unknown');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/control-plane/health.test.js __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：FAIL，因为 adapter 目前硬编码 `loaded` 与 `enforced` 为 unknown。

- [ ] **步骤 3：编写最少实现代码**

在 `getOpenCodePaths()` 添加 activation 文件路径，并加入严格 JSON/schema 校验。 `inspectRuntime()` 采用以下转换：

```js
const loaded = activation.state === 'verified' || activation.state === 'degraded'
  ? { state: 'verified', evidence: `Plugin activation recorded at ${activation.activated_at}` }
  : { state: 'unknown', evidence: 'No matching OpenCode plugin activation was recorded', reason: DEFERRED_LOAD_ACTION };

const enforced = loaded.state === 'verified'
  && activation.registered_hooks.includes('tool.execute.before')
  ? { state: 'verified', evidence: 'Activation recorded tool.execute.before registration' }
  : { state: 'unknown', evidence: 'Activation lacks write-before hook registration', reason: 'Restart OpenCode after native plugin installation.' };
```

将 `postinstallEvidence()` 改为 bootstrap 证据，使用 activation 的漂移项和当前所有权摘要；doctor 对 degraded 资源继续生成 `resource-drifted` finding，但不把用户修改覆盖为安装失败。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/control-plane/health.test.js __tests__/unit/install/hosts/opencode-adapter.test.js __tests__/unit/install/opencode-closure.test.js`

预期：PASS；匹配 activation 无 runtime unknown finding，缺失 activation 仍有明确恢复提示。

- [ ] **步骤 5：提交**

```bash
git add install/hosts/opencode-adapter.js install/control-plane/health.js __tests__/unit/install/control-plane/health.test.js __tests__/unit/install/hosts/opencode-adapter.test.js
git commit -m "fix(opencode): verify runtime activation in doctor" -m "Refs: #72"
```

### 任务 4：端到端验证原生安装、重启与发布内容

**文件：**

- 修改：`__tests__/integration/opencode/install.test.js`
- 修改：`opencode/package.json`

- [ ] **步骤 1：编写失败的集成测试**

```js
test('native OpenCode install followed by plugin load refreshes sdd-review', async () => {
  const harness = await createOpenCodeHarness({ pluginPackage: packedTarball });
  await harness.runOmsInstall('opencode');
  assert.deepEqual(harness.opencodeCalls[0].args, [
    'plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force',
  ]);

  await harness.restartAndLoadPlugin();
  assert.match(harness.readSkill('sdd-review'), /原子 PR 交付/);
  assert.equal((await harness.doctor()).hosts[0].evidence.enforced.state, 'verified');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/integration/opencode/install.test.js`

预期：FAIL，因为当前集成流程模拟 postinstall，未运行原生 CLI 和插件 activation。

- [ ] **步骤 3：编写最少实现代码**

让 harness 以 fake `opencode` CLI 记录原生命令，并通过导入 tarball 中 `dist/index.js` 模拟重启加载。测试 tarball 必须包含：

```js
for (const required of [
  'dist/index.js',
  'hooks/pre-tool-use.js',
  'lib/rules.js',
  'content/enterprise-baseline.md',
  'oms-skills/sdd-review/SKILL.md',
  '.opencode/commands/sdd-review.md',
  'scripts/resource-bootstrap.mjs',
]) assert.ok(tarballFiles.has(required), required);
```

必要时更新 `opencode/package.json.files`，但不依赖 `postinstall` 被 OpenCode 执行。

- [ ] **步骤 4：运行受影响验证**

运行：

```bash
node --test __tests__/integration/opencode/install.test.js
node --test __tests__/unit/opencode/bootstrap.test.js __tests__/unit/install/opencode-closure.test.js
cd opencode && npm run typecheck
```

预期：全部 PASS。

- [ ] **步骤 5：运行完整门禁并提交**

运行：

```bash
npm test
npm run lint:baseline
git diff --check
```

预期：全部成功，且无 diff whitespace 错误。

提交：

```bash
git add opencode/package.json __tests__/integration/opencode/install.test.js
git commit -m "test(opencode): cover native plugin activation lifecycle" -m "Refs: #72"
```
