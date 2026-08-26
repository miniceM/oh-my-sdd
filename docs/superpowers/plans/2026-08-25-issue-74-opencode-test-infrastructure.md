# Issue #74 OpenCode 测试基础设施实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在干净 checkout、macOS、Ubuntu、Windows 和 Node 18/20/22 上，以可重复的用户可观察行为验证 OpenCode 的安装、加载、规则阻断和 doctor 证据。

**架构：** 根 runner 先直接同步受忽略资源；共享 sandbox 隔离用户目录与 npm 状态；activation/doctor 接受默认值为系统时钟的注入时钟。真实 CLI E2E 是验证用户行为的少量关键旅程，helper 测试只验证这些旅程的可信度。

**技术栈：** Node.js 18+、`node:test`、Node `child_process`/`fs`、GitHub Actions、OpenCode CLI。

---

## 文件结构

- `scripts/run-tests.js`、`__tests__/unit/scripts/run-tests.test.js`：根命令显式准备资源。
- `__tests__/helpers/opencode-test-env.js`（新建）、`__tests__/helpers/opencode-e2e-harness.js`、相关 install/adapter 测试：可复用的隔离环境与跨平台 launcher。
- `opencode/scripts/resource-bootstrap.mjs`、`install/hosts/opencode-adapter.js`、其测试：固定 activation/doctor 时钟。
- `__tests__/integration/opencode/real-cli-e2e.test.js`、`.github/workflows/opencode-e2e.yml`、`__tests__/unit/opencode/e2e-harness.test.js`：Node 18/22 真实宿主验收和清理实现细节断言。

### 任务 1：让根测试命令自备发布资源

**文件：**

- 修改：`scripts/run-tests.js:10-79`
- 修改：`__tests__/unit/scripts/run-tests.test.js`

- [ ] **步骤 1：编写失败的测试**

导入待新增的 `OPENCODE_RESOURCE_SYNC_SCRIPT`、`syncOpenCodeResources` 与 `PROJECT_ROOT`。用 `EventEmitter` fake child 写入以下测试，并增加 exit 17 必须 reject 的测试：

```js
test('runner synchronizes generated OpenCode resources before tests', async () => {
  const calls = [];
  const child = new EventEmitter();
  await syncOpenCodeResources({ spawnFn(command, args, options) {
    calls.push({ command, args, options });
    queueMicrotask(() => child.emit('close', 0));
    return child;
  } });
  assert.deepEqual(calls, [{
    command: process.execPath,
    args: [OPENCODE_RESOURCE_SYNC_SCRIPT],
    options: { cwd: PROJECT_ROOT, stdio: 'inherit' },
  }]);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/scripts/run-tests.test.js`

预期：FAIL，缺少导出的资源准备函数或常量。

- [ ] **步骤 3：编写最少实现代码**

在 runner 中添加：

```js
const OPENCODE_RESOURCE_SYNC_SCRIPT = path.join(PROJECT_ROOT, 'opencode', 'scripts', 'copy-resources.mjs');
function syncOpenCodeResources({ spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(process.execPath, [OPENCODE_RESOURCE_SYNC_SCRIPT], { cwd: PROJECT_ROOT, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`OpenCode resource synchronization failed with code ${code ?? 1}`)));
  });
}
```

