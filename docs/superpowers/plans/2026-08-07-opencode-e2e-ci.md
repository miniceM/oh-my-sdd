# OpenCode Plugin CI E2E 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 Linux、macOS、Windows CI 中通过真实 OpenCode CLI 验证全局 npm 安装后的 command、skill 和 hook 行为，并用仓库 mock 替代企业 `iam`/`dop` CLI。

**架构：** 新增独立的 OpenCode E2E runner，创建临时 HOME/npm prefix/project，执行真实 `prepack` 后全局安装 `opencode/` tarball。runner 以 OpenCode 本地 loader 重导出该全局安装包的 `OhMySddPlugin`，并以本地脚本化 provider 驱动 CLI 真实工具调用；不让 OpenCode 从 npm/Bun 缓存下载同名包。CI 使用固定 OpenCode/Node 版本的独立三平台 job，不改变默认单元/集成测试入口。

**技术栈：** Node.js `node:test`、Node 原生 `child_process`/`fs` API、npm pack/install、GitHub Actions matrix、仓库现有 `scripts/iam` 与 `scripts/dop` mock。

---

## 文件清单

- 创建：`__tests__/helpers/opencode-e2e-harness.js`，负责临时环境、跨平台命令执行、npm 安装、CLI 探测和清理。
- 创建：`__tests__/integration/opencode/real-cli-e2e.test.js`，负责真实 OpenCode 运行时的 command、skill、hook 验收。
- 创建：`__tests__/unit/opencode/e2e-harness.test.js`，覆盖清单解析、环境构造、JSON 输出解析和失败诊断逻辑，不下载外部 CLI。
- 修改：`package.json`，增加 `test:e2e:opencode` 入口及必要的 OpenCode CLI 包配置。
- 创建：`.github/workflows/opencode-e2e.yml`，配置三操作系统矩阵、Node 版本、公开 npm OpenCode 安装、企业 CLI mock、日志上传。
- 修改：`opencode/src/mappers.ts` 与 `hooks/pre-tool-use.js`，让真实 OpenCode Bash 工具进入既有 HARD_RULE gate。
- 创建：`scripts/iam.cmd`、`scripts/dop.cmd`，让 Windows CI 能调用仓库 mock。

### 任务 1：建立跨平台 E2E harness

**文件：**
- 创建：`__tests__/helpers/opencode-e2e-harness.js`
- 测试：`__tests__/unit/opencode/e2e-harness.test.js`

- [ ] **步骤 1：编写失败的单元测试**

  测试以下纯函数契约：
  - `publishedCommands()` 从 tarball 清单返回所有 `sdd-*.md` 的无扩展名名称，并排除 `sdd-constitution`。
  - `publishedSkills()` 返回 `opencode/oms-skills` 中允许发布且含 `SKILL.md` 的目录名。
  - `buildE2eEnv()` 将临时目录映射到 `HOME`、`USERPROFILE`、`npm_config_prefix`、`npm_config_cache`、`OPENCODE_CONFIG`、`OPENCODE_CONFIG_DIR`，并把仓库 `scripts` 放到 `PATH` 首位。
  - `writePluginLoader()` 只允许导入由 `npm root --global` 解析出的安装包 `dist/index.js`；生成的 loader 必须导出 `OhMySddPlugin`。
  - `parseJsonLines()` 能从 OpenCode 混合日志中提取 JSON 行，并在 JSON 损坏时返回包含原始输出的诊断错误。

- [ ] **步骤 2：运行测试确认失败**

  运行：`node --test __tests__/unit/opencode/e2e-harness.test.js`

  预期：FAIL，报错 `Cannot find module` 或导出函数不存在。

- [ ] **步骤 3：实现最小 harness**

  提供以下导出函数：

  ```js
  export function publishedCommands(repoRoot) {}
  export function publishedSkills(repoRoot) {}
  export function buildE2eEnv({ repoRoot, root }) {}
  export function runNpm(args, options) {}
  export function runProcess(command, args, options) {}
  export function parseJsonLines(output) {}
  export function formatFailure({ phase, result, env }) {}
  export function createE2eSandbox(repoRoot) {}
  ```

  `createE2eSandbox` 必须返回 `root`, `home`, `prefix`, `cache`, `packDir`, `projectDir`, `artifactsDir`, `env` 和 `cleanup()`；所有路径使用 `path.join`，进程使用 `execFileSync`/`spawn`，不得调用 shell-specific 命令。

- [ ] **步骤 4：运行测试确认通过**

  运行：`node --test __tests__/unit/opencode/e2e-harness.test.js`

  预期：PASS，所有纯函数测试通过。

- [ ] **步骤 5：Commit**

  ```bash
  git add __tests__/helpers/opencode-e2e-harness.js __tests__/unit/opencode/e2e-harness.test.js
  git commit -m "test: add cross-platform OpenCode E2E harness"
  ```

### 任务 2：实现真实 npm 安装与 OpenCode 运行时验收

**文件：**
- 创建：`__tests__/integration/opencode/real-cli-e2e.test.js`
- 修改：`package.json`
- 依赖：`__tests__/helpers/opencode-e2e-harness.js`

