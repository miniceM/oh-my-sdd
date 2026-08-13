# OpenCode AGENTS 可靠性与请求隔离实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复 Issue #28 受管 `AGENTS.md` 的非原子覆盖风险，并用真实 OpenCode/Qwen-compatible 请求和 Windows 生命周期测试闭合剩余验收项。

**架构：** `agents-md.mjs` 提供同目录临时文件加原子 rename 的单文件更新边界，postinstall/uninstall 继续复用该边界。现有真实 CLI E2E provider 扩展为严格 system-message 校验器和请求 transcript 观察点，现有三平台 workflow 提供 Windows CRLF 生命周期证据。

**技术栈：** Node.js `node:test`、Node.js `fs`/`path` API、OpenCode CLI 1.18.15、OpenAI-compatible SSE provider、GitHub Actions Windows runner。

---

## 文件职责

- 修改：`opencode/scripts/agents-md.mjs` — 原子替换、权限继承和失败清理。
- 修改：`__tests__/unit/opencode/resource-scripts.test.js` — 原子写入失败与 CRLF 生命周期合同。
- 修改：`__tests__/integration/opencode/real-cli-e2e.test.js` — 严格 provider、请求分类、正常对话及内部请求隔离断言。
- 修改：`__tests__/helpers/opencode-e2e-harness.js` — 仅在跨平台 E2E 需要共享 transcript/环境辅助时修改。
- 修改：`.github/workflows/opencode-e2e.yml` — 保持三平台执行并暴露内部请求触发所需的固定参数。
- 修改：`__tests__/unit/opencode/e2e-harness.test.js` — 锁定 Windows runner 与 E2E 配置合同。
- 修改：`install/hosts/opencode-adapter.js` — 删除过期的 Windows 不支持注释。

### 任务 1：原子维护 AGENTS.md

**文件：**
- 修改：`opencode/scripts/agents-md.mjs`
- 测试：`__tests__/unit/opencode/resource-scripts.test.js`

- [ ] **步骤 1：编写失败测试**

新增可注入 fs 操作的测试：让临时文件 `writeFileSync` 抛错，断言原文件仍为 `# User\nkeep\n`；让 `renameSync` 抛错，断言原文件内容和 mode 不变；两种情况下目录中均不存在 `.oh-my-sdd-tmp-*` 残留。

- [ ] **步骤 2：运行测试验证正确失败**

运行：`node --test --test-name-pattern='AGENTS helper.*atomic|AGENTS helper.*failure' __tests__/unit/opencode/resource-scripts.test.js`

预期：FAIL，原因是 helper 尚不接受 fs 注入或仍调用目标文件上的 `writeFileSync`。

- [ ] **步骤 3：实现最少原子替换**

新增内部 `replaceFileAtomically(file, content, fsImpl)`：在 `dirname(file)` 创建带进程号和随机后缀的临时文件；存在目标时从 `statSync(file).mode` 取得权限并用于临时文件；完整写入后 `renameSync(temp, file)`；`finally` 在 rename 未成功时 `rmSync(temp, { force: true })`。`upsertManagedAgentsBlock` 和保留用户内容的 `removeManagedAgentsBlock` 调用它，仅插件内容为空的卸载继续删除文件。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js`

预期：全部通过，原子失败测试证明原文件不变。

- [ ] **步骤 5：提交**

```bash
git add opencode/scripts/agents-md.mjs __tests__/unit/opencode/resource-scripts.test.js
git commit -m "fix(opencode): atomically update managed AGENTS file" -m "Refs #28"
```

### 任务 2：Windows CRLF 完整生命周期

**文件：**
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`
- 修改：`install/hosts/opencode-adapter.js`

- [ ] **步骤 1：编写 Windows/CRLF 合同测试**

在生命周期测试中写入 `# User rules\r\nkeep me\r\n`，连续执行两次 postinstall 后断言用户前缀字节不变、sentinel 仅一个；执行 uninstaller 后断言文件精确恢复为原 CRLF 内容。加入源码合同断言，禁止 `opencode-adapter.js` 出现 `Windows 不支持`。

- [ ] **步骤 2：运行测试验证正确失败**

运行：`node --test --test-name-pattern='CRLF|Windows support' __tests__/unit/opencode/resource-scripts.test.js`

预期：至少过期注释合同 FAIL；若当前区块正则吞掉 CRLF，生命周期断言也 FAIL。

- [ ] **步骤 3：最少实现并验证**

