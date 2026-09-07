# 非归档 Markdown 保鲜 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 使非归档 Markdown 准确描述 npm workspaces 重构后的双包架构、安装运维与发布流程，并保持所有发布镜像一致。

**架构：** 在根文档、`docs/` 和 `packages/product/` 中维护用户可读事实；产品包的 skills 和 content 是 OpenCode 资源的唯一源。运行 `npm run sync:opencode` 后，由同步脚本生成 OpenCode 包的四组 skill 镜像、content 镜像和 command 镜像，禁止直接编辑生成副本。

**技术栈：** Markdown、npm workspaces、Changesets、Node.js 内置测试、OpenCode 资源同步脚本。

---

## 文件结构

### 手工维护的文档

- 修改：`README.md` — 项目入口、工作区架构、快速开始与控制面说明。
- 修改：`INSTALL.md` — 四宿主安装、验证、升级和卸载的唯一操作指南。
- 修改：`CONTRIBUTING.md` — 当前包边界、测试、变更集与 PR 贡献规范。
- 修改：`CLAUDE.md`、`AGENTS.md` — 仓库级 Agent 指令中与重构后目录和命令相关的说明。
- 修改：`.changeset/issue-78-workspaces-lockstep-versioning.md` — 使未发布变更说明匹配锁步版本策略。
- 修改：`docs/roadmap/v0.2-backlog.md`、`docs/sdd-git-workflow.md`、`docs/smoke-test-checklist.md`、`docs/spike-opencode-e2e.md`、`docs/spike-posttooluse-deny.md` — 当前架构下的路线、Git、冒烟和实验说明。
- 修改：`docs/release/internal-publish-runbook.md`、`docs/release/npm-publish-guide.md`、`docs/release/runbook-internal-test-v0.2.md` — 当前双包发布与内网实测流程。
- 修改：`packages/product/README.md` — 产品包入口和宿主能力矩阵。
- 修改：`packages/product/content/auth-required.md`、`packages/product/content/welcome-message.md` — 与宿主无关的认证和首次使用指引。
- 核验并按事实需要修改：`packages/product/content/enterprise-baseline.md`、`packages/product/content/lingma-baseline.md` — 仅处理路径或宿主描述漂移；不因本文档工作修改治理语义或版本。
- 核验并按事实需要修改：`packages/product/skills/**/{SKILL.md,*.md}` — 仅更新受 workspaces、OpenSpec 路径、CLI 或发布流程影响的自有技能与资源说明。
- 修改：`packages/opencode-plugin/README.md` — OpenCode 原生包的安装、资源与验证说明。
- 修改：`packages/opencode-plugin/.opencode/commands/{sdd-apply,sdd-doc,sdd-plan,sdd-review,sdd-spec,sdd-task}.md` — 当前 command 的资源发现和 SDD 交接说明。
- 核验：`packages/opencode-plugin/delegated-skills/**` — 保留固定上游版本与语义，不混入项目专属描述。

### 由同步脚本生成的镜像

- 生成：`packages/opencode-plugin/{skills,oms-skills,.opencode/skills,.agents/skills}/**`，源为 `packages/product/skills/**`。
- 生成：`packages/opencode-plugin/content/**`，源为 `packages/product/content/**`。
- 生成：`packages/opencode-plugin/.agents/command/{sdd-apply,sdd-doc,sdd-plan,sdd-review,sdd-spec,sdd-task}.md`，源为 `.opencode/commands/**`。

### 不变更的归档范围

- 不修改：`docs/archive/**`。
- 不修改：`docs/superpowers/{plans,specs,research}/**` 中本轮新建过程文档以外的既有记录。

### 任务 1：建立可执行的当前事实基线

**文件：**
- 读取：`package.json`、`packages/product/package.json`、`packages/opencode-plugin/package.json`
- 读取：`packages/product/bin/{oms,oms-install,oms-uninstall,oms-git-hooks}.js`
- 读取：`packages/opencode-plugin/scripts/copy-resources.mjs`

- [ ] **步骤 1：记录命令与工作区事实**

确认根工作区声明 `packages/*`，公开包为 `@cli-tools/oh-my-sdd` 与 `@cli-tools/oh-my-sdd-opencode`，并记录根脚本 `npm test`、`npm run lint:baseline`、`npm run sync:opencode`、`npm run release:check` 和 `npm run release:version`。

