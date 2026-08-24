# OpenCode 安装状态输出实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** OpenCode 安装将待宿主加载的资源作为单条后续操作呈现，而不报为 warning；npm 全局符号链接下的 `oms` 子命令正常输出报告。

**架构：** 执行器新增 `deferred` 终态，保留机器可读事件但不作为 warning 或人类步骤输出。OpenCode adapter 对 postinstall/runtime 返回统一 deferred next action。CLI 入口比较模块和入口的真实路径，以支持 npm bin 符号链接。

**技术栈：** Node.js ESM、`node:test`、`node:assert/strict`、npm bin 符号链接。

---

## 文件结构

- 修改：`install/control-plane/executor.js` — 汇总 deferred 事件、后续操作及计数。
- 修改：`install/control-plane/render.js` — 人类可读安装结果隐藏 deferred 步骤。
- 修改：`install/hosts/opencode-adapter.js` — 将预期 postinstall/runtime 等待改为统一 deferred 状态。
- 修改：`bin/oms.js` — 用真实路径判断 npm 符号链接是否直接执行。
- 修改：`__tests__/unit/install/control-plane/executor.test.js` — 验证 deferred 汇总契约。
- 修改：`__tests__/unit/install/opencode-closure.test.js` — 验证 OpenCode 安装无 warning 且只有一条后续操作。
- 修改：`__tests__/unit/install/control-plane/render.test.js` — 验证文本安装结果不显示 deferred 步骤。
- 修改：`__tests__/unit/bin/oms.test.js` — 验证符号链接入口产生 status/doctor 报告。

### 任务 1：为 deferred 安装状态建立执行器契约

**文件：**
- 修改：`__tests__/unit/install/control-plane/executor.test.js`
- 修改：`install/control-plane/executor.js`

- [ ] **步骤 1：编写失败的测试**

```js
test('deferred steps do not count as warnings and retain one next action', () => {
  const result = summarizeExecution({ schema_version: 1, hosts: [] }, [
    { id: 'opencode:a', status: 'succeeded' },
    { id: 'opencode:b', status: 'deferred', next_action: 'Restart OpenCode to complete plugin loading.' },
    { id: 'opencode:c', status: 'deferred', next_action: 'Restart OpenCode to complete plugin loading.' },
  ]);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.summary.succeeded, 1);
  assert.equal(result.summary.warnings, 0);
  assert.equal(result.summary.deferred, 2);
  assert.deepEqual(result.summary.next_actions, ['Restart OpenCode to complete plugin loading.']);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/control-plane/executor.test.js`

预期：FAIL，因为 `summary.deferred` 尚未定义，deferred 事件未参与后续操作汇总。

- [ ] **步骤 3：编写最小实现代码**

```js
const deferredEvents = terminalEvents.filter((event) => event.status === 'deferred');
const nextActionEvents = [...failedEvents, ...unsupportedEvents, ...warningEvents, ...deferredEvents];
for (const event of nextActionEvents) {
  if (event.next_action && !nextActions.includes(event.next_action)) nextActions.push(event.next_action);
}
// 在 summary 中加入 deferred: deferredEvents.length
```

保持 deferred 不影响既有成功、warning、失败和 unsupported 的总体状态计算。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/control-plane/executor.test.js`

预期：PASS。

### 任务 2：把 OpenCode 的预期等待状态改为非告警后续操作

**文件：**
- 修改：`__tests__/unit/install/opencode-closure.test.js`
- 修改：`install/hosts/opencode-adapter.js`

- [ ] **步骤 1：替换 warning 断言，编写失败的安装测试**

```js
assert.equal(installation.status, 'succeeded');
assert.equal(installation.summary.warnings, 0);
assert.equal(installation.summary.deferred, 4);
assert.deepEqual(installation.summary.next_actions, [
  '重启 OpenCode 后完成插件加载；随后可运行 oms status --tool opencode 查看注册状态。',
]);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/opencode-closure.test.js`

预期：FAIL，因为 postinstall/runtime 仍返回 `warning`，且 adapter 仍追加 loaded/enforced 确认提示。

- [ ] **步骤 3：编写最小实现代码**

```js
const OPEN_CODE_PLUGIN_LOAD_ACTION =
  '重启 OpenCode 后完成插件加载；随后可运行 oms status --tool opencode 查看注册状态。';