- [ ] **步骤 1：编写失败的 E2E 测试**

  添加一个 `node:test` 测试，只有 `OMS_OPENCODE_E2E=1` 或 `CI=true` 时运行；在 sandbox 中：

  1. `npm ci --prefix opencode` 后执行 `npm pack --json --pack-destination <packDir>`；不得使用 `--ignore-scripts`。
  2. `npm install --global --foreground-scripts <tarball>` 安装插件包。
  3. 通过公开 npm 源安装真实 OpenCode CLI，包名固定为 `opencode-ai`，版本由必填的 `OPENCODE_VERSION` 控制。
  4. 断言全部期望 command 和 skill 文件存在。
  5. 生成仅重导出 tarball 已安装 `OhMySddPlugin` 的 OpenCode 本地 loader，使用 `OPENCODE_CONFIG` 运行 CLI；禁止把包名写入 `plugin` 配置。
  6. 启动本地脚本化 provider，以 `opencode run --format json --command <name>` 验证每个命令；断言插件加载成功且输出不含 `Unexpected server error`。
  7. 由同一个 provider 逐个驱动 safe write、AWS/OpenAI key、`.env` 编辑、`rm -rf /`、受保护分支 force push 工具调用，断言实际 CLI 会话中的 allow/deny 结果和诊断提示。
  8. 将 stdout、stderr、OpenCode 日志、provider transcript、tarball manifest 和测试摘要写入 `artifactsDir`。

  测试失败时必须把 phase、平台、Node/OpenCode 版本和日志路径加入 assertion message；`finally` 必须执行 `cleanup()`。

- [ ] **步骤 2：运行 E2E 确认当前实现缺少运行时契约或发现失败**

  运行：`OMS_OPENCODE_E2E=1 npm run test:e2e:opencode`

  预期：在当前尚未接入 runner 或 CLI 观测命令不匹配时 FAIL；记录真实 OpenCode CLI 的帮助/JSON 输出，用于步骤 3 固化适配，不允许把失败改成 skip。

- [ ] **步骤 3：实现 E2E 入口与运行时适配**

  在 `package.json` 增加：

  ```json
  "test:e2e:opencode": "node --test __tests__/integration/opencode/real-cli-e2e.test.js"
  ```

  测试通过 harness 调用 npm 和 OpenCode CLI。命令使用 `run --format json --command` 验证，不假设存在命令列表事件。hook 验收由真实 CLI + 本地脚本化 provider 完成；loader 仅负责让 OpenCode 加载 tarball 中的已安装产物，不能直接调用 handler 作为 E2E 替代。

- [ ] **步骤 4：运行 focused 验证**

  运行：`OMS_OPENCODE_E2E=1 npm run test:e2e:opencode`

  预期：本机安装真实 OpenCode 后 PASS；若本机缺少 CLI 或公开 npm 网络不可用，测试必须 FAIL 并给出安装阶段和日志位置，而不是误报 PASS。

- [ ] **步骤 5：Commit**

  ```bash
  git add package.json __tests__/integration/opencode/real-cli-e2e.test.js
  git commit -m "test: verify OpenCode commands skills and hooks at runtime"
  ```

### 任务 3：加入 GitHub Actions 三平台门禁

**文件：**
- 创建：`.github/workflows/opencode-e2e.yml`

- [ ] **步骤 1：编写 workflow 静态测试**

  在 `__tests__/unit/opencode/e2e-harness.test.js` 增加 YAML 文本断言：workflow 存在 `ubuntu-latest`、`macos-latest`、`windows-latest`，使用 Node 18/20/22 支持范围中的明确版本，设置 `OMS_OPENCODE_E2E=1`，把 `${{ runner.os }}` 对应的 artifact 上传步骤设为 `if: failure()`，并把仓库 `scripts` 置于 `PATH`。

- [ ] **步骤 2：运行测试确认失败**

  运行：`node --test __tests__/unit/opencode/e2e-harness.test.js`

  预期：FAIL，因为 workflow 尚不存在。

- [ ] **步骤 3：实现 workflow**

  使用独立 `opencode-e2e` job：

  - matrix `os: [ubuntu-latest, macos-latest, windows-latest]`，Node 22。
  - `actions/checkout` 与 `actions/setup-node`。
  - 显式从公开 npm 源安装真实 OpenCode CLI；项目 tarball 仍由 E2E 测试本地 pack，避免测试未提交包。
  - 设置 `OMS_MOCK_USER=ci`，将 `scripts` 加入 `PATH`，设置 `OMS_OPENCODE_E2E=1`、`OPENCODE_PACKAGE=opencode-ai` 与固定 `OPENCODE_VERSION`。
  - 执行 `npm ci` 和 `npm run test:e2e:opencode`。
  - 使用 `actions/upload-artifact` 上传 `.e2e-artifacts`，仅失败时执行。

- [ ] **步骤 4：运行静态 workflow 验证**

  运行：`node --test __tests__/unit/opencode/e2e-harness.test.js`

  预期：PASS。再运行 `git diff --check`，预期无 whitespace error。

- [ ] **步骤 5：Commit**

  ```bash
  git add .github/workflows/opencode-e2e.yml __tests__/unit/opencode/e2e-harness.test.js
  git commit -m "ci: add cross-platform OpenCode plugin E2E gate"
  ```

### 任务 4：全量回归与发布前验证

**文件：**
- 无新增业务文件；验证任务 1-3 的全部变更。

- [ ] **步骤 1：运行基础测试**

  运行：`npm test`

  预期：现有全部 unit/integration 测试 PASS。

- [ ] **步骤 2：运行 baseline 检查**

  运行：`npm run lint:baseline`

  预期：PASS，未修改企业 baseline。

- [ ] **步骤 3：运行 E2E**

  运行：`OMS_OPENCODE_E2E=1 npm run test:e2e:opencode`

  预期：真实 OpenCode CLI 完成全局安装、启动、命令/skill/hook 验收并 PASS。

- [ ] **步骤 4：检查变更边界**

  运行：`git diff --check` 和 `git status --short`

  预期：无 whitespace error；仅包含本计划范围内文件。

- [ ] **步骤 5：Commit**

  ```bash
  git add docs/superpowers/specs/2026-08-07-opencode-e2e-ci-design.md docs/superpowers/plans/2026-08-07-opencode-e2e-ci.md
  git commit -m "docs: record OpenCode E2E CI design and plan"
  ```
