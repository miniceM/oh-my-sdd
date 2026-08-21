# 交互式安装宿主选择实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 TTY 中让 `oms-install` 以键盘菜单选择多宿主目标，并在正常安装开头显示项目 Logo，同时不破坏非交互与 JSON 调用方。

**架构：** `bin/oms-install.js` 保持安装编排职责，抽出一个可注入流和 TTY 状态的菜单函数。菜单得到宿主 ID 后，CLI 再调用现有 `main({ tool, dryRun: true })` 构造单宿主计划；`install/main.js` 和各 adapter 不感知交互行为。Logo 渲染重用 `oms-welcome.js` 的 ASCII 常量，但提供窄的 installer banner 函数。

**技术栈：** Node.js ESM、`node:readline`、Node 内置测试运行器（`node:test`、`node:assert/strict`）。

---

## 文件结构

- 修改：`bin/oms-welcome.js` — 导出只含 Logo 和产品标识的 installer banner，保留现有登录欢迎页。
- 修改：`bin/oms-install.js` — 判断交互资格、绘制/读取 TTY 选择菜单，并在选择后重新计划。
- 修改：`__tests__/unit/bin/oms-install.test.js` — 测试 Logo 输出、TTY 选择、非 TTY 回退与确认后的安装调用。
- 创建：`__tests__/unit/bin/oms-welcome.test.js` — 固定 installer banner 的无用户名输出契约。

### 任务 1：建立交付分支

**文件：**

- 已创建：GitHub Issue #63（验收标准）
- 创建：`feat/issue-63-interactive-installer-selection` 分支

- [ ] **步骤 1：核实 GitHub 身份和目标仓库**

运行：`gh auth status && gh repo view miniceM/oh-my-sdd --json nameWithOwner,url`

预期：认证账户可用，命令输出唯一目标仓库标识。

- [x] **步骤 2：创建包含可验证 checklist 的 Issue**

准备 Issue 正文，至少包含：TTY 菜单、非 TTY 回退、`y/N` 二次确认、Logo、`--json` stdout 纯净性五项 `- [ ]` 验收标准；随后运行：

```bash
gh issue create --repo miniceM/oh-my-sdd --title "feat: add interactive oms-install host selection" --body-file /tmp/oms-install-issue.md
```

预期：命令返回 Issue URL 和编号。

- [ ] **步骤 3：从最新 main 创建专用分支**

运行：

```bash
git fetch origin main
git switch -c feat/issue-63-interactive-installer-selection origin/main
```

预期：`git branch --show-current` 输出该 Issue 分支，且工作区干净。

### 任务 2：为 installer banner 建立红灯测试

**文件：**

- 修改：`__tests__/unit/bin/oms-welcome.test.js`
- 修改：`__tests__/unit/bin/oms-install.test.js`
- 修改：`bin/oms-welcome.js`

- [ ] **步骤 1：编写 banner 的失败测试**

在 `__tests__/unit/bin/oms-welcome.test.js` 断言新导出 `installerBanner()` 含 `____`、`oh-my-sdd`，但不含 `Quick start`：

```js
test('installerBanner renders the shared logo without login welcome content', () => {
  const output = installerBanner();
  assert.match(output, /____/);
  assert.match(output, /oh-my-sdd/);
  assert.doesNotMatch(output, /Quick start/);
});
```

在 installer 单元测试将 stderr 设为可收集对象，断言常规安装写入 banner，而 JSON 模式的 stdout 可被 `JSON.parse()` 解析且不匹配 ASCII Logo。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/bin/oms-welcome.test.js __tests__/unit/bin/oms-install.test.js`

预期：FAIL，原因是 `installerBanner` 尚未导出且 installer 尚未调用它。

- [ ] **步骤 3：以最小实现提供 banner**

在 `bin/oms-welcome.js` 增加：

```js
function installerBanner() {
  return ['', ...LOGO.map((line) => `${CYAN}${BOLD}${line}${RESET}`), '',
    `  ${BOLD}oh-my-sdd${RESET} ${DIM}多工具安装器${RESET}`, ''].join('\n');
}
```

在 `bin/oms-install.js` 导入 `installerBanner`，仅在安装 action 进入计划流程后执行 `stderr.write(installerBanner() + '\n')`；即使 `--json` 也只写 stderr，`--help` 和 `--version` 的早退路径不写 banner。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/bin/oms-welcome.test.js __tests__/unit/bin/oms-install.test.js`

