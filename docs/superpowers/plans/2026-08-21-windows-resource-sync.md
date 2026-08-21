# Windows resource sync implementation plan

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 OpenCode 资源同步在企业 Windows 目录监控场景下避免无意义的目录替换，并在真实替换遇到持续句柄占用时提供更长、更可诊断的退避重试。

**架构：** `syncResourceTree()` 继续在跨进程锁内执行 staging → backup → destination 的原子替换。它先对过滤后的源/目标树做内容指纹比较；相同则直接返回，变化时通过带总时限的 `renameWithRetry()` 完成带操作上下文的重命名。

**技术栈：** Node.js ESM、`node:fs`、`node:crypto`、Node 内置 `node:test`、GitHub Actions。

---

### 任务 1：为已同步目录增加 no-op 防护

**文件：**
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`
- 修改：`opencode/scripts/copy-resources.mjs`

- [ ] **步骤 1：编写失败测试**

在资源同步测试文件中增加一个真实临时目录测试：源目录和目标目录各包含相同的文件；通过注入 `renameSync` 在任何调用时抛出错误；调用 `syncResourceTree()` 后断言成功且目标文件仍存在。该测试必须验证相同树不进入 staging/rename 路径，而不是只断言最终文件内容。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js`

预期：新增测试失败，注入的 `renameSync` 被当前实现调用。

- [ ] **步骤 3：编写最少实现代码**

在 `opencode/scripts/copy-resources.mjs` 中加入使用 `createHash`、`readdirSync` 和现有 `shouldCopy()` 的递归树指纹函数。指纹必须包含相对路径、目录/文件类型和文件字节，并按名称排序；读取失败时返回“不可比较”，不能把错误当作相等。将比较放入 `withSyncLock()` 回调的最前面，只有 `treesEquivalent(src, dst)` 为真时直接返回。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js`

预期：新增 no-op 测试和既有资源同步测试全部通过。

- [ ] **步骤 5：Commit**

```bash
git add -- __tests__/unit/opencode/resource-scripts.test.js opencode/scripts/copy-resources.mjs
git commit -m "fix(opencode): skip unchanged resource directory swaps" -m "Refs #57"
```

### 任务 2：将 Windows rename 重试改为带诊断的总时限退避

**文件：**
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`
- 修改：`opencode/scripts/copy-resources.mjs`

- [ ] **步骤 1：编写失败测试**

将现有一次性锁测试保留为成功回归，并新增持续锁测试：注入 `renameSync` 对目标到 backup 的每次调用都抛出 `EPERM`，设置很小的 `renameTimeoutMs` 和 `renameDelayMs`，断言抛错信息同时包含 `destination-to-backup`、目标路径、`EPERM` 和 `attempts=`，并断言旧文件仍存在、新文件不存在。更新现有重试测试使用总时限配置，而不是依赖固定调用次数。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js`

预期：新增测试失败，因为当前实现没有 `renameTimeoutMs` 语义，也不会为 rename 错误补充操作和重试上下文。

- [ ] **步骤 3：编写最少实现代码**

将 `renameWithRetry()` 改为接受 `{ operation, timeoutMs, delayMs, maxDelayMs }`，默认总时限设为明显高于当前约 2 秒的有限窗口；只对 `EPERM`、`EBUSY`、`EACCES` 重试，使用 `Math.min()` 控制递增等待并在总时限耗尽后包装最后一个错误。包装错误保留 `code` 和 `cause`，消息包含操作、from/to、attempts 和 elapsedMs。让 backup、staging、restore 三类 rename 分别传入稳定的操作名；保留 `renameAttempts`/`renameDelayMs` 的兼容注入仅在现有测试需要时，生产默认路径使用总时限。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js`

预期：资源同步相关测试全部通过，持续锁测试在毫秒级测试配置下完成。

- [ ] **步骤 5：Commit**

```bash
git add -- __tests__/unit/opencode/resource-scripts.test.js opencode/scripts/copy-resources.mjs
git commit -m "fix(opencode): diagnose persistent Windows rename locks" -m "Refs #57"
```

### 任务 3：让 CI 显式覆盖重复同步契约

**文件：**
- 修改：`.github/workflows/opencode-e2e.yml`
- 修改：`__tests__/unit/opencode/e2e-harness.test.js`

- [ ] **步骤 1：编写失败测试**

扩展 OpenCode E2E workflow contract 测试，读取工作流文本并断言 `npm run sync:resources --prefix opencode` 至少出现两次。当前工作流只有一次调用，因此测试必须失败。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/e2e-harness.test.js`

预期：新增 contract 测试失败，报告工作流只执行一次资源同步。

- [ ] **步骤 3：编写最少实现代码**

在 `.github/workflows/opencode-e2e.yml` 中把资源同步步骤改为连续执行两次，第二次针对已经物化的目标树验证 no-op 路径；保留后续资源脚本测试和 E2E 步骤不变。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/e2e-harness.test.js`

预期：workflow contract 测试全部通过。

- [ ] **步骤 5：Commit**

```bash
git add -- .github/workflows/opencode-e2e.yml __tests__/unit/opencode/e2e-harness.test.js
git commit -m "test(ci): cover repeated OpenCode resource sync" -m "Refs #57"
```

### 任务 4：全量验证与交付

**文件：**
- 验证：`opencode/scripts/copy-resources.mjs`
- 验证：`__tests__/unit/opencode/resource-scripts.test.js`
- 验证：`.github/workflows/opencode-e2e.yml`

- [ ] **步骤 1：运行目标测试**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js __tests__/unit/opencode/e2e-harness.test.js`

- [ ] **步骤 2：运行全量测试和基线检查**

运行：`npm test`、`npm run lint:baseline`、`git diff --check`

预期：测试无失败，基线 lint 通过，diff 无空白错误。

- [ ] **步骤 3：检查提交范围和敏感文件**

运行：`git status --short`、`git diff origin/main..HEAD --stat`、`git diff origin/main..HEAD --check`

确认只包含 Issue 57 的设计文档、资源同步实现/测试和 CI 契约，不暂存无关文件或敏感文件。

- [ ] **步骤 4：请求代码审查**

以设计文档、Issue 57 和 `origin/main..HEAD` 差异为上下文执行代码审查；Critical/Important 问题修复后再继续。

- [ ] **步骤 5：推送并创建 Draft PR**

推送：`git push -u origin fix/issue-57-windows-resource-sync`

创建目标为 `main` 的 Draft PR，正文包含变更范围、验证结果、CI 与内网差异说明及 `Closes #57`。
