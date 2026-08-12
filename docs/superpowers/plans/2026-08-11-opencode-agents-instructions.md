# OpenCode 官方 Instructions 注入实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans（当前会话内联执行）逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 OpenCode 企业 baseline 从实验性 system transform 迁移到官方全局 `AGENTS.md`，并保证安装、升级、卸载安全且幂等。

**架构：** 新增一个纯 Node.js 的受管区块 helper，由 postinstall 和 uninstaller 共用；它只操作 `~/.config/opencode/AGENTS.md` 中的 oh-my-sdd sentinel 区块。TypeScript 插件移除 baseline transform，只保留工具、命令和事件 hooks。

**技术栈：** Node.js `node:test`、Node.js fs/path API、OpenCode TypeScript plugin SDK、npm lifecycle scripts。

---

## 文件职责

- 创建：`opencode/scripts/agents-md.mjs` — 受管区块的路径、upsert、remove 和跨平台可注入 path 实现。
- 修改：`opencode/scripts/postinstall.mjs` — 安装已打包 baseline 并记录结果。
- 修改：`opencode/scripts/uninstall.mjs` — 卸载时清理 baseline 区块。
- 修改：`opencode/src/index.ts`、`opencode/src/plugin.ts`、`opencode/src/config.ts` — 删除旧 transform 及无用配置。
- 删除：`opencode/src/baseline.ts` — 旧 system message 注入实现不再有调用者。
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`、`__tests__/unit/opencode/plugin.test.js`、`__tests__/integration/opencode/full-flow.test.js` — 覆盖新生命周期和 hook 合同。
- 修改：`README.md`、`INSTALL.md`、`opencode/README.md` — 更新注入机制说明。
- 修改：生成的 `opencode/dist/*` — 由 OpenCode build 生成并供根测试加载。

### 任务 1：受管 AGENTS.md helper（TDD）

**文件：**
- 创建：`opencode/scripts/agents-md.mjs`
- 测试：`__tests__/unit/opencode/resource-scripts.test.js`

- [ ] **步骤 1：编写失败测试**

在 `resource-scripts.test.js` 中导入 `getAgentsPath`、`upsertManagedAgentsBlock`、`removeManagedAgentsBlock`，添加以下行为测试：

```js
test('AGENTS helper creates one managed block and preserves user content', () => {
  const root = fixture();
  const file = join(root, '.config', 'opencode', 'AGENTS.md');
  const body = '## User rules\nkeep me\n';
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, { flag: 'a' });
  upsertManagedAgentsBlock(file, '## HARD_RULE\nno secrets');
  upsertManagedAgentsBlock(file, '## HARD_RULE\nupdated');
  const content = readFileSync(file, 'utf8');
  assert.equal(content.match(/OH-MY-SDD:BEGIN/g)?.length, 1);
  assert.match(content, /keep me/);
  assert.match(content, /updated/);
  assert.doesNotMatch(content, /no secrets/);
});

test('AGENTS helper removes only its block and deletes an empty plugin file', () => {
  const root = fixture();
  const file = join(root, 'AGENTS.md');
  upsertManagedAgentsBlock(file, '## Rule');
  assert.equal(removeManagedAgentsBlock(file), true);
  assert.equal(existsSync(file), false);
});

test('AGENTS helper resolves POSIX and Windows OpenCode config paths', () => {
  assert.equal(getAgentsPath('/home/alice', path.posix), '/home/alice/.config/opencode/AGENTS.md');
  assert.equal(getAgentsPath('C:\\Users\\alice', path.win32), 'C:\\Users\\alice\\.config\\opencode\\AGENTS.md');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js`

预期：FAIL，报错为新 helper 导出不存在，而不是测试语法错误。

- [ ] **步骤 3：实现最少 helper**

实现两个 sentinel 常量和三个导出函数：`getAgentsPath(home, pathImpl)` 使用 `pathImpl.join`；`upsertManagedAgentsBlock` 先用非贪婪正则移除旧区块，再保留用户内容并追加一个规范化区块；`removeManagedAgentsBlock` 只移除 sentinel 区块，文件剩余非空时写回，否则删除文件。读写异常由调用方处理，helper 不执行网络或 npm 操作。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js`

预期：该文件全部通过，已有资源 ownership 测试无回归。

- [ ] **步骤 5：提交**

```bash
git add opencode/scripts/agents-md.mjs __tests__/unit/opencode/resource-scripts.test.js
git commit -m "feat(opencode): add managed AGENTS baseline block"
```

### 任务 2：安装、升级、卸载生命周期

**文件：**
- 修改：`opencode/scripts/postinstall.mjs`
- 修改：`opencode/scripts/uninstall.mjs`
- 测试：`__tests__/unit/opencode/resource-scripts.test.js`
- 测试：`__tests__/integration/opencode/install.test.js`

- [ ] **步骤 1：编写失败测试**

添加 postinstall 的临时 HOME 测试：首次运行生成 `~/.config/opencode/AGENTS.md`，第二次运行只保留一个 sentinel，baseline 只包含 body（无 YAML frontmatter 和 Sync Impact Report），用户内容保持不变；添加 uninstaller 测试：只删除受管区块，用户内容保留，只有受管区块时删除文件。通过可注入 `agentsPath` 或 helper 选项避免修改真实 HOME。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js __tests__/integration/opencode/install.test.js`

预期：新安装/卸载断言失败，现有资源同步断言继续通过。

- [ ] **步骤 3：实现生命周期接线**

在 postinstall 中读取 `PLUGIN_ROOT/content/enterprise-baseline.md`，调用现有 `getBodyForInjection` 语义或等价的 frontmatter/Sync Report 清理逻辑，再调用 `upsertManagedAgentsBlock`；日志加入 agents 结果，读写失败沿用当前 warning/fail-open 行为。在 uninstall 的 `main` 参数中加入可测试的 `agentsPath`，调用 `removeManagedAgentsBlock`，并把结果纳入日志和返回值。不要把混合用户文件作为 ownership whole-file 资源记录。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js __tests__/integration/opencode/install.test.js`

预期：生命周期测试全部通过，skills/commands ownership 和 npm wrapper 行为不变。

- [ ] **步骤 5：提交**

```bash
git add opencode/scripts/postinstall.mjs opencode/scripts/uninstall.mjs __tests__/unit/opencode/resource-scripts.test.js __tests__/integration/opencode/install.test.js
git commit -m "fix(opencode): install and remove managed baseline block"
```

### 任务 3：移除插件 system transform

**文件：**
- 修改：`opencode/src/index.ts`
- 修改：`opencode/src/plugin.ts`
- 修改：`opencode/src/config.ts`
- 删除：`opencode/src/baseline.ts`
- 测试：`__tests__/unit/opencode/plugin.test.js`
- 测试：`__tests__/unit/opencode/config.test.js`
- 修改：`__tests__/integration/opencode/full-flow.test.js`

- [ ] **步骤 1：编写失败测试**

先将 plugin 合同改为断言 `hooks['experimental.chat.system.transform'] === undefined`，并断言工具、命令、event hooks 仍是函数；删除 full-flow 中调用旧 transform 的测试，增加“不注册 baseline transform”的合同断言。运行 `npm run build:opencode` 或 `cd opencode && npm run build`，确认旧实现仍被编译/测试引用，形成可诊断失败。

- [ ] **步骤 2：实现最少删除**

从 `createPlugin` 删除 transform 条目；从 `plugin.ts` 删除 `handleSystemTransform` 和 baseline import；从 config 类型、默认值及测试删除 `opencode_baseline_inject`；删除无调用者的 `baseline.ts`。保留 `opencode/lib/constitution.js`，因为它仍由根安装器的 baseline 校验测试使用，不属于 OpenCode transform 路径。

- [ ] **步骤 3：构建并验证通过**

运行：`cd opencode && npm run build && npm run typecheck`；再运行：`node --test __tests__/unit/opencode/plugin.test.js __tests__/unit/opencode/config.test.js __tests__/integration/opencode/full-flow.test.js`。

预期：TypeScript 编译、类型检查和相关测试通过，生成的 dist 不再注册 transform。

- [ ] **步骤 4：提交**

```bash
git add opencode/src opencode/dist __tests__/unit/opencode/plugin.test.js __tests__/unit/opencode/config.test.js __tests__/integration/opencode/full-flow.test.js
git commit -m "fix(opencode): remove baseline system transform hook"
```

### 任务 4：文档、打包和跨平台合同

**文件：**
- 修改：`README.md`
- 修改：`INSTALL.md`
- 修改：`opencode/README.md`
- 测试：相关 OpenCode package/integration tests

- [ ] **步骤 1：更新文档**

把旧的 `experimental.chat.system.transform` 注入说明改为全局 `~/.config/opencode/AGENTS.md` 官方 Rules/Instructions 机制，说明受管 sentinel、升级幂等和专用卸载命令；删除“Windows fallback 不支持”的表述，并保留其他宿主 baseline 行为说明。

- [ ] **步骤 2：运行定向验证**

运行：`cd opencode && npm run build && npm run typecheck`；运行：`node --test __tests__/unit/opencode/*.test.js __tests__/integration/opencode/install.test.js __tests__/integration/opencode/full-flow.test.js`；运行：`git diff --check`。

- [ ] **步骤 3：提交**

```bash
git add README.md INSTALL.md opencode/README.md
git commit -m "docs(opencode): document AGENTS baseline injection"
```

### 任务 5：全量验证与 PR

**文件：** 无新增实现文件；只检查已提交变更。

- [ ] **步骤 1：运行 OpenCode 与根项目验证**

运行：`cd opencode && npm run build && npm run typecheck`；回到仓库根目录运行：`npm test`、`npm run lint:baseline`、`git diff --check`。

- [ ] **步骤 2：审查范围和敏感内容**

运行：`git status --short`、`git diff origin/main...HEAD --stat`、`git diff origin/main...HEAD --check`，确认只包含 Issue #28 相关文件，未暂存用户文件、密钥或构建缓存。

- [ ] **步骤 3：提交并推送 PR**

若所有验证通过，运行 `git push -u origin fix/issue-28-opencode-agents-instructions`，创建目标为 `main` 的 draft PR，标题使用 `fix(opencode): use official AGENTS instructions for enterprise baseline`，正文包含根因、变更范围、验证结果和 `Closes #28`。
