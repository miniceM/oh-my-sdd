# Contributing to oh-my-sdd

## 工作区边界

本仓库使用 npm workspaces，并发布两个通过 Changesets fixed group 锁步版本化的包：

- `packages/product/`：`@cli-tools/oh-my-sdd`，拥有多宿主安装器、`oms` CLI、hooks、skills、baseline 和控制面。
- `packages/opencode-plugin/`：`@cli-tools/oh-my-sdd-opencode`，拥有 OpenCode 原生 npm 插件、构建产物与资源同步脚本。

不要恢复旧的单包 `opencode/` 目录或将 OpenCode 源码复制为本地插件路径。OpenCode 由 npm 插件和 `postinstall` 资源同步提供。

## 开发与验证

从仓库根目录执行：

```bash
npm test
npm run lint:baseline
npm run sync:opencode
npm run release:check
npm run release:version
```

修改产品包的 baseline 时，保持 `content/enterprise-baseline.md` 的 frontmatter、Sync Impact Report 和正文 token 预算约束，并运行 `npm run lint:baseline`。修改 OpenCode 插件资源同步时运行 `npm run sync:opencode`；发布前运行 `npm run release:check`。

## 扩展指南

- 新增宿主：在 `packages/product/install/hosts/` 实现适配器，并注册到产品包的宿主注册表；明确其 runtime enforcement 或 advisory 能力。
- 新增或修改规则：更新产品包 baseline；需要运行期阻断时同步更新规则引擎与 PreToolUse 路径。不得把阻断逻辑迁移到 PostToolUse。
- 新增 OpenCode 功能：只在 `packages/opencode-plugin/` 内实现插件代码、资源或同步逻辑，并验证构建与同步结果。

## 提交与 PR 流程

所有远程交付必须遵循 Issue → 专用分支 → PR：

1. 使用本地 `gh` CLI 创建或确认一个开放 Issue，并确保其中有可验证的验收标准和 Markdown checklist。
2. 从最新 `main` 创建 `<type>/issue-<number>-<short-slug>` 分支；不得直接在默认分支提交或推送。
3. 仅暂存 Issue 范围内的改动，使用 Conventional Commits，并关联 Issue。
4. 提交前运行匹配的验证、`git diff --check`，并检查暂存内容和敏感文件。
5. 仅推送 Issue 分支；使用本地 `gh pr create --repo OWNER/REPO` 向 `main` 创建 PR。
6. PR 描述必须逐条核验 Issue 验收标准并附上验证证据；合并前不得删除分支。

项目的硬性安全规则、提交格式和发布约束以 [AGENTS.md](AGENTS.md) 为准。
