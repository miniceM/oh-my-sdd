# OpenCode E2E Spike Report

> **实验日期**：2026-07-22
>
> **历史状态**：安装、启动与 slash command 探索完成；当时的运行期 HARD_RULE 验证需以当前实现重新执行。
> **生产关系（当前）**：本报告保留实验事实，不定义安装路径或生命周期。生产实现位于 `packages/opencode-plugin`，通过 `@cli-tools/oh-my-sdd-opencode` npm 插件及其 `postinstall` 同步资源。

## 实验事实

本次真实 OpenCode 会话确认了以下运行时约束：

- slash commands 来自 OpenCode 的全局命令发现机制；插件事件钩子不能替代命令资源。
- agent 指令中的“忽略 Skill 调用”会被误解为跳过工作步骤。对 SDD 的委托步骤，应提供可读取的 skill 资源或明确的等价执行说明。
- 安装资源必须区分 package-owned 内容与用户内容；可重复安装、备份/恢复和卸载边界需要端到端验证。
- 运行时失败与测试日志须隔离，不能把测试噪声写成生产故障记录。

这些结论解释了设计选择，但其中涉及的旧分支、旧安装脚本、旧资源目录和历史命令数量均不再是生产接口。

## 当前生产模型

```text
packages/opencode-plugin
  └─ @cli-tools/oh-my-sdd-opencode npm package
       ├─ OpenCode native plugin runtime
       └─ postinstall → OpenCode global package-owned skills, commands, baseline block
```

- 安装器 `oms-install --tool opencode` 负责把 npm plugin 注册到 OpenCode 配置，同时保留用户已有插件条目。
- `postinstall` 将受管 resources 同步到 OpenCode 的全局发现位置，并记录所有权；受管 baseline 仅维护 `AGENTS.md` 的 oh-my-sdd 区块。
- `oms-opencode-uninstall` 是受支持的卸载入口，按所有权记录清理或恢复资源。
- OpenCode 对 HARD_RULE 提供运行期强制；KiloCode 仅为 advisory，不能由本 spike 推断为强制。

## 当前复验步骤

1. 在 workspace 根运行 `npm run sync:opencode`，再构建插件：`npm run build --workspace=@cli-tools/oh-my-sdd-opencode`。
2. 在隔离 shell 中执行以下完整链路；它把 HOME 和 npm 全局前缀限制在临时目录，随后先安装主产品包，再由 `oms-install` 通过 OpenCode CLI 安装并注册原生 npm plugin：

   ```bash
   export OMS_TEST_HOME="$(mktemp -d)"
   export HOME="$OMS_TEST_HOME"
   export npm_config_prefix="$OMS_TEST_HOME/.npm-global"
   export PATH="$npm_config_prefix/bin:$PATH"
   npm install -g --foreground-scripts @cli-tools/oh-my-sdd
   oms-install --tool opencode --yes
   ```

   `oms-install --tool opencode` 是原生包 `@cli-tools/oh-my-sdd-opencode` 的生产入口；它负责通过 OpenCode CLI 安装/注册该插件并触发其资源同步。不要另行以全局 `npm install` 安装原生包，除非专门测试其 npm lifecycle；也不要创建或引用旧 `opencode/` 目录。
3. 重启 OpenCode，确认 `/sdd-spec` 可发现，并确认受管 skills、commands 与 baseline block 存在且用户配置保留。
4. 执行一个不含真实凭据的 HARD_RULE 负例，记录插件拒绝行为和目标文件状态。
5. 仅在明确同意清理上述隔离测试环境后执行 `oms-opencode-uninstall`，确认它只处理所有权清单中的资源；不得把此命令作为无副作用的存在性或帮助检查。

将本次复验的日期、OpenCode 版本、npm 包版本、命令输出和观察结果追加到该文档；不要把一次实验的目录结构或资源计数提升为长期契约。
