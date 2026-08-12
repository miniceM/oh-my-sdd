# oh-my-sdd 安装指南

> 版本：与当前代码同步 · 最后更新：2026-08-12 · 负责人：oh-my-sdd 团队 · 评审：待评审

本文档说明 `@cli-tools/oh-my-sdd` 主包及 OpenCode 子包的安装、验证、升级和卸载。安装器支持 Claude Code、通义灵码 Lingma、OpenCode 和 KiloCode。

## 快速导航

- [前置依赖](#前置依赖)
- [安装主包](#安装主包)
- [Claude Code](#claude-code)
- [OpenCode](#opencode)
- [通义灵码 Lingma](#通义灵码-lingma)
- [KiloCode](#kilocode)
- [多工具并存与自动检测](#多工具并存与自动检测)
- [验证安装](#验证安装)
- [故障排除](#故障排除)
- [卸载](#卸载)

## 前置依赖

### 通用依赖

| 依赖 | 要求 | 检查命令 | 说明 |
| --- | --- | --- | --- |
| Node.js | `>= 18.0.0` | `node --version` | 主包和 OpenCode 子包的运行时要求 |
| npm | `>= 9.0.0` | `npm --version` | 用于全局安装和 OpenCode 插件安装 |
| openspec CLI | 推荐安装 | `openspec --version` | `/sdd-review` 归档阶段必需 |

安装 `openspec`：

```bash
npm install -g @fission-ai/openspec
```

未安装 `openspec` 时，其他安装步骤仍可继续，但 `/sdd-review` 的归档阶段会阻塞。

### 工具依赖

| 工具 | 安装前提 | 安装器行为 |
| --- | --- | --- |
| Claude Code | 可执行的 `claude` CLI；企业环境还需要 `iam` CLI | 注册 marketplace、安装 Claude plugin，并尝试安装 wrapper |
| OpenCode | OpenCode CLI 或 `~/.config/opencode/` 目录 | 注册 npm 插件到 `opencode.json`；资源由 OpenCode 安装插件时的 `postinstall` 同步 |
| 通义灵码 Lingma | Lingma IDE 或 `lingma` CLI | 写入 skills、baseline 和 hooks |
| KiloCode | KiloCode IDE 或 `kilo` CLI | 写入 skills 和 advisory-only `AGENTS.md` |

安装器的前置检查只输出警告，不会因为目标工具尚未安装而阻止显式安装。

## 安装主包

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

`--foreground-scripts` 只影响 npm 是否显示 `postinstall` 进度，不是安装成功的必要条件。安装后可使用以下命令：

```bash
oms-install --help
oms-uninstall --help
oms-login --help
```

主包安装时会执行一次自动检测；要明确安装某个工具，请继续执行对应的 `oms-install --tool <name>`。

## Claude Code

### 安装

```bash
oms-install --tool claude
```

安装器会：

- 检测 `claude --version` 是否能够成功执行；不可执行时跳过 Claude 专属步骤并返回成功。
- 注册 `oh-my-sdd` marketplace 并安装 Claude plugin。
- 在找到原始 `claude` 二进制时安装 wrapper，通过 `--append-system-prompt-file` 注入企业 baseline。
- 初始化共享状态目录 `~/.oh-my-sdd/`。

首次使用前完成企业身份认证并重启 Claude Code：

```bash
oms-login
```

如果安装时未找到原始 `claude` 二进制，先安装 Claude Code，再重新触发主包安装：

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

### 验证

```bash
claude --version
oms-wrapper-verify
test -f ~/.claude/skills/sdd-spec/SKILL.md
```

在 Claude Code 中重启会话后运行 `/sdd-spec <change-name>`。

## OpenCode

OpenCode 使用两个相互配合的安装路径：主包安装器负责注册 npm 插件；`@cli-tools/oh-my-sdd-opencode` 的 `postinstall` 负责将插件资源复制到 OpenCode 的全局发现目录。主包安装器不会把 TypeScript 源码复制到 `~/.config/opencode/plugins/oh-my-sdd/`。

### 方式一：通过主包安装器注册 npm 插件

先安装主包，再运行：

```bash
oms-install --tool opencode
```

该命令会在 `~/.config/opencode/opencode.json` 的 `plugin` 数组中加入：

```json
"@cli-tools/oh-my-sdd-opencode"
```

然后启动 OpenCode。OpenCode 会按 npm 插件机制安装并更新 `@cli-tools/oh-my-sdd-opencode`；其 `postinstall` 会同步以下资源：

- OMS skills：`~/.config/opencode/skills/<skill>/SKILL.md`
- 8 个委托/支持 skills：同一 `skills` 目录
- SDD commands：`~/.config/opencode/commands/sdd-*.md`
- 企业 baseline：`~/.config/opencode/AGENTS.md` 中的单个受管区块
- 跨工具镜像：`~/.agents/skills/` 和 `~/.agents/command/`
- 所有权清单：`~/.oh-my-sdd/opencode-npm-resources.json`

`postinstall` 是幂等的：内容未变化时保留原文件；发现用户修改时保留用户内容并输出警告。安装失败采用 fail-open，不会让 npm 安装因资源同步失败而退出。

### 方式二：直接安装 OpenCode 子包

适用于本仓库开发、测试或需要独立安装 OpenCode 插件的场景：

```bash
cd opencode
npm install -g --foreground-scripts .
```

该命令会执行子包的 `postinstall`，同步上面的 skills、commands、`AGENTS.md` 和所有权清单。升级或诊断资源发现路径时，可重复执行同一命令。

验证：

```bash
test -f ~/.config/opencode/skills/sdd-plan/SKILL.md
test -f ~/.config/opencode/skills/brainstorming/SKILL.md
test -f ~/.config/opencode/commands/sdd-plan.md
test -f ~/.config/opencode/AGENTS.md
```

重启 OpenCode 后运行 `/sdd-spec <change-name>` 或 `/sdd-plan <change-name>`。

### OpenCode 配置说明

主包安装器维护 `~/.config/opencode/opencode.json` 中的 npm 插件条目；卸载时只移除 oh-my-sdd 相关条目并保留其他插件和用户配置。OpenCode baseline 通过 `~/.config/opencode/AGENTS.md` 的受管区块注入，不创建额外的 system message。

OpenCode 适配层将安全 hook 的 deny 结果转换为 OpenCode 的异常，从而阻止工具调用。请勿把 `~/.config/opencode/plugins/oh-my-sdd/` 是否存在作为安装成功条件；该目录属于旧版本地插件路径，当前生产路径是 npm 插件加全局发现目录。

## 通义灵码 Lingma

### 安装

```bash
oms-install --tool lingma
```

安装器会写入：

- skills：`~/.lingma/skills/`
- baseline：`~/.lingma/rules/oh-my-sdd.md`
- hooks：合并到 `~/.lingma/settings.json` 的 `PreToolUse`、`PostToolUse`、`UserPromptSubmit` 和 `Stop` 事件
- 所有权哨兵：`~/.oh-my-sdd/baseline-lingma.sentinel`

安装器只删除或更新自身记录的 skills 和 hook handlers，会保留用户的其他内容。重启通义灵码 IDE 后运行 `/sdd-spec <change-name>`。

验证：

```bash
test -f ~/.lingma/skills/sdd-spec/SKILL.md
test -f ~/.lingma/rules/oh-my-sdd.md
test -f ~/.lingma/settings.json
```

该适配基于 Lingma 文档实现，仍需在真实 Lingma 环境完成完整 e2e 验证。

## KiloCode

### 安装

```bash
oms-install --tool kilocode
```

安装器会写入：

- skills：`~/.kilo/skills/`
- baseline：`~/.config/kilo/AGENTS.md` 中的受管区块
- 所有权哨兵：`~/.oh-my-sdd/baseline-kilocode.sentinel`

KiloCode 当前没有 hooks 系统，因此 baseline 仅是 advisory-only 约束，HARD_RULE 不会在运行期被 hook 强制阻断。安装后在 KiloCode 中运行 `/reload`。

验证：

```bash
test -f ~/.kilo/skills/sdd-spec/SKILL.md
test -f ~/.config/kilo/AGENTS.md
```

## 多工具并存与自动检测

同一台机器可以同时安装多个工具。每个适配器使用独立的 skills/config 路径，共享状态目录为 `~/.oh-my-sdd/`。

```bash
oms-install --tool claude
oms-install --tool lingma
oms-install --tool opencode
oms-install --tool kilocode
```

不传 `--tool` 时，安装器按注册表顺序检查第一个已安装工具：

1. Claude Code：`claude --version` 成功
2. Lingma：`lingma` CLI 或 `~/.lingma/` 存在
3. OpenCode：`opencode` CLI 或 `~/.config/opencode/` 存在
4. KiloCode：`kilo` CLI、`~/.kilo/` 或 `~/.config/kilo/` 存在
5. 都未检测到时回退到 `claude`，保持旧版 npm postinstall 行为

因此，在多工具环境中请使用显式的 `--tool`，不要依赖自动检测。

## 验证安装

### 通用验证

```bash
node --version       # >= 18.0.0
npm --version        # >= 9.0.0
openspec --version
which oms-install    # Windows PowerShell 使用: Get-Command oms-install
which oms-uninstall  # Windows PowerShell 使用: Get-Command oms-uninstall
```

检查共享配置（首次安装后由运行时按需生成）：

```bash
test -f ~/.oh-my-sdd/config.json && cat ~/.oh-my-sdd/config.json
```

默认配置为：

```json
{
  "dop_endpoint": "https://dop.enterprise.com",
  "aih_system_name": "sdd",
  "log_level": "info",
  "telemetry_disabled": false
}
```

### Windows 路径

文档中的 `~` 表示当前用户 home 目录。PowerShell 可使用 `$HOME` 替换 `~`；例如：

```powershell
Test-Path "$HOME\.kilo\skills\sdd-spec\SKILL.md"
Test-Path "$HOME\.config\opencode\AGENTS.md"
```

## 故障排除

### `npm install` 没有安装进度

使用 `--foreground-scripts` 查看 postinstall 输出：

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

也可以设置 npm 默认显示生命周期脚本：

```bash
npm config set foreground-scripts true
```

### `oms-install` 或 `oms-login` 找不到

检查 npm 全局 bin 目录是否在 `PATH`：

```bash
npm config get prefix
export PATH="$(npm config get prefix)/bin:$PATH"
```

Windows 请在 PowerShell 中使用 `Get-Command oms-install` 检查，并将 npm 全局 bin 目录加入用户 `PATH`。

### Claude Code 未识别 `/sdd-spec`

确认 skill 和 CLI：

```bash
test -f ~/.claude/skills/sdd-spec/SKILL.md
claude --version
```

然后重启 Claude Code；如果 wrapper 或插件未刷新，重新执行：

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
oms-install --tool claude
```

### OpenCode 未加载插件或 commands

按顺序检查：

```bash
grep -n "@cli-tools/oh-my-sdd-opencode" ~/.config/opencode/opencode.json
test -f ~/.config/opencode/skills/sdd-plan/SKILL.md
test -f ~/.config/opencode/commands/sdd-plan.md
test -f ~/.config/opencode/AGENTS.md
```

如果资源不存在，直接重跑 OpenCode 子包的 postinstall：

```bash
cd opencode
npm install -g --foreground-scripts .
```

如果使用主包安装器，重跑注册步骤：

```bash
oms-install --tool opencode
```

不要用 `~/.config/opencode/plugins/oh-my-sdd/index.js` 作为验证路径；当前生产安装不复制该本地插件目录。

### `openspec` 找不到

```bash
npm install -g @fission-ai/openspec
```

### Claude 身份认证失败

```bash
which iam
oms-login
```

Claude 路径会在未找到 `iam` 时给出警告，但首次企业会话仍需要完成认证。

### npm 全局安装权限不足

macOS/Linux 建议使用 nvm 或 Node 版本管理器安装 Node.js，避免使用 root 执行 npm。Windows 请将 npm 全局 bin 目录加入用户 `PATH`，必要时使用管理员 PowerShell。

## 卸载

### 单工具卸载

只清理指定适配器，保留其他工具：

```bash
oms-uninstall --tool claude
oms-uninstall --tool lingma
oms-uninstall --tool opencode
oms-uninstall --tool kilocode
```

卸载器按所有权记录清理资源：会恢复安装前备份，保留安装后被用户修改的文件，并只移除 `AGENTS.md` 中的 oh-my-sdd 受管区块。OpenCode 的 `oms-opencode-uninstall` 仅适用于独立安装的 OpenCode 子包。

### 完整卸载主包

必须先运行仍由主包提供的卸载器，再移除 npm 包：

```bash
oms-uninstall
npm uninstall -g @cli-tools/oh-my-sdd
```

现代 npm 不应依赖卸载生命周期脚本清理所有资源。`~/.oh-my-sdd/` 状态目录默认保留，便于重装复用。

### 彻底清空状态目录

```bash
oms-uninstall --purge
npm uninstall -g @cli-tools/oh-my-sdd
```

`--purge` 必须在包仍然安装时执行，因为执行完 npm 卸载后 `oms-uninstall` 命令将不可用。该命令会删除 `~/.oh-my-sdd/`，请确认其中没有需要保留的日志、配置或备份。

### 独立 OpenCode 子包卸载

如果使用 `cd opencode && npm install -g .` 安装，而不是通过主包注册，请使用子包提供的 ownership-aware 卸载器：

```bash
oms-opencode-uninstall
```

它会先移除全局 npm 包，再根据 `~/.oh-my-sdd/opencode-npm-resources.json` 恢复或清理资源；用户修改过的资源会被保留。

## 相关文档

- [项目 README](README.md)
- [OpenCode 子包说明](opencode/README.md)
- [企业 baseline](content/enterprise-baseline.md)
- [贡献指南](CONTRIBUTING.md)
