# Claude CLI 可选安装实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 未安装或不可执行 Claude CLI 时，安装器成功跳过 Claude 专属步骤。

**架构：** 在 Claude adapter 内新增可注入的版本命令验证函数，并让 `isInstalled()` 仅依赖该函数。adapter 的未安装分支改为输出跳过提示并返回；通用安装入口保持不变。

**技术栈：** Node.js ESM、`node:test`、`node:child_process`。

---

## 文件结构

- 修改：`install/hosts/claude-adapter.js` — 验证 `claude --version` 可执行，并跳过不可用 Claude 的安装流程。
- 修改：`__tests__/unit/install/hosts/claude-adapter.test.js` — 覆盖 POSIX 与 Windows 的版本命令验证。
- 修改：`__tests__/unit/install/entrypoints.test.js` — 覆盖缺失 Claude 时入口成功退出和公开 API 成功返回。

### 任务 1：为可执行 Claude CLI 建立测试契约

**文件：**

- 修改：`__tests__/unit/install/hosts/claude-adapter.test.js`
- 修改：`__tests__/unit/install/entrypoints.test.js`

- [x] **步骤 1：编写失败的测试（RED）**

导入新的 `isClaudeCliAvailable` 导出，并添加使用注入的 `execFileSync` 替身的测试：

```js
assert.equal(isClaudeCliAvailable({
  execFileSyncFn(command, args) {
    assert.equal(command, 'claude');
    assert.deepEqual(args, ['--version']);
  },
  platform: 'linux',
}), true);

assert.equal(isClaudeCliAvailable({
  execFileSyncFn() { throw new Error('ENOENT'); },
  platform: 'win32',
}), false);
```

将入口测试改为断言 `PATH` 为空时 `install.js` 以状态码 `0` 退出且输出“跳过 Claude 专属安装步骤”；将公开 API 测试改为断言 `main({ tool: 'claude' })` resolve 而不是抛出 `OMS_CLAUDE_NOT_FOUND`。

- [x] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/hosts/claude-adapter.test.js __tests__/unit/install/entrypoints.test.js`

预期：FAIL，因为 `isClaudeCliAvailable` 尚未导出，且当前入口仍以 `OMS_CLAUDE_NOT_FOUND` 失败。

### 任务 2：实现可选 Claude 分支并验证（GREEN → REFACTOR）

**文件：**

- 修改：`install/hosts/claude-adapter.js`
- 测试：`__tests__/unit/install/hosts/claude-adapter.test.js`
- 测试：`__tests__/unit/install/entrypoints.test.js`

- [x] **步骤 1：编写最少实现（GREEN）**

添加可导出的 `isClaudeCliAvailable`，使用 `buildClaudeInvocation(['--version'], { platform, comspec })` 获取跨平台命令，并以 `execFileSync(..., { stdio: 'ignore' })` 判断成功退出：

```js
export function isClaudeCliAvailable({
  execFileSyncFn = execFileSync,
  platform = process.platform,
  comspec = process.env.ComSpec,
} = {}) {
  const { command, args } = buildClaudeInvocation(['--version'], { platform, comspec });
  try {
    execFileSyncFn(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
```

令 `ClaudeAdapter.isInstalled()` 返回该函数结果。将 `install()` 中的未安装分支替换为一条可操作的跳过提示并 `return false`，不要创建 Claude 专属产物或执行 marketplace、plugin、wrapper 操作。

- [x] **步骤 2：运行目标测试验证通过**

运行：`node --test __tests__/unit/install/hosts/claude-adapter.test.js __tests__/unit/install/entrypoints.test.js`

预期：PASS，缺失 CLI 的两个入口断言成功，版本命令验证在 POSIX 与 Windows 参数下通过。

- [x] **步骤 3：重构与全量回归（REFACTOR）**

检查重复导入与消息措辞，保持 helper 单一职责；运行：`npm test`、`npm run lint:baseline` 和 `git diff --check`。

预期：全量测试和 baseline lint 通过，diff 无空白错误。

- [x] **步骤 4：提交**

```bash
git add install/hosts/claude-adapter.js __tests__/unit/install/hosts/claude-adapter.test.js __tests__/unit/install/entrypoints.test.js docs/superpowers/plans/2026-08-11-optional-claude-cli.md
git commit -m "fix: skip Claude setup when CLI is unavailable" -m "Closes #22"
```