if (resource?.phase === 'postinstall' || resource?.phase === 'runtime') {
  return {
    status: 'deferred',
    owned: resource.owned !== false,
    message: 'OpenCode plugin loading pending',
    next_action: OPEN_CODE_PLUGIN_LOAD_ACTION,
  };
}
```

删除 `OpenCodeAdapter.install()` 中要求确认 `loaded/enforced` 的额外 next action；跳过 deferred 事件的即时 announcement。保留 `inspectRuntime()` 对未知层的真实报告。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/opencode-closure.test.js`

预期：PASS。

### 任务 3：让成功安装文本仅显示成功步骤

**文件：**
- 修改：`__tests__/unit/install/control-plane/render.test.js`
- 修改：`install/control-plane/render.js`

- [ ] **步骤 1：编写失败的渲染测试**

```js
const text = renderResultText({
  status: 'succeeded',
  events: [
    { status: 'succeeded', host: 'opencode', message: 'Wrote config' },
    { status: 'deferred', host: 'opencode', message: 'commands pending OpenCode plugin loading' },
  ],
  summary: { succeeded: 1, failed: 0, warnings: 0, deferred: 1, total_steps: 2,
    next_actions: ['Restart OpenCode to complete plugin loading.'] },
});
assert.doesNotMatch(text, /commands pending/);
assert.doesNotMatch(text, /warnings/);
assert.match(text, /Restart OpenCode to complete plugin loading/);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/control-plane/render.test.js`

预期：FAIL，因为当前 renderer 会将未知终态显示为 `❌`。

- [ ] **步骤 3：编写最小实现代码**

```js
const terminalEvents = events.filter(
  (event) => event.status !== 'running' && event.status !== 'deferred',
);
```

保留 JSON 中的 deferred 计数和人类输出中的单条 Next actions，不显示 warning 文案或图标。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/control-plane/render.test.js`

预期：PASS。

### 任务 4：修复 npm 符号链接启动的 oms CLI

**文件：**
- 修改：`__tests__/unit/bin/oms.test.js`
- 修改：`bin/oms.js`

- [ ] **步骤 1：编写失败的符号链接入口测试**

```js
const linkDir = mkdtempSync(join(tmpdir(), 'oms-bin-link-'));
const link = join(linkDir, 'oms');
symlinkSync(CLI, link);
const status = await runOms(['status', '--tool', 'opencode'], { entry: link });
const doctor = await runOms(['doctor', '--tool', 'opencode'], { entry: link });
assert.match(status.stdout, /Status Report/);
assert.match(doctor.stdout, /Doctor Report/);
```

更新 `runOms`，将可选 `entry`（默认 `CLI`）传给 `spawn`；测试的 finally 块删除临时目录。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/bin/oms.test.js`

预期：FAIL，因为符号链接入口没有调用 `runOmsCli`，stdout 为空。

- [ ] **步骤 3：编写最小实现代码**

```js
import { readFileSync, realpathSync } from 'node:fs';

const canonical = (filePath) => {
  const absolute = path.resolve(filePath);
  try { return path.resolve(realpathSync(absolute)); } catch { return absolute; }
};
const modulePath = canonical(fileURLToPath(moduleUrl));
const entryPath = canonical(entryArg);
```

将这段逻辑置入 `isDirectExecution`，并保留 Windows 不区分大小写比较。这与 `bin/oms-install.js` 的已验证入口策略一致。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/bin/oms.test.js`

预期：PASS，符号链接入口的 status/doctor 均产生报告。

### 任务 5：全量验证与提交

**文件：**
- 修改：上述实现和测试文件。

- [ ] **步骤 1：运行范围测试**

```bash
node --test __tests__/unit/install/control-plane/executor.test.js
node --test __tests__/unit/install/opencode-closure.test.js
node --test __tests__/unit/install/control-plane/render.test.js
node --test __tests__/unit/bin/oms.test.js
```

预期：所有测试 PASS。

- [ ] **步骤 2：运行全量质量门禁**

```bash
npm test
git diff --check
git status --short
```

预期：测试通过、无 diff 空白错误，且暂存内容仅限 Issue #66 的实现与测试文件。

- [ ] **步骤 3：提交实现**

```bash
git add bin/oms.js install/control-plane/executor.js install/control-plane/render.js install/hosts/opencode-adapter.js __tests__/unit/bin/oms.test.js __tests__/unit/install/control-plane/executor.test.js __tests__/unit/install/control-plane/render.test.js __tests__/unit/install/opencode-closure.test.js
git commit -m 'fix: clarify OpenCode installation status' -m 'Refs #66'
```

预期：创建只包含 Issue #66 实现和测试的 Conventional Commit。
