# 内网发布前实测 Runbook

文件路径保留历史名称；本文内容不绑定特定版本。目标是在内网发布前验证当前已审核的发布候选，而不是记录一次性契约或旧版本结果。

## 范围与权限

- 测试执行者不发布、不创建或推送 tag、不推送任何分支；但 `npm run sync:opencode` 与 pack 生命周期可能写入同步资源快照或构建产物，不能假定所有本地测试均可逆。
- 发布、tag、push、`npm publish`、`npm unpublish` 和回滚仅限授权操作员，并且必须在 Issue → 分支 → PR 完成后执行。
- 不要直接向默认分支推送；发现问题时记录证据并回到关联 Issue。

## 测试前准备

- [ ] 记录待测 commit、关联 Issue 和已合并 PR。
- [ ] 使用专门为本次测试创建的干净隔离 checkout 和临时用户目录，避免污染日常配置。
- [ ] 确认测试环境可访问所需企业服务和目标 npm registry。
- [ ] 开始前 `git status --short` 无输出；只测试明确的发布候选。

## 根目录验证

在仓库根目录运行：

```bash
npm test
npm run lint:baseline
npm run sync:opencode
npm run release:check
git diff --check
```

所有检查都必须通过。失败时停止，保存完整错误输出、环境信息和复现步骤；不要现场修改发布候选来绕过失败。

`npm run sync:opencode` 可能刷新派生资源快照；随后 pack 的 `prepack` 生命周期也可能产生构建文件。上述命令后必须运行 `git status --short` 和 `git diff --exit-code`：发布候选的内容不得漂移。若出现修改或未跟踪产物，停止测试，记录差异；不要把它们留在候选 checkout 中。

## 双包打包与安装演练

先以不落地的方式检查两个 workspace bundle：

```bash
npm pack --dry-run --json --workspace=@cli-tools/oh-my-sdd
npm pack --dry-run --json --workspace=@cli-tools/oh-my-sdd-opencode
```

如需实际 bundle 做安装演练，使用测试专用的临时目录：

```bash
PACK_DIR=$(mktemp -d)
npm pack --workspace=@cli-tools/oh-my-sdd --pack-destination "$PACK_DIR"
npm pack --workspace=@cli-tools/oh-my-sdd-opencode --pack-destination "$PACK_DIR"
```

- [ ] 两个 bundle 的 dry-run/实际输出均成功，且版本相同。
- [ ] 检查包内容，确认产品包包含安装所需资源，OpenCode 包包含其可运行资源。
- [ ] 在隔离环境中从临时目录的本地 bundle 安装并验证基本启动/加载行为。
- [ ] 清理临时目录后，运行 `git status --short` 与 `git diff --exit-code`；两者不得显示候选 checkout 的内容漂移。

发布前可由授权操作员再做不上传的检查：

```bash
npm publish --dry-run --workspace=@cli-tools/oh-my-sdd
npm publish --dry-run --workspace=@cli-tools/oh-my-sdd-opencode
```

dry-run 失败、bundle 内容异常或安装演练失败时，均不得进入正式发布。

## 结果记录与升级

每次实测记录：日期、执行者、平台与 Node/npm 版本、待测 commit、Issue/PR、每项命令的结果、bundle 检查结论，以及任何失败的完整复现信息。

需要恢复时，优先提交修复并发布新的同步版本。任何回滚或 `npm unpublish` 均属高影响/破坏性操作：只能由授权操作员在确认准确目标、影响范围和审批后执行。
