# oh-my-sdd 发布前 Smoke Test Checklist

在干净工作目录完成下列检查。记录命令、退出码、平台和必要的人工观察；不要用固定测试总数作为通过条件。

## 1. 根测试与发布一致性

- [ ] `npm test` 退出码为 0。
- [ ] `npm run release:check` 退出码为 0，两个 workspace 包的锁步版本与发布元数据一致。
- [ ] `git diff --check` 无空白错误；暂存区仅包含当前 Issue 范围的文件。

## 2. Baseline

- [ ] `npm run lint:baseline` 退出码为 0。
- [ ] 手工确认 baseline SSOT 为 `packages/product/content/enterprise-baseline.md`，frontmatter 和 Sync Impact Report 与正文一致。
- [ ] Claude Code 写入 HARD_RULE 样例时，`PreToolUse` 在工具执行前拒绝，目标文件未落盘。
- [ ] `PostToolUse` 只用于遥测/上下文反馈；不将其结果作为阻断成功的证据。

## 3. OpenCode 资源同步

- [ ] `npm run sync:opencode` 退出码为 0。
- [ ] 通过安装 `@cli-tools/oh-my-sdd-opencode` 或运行其受支持的安装路径，确认 `postinstall` 同步 package-owned resources。
- [ ] 确认 OpenCode 配置使用 npm plugin `@cli-tools/oh-my-sdd-opencode`，没有旧 `opencode/` 本地目录引用。
- [ ] 验证受管 skills、`sdd-*.md` commands 与 `AGENTS.md` 中的 oh-my-sdd 受管 baseline block 可被发现；用户在受管区块外的配置保留。
- [ ] 在隔离的 HOME、测试用户或一次性 OpenCode 配置中运行一个 HARD_RULE 负例，确认插件运行期拒绝；仅在明确同意清理该测试环境后执行 `oms-opencode-uninstall`，并确认仅受管资源被清理或恢复。

## 4. 两包构建与打包

- [ ] `npm run build --workspace=@cli-tools/oh-my-sdd` 退出码为 0。
- [ ] `npm run build --workspace=@cli-tools/oh-my-sdd-opencode` 退出码为 0。
- [ ] 分别执行两个包的 `npm pack --dry-run`，检查发布内容不含源码工作区垃圾、凭据或废弃 `opencode/` 目录。

## 5. CLI 帮助与宿主验证

- [ ] `oms --help`、`oms-install --help`、`oms-uninstall --help` 均可用；用 `command -v oms-opencode-uninstall` 确认 OpenCode 卸载命令已安装。不要以 `--help` 调用该卸载命令，它会执行全局卸载/清理。
- [ ] `oms status --tool claude` 与 `oms status --tool opencode` 显示对应宿主的探测/保护状态。
- [ ] Claude Code 运行 `/sdd-spec`，确认安装的产品包可被发现。
- [ ] OpenCode 重启后运行 `/sdd-spec`，确认 npm 插件提供的资源可被发现。
- [ ] KiloCode 安装和 `oms status --tool kilocode` 显示 `advisory`；不得把它记录为运行期强制。

## 6. 交付门禁

- [ ] 开放 Issue 有可验证验收标准和 checklist；工作位于 `<type>/issue-<number>-<short-slug>` 分支。
- [ ] PR 面向 `main`，描述包含范围、验证、阻断、Issue 关联及逐条验收证据。
- [ ] 未向默认分支直接推送。
