# npm 发布指南

本指南面向第一次参与发布的开发者。实际发布、tag、远端推送、`npm publish`、`npm unpublish` 和回滚都只能由已授权操作员在 Issue → 分支 → PR 完成后执行；本文不会引导直接向默认分支推送。

## 发布的两个包为何必须同步

根目录是 npm workspace 编排项目，发布产物有两个：

| 包 | 作用 |
| --- | --- |
| `@cli-tools/oh-my-sdd` | 产品包：安装器、CLI、hooks、skills、baseline 和控制面。 |
| `@cli-tools/oh-my-sdd-opencode` | OpenCode 原生插件及其同步资源。 |

它们位于 Changesets 的 `fixed` 组。可以把 fixed 组理解成“绑在一起的版本号”：任一成员需要升级时，两者都必须使用相同的新版本。因此不要手改其中一个 `package.json` 的版本，也不要只发布其中一个包。

## 从变更到可发布版本

1. 为发布工作建立可追踪 Issue，写明验收标准和 checklist。
2. 从最新默认分支创建非默认发布分支，在该分支完成改动和 Changeset。
3. 仍在发布分支的仓库根目录运行版本生成器：

```bash
npm run release:version
```

该命令根据 Changesets 更新 fixed 组版本与相关发布元数据。随后运行：

```bash
npm run release:check
```

检查应确认发布资料一致，尤其是两个 workspace 的版本保持相同。将版本生成结果与其余发布改动一并提交，创建 PR、完成审阅并合并；不要先合并 PR 再在默认分支生成版本，也不要把版本生成当成跳过审阅的理由。

## 先验证，再看 bundle

发布前在仓库根目录执行以下安全检查：

```bash
npm test
npm run lint:baseline
npm run sync:opencode
npm run release:check
git diff --check
```

这里的 `npm run sync:opencode` 会使 OpenCode 发布资源与产品包保持同步。任一检查失败时，停止发布，修复并重新验证。

先以不落地的方式检查 bundle：

```bash
npm pack --dry-run --json --workspace=@cli-tools/oh-my-sdd
npm pack --dry-run --json --workspace=@cli-tools/oh-my-sdd-opencode
```

检查输出的包名、相同版本号和内容。如需真实 `.tgz` 进行安装演练，使用临时目标目录，避免把产物写到仓库根目录：

```bash
PACK_DIR=$(mktemp -d)
npm pack --workspace=@cli-tools/oh-my-sdd --pack-destination "$PACK_DIR"
npm pack --workspace=@cli-tools/oh-my-sdd-opencode --pack-destination "$PACK_DIR"
git status --short
```

从该临时目录安装和验证两个 bundle 后，清理临时目录，并再次确认 `git status --short` 未出现意外产物或内容漂移。这能在任何远端变更前发现漏文件、构建产物或安装问题。

## dry-run 与正式发布

`npm publish --dry-run` 不会向 registry 上传包，是正式发布前最后一次查看上传内容的机会。授权发布操作员在 Issue、分支与 PR 已完成，且前述验证全部通过后，执行：

```bash
npm publish --dry-run --workspace=@cli-tools/oh-my-sdd
npm publish --dry-run --workspace=@cli-tools/oh-my-sdd-opencode
```

确认 dry-run 无误后，仍只有授权发布操作员可以执行会改变 registry 状态的正式 `npm publish`，并且必须发布两个包。发布后查询 registry 中两个包的版本，再在独立测试机安装验证。

创建/推送 release tag 或推送发布分支同样是远端状态变更，只能由授权操作员针对已审核的发布结果执行；禁止直接向 `main` 或其他默认分支推送。

## 出错时怎么处理

先停止：不要因为一个包已经发布就仓促发布另一个包或修改默认分支。保留 dry-run、验证和 registry 查询输出，并回到关联 Issue/PR 处理。

回滚属于高影响操作。优先发布修复版本或按 registry 策略标记旧版本不推荐使用。`npm unpublish` 是破坏性操作，只能在明确审批、确认精确包名/版本/registry 与影响范围后由授权操作员执行，绝不是常规补救步骤。