删除过期注释；仅在失败测试证明需要时调整 sentinel 拼接/移除逻辑，保持区块外用户字节不变。

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js`

预期：全部通过；该文件在 GitHub `windows-latest` runner 上使用原生 Windows Node/fs 再执行一次。

- [ ] **步骤 4：提交**

```bash
git add install/hosts/opencode-adapter.js __tests__/unit/opencode/resource-scripts.test.js
git commit -m "test(opencode): cover Windows AGENTS lifecycle" -m "Refs #28"
```

### 任务 3：真实请求 transcript 与严格 Qwen-compatible provider

**文件：**
- 修改：`__tests__/integration/opencode/real-cli-e2e.test.js`
- 可选修改：`__tests__/helpers/opencode-e2e-harness.js`

- [ ] **步骤 1：编写 provider 请求分类失败测试**

提取纯函数按 message 内容和 OpenCode 请求特征将 transcript 分为 normal、title、summary/compaction，并测试严格校验：`messages[0]` 之后出现 `role: system` 时返回兼容 Qwen 的 400；normal 必须含唯一 baseline marker；internal 不得含 marker。

- [ ] **步骤 2：运行测试验证正确失败**

运行：`node --test --test-name-pattern='provider transcript|system message' __tests__/integration/opencode/real-cli-e2e.test.js`

预期：FAIL，缺少分类/校验函数或 transcript 尚未保存解析后的 messages。

- [ ] **步骤 3：实现严格 provider 与正常对话断言**

provider 解析 JSON body 并保存 `{ marker, messages, body }`；发现非首项 system 时返回 400 JSON 错误。安装完成后读取全局 `AGENTS.md` 中稳定 sentinel 作为 transcript marker，运行普通 `opencode run`，断言请求成功、normal 请求包含 marker 且不存在第二条 system message。

- [ ] **步骤 4：触发并断言标题请求隔离**

使用真实 CLI 创建新 session 的普通 run，等待 OpenCode 的标题生成请求进入 transcript；用固定的标题 system/prompt 特征分类，断言至少一条 title 请求且均不含 sentinel。若当前 CLI 不在 `run` 命令生成标题，使用其公开 session/server CLI 路径触发，不导入 OpenCode 内部模块。

- [ ] **步骤 5：触发并断言 summary/compaction 隔离**

为 E2E 模型配置小 context limit，并在同一 session 发送足量可辨识历史消息，直到 transcript 出现 compaction system/prompt 特征；断言至少一条 internal 请求且不含 sentinel。若固定 CLI 无公开稳定触发路径，测试以明确诊断失败并保留验收缺口，不把缺失请求当作通过。

- [ ] **步骤 6：运行真实 CLI E2E**

运行：`OMS_OPENCODE_E2E=1 OPENCODE_PACKAGE=opencode-ai OPENCODE_VERSION=1.18.15 npm run test:e2e:opencode`

预期：PASS；artifact transcript 可区分 normal、title、summary/compaction，并证明严格 provider 未返回 system 排列错误。

- [ ] **步骤 7：提交**

```bash
git add __tests__/integration/opencode/real-cli-e2e.test.js __tests__/helpers/opencode-e2e-harness.js
git commit -m "test(opencode): verify internal request isolation" -m "Refs #28"
```

### 任务 4：三平台 CI 合同与全量验证

**文件：**
- 修改：`.github/workflows/opencode-e2e.yml`（仅当任务 3 需要额外固定环境参数）
- 修改：`__tests__/unit/opencode/e2e-harness.test.js`

- [ ] **步骤 1：先写 CI 合同测试**

断言 workflow matrix 包含 `ubuntu-latest`、`macos-latest`、`windows-latest`，启用 `OMS_OPENCODE_E2E=1`，固定 OpenCode 版本，并执行包含 CRLF 生命周期和真实请求隔离的测试入口。

- [ ] **步骤 2：运行合同测试并最少调整 workflow**

运行：`node --test __tests__/unit/opencode/e2e-harness.test.js`

预期：修改前若缺少任务 3 所需参数则 FAIL；最少更新 workflow 后 PASS。

- [ ] **步骤 3：运行本地验证门禁**

运行：`npm run build --prefix opencode`、`npm run typecheck --prefix opencode`、`node --test __tests__/unit/opencode/resource-scripts.test.js __tests__/unit/opencode/e2e-harness.test.js`、真实 CLI E2E、`npm test`、`npm run lint:baseline`、`git diff --check`。

预期：本地可执行门禁全部通过；Windows 结论在远程 runner 完成前仅标记为待验证。

- [ ] **步骤 4：提交 CI 调整**

```bash
git add .github/workflows/opencode-e2e.yml __tests__/unit/opencode/e2e-harness.test.js
git commit -m "ci(opencode): verify AGENTS lifecycle on Windows" -m "Refs #28"
```

### 任务 5：审查、推送与 PR

- [ ] **步骤 1：检查范围与提交**

运行：`git status --short`、`git diff main...HEAD --stat`、`git diff main...HEAD --check`、`git log --oneline main..HEAD`。确认只包含 Issue #28 修正且没有真实 HOME、缓存、artifact 或密钥。

- [ ] **步骤 2：推送 Issue 分支**

运行：`git push -u origin fix/issue-28-agents-reliability-e2e`。

- [ ] **步骤 3：创建目标为 main 的 draft PR**

PR 正文列出原子写入、真实请求证据、Windows CRLF 生命周期、本地验证结果、尚未完成的远程 job，并使用 `Closes #28`。不得把 `in_progress` 的 Windows 或 E2E job 描述为通过。

- [ ] **步骤 4：检查远程 CI**

区分 completed/success、completed/failure 和 in_progress；仅在三平台 OpenCode E2E 均 completed/success 后关闭对应验收缺口。
