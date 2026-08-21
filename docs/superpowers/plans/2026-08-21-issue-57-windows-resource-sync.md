# Windows resource sync resilience implementation plan

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans（逐任务实现此计划）。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 OpenCode 资源同步在企业 Windows 外部进程持有目录句柄时减少无意义的 rename，并对真实变更提供有截止时间的安全重试。

**架构：** `syncResourceTree()` 在现有跨进程锁内先比较经过 `shouldCopy()` 过滤的源/目标树；一致时直接返回。树有变化时仍复制到 staging，再以 backup + 原子 rename 替换目标。rename 仅重试 Windows 瞬时错误，直到配置的截止时间或测试注入的最大次数；超时错误携带操作上下文。

**技术栈：** Node.js 18+、`node:fs`、`node:crypto`、`node:test`、GitHub Actions YAML。

---

### 任务 1：锁定失败行为

**文件：**
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`
- 修改：`__tests__/unit/opencode/e2e-harness.test.js`

- [ ] **步骤 1：添加等价目标不 rename 的失败测试**

在现有资源同步测试附近添加一个源目录和内容完全相同的目标目录，并注入 `renameSync`。断言同步成功、注入的 rename 未被调用、文件内容保持不变。

```js
test('resource sync skips replacement when the filtered destination is current', () => {
  const root = fixture();
  try {
    const src = join(root, 'src');
    const dst = join(root, 'dst');
    mkdirSync(src, { recursive: true });
    mkdirSync(dst, { recursive: true });
    writeFileSync(join(src, 'same.txt'), 'same');
    writeFileSync(join(dst, 'same.txt'), 'same');

    let renameCalls = 0;
    syncResourceTree(src, dst, {
      renameSync: () => {
        renameCalls += 1;
        throw new Error('rename should not run for an equivalent tree');
      },
    });

    assert.equal(renameCalls, 0);
    assert.equal(readFileSync(join(dst, 'same.txt'), 'utf8'), 'same');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **步骤 2：添加持续锁诊断失败测试**

注入对 backup rename 持续抛出 `EPERM`，配置 `renameAttempts: 3` 和 `renameDelayMs: 1`，断言错误包含 `destination-to-backup`、`EPERM` 和尝试次数，并断言旧目标仍完整。

```js
assert.throws(
  () => syncResourceTree(src, dst, {
    renameAttempts: 3,
    renameDelayMs: 1,
    renameSync: (from, to) => {
      if (to.includes('.oh-my-sdd-sync.backup-')) {
        const error = new Error('destination locked');
        error.code = 'EPERM';
        throw error;
      }
      return renameSync(from, to);
    },
  }),
  /destination-to-backup.*EPERM.*3 attempts/,
);
```

- [ ] **步骤 3：添加 CI 重复同步契约失败测试**

读取 `.github/workflows/opencode-e2e.yml`，断言工作流有明确的重复同步步骤，且 `npm run sync:resources --prefix opencode` 出现两次。当前工作流只出现一次，因此该测试先失败。

- [ ] **步骤 4：运行红灯测试**

运行：

```bash
node --test __tests__/unit/opencode/resource-scripts.test.js __tests__/unit/opencode/e2e-harness.test.js
```

预期：新增等价目标测试、持续锁诊断测试和 CI 重复同步契约测试失败；失败原因应分别是 rename 未被跳过、错误缺少操作上下文、工作流缺少第二次同步，而不是测试语法或 fixture 错误。

### 任务 2：实现安全同步行为

**文件：**
- 修改：`opencode/scripts/copy-resources.mjs`

- [ ] **步骤 1：添加过滤树指纹辅助函数**

引入 `createHash`、`readdirSync`，实现按稳定相对路径和文件字节生成 SHA-256 指纹的辅助函数。遍历每层目录时过滤 `EXCLUDE_BASENAMES` 并排序，避免平台目录顺序影响结果；比较失败时返回“不可比较”，由调用者走完整 staging 流程。

- [ ] **步骤 2：在锁内增加等价树短路**

在 `withSyncLock()` 的操作函数最前面判断目标存在且源/目标过滤树指纹一致；一致时返回 `undefined`，不创建 staging、不调用 rename。目标缺失、内容不同或读取比较失败时继续现有流程。

- [ ] **步骤 3：把 rename 重试改为截止时间 + 退避**

保留 `EPERM`、`EBUSY`、`EACCES` 白名单，默认使用明确的总超时和递增 delay；`renameAttempts` 继续作为可注入的测试上限。每个调用传入 `destination-to-backup`、`staging-to-destination` 或 `restore-backup` 操作名。截止后创建包含操作、错误码、尝试次数、耗时和源/目标路径的错误，并保留现有完整目标。

- [ ] **步骤 4：运行绿灯目标测试**

运行：

```bash
node --test __tests__/unit/opencode/resource-scripts.test.js __tests__/unit/opencode/e2e-harness.test.js
```

预期：任务 1 的新增测试通过，既有资源同步测试也通过。

### 任务 3：强化 CI 的重复同步路径

**文件：**
- 修改：`.github/workflows/opencode-e2e.yml`

- [ ] **步骤 1：增加第二次同步步骤**

在现有 `npm run sync:resources --prefix opencode` 后增加命名步骤，再次执行同一命令。第二次运行必须针对第一次已经物化的目标目录，覆盖实际 CI runner 上的 no-op 路径。

- [ ] **步骤 2：运行 CI 契约测试**

运行：

```bash
node --test __tests__/unit/opencode/e2e-harness.test.js
```

预期：工作流重复同步断言通过。

### 任务 4：完整验证与交付

**文件：**
- 修改：`opencode/scripts/copy-resources.mjs`
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`
- 修改：`__tests__/unit/opencode/e2e-harness.test.js`
- 修改：`.github/workflows/opencode-e2e.yml`

- [ ] **步骤 1：运行完整测试和质量门禁**

运行：

```bash
npm test
npm run lint:baseline
git diff --check
```

预期：测试、基线校验和 diff 检查全部通过。

- [ ] **步骤 2：检查变更范围和敏感文件**

运行：

```bash
git status --short
git diff --stat origin/main...HEAD
git diff --cached --check
```

只允许 Issue 57 范围内的设计、计划、同步器、测试和 CI 文件进入提交。

- [ ] **步骤 3：请求代码审查并处理 Critical/Important 问题**

以设计文档、Issue 57 和测试结果为上下文审查 `origin/main...HEAD`。所有 Critical/Important 问题在创建 PR 前修复并重新运行相关测试。

- [ ] **步骤 4：推送 Issue 分支并创建 Draft PR**

使用 `git push -u origin fix/issue-57-windows-resource-sync`，创建目标为 `main` 的 Draft PR，正文包含根因、CI 未暴露原因、验证命令、已知限制，并关联 `Closes #57`。