在 `main` 的 `findTests` 后、启动 Node test child 前执行 `await syncOpenCodeResources()`，并导出两项。不要增加 `pretest` lifecycle 或读取 CI YAML。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
node --test __tests__/unit/scripts/run-tests.test.js
rm -rf opencode/.opencode/skills
npm test
```

预期：第一项 PASS；runner 重新生成资源，`sdd-review` 不再 ENOENT，整套测试退出 0。

- [ ] **步骤 5：重构并回归**

确认 coverage 也经过相同 `main`。运行：`npm run test:coverage`。预期：同步后 coverage gate 通过。

- [ ] **步骤 6：Commit**

运行：`git add scripts/run-tests.js __tests__/unit/scripts/run-tests.test.js && git commit -m "[OMS74] test: prepare OpenCode resources in runner"`

### 任务 2：收敛隔离环境与 Windows launcher fixture

**文件：**

- 创建：`__tests__/helpers/opencode-test-env.js`
- 修改：`__tests__/helpers/opencode-e2e-harness.js:1-36`
- 修改：`__tests__/integration/opencode/install.test.js:19-65`
- 修改：`__tests__/unit/install/hosts/opencode-adapter.test.js:1-75`
- 修改：`__tests__/unit/opencode/e2e-harness.test.js:20-40`

- [ ] **步骤 1：编写失败的测试**

从新 helper 导入 `createOpenCodeTestSandbox` 与 `createFakeOpenCodeCli`。断言 sandbox 的 HOME、USERPROFILE、XDG_CONFIG_HOME、OPENCODE_CONFIG_DIR、npm prefix/cache 位于 root 下，PATH 使用 `path.delimiter`；用 `spawnSync` 真正调用 fake CLI 并断言调用日志为 plugin 安装参数，在 Windows 断言命令以 `.cmd` 结尾。

```js
const sandbox = createOpenCodeTestSandbox({ repoRoot: process.cwd() });
const cli = createFakeOpenCodeCli(sandbox);
const result = spawnSync(cli.command, cli.installArgs, { cwd: sandbox.projectDir, env: sandbox.env, encoding: 'utf8', shell: cli.shell });
assert.equal(result.status, 0, result.stderr);
assert.deepEqual(readJsonLines(cli.invocationLog), [cli.installArgs]);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/e2e-harness.test.js __tests__/integration/opencode/install.test.js`

预期：FAIL，找不到新 helper 导出。

- [ ] **步骤 3：编写最少实现代码**

新 helper 用 `mkdtempSync` 创建 root，并返回下列显式环境。`createFakeOpenCodeCli` 写入 Node `.mjs` 实现，只在 Windows 写 `.cmd` wrapper，POSIX 写可执行 wrapper：

```js
return {
  PATH: `${join(repoRoot, 'scripts')}${delimiter}${inherited.PATH ?? ''}`,
  HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: configHome,
  OPENCODE_CONFIG_DIR: join(configHome, 'opencode'),
  OPENCODE_CONFIG: join(configHome, 'opencode', 'opencode.json'),
  npm_config_prefix: join(root, 'prefix'), npm_config_cache: join(root, 'npm-cache'),
};
```

迁移现有 E2E sandbox、`createFakeOpenCode` 和 doctor child fixture；使用 `path.delimiter`、Windows junction 与 `.cmd`，不硬编码 `:`、POSIX symlink 或 Bash。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/e2e-harness.test.js __tests__/integration/opencode/install.test.js __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：PASS；Windows CI 实际执行 `.cmd` 与 junction。

- [ ] **步骤 5：重构并回归**

移除迁移后的局部 fake CLI 和重复 HOME/PATH 拼接。运行：`npm test`。预期：PASS。

- [ ] **步骤 6：Commit**

运行：`git add __tests__/helpers/opencode-test-env.js __tests__/helpers/opencode-e2e-harness.js __tests__/unit/opencode/e2e-harness.test.js __tests__/integration/opencode/install.test.js __tests__/unit/install/hosts/opencode-adapter.test.js && git commit -m "[OMS74] test: share cross-platform OpenCode fixtures"`

### 任务 3：使 activation 与 doctor 的时间证据可控

**文件：**

- 修改：`opencode/scripts/resource-bootstrap.mjs:22-104`
- 修改：`install/hosts/opencode-adapter.js:102-145`
- 修改：`__tests__/unit/opencode/bootstrap.test.js`
- 修改：`__tests__/unit/install/hosts/opencode-adapter.test.js`

- [ ] **步骤 1：编写失败的测试**

使用 `const NOW_MS = Date.parse('2026-01-01T00:00:00.000Z')`。让 doctor child script 调用 `OpenCodeAdapter.inspectRuntime({ now: () => NOW_MS })` 与 `doctor({ adapters: [OpenCodeAdapter], ctx: { now: () => NOW_MS } })`。分别断言 `NOW_MS - 1` 有效，`NOW_MS - 24*60*60*1000 - 1` 过期，`NOW_MS + 1` 未来，损坏 JSON 都生成 `runtime-loaded-unknown` 与 `runtime-enforced-unknown`。bootstrap 测试断言 `now: () => NOW_MS` 写入精确 `activated_at`。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/bootstrap.test.js __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：FAIL，activation 时间仍来自不可注入的 `Date.now()`。

- [ ] **步骤 3：编写最少实现代码**

在 bootstrap 读取一次时钟，在 doctor 读取 context 默认时钟：

```js
const now = options.now ?? Date.now;
const nowMs = now();
activated_at: new Date(nowMs).toISOString();

