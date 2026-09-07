# SDD Git 工作流

本流程适用于使用 oh-my-sdd 的项目和本仓库的变更交付。目标是让每项远程交付都能追溯到一个开放 Issue、一个专用分支和一个 PR。

## 产物管理

提交团队共享且可审计的 SDD 产物，例如 `openspec/specs/`、变更目录中的 proposal、delta spec、design、tasks 和 review，以及项目级 OpenSpec 配置。机器本地状态、凭据、`node_modules/`、包产物和本地覆盖配置不得提交。

敏感信息（密钥、token、密码、连接串、`.env` 内容、私钥及客户数据）不得写入 Issue、spec、提交或 PR；先脱敏再记录。

## Issue → 专用分支 → PR

1. 创建或读取一个**开放** Issue。Issue 必须有可观察、可验证的验收标准，并至少包含一项 `- [ ]` checklist。
2. 从最新 `main` 创建专用分支：`<type>/issue-<number>-<short-slug>`。例如 `fix/issue-123-opencode-sync`。
3. 仅在该分支上完成 SDD 产物、实现和测试。不得在 `main`、`master` 或其他默认保护分支直接提交或推送。
4. 只暂存当前 Issue 范围的文件；提交采用 Conventional Commits，并在正文或 footer 关联 Issue。
5. 推送前运行适配的验证、`git diff --check`、敏感文件检查，并确认目标是 Issue 分支。
6. 创建面向 `main` 的 PR 前，用 `gh issue view <number> --repo OWNER/REPO --json title,body,state,url` 重新确认 Issue 仍开放。PR 描述须包含范围、验证、已知阻断、Issue 链接，以及每条验收标准的完成证据。
7. 仅在 PR 合并且远程 `main` 已包含目标提交后，才删除本地和远程 Issue 分支。

缺少开放 Issue、专用分支、远程权限或审核条件时，停止发布并报告阻断；不要以默认分支直推绕过流程。

## SDD 与并行变更

每个 SDD change 对应一个 Issue 分支。若多个 change 修改同一 capability，后合入的分支须 rebase 到最新 `main`、解决 spec 冲突并重新验证。归档后的 specs 是当前系统事实，应随 PR 一起审查。

## 仓库发布检查

本仓库采用 npm workspaces，发布范围分为 `packages/product` 与 `packages/opencode-plugin`。涉及发布时，除功能验证外至少运行：

```bash
npm test
npm run lint:baseline
npm run sync:opencode
npm run release:check
git diff --check
```

不要将 OpenCode 变更放回旧的 `opencode/` 单包目录。OpenCode 通过原生 npm 插件和其 `postinstall` 管理资源；产品包保持安装器、CLI、hooks 和 baseline 边界。