- [ ] **步骤 2：记录用户 CLI 的实际语法**

运行：`node packages/product/bin/oms.js --help && node packages/product/bin/oms-install.js --help && node packages/product/bin/oms-uninstall.js --help && node packages/product/bin/oms-git-hooks.js --help`

预期：帮助文本包含 `oms status`、`oms doctor`、`oms repair [--apply]`，以及四宿主的 `oms-install --tool <name>`、`oms-uninstall --tool <name>` 与 git hook 管理命令。

- [ ] **步骤 3：确认资源镜像边界**

运行：`node packages/opencode-plugin/scripts/copy-resources.mjs`

预期：脚本成功同步产品包的 skills/content，并将 `.opencode/commands/` 复制到 `.agents/command/`；不修改归档目录。

### 任务 2：重写根入口与贡献文档

**文件：**
- 修改：`README.md`
- 修改：`INSTALL.md`
- 修改：`CONTRIBUTING.md`
- 修改：`CLAUDE.md`
- 修改：`AGENTS.md`
- 修改：`.changeset/issue-78-workspaces-lockstep-versioning.md`

- [ ] **步骤 1：重写 README 的用户入口**

使用项目名称与一句话定位开篇；在前 5 行命令内给出安装、指定宿主、诊断和验证路径。说明双包工作区与四个宿主的能力差异，将完整操作引向 `INSTALL.md`，并保留控制面 `oms status`、`oms doctor` 和 dry-run `oms repair` 的准确示例。

- [ ] **步骤 2：统一安装、验证、升级与卸载说明**

以 `INSTALL.md` 为唯一操作详情：根据 `oms-install --tool claude|lingma|opencode|kilocode` 给出四条受支持路径；解释多宿主必须显式选择、OpenCode npm 插件资源同步、`oms status`/`oms doctor`/`oms repair` 与所有权感知的 `oms-uninstall`。删除历史本地插件目录和不再存在的 `opencode/` 工作目录示例。

- [ ] **步骤 3：刷新贡献与 Agent 指令**

使 `CONTRIBUTING.md`、`CLAUDE.md` 与 `AGENTS.md` 指向 `packages/product/`、`packages/opencode-plugin/`、当前测试命令和 Issue → 分支 → PR 约束。将未发布 changeset 描述为两个公开包的 fixed 组版本同步，避免写入硬编码发布版本。

- [ ] **步骤 4：检查根文档链接与命令**

运行：`rg -n 'cd opencode|0\\.1\\.0|352 个|17 个 skill|v0\\.2\\.2-alpha' README.md INSTALL.md CONTRIBUTING.md CLAUDE.md AGENTS.md .changeset/issue-78-workspaces-lockstep-versioning.md`

预期：无过期工作目录、历史测试数量或固定版本；保留具有明确历史含义的 changelog 文本仅在归档范围内。

### 任务 3：重写项目运维、路线图与实验文档

**文件：**
- 修改：`docs/roadmap/v0.2-backlog.md`
- 修改：`docs/sdd-git-workflow.md`
- 修改：`docs/smoke-test-checklist.md`
- 修改：`docs/spike-opencode-e2e.md`
- 修改：`docs/spike-posttooluse-deny.md`

- [ ] **步骤 1：刷新路线图与 Git 工作流**

将路线图改为当前 workspaces 后的可验证遗留项；将 Git 流程与仓库的 Issue、专用分支、Conventional Commit、验收证据和 PR 要求对齐，删除已完成重构的待办或过期项目结构。

- [ ] **步骤 2：重写冒烟清单**

将检查项分为根测试、baseline lint、OpenCode 同步、两个 package 的构建/打包、`oms` CLI 帮助与各宿主验证。每项写清命令、成功信号和失败时的停止条件，不固定测试总数。

- [ ] **步骤 3：更新两个 Spike 的结论边界**

保留实验事实和日期，但将其与当前生产实现的关系写清：PreToolUse 是可阻断写入的门禁，PostToolUse 只做遥测；OpenCode 当前走 npm 插件、全局资源发现和 TypeScript 适配层。

- [ ] **步骤 4：运行文档陈旧性扫描**

