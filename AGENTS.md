# oh-my-sdd — Agent Guide

## 项目与工作区

oh-my-sdd 是面向 Claude Code、Lingma、OpenCode 和 KiloCode 的企业 SDD 工作流与控制面。根目录使用 npm workspaces，发布两个固定组锁步版本的包：

```
packages/product/            @cli-tools/oh-my-sdd：安装器、CLI、hooks、skills、baseline、控制面
packages/opencode-plugin/    @cli-tools/oh-my-sdd-opencode：OpenCode 原生 npm 插件与资源同步
__tests__/                   Node.js 内置测试运行器的单元与集成测试
```

OpenCode 通过 npm 插件及 `postinstall` 同步全局资源；不使用已废弃的单包 `opencode/` 目录。Claude Code 与 OpenCode 可运行期强制 HARD_RULE，KiloCode 仅 advisory。

## 快速命令

```bash
npm test
npm run lint:baseline
npm run sync:opencode
npm run release:check
npm run release:version
```

## 核心安全事实

- `packages/product/hooks/pre-tool-use.js` 是实际写入前安全门禁；PostToolUse 无法阻断已发生的写入。
- baseline SSOT 为 `packages/product/content/enterprise-baseline.md`。修改时维护 frontmatter 与 Sync Impact Report，正文保持不超过 1000 tokens，并运行 `npm run lint:baseline`。
- hooks 从 stdin 读取 `{ session_id, tool_name, tool_input, cwd }` JSON，向 stdout 输出 `{ permissionDecision?, additionalContext? }` JSON；使用 `CLAUDE_PLUGIN_ROOT` 并保持 1–5 秒超时。
- hard rules 包括 AWS AK 与 OpenAI `sk-` 硬编码凭据、`rm -rf /` 或 `rm -rf /*`、对 `main` 的 `git push --force` 和直接编辑 `.env`；soft rules 只警告不阻断。
- 不得将安全阻断逻辑移动到 PostToolUse，也不得通过 OpenCode 的旧本地目录绕过 npm 插件路径。

## 变更与验证

1. 先运行 `git status --short`，保留已有的用户改动。
2. 代码发现优先使用 codebase-memory-mcp 图谱工具；仅在图谱不足或搜索非代码文本时回退到 `rg`。
3. 修改产品包时在 `packages/product/` 内保持安装、CLI、hooks 和规则边界；修改 OpenCode 功能时在 `packages/opencode-plugin/` 内保持插件与资源同步边界。
4. 运行与变更匹配的根命令。产品 baseline 变更至少运行 `npm run lint:baseline`；OpenCode 资源变更至少运行 `npm run sync:opencode`；发布准备运行 `npm run release:check`。
5. 结论要区分源码事实、测试/实验事实、线上事实和推断。

## Issue → 分支 → PR（强制）

1. 远程交付必须先有可追踪 Issue。使用本地 `gh` CLI 创建或读取 Issue；Issue 必须为开放状态，包含可观察、可验证的“验收标准”和至少一条 `- [ ]` checklist。
2. 从最新 `main` 创建 `<type>/issue-<number>-<short-slug>` 分支。禁止在 `main`、`master` 或其他默认保护分支上提交。
3. 只暂存当前 Issue 范围的文件。提交使用 Conventional Commits，并在正文或 footer 关联 Issue。
4. 推送前运行对应验证、`git diff --check`，检查暂存区和敏感文件。只允许推送 Issue 分支，严禁直接推送默认分支。
5. 创建 PR 前，用本地 `gh issue view <number> --repo OWNER/REPO --json title,body,state,url` 重新核验 Issue 的开放状态和每项验收标准；逐条保留测试、命令输出或人工检查证据。
6. 只能通过本地 `gh pr create --repo OWNER/REPO` 向 `main` 创建 PR。描述必须包含范围、验证、阻断、Issue 关联和逐条完成的验收标准核验。
7. 仅在 PR 合并且远程 `main` 包含目标提交后删除本地和远程 Issue 分支。

缺少 Issue、目标分支、远程权限或审核条件时，停止发布并报告阻断；不得绕过流程。
