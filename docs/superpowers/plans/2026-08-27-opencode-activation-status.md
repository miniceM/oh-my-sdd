# OpenCode activation status 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 `oms status --tool opencode` 在正常构建或重装后仍准确报告 OpenCode 的 HARD_RULE 强制执行证据。

**架构：** 共享 bootstrap 为 postinstall 提供真实的默认 hook 清单；运行期仍覆盖为实际注册的 hooks。激活记录保留 digest 字段但 status 不再以可变安装目录 digest 作为运行时证据的有效性条件，且 enforced 的 reason 仅在缺少写前 hook 时出现。

**技术栈：** Node.js ESM、TypeScript、Node 内置 `node:test` 与 `node:assert/strict`。

---

## 文件结构

- `opencode/scripts/resource-bootstrap.mjs`：定义并写入 postinstall 的默认 OpenCode hooks。
- `install/hosts/opencode-adapter.js`：验证 activation schema/时间/hooks，构造一致的 loaded/enforced 状态。
- `__tests__/unit/opencode/bootstrap.test.js`：验证 postinstall 默认 activation 记录。
- `__tests__/unit/install/hosts/opencode-adapter.test.js`：验证 digest 漂移、空 hooks 与 reason 的状态判定。

### 任务 1：postinstall 写入写前 hook

**文件：**
- 修改：`__tests__/unit/opencode/bootstrap.test.js:31-69`
- 修改：`opencode/scripts/resource-bootstrap.mjs:37-106`

- [ ] **步骤 1：编写失败的测试**

将现有 bootstrap 成功测试中的空 hook 断言替换为 postinstall 应有的真实 hook 清单：

```js
assert.deepEqual(activation.registered_hooks, [
  'tool.execute.before',
  'tool.execute.after',
  'command.execute.before',
]);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/bootstrap.test.js`

预期：FAIL，断言实际 `registered_hooks` 为 `[]` 而期望为包含 `tool.execute.before` 的数组。

- [ ] **步骤 3：编写最少实现代码**

在 `resource-bootstrap.mjs` 的模块常量区新增冻结的默认清单，并将 result 的 fallback 改为该清单：

```js
export const DEFAULT_REGISTERED_HOOKS = Object.freeze([
  'tool.execute.before',
  'tool.execute.after',
  'command.execute.before',
]);

// result
registered_hooks: options.registeredHooks ?? DEFAULT_REGISTERED_HOOKS,
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/bootstrap.test.js`

预期：PASS，所有 bootstrap 测试通过。

- [ ] **步骤 5：重构并回归**

确认运行期 `activatePlugin(Object.keys(hooks))` 仍显式覆盖默认值，不新增 postinstall 专用分支。

运行：`node --test __tests__/unit/opencode/bootstrap.test.js`

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add opencode/scripts/resource-bootstrap.mjs __tests__/unit/opencode/bootstrap.test.js
git commit -m "fix(opencode): preserve write-before hook in postinstall activation" -m "Refs #76"
```

### 任务 2：digest 漂移不使 activation 证据失效

**文件：**
- 修改：`__tests__/unit/install/hosts/opencode-adapter.test.js:83-106`
- 修改：`install/hosts/opencode-adapter.js:102-146`

- [ ] **步骤 1：编写失败的测试**

在 adapter 测试中新增直接调用 `inspectOpenCodeActivation` 的场景：使用现有 sandbox 和 injected `execFileSync`，写入一个带 `registered_hooks: ['tool.execute.before']`、但与安装快照不同的 `resource_digest` 的 activation record，并断言 `state === 'valid'`。另写入 `registered_hooks: []` 并断言 `state === 'invalid'`。

```js
assert.equal(JSON.parse(result.stdout).state, 'valid');
assert.equal(JSON.parse(emptyHooks.stdout).state, 'invalid');
```

将现有 digest mismatch runtime 测试从 unknown 断言改为：

```js
assert.equal(runtime.loaded.state, 'verified');
assert.equal(runtime.enforced.state, 'verified');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：FAIL，直接 probe 因 digest mismatch 返回 `invalid`，或旧测试仍期待 unknown。

- [ ] **步骤 3：编写最少实现代码**

从 `inspectOpenCodeActivation` 删除 npm-root 查询、`realpathSync` 和 `resourceDigest` 的比较路径；保留 `resource_digest` 为非空 string 的 schema 校验。empty hook array 不通过现有 `stringList` 校验，继续返回 invalid。

```js
if (age < 0 || age > ACTIVATION_TTL_MS) {
  return { state: 'invalid', path, reason: 'OpenCode activation is expired or has a future timestamp; restart OpenCode to refresh activation evidence.' };
}
return { state: 'valid', path, value };
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：PASS；digest mismatch 保留 verified 证据，空 hooks 仍被拒绝。

- [ ] **步骤 5：重构并回归**

移除变为未使用的 `buildNpmRootInvocation`、`resourceDigest`、`realpathSync` 相关 import 或辅助代码；保留 Windows npm-root invocation 的独立测试和导出，避免改动无关 CLI 行为。

运行：`node --test __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add install/hosts/opencode-adapter.js __tests__/unit/install/hosts/opencode-adapter.test.js
git commit -m "fix(opencode): keep activation evidence valid across digest drift" -m "Refs #76"
```

### 任务 3：仅在确实缺少 hook 时输出 reason

**文件：**
- 修改：`__tests__/unit/install/hosts/opencode-adapter.test.js:72-115`
- 修改：`install/hosts/opencode-adapter.js:342-391`

- [ ] **步骤 1：编写失败的测试**

在现有 `doctor verifies loaded and enforced` 测试中增加：

```js
assert.equal(runtime.enforced.reason, null);
```

并在 `does not infer write enforcement` 测试中保留并加强：

```js
assert.equal(runtime.enforced.reason, 'OpenCode activation does not include tool.execute.before.');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：FAIL，已 verified 的 enforced 目前仍含缺 hook reason。

- [ ] **步骤 3：编写最少实现代码**

在 `OpenCodeAdapter.inspectRuntime` 中让 reason 服从 `writeBeforeRegistered`：

```js
reason: writeBeforeRegistered
  ? null
  : (active
    ? 'OpenCode activation does not include tool.execute.before.'
    : (activation.reason || 'Write prevention evidence requires active runtime')),
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：PASS；verified enforcement 无 reason，缺 hook 的 activation 保留准确 reason。

- [ ] **步骤 5：重构并回归**

检查 `loaded` 与 `enforced` 的状态均来自同一个 active activation，并保留 degraded activation 的 postinstall drift 报告。

运行：`node --test __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add install/hosts/opencode-adapter.js __tests__/unit/install/hosts/opencode-adapter.test.js
git commit -m "fix(opencode): align verified enforcement reason" -m "Refs #76"
```

### 任务 4：全量回归与验收

**文件：**
- 验证：`opencode/scripts/resource-bootstrap.mjs`
- 验证：`install/hosts/opencode-adapter.js`
- 验证：`__tests__/unit/opencode/bootstrap.test.js`
- 验证：`__tests__/unit/install/hosts/opencode-adapter.test.js`

- [ ] **步骤 1：运行针对性回归**

运行：`node --test __tests__/unit/opencode/bootstrap.test.js __tests__/unit/install/hosts/opencode-adapter.test.js`

预期：PASS。

- [ ] **步骤 2：运行全量测试**

运行：`npm test`

预期：PASS，Node 内置测试 runner 无失败用例。

- [ ] **步骤 3：执行变更检查**

运行：`git diff origin/main...HEAD --check && git status --short`

预期：无 whitespace error；仅 Issue #76 范围内的计划、实现和测试文件。