运行：`rg -n 'hooks/|skills/|opencode/|v0\\.1|v0\\.2|352 个|17 个 skill' docs/roadmap/v0.2-backlog.md docs/sdd-git-workflow.md docs/smoke-test-checklist.md docs/spike-opencode-e2e.md docs/spike-posttooluse-deny.md`

预期：每项匹配都能指向当前目录或明确标注为实验历史，不存在会引导执行旧流程的描述。

### 任务 4：严格重写三份发布与内网实测 Runbook

**文件：**
- 修改：`docs/release/internal-publish-runbook.md`
- 修改：`docs/release/npm-publish-guide.md`
- 修改：`docs/release/runbook-internal-test-v0.2.md`

- [ ] **步骤 1：定义三份文档的互补职责**

将 `internal-publish-runbook.md` 写成执行者的简洁内网发布清单；将 `npm-publish-guide.md` 写成包含 Changesets、fixed 组、bundle、dry-run、双包发布和回滚解释的新人指南；将 `runbook-internal-test-v0.2.md` 改为当前版本无关的内网实测矩阵，并保留文件名以避免断链。

- [ ] **步骤 2：替换历史版本与目录命令**

统一使用根目录 `npm run release:version`、`npm run release:check`、`npm test`、`npm run lint:baseline`、`npm run sync:opencode`、workspace 定向 `npm pack` 与对应 package 名。禁止固定 `0.1.x`/`0.2.x`、测试总数、旧 tag、旧 commit SHA 或 `cd opencode`。

- [ ] **步骤 3：校正发布安全边界**

明确版本由 Changesets fixed 组生成；正式发布前必须完成 Issue → 分支 → PR；当前任务只更新文档，Runbook 中的 `npm publish`、tag、push 和 unpublish 示例必须标明仅供拥有发布授权的操作员执行。

- [ ] **步骤 4：检查发布文档没有历史硬编码**

运行：`rg -n '0\\.1\\.|0\\.2\\.|v0\\.|352|17 个 skill|cd opencode|git push origin main' docs/release/*.md`

预期：无过期固定版本、测试计数、过时目录或默认分支直接推送指引。

### 任务 5：更新产品包的用户资源与项目相关技能

**文件：**
- 修改：`packages/product/README.md`
- 修改：`packages/product/content/auth-required.md`
- 修改：`packages/product/content/welcome-message.md`
- 核验并按事实需要修改：`packages/product/content/enterprise-baseline.md`
- 核验并按事实需要修改：`packages/product/content/lingma-baseline.md`
- 核验并按事实需要修改：`packages/product/skills/**/{SKILL.md,*.md}`

- [ ] **步骤 1：重写产品包 README**

删除重复的标题和旧 `cd opencode` 示例；围绕控制平面、主包和 OpenCode 原生包边界、四宿主能力矩阵、安装/诊断/卸载、开发验证和镜像规则编排内容。明确 KiloCode 为 advisory-only，Claude/OpenCode 使用运行期拦截，且 OpenCode 资源由 npm 插件 `postinstall` 管理。

- [ ] **步骤 2：刷新首次使用和认证模板**

使 `auth-required.md` 与 `welcome-message.md` 不再假设唯一宿主是 Claude Code；保留只有在当前适配器需要时才执行 iam 认证的事实，并将诊断指向 `oms doctor`。

- [ ] **步骤 3：逐一核验 baseline 与全部自有 skills**

检查 32 个自有 skill/资源文档是否引用旧根目录、`docs/superpowers/` 输出、旧 CLI、旧包目录或已失效的工作流。只在存在源码漂移时更新；若修改 baseline，则遵循其 SemVer、Sync Impact Report 和 token 预算规则，否则保持其治理版本不变。

- [ ] **步骤 4：运行源资源校验**

运行：`npm run lint:baseline && rg -n 'cd opencode|0\\.1\\.0|0\\.2\\.2-alpha|352 个|17 个 skill' packages/product/README.md packages/product/content packages/product/skills -g '*.md'`

预期：baseline lint 通过；所有匹配均为当前领域技能中的示例数据，或在修改前已被消除的项目事实。

### 任务 6：更新 OpenCode 原生包的专属文档与命令源