预期：PASS。

### 任务 3：为 TTY 宿主菜单建立红灯测试

**文件：**

- 修改：`__tests__/unit/bin/oms-install.test.js`
- 修改：`bin/oms-install.js`

- [ ] **步骤 1：编写选择菜单的失败测试**

为 `runOmsInstall()` 注入 `isInteractiveFn: () => true` 和模拟流，向菜单发送 `\x1b[B\r`；断言第二个调用为 `{ tool: 'kilocode', dryRun: true }`，且输出包含 Claude 和 KiloCode。另写非 TTY 测试，注入 `isInteractiveFn: () => false`，断言退出码 2 和没有第二次 `mainFn` 调用。

```js
assert.deepEqual(calls, [
  { tool: null, dryRun: true },
  { tool: 'kilocode', dryRun: true },
  { tool: 'kilocode', plan: selectedPlan },
]);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/bin/oms-install.test.js`

预期：FAIL，原因是多宿主计划当前直接返回退出码 2。

- [ ] **步骤 3：实现最小的 raw-mode 菜单与计划重建**

在 `bin/oms-install.js` 添加可测试的 `selectHost()` 与 `isInteractive()`；只接受 `selection_candidates`（没有时从 `selection_options` 补齐 ID/展示名）。菜单进入时设置 raw mode、隐藏光标，`\x1b[A`/`\x1b[B` 环绕更新索引，`\r` 返回所选 ID。所有 resolve/reject/`Ctrl-C` 分支在 `finally` 中恢复 raw mode、暂停输入、移除 data listener 并显示光标。

在 `runOmsInstall()` 将现有 `selection_required` 分支替换为：满足 TTY 条件时选 ID，执行 `plan = await mainFn({ tool: selectedTool, dryRun: true })`，再走既有渲染和确认分支；不满足时保留 `writeSelectionRequired()` 与退出码 2。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/bin/oms-install.test.js`

预期：PASS，包括已有 `--tool`、取消和 `-y` 行为。

### 任务 4：端到端验证和交付检查

**文件：**

- 修改：`bin/oms-install.js`
- 修改：`bin/oms-welcome.js`
- 修改：`__tests__/unit/bin/oms-install.test.js`
- 创建：`__tests__/unit/bin/oms-welcome.test.js`

- [ ] **步骤 1：运行定向回归测试**

运行：`node --test __tests__/unit/bin/oms-install.test.js __tests__/unit/bin/oms-welcome.test.js`

预期：PASS，无未处理的监听器、raw mode 或 ANSI 输出断言失败。

- [ ] **步骤 2：运行全量项目门禁**

运行：

```bash
npm test
npm run lint:baseline
git diff --check
```

预期：三条命令均成功退出；`git diff --check` 无空白错误。

- [ ] **步骤 3：创建符合 Conventional Commits 的提交**

运行：

```bash
git add bin/oms-install.js bin/oms-welcome.js __tests__/unit/bin/oms-install.test.js __tests__/unit/bin/oms-welcome.test.js
git commit -m "feat: add interactive installer host selection" -m "Refs #63"
```

预期：提交仅包含 Issue 范围文件。

- [ ] **步骤 4：核验 Issue 验收标准后创建 PR**

运行：`gh issue view 63 --repo miniceM/oh-my-sdd --json title,body,state,url`

预期：Issue 为 OPEN，含验收标准 checklist。逐项将任务 2–4 的命令和结果记入 PR 正文，然后运行 `git push -u origin feat/issue-63-interactive-installer-selection` 与 `gh pr create --repo miniceM/oh-my-sdd --base main --body-file /tmp/oms-install-pr.md`。
