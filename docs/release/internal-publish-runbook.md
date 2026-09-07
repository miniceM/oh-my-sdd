# 内网发布清单

仅限已获授权的发布操作员使用。发布、创建或推送 tag、推送分支、`npm publish` 及任何回滚操作，都必须在 Issue → 分支 → PR 已完成后执行；不要直接向默认分支推送。

## 1. 先确认发布来源

- [ ] 对应 Issue 仍为开放状态，包含可验证的验收标准和 checklist。
- [ ] 版本改动已在非默认发布分支上生成、检查、提交并经 PR 审阅合并；记录 Issue、PR 和待发布 commit。
- [ ] 工作区没有无关改动：`git status --short`。
- [ ] 版本改动由 `npm run release:version` 生成；不要手工分别修改两个包的版本。
- [ ] `npm run release:check` 通过，并确认两个包版本相同。

## 2. 验证与打包演练（先于发布）

在发布来源的根目录运行：

```bash
npm test
npm run lint:baseline
npm run sync:opencode
npm run release:check
git diff --check
npm pack --dry-run --json --workspace=@cli-tools/oh-my-sdd
npm pack --dry-run --json --workspace=@cli-tools/oh-my-sdd-opencode
git status --short
git diff --exit-code
```

- [ ] 所有命令通过；任一失败即停止发布并修复后重新走 Issue → 分支 → PR。
- [ ] dry-run 输出中的两个 bundle 名称、版本和内容均已检查；确认它们是同一版本，且包含各自的运行产物。
- [ ] dry-run 后工作区仍无内容漂移；OpenCode 的 prepack/sync 若写入资源快照或产物，停止并记录差异。
- [ ] 如需实际 `.tgz` 做隔离安装演练，在临时目录使用 `--pack-destination`；演练后运行 `git status --short`，清理临时目录和产物。
- [ ] 在隔离测试环境从生成的包进行安装与基本功能验证；不要把本机用户环境当作演练环境。

## 3. 授权发布操作

只有授权发布操作员可在上述核验通过后执行。以下操作会改变远端状态：

- 推送已审核的发布分支与 release tag（禁止直接推送默认分支）。
- 向配置好的企业 registry 发布两个包：`@cli-tools/oh-my-sdd` 和 `@cli-tools/oh-my-sdd-opencode`。
- 发布后查询 registry，确认两个包均可解析到相同版本；再在独立测试机安装验证。

发布前先用包级 dry-run 检查将上传的内容：

```bash
npm publish --dry-run --workspace=@cli-tools/oh-my-sdd
npm publish --dry-run --workspace=@cli-tools/oh-my-sdd-opencode
```

如果任一 dry-run、发布或安装验证失败，停止后续动作，保留命令输出并关联到 Issue/PR。

## 4. 回滚与记录

回滚是破坏性/高影响操作，仅限授权发布操作员按组织审批执行。优先发布一个修复版本或将有问题版本标记为不推荐使用；不要把 `npm unpublish` 当作常规回滚手段。若审批要求撤销发布，先确认准确的包名、版本、registry 和影响范围，再执行已批准的操作。

- [ ] 记录发布者、时间、Issue、PR、tag、两个包的版本及测试证据。
- [ ] 将故障、恢复措施和后续修复 Issue 通知相关使用者。