**文件：**
- 修改：`packages/opencode-plugin/README.md`
- 修改：`packages/opencode-plugin/.opencode/commands/sdd-apply.md`
- 修改：`packages/opencode-plugin/.opencode/commands/sdd-doc.md`
- 修改：`packages/opencode-plugin/.opencode/commands/sdd-plan.md`
- 修改：`packages/opencode-plugin/.opencode/commands/sdd-review.md`
- 修改：`packages/opencode-plugin/.opencode/commands/sdd-spec.md`
- 修改：`packages/opencode-plugin/.opencode/commands/sdd-task.md`
- 核验：`packages/opencode-plugin/delegated-skills/**`

- [ ] **步骤 1：重写 OpenCode README**

说明 npm 插件配置、`postinstall` 的全局资源安装、OMS 资源源目录、命令发现路径、所有权保护、升级、卸载和诊断。只引用 `packages/opencode-plugin/` 与 `packages/product/` 的现有路径，不引用删除的单包 `opencode/` 目录。

- [ ] **步骤 2：核验并刷新六个 command 源**

确保每个 command 先在产品包 source、包内 mirror、全局 OpenCode 和跨工具路径中解析对应 skill；完整保留对执行模式和委派失败路径的约束；校正工作区重构后失效的父目录或 command 发现路径。

- [ ] **步骤 3：核验 vendored 委派技能**

确认 `delegated-skills/` 声明的固定版本与 `postinstall.mjs` 中 5 个强制和 3 个支持技能的名单一致。除非发现项目专属错误引用，否则不改动上游内容。

### 任务 7：生成镜像并执行文档完整性验证

**文件：**
- 生成：`packages/opencode-plugin/{skills,oms-skills,.opencode/skills,.agents/skills}/**`
- 生成：`packages/opencode-plugin/content/**`
- 生成：`packages/opencode-plugin/.agents/command/{sdd-apply,sdd-doc,sdd-plan,sdd-review,sdd-spec,sdd-task}.md`

- [ ] **步骤 1：生成所有 OpenCode 镜像**

运行：`npm run sync:opencode`

预期：产品包 skills/content 与四组 skill 镜像、content 镜像一致；`.opencode/commands/` 与 `.agents/command/` 一致。

- [ ] **步骤 2：验证镜像内容**

运行：`diff -rq packages/product/skills packages/opencode-plugin/skills && diff -rq packages/product/skills packages/opencode-plugin/oms-skills && diff -rq packages/product/skills packages/opencode-plugin/.opencode/skills && diff -rq packages/product/skills packages/opencode-plugin/.agents/skills && diff -rq packages/product/content packages/opencode-plugin/content && diff -rq packages/opencode-plugin/.opencode/commands packages/opencode-plugin/.agents/command`

预期：所有 `diff -rq` 命令退出码为 `0`。

- [ ] **步骤 3：验证内部 Markdown 链接**

运行：`node --input-type=module -e 'import { existsSync, readFileSync } from "node:fs"; import { dirname, resolve } from "node:path"; import { execFileSync } from "node:child_process"; const files=execFileSync("rg",["--files","--hidden","-g","*.md","-g","!node_modules","-g","!docs/archive/**","-g","!docs/superpowers/plans/**","-g","!docs/superpowers/specs/**","-g","!docs/superpowers/research/**"],{encoding:"utf8"}).trim().split("\\n").filter(Boolean); const bad=[]; for (const f of files) { const text=readFileSync(f,"utf8"); for (const m of text.matchAll(/\\[[^\\]]+\\]\\(([^)#]+)(?:#[^)]*)?\\)/g)) { const target=m[1]; if (!/^[a-z][a-z0-9+.-]*:/i.test(target) && !existsSync(resolve(dirname(f),target))) bad.push(`${f} -> ${target}`); } } if (bad.length) { console.error(bad.join("\\n")); process.exit(1); }'`

预期：退出码为 `0`，表示所有非归档 Markdown 的相对文件链接均指向现有文件。

- [ ] **步骤 4：运行发布与测试门禁**

运行：`npm run lint:baseline && npm run release:check && npm test && git diff --check`

预期：四项均退出码为 `0`；测试输出不依赖固定测试数量。

- [ ] **步骤 5：复核变更范围**

运行：`git status --short && git diff --stat && git diff -- docs/archive docs/superpowers`

预期：`docs/archive/**` 与既有 `docs/superpowers/{plans,specs,research}/**` 不发生修改；只有本轮过程记录位于相应目录。
