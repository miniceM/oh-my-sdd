# oh-my-sdd 产品包

`@cli-tools/oh-my-sdd` 是 oh-my-sdd 的多宿主安装器与控制面，面向 Claude Code、通义灵码 Lingma、OpenCode 和 Kilo Code。它负责发现宿主、安装受管资源，并通过统一 CLI 报告实际加载与保护状态。

## 双包边界

- `@cli-tools/oh-my-sdd`（本包）：四个宿主的安装、卸载、诊断与修复控制面，以及 Claude、Lingma、Kilo Code 的适配资源。
- `@cli-tools/oh-my-sdd-opencode`：OpenCode 的原生 npm 插件。它由 OpenCode 的插件机制在运行时加载，并在 `postinstall` 同步该宿主所需的全局资源。

不要从已废弃的本地源码目录安装流程判断 OpenCode 状态；使用本包的安装器和 `oms doctor` 获取证据。

## 安装与宿主能力

需要 Node.js 18+ 与 npm 9+。安装主包后，显式选择需要的宿主：

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
oms-install --tool claude
oms-install --tool lingma
oms-install --tool opencode
oms-install --tool kilocode
```

Claude Code 和 OpenCode 在运行时能够通过写入前 hook 强制执行 HARD_RULE；安装或插件注册本身不等同于已加载或已强制。Lingma 的状态由控制面按实际宿主证据报告。Kilo Code 没有写入前 hook，规则仅为 advisory（建议性）约束，不能视为运行时阻断。

OpenCode 安装会注册独立的原生插件。启动 OpenCode 后再检查其运行时加载状态。

## 运维

```bash
oms status [--tool <id>] [--json]
oms doctor [--tool <id>] [--json]
oms repair [--tool <id>] [--apply]
```

`oms doctor` 用于诊断依赖缺失、配置漂移和真实生效状态；`oms repair` 默认只展示修复计划，只有传入 `--apply` 才会写入。

卸载时先使用所有权感知卸载器，避免删除其他工具或用户的配置：

```bash
oms-uninstall --tool opencode
oms-uninstall --tool claude
oms-uninstall
npm uninstall -g @cli-tools/oh-my-sdd
```

`oms-uninstall --purge` 还会删除 oh-my-sdd 状态数据，只应在不再需要诊断或重装状态时使用。

完整安装、升级和卸载说明见[仓库的 INSTALL.md](https://github.com/enterprise/oh-my-sdd/blob/main/INSTALL.md)。