function readActivation({ now = Date.now, ...ctx } = {}) {
  const age = now() - Date.parse(value.activated_at);
}
```

保留 `OpenCodeAdapter.inspectRuntime(ctx)` 和 `doctor({ ctx })` 的既有 context 传递；生产调用不传 `now` 时继续使用系统时钟。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/bootstrap.test.js __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：PASS；doctor 仅在有效 activation 且有 `tool.execute.before` 时报告 verified。

- [ ] **步骤 5：重构并回归**

将 fixture 的动态 `Date.now()` 替为 `NOW_MS`。运行：`npm test`。预期：PASS。

- [ ] **步骤 6：Commit**

运行：`git add opencode/scripts/resource-bootstrap.mjs install/hosts/opencode-adapter.js __tests__/unit/opencode/bootstrap.test.js __tests__/unit/install/hosts/opencode-adapter.test.js && git commit -m "[OMS74] test: stabilize OpenCode activation evidence"`

### 任务 4：以真实 Node 18 宿主证明插件发现与规则阻断

**文件：**

- 修改：`__tests__/integration/opencode/real-cli-e2e.test.js:18-24,236-365`
- 修改：`.github/workflows/opencode-e2e.yml`
- 修改：`__tests__/unit/opencode/e2e-harness.test.js:113-158`

- [ ] **步骤 1：编写失败的测试**

将 E2E enabled 条件的期望设为 Node `[18, 22]`；workflow 测试只检查可执行 matrix 同时包含 18 和 22。删除“资源同步出现次数”“YAML shell 文本”这类不能证明用户行为的断言，保留真实 E2E 对 safe allow 和五类危险操作 deny 的断言。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/e2e-harness.test.js`

预期：FAIL，workflow 仍只有 Node 22。

- [ ] **步骤 3：编写最少实现代码**

将 `opencode-e2e.yml` matrix 设为 `os: [ubuntu-latest, macos-latest, windows-latest]` 与 `node: [18, 22]`，job 名称包括 OS 与 Node，`setup-node` 使用 `${{ matrix.node }}`。将 E2E 条件改为：

```js
const enabled = process.env.OMS_OPENCODE_E2E === '1' && [18, 22].includes(nodeMajor);
```

保留 `.js` loader 和相邻 `package.json` 的 `type: module`；它是 Node 18 的真实发现契约。

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
node --test __tests__/unit/opencode/e2e-harness.test.js
OMS_OPENCODE_E2E=1 OPENCODE_VERSION=1.18.15 npm run test:e2e:opencode
```

预期：unit PASS；Node 18/22 CI 中，打包插件被真实 CLI 加载，安全写入通过，AWS/OpenAI/`.env`/`rm -rf /`/force-push 都被阻止。

- [ ] **步骤 5：重构并回归**

确认 E2E assertion 都陈述用户行为或失败诊断。运行：`npm test && npm run test:coverage && npm run lint:baseline`。预期：PASS。

- [ ] **步骤 6：Commit**

运行：`git add .github/workflows/opencode-e2e.yml __tests__/integration/opencode/real-cli-e2e.test.js __tests__/unit/opencode/e2e-harness.test.js && git commit -m "[OMS74] test: verify OpenCode loading on Node 18"`

### 任务 5：完成交付验证

**文件：** 无；只允许修复前述任务发现的 #74 范围问题。

- [ ] **步骤 1：验证全量证据**

运行：`npm test && npm run test:coverage && npm run lint:baseline && git diff --check`

预期：根测试命令自行准备资源，coverage 不低于 80%，baseline 合法，diff 无空白错误。

- [ ] **步骤 2：验证 CI 用户旅程**

在 CI 完成后核对 Node 18/22 × macOS/Ubuntu/Windows 的 OpenCode E2E 未跳过，且每个平台具备 safe allow 与 AWS/OpenAI/`.env`/`rm -rf /`/force-push deny 日志证据。

- [ ] **步骤 3：提交最终验证记录**

运行：`git status --short && git log --oneline origin/main..HEAD`

预期：仅 #74 范围的已提交文件，无未预期变更；PR 描述逐项附上验收命令与 CI 结果。
