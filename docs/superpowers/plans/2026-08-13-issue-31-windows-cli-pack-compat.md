# Issue #31 Windows CLI 与 npm pack 兼容性实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans（推荐内联执行）逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 Windows 无 Bash、多个 Claude PATH 候选及启用生命周期脚本的 npm pack 场景可可靠运行。

**架构：** 保持现有 POSIX mock 和资源同步职责不变；新增 Node mock 作为 Windows shim 的执行入口，新增共享 npm manifest parser 作为所有 OpenCode pack 测试的唯一解析入口。诊断日志走 stderr，机器可读 manifest 走 stdout。

**技术栈：** Node.js 18+、Node 内置 test runner、Windows `.cmd`、npm lifecycle、GitHub Actions。

---

### 任务 1：Windows Claude 多路径解析

**文件：**
- 修改：`wrapper/wrapper.js`
- 测试：`__tests__/unit/wrapper/wrapper.test.js`

- [ ] **步骤 1：编写失败测试**

为 `findClaudeOriginal` 增加可注入 `platform`、`execFileSync` 或等价测试 seam，覆盖 CRLF 多候选、wrapper 候选后跟有效候选、空行和全无效输出；断言选择首个有效路径。

- [ ] **步骤 2：运行聚焦测试确认失败**

运行 `node --test __tests__/unit/wrapper/wrapper.test.js`，预期新增多候选断言失败于当前 `.trim()` 将完整多行输出当作单一路径。

- [ ] **步骤 3：实现最小修复**

将 Windows `where` 结果拆成行，过滤空值和 wrapper 目录，逐行返回首个有效候选；保留现有备份路径和固定安装位置优先级。

- [ ] **步骤 4：运行测试确认通过**

运行 `node --test __tests__/unit/wrapper/wrapper.test.js`，预期全部通过。

### 任务 2：共享 npm pack manifest parser 与 stderr 分流

**文件：**
- 修改：`opencode/scripts/copy-resources.mjs`
- 修改：`__tests__/helpers/opencode-e2e-harness.js`
- 修改：`__tests__/unit/opencode/e2e-harness.test.js`
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`

- [ ] **步骤 1：编写失败测试**

增加包含多段 npm lifecycle 文本、JSON manifest 和尾随文本的 parser 测试；增加 `copy-resources` 子进程测试，断言成功诊断在 stderr、stdout 不含 `[copy-resources]`。

- [ ] **步骤 2：运行聚焦测试确认失败**

运行 `node --test __tests__/unit/opencode/e2e-harness.test.js __tests__/unit/opencode/resource-scripts.test.js`，预期 stderr 分流测试失败。

- [ ] **步骤 3：实现最小修复**

让共享 parser 从输出中定位最后一个完整 JSON 数组并调用 `JSON.parse`；失败时抛出包含 stdout/stderr 的错误。将 copy-resources 的正常 `console.log` 改为 `console.error`，不改变失败退出码。

- [ ] **步骤 4：运行测试确认通过**

运行同一组聚焦测试，预期全部通过。

### 任务 3：统一 OpenCode pack 测试入口

**文件：**
- 修改：`__tests__/integration/opencode/concurrent-pack.test.js`
- 修改：`__tests__/integration/opencode/sdd-plan-harness.test.js`
- 修改：`__tests__/integration/opencode/install.test.js`
- 修改：`__tests__/integration/opencode/real-cli-e2e.test.js`
- 修改：`__tests__/helpers/opencode-e2e-harness.js`

- [ ] **步骤 1：编写失败测试**

将 concurrent pack 的两个非 silent、启用 prepack 的执行结果送入共享 parser；为 sdd-plan pack 缺少 manifest 的场景断言错误包含 stdout/stderr 和 `filename` 诊断。

- [ ] **步骤 2：运行聚焦测试确认失败**

运行 `node --test __tests__/integration/opencode/concurrent-pack.test.js __tests__/integration/opencode/sdd-plan-harness.test.js`，预期当前局部 parser/直接 JSON.parse 路径无法满足新输入。

- [ ] **步骤 3：实现最小修复**

删除重复 parser，所有 pack 调用复用共享 parser；sdd-plan 通过 parser 取得 manifest，并在空 manifest 或缺少 filename 时抛出带上下文错误。

- [ ] **步骤 4：运行测试确认通过**

运行上述聚焦集并执行 `node --test __tests__/integration/opencode/install.test.js`，预期全部通过。

### 任务 4：无 Bash 的 Windows mock CLI

**文件：**
- 创建：`scripts/mock-cli.mjs`
- 修改：`scripts/iam.cmd`
- 修改：`scripts/dop.cmd`
- 修改：`__tests__/unit/scripts/mock-cli.test.js`

- [ ] **步骤 1：编写失败测试**

测试 Node mock 的 IAM JSON 契约和 `.cmd` shim 不再引用 Bash；使用隔离 PATH 调用 shim 入口，断言无 Bash 时仍返回预期结果。

- [ ] **步骤 2：运行聚焦测试确认失败**

运行 `node --test __tests__/unit/scripts/mock-cli.test.js`，预期当前测试明确依赖 bash，且 shim 内容包含 Bash 委托。

- [ ] **步骤 3：实现最小修复**

从现有 Bash mock 保持相同环境变量和 IAM/DOP 输出契约，抽出 Node 原生入口；两个 `.cmd` 文件通过 `%~dp0` 调用 `node mock-cli.mjs iam|dop`，参数原样传递。

- [ ] **步骤 4：运行测试确认通过**

运行 `node --test __tests__/unit/scripts/mock-cli.test.js`，预期无 Bash contract 全部通过。

### 任务 5：CI contract 与全量验证

**文件：**
- 修改：`.github/workflows/ci.yml`
- 修改：`__tests__/unit/scripts/mock-cli.test.js`
- 修改：`__tests__/unit/wrapper/wrapper.test.js`

- [ ] **步骤 1：编写失败测试**

增加 CI workflow contract 断言 Windows 矩阵执行无 Bash mock contract，并显式保留多 Claude 候选覆盖。

- [ ] **步骤 2：实现最小 CI 调整**

在 Windows job 增加隔离 PATH 的 Node contract 命令；不改变 Linux/macOS 测试矩阵和现有依赖安装顺序。

- [ ] **步骤 3：运行验证**

依次运行聚焦测试、`npm test`、`npm run lint:baseline` 和 `git diff --check`；预期全量测试 0 失败，Windows-only 测试在非 Windows 主机上以明确 skip 或纯 Node contract 方式稳定完成。

- [ ] **步骤 4：审查与交付**

检查 `git diff --stat`、敏感文件和暂存内容，请求代码审查；使用 Conventional Commit 关联 `#31`，推送 `fix/issue-31-windows-cli-pack-compat` 并创建目标为 `main` 的 draft PR。
