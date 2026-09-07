# oh-my-sdd 安装与运维指南

本文档是安装、验证、升级、诊断、修复和卸载的唯一操作说明。oh-my-sdd 由两个锁步版本的 npm 包组成：`@cli-tools/oh-my-sdd`（多宿主产品包）和 `@cli-tools/oh-my-sdd-opencode`（OpenCode 原生插件包）。

## 前置条件

需要 Node.js `>= 18` 和 npm `>= 9`。`openspec` 是 `/sdd-review` 归档流程所需的外部 CLI；Claude Code 的企业路径还需要 `iam` CLI。

```bash
npm install -g @fission-ai/openspec
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

`--foreground-scripts` 仅显示安装脚本进度，不影响安装是否成功。

## 安装四个宿主

使用显式宿主参数生成安装计划并执行安装：

```bash
oms-install --tool claude
oms-install --tool lingma
oms-install --tool opencode
oms-install --tool kilocode
```

安装器默认要求交互确认。自动化场景使用 `-y`；只查看计划使用 `--dry-run`；脚本读取结构化结果使用 `--json`：

```bash
oms-install --tool opencode --dry-run --json
oms-install --tool claude -y
```

不传 `--tool` 时，单一已检测宿主可被自动选择；检测到多个宿主时安装器会拒绝执行并要求显式 `--tool`。请在多宿主机器和自动化中始终指定宿主。

### Claude Code

```bash
oms-install --tool claude
oms-login
```

重启 Claude Code 后运行 `/sdd-spec <change-name>`。Claude 的 PreToolUse 路径可运行期阻断 HARD_RULE 违规操作。

### 通义灵码 Lingma

```bash
oms-install --tool lingma
```

重启 Lingma IDE 后运行 SDD 命令。安装器会合并其所管理的资源，保留其他用户配置。

### OpenCode

```bash
oms-install --tool opencode
```

安装器将 `@cli-tools/oh-my-sdd-opencode` 注册为 OpenCode npm 插件。启动 OpenCode 后，插件的 `postinstall` 会同步所需全局 skills、commands 与受管 baseline。OpenCode 可运行期强制执行 HARD_RULE；请勿依据旧的单包 `opencode/` 或本地源码目录判断安装状态。

### KiloCode

```bash
oms-install --tool kilocode
```

重启 KiloCode（如需要，执行 `/reload`）。KiloCode 目前只提供 advisory-only 约束，不具备运行期 HARD_RULE 阻断能力。

## 验证、诊断与修复

`oms` 是首选的跨宿主运维入口：

```bash
oms status [--tool <id>] [--json]
oms doctor [--tool <id>] [--json]
oms repair [--tool <id>] [--apply]
```

`status` 报告写入、注册、加载和强制/建议性保护状态；`doctor` 检查依赖与配置漂移；`repair` 默认只输出修复计划，添加 `--apply` 才会写入。先运行 `oms repair --tool <id>` 审阅计划，再显式应用。

Git 钩子可按仓库管理：

```bash
oms-git-hooks install [path]
oms-git-hooks status [path]
oms-git-hooks uninstall [path]
```

## 升级

升级主包：

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd@latest
oms doctor
```

该命令只升级主包。OpenCode npm 插件由 OpenCode 在启动时按其插件机制另行安装或更新；两个公开包在发布时由 fixed group 锁步版本化，但主包升级不会直接安装或升级该插件。若 `doctor` 报告资源漂移，先审阅 `oms repair` 的计划，再使用 `--apply`。

## 所有权感知卸载

始终先运行卸载器，再移除 npm 主包；卸载器只删除或恢复它拥有的资源，并保留用户修改和其他宿主的配置。

```bash
oms-uninstall --tool claude
oms-uninstall --tool opencode
oms-uninstall
npm uninstall -g @cli-tools/oh-my-sdd
```

`--purge` 会额外清理 oh-my-sdd 的状态数据，仅在确认不再需要诊断记录或重装状态时使用：

```bash
oms-uninstall --purge
```

不要手动递归删除配置目录；这可能移除不属于 oh-my-sdd 的用户资源。
