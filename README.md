# oh-my-sdd

面向 Claude Code、通义灵码 Lingma、OpenCode 和 KiloCode 的企业级 SDD 工作流与控制面，作为两个 npm workspace 包发布。

运行时要求：Node.js ≥ 18。

## 快速开始

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
oms-install --tool claude
oms-login  # Claude 路径要求 iam 已就绪
# 重启 Claude Code 后运行 /sdd-spec <change-name>
oms status --tool claude
```

完整的宿主安装、升级、验证与卸载操作请见 [INSTALL.md](INSTALL.md)。

## 核心特性

- 提供 `/sdd-spec`、`/sdd-plan`、`/sdd-task`、`/sdd-apply`、`/sdd-review` 工作流。
- 将企业 baseline 和安全规则适配到四个宿主的原生机制。
- 通过 `oms` 提供状态、诊断和所有权感知修复能力。
- Claude Code 与 OpenCode 可在运行期强制执行 HARD_RULE；KiloCode 为 advisory-only。
- 以 Changesets fixed group 锁步发布产品包与 OpenCode 原生插件包。

## 工作区结构

```
packages/
  product/            @cli-tools/oh-my-sdd：多宿主产品、CLI、安装器与 hooks
  opencode-plugin/    @cli-tools/oh-my-sdd-opencode：OpenCode 原生 npm 插件
__tests__/            Node.js 内置测试运行器的单元与集成测试
```

OpenCode 通过 npm 插件及其 `postinstall` 同步全局资源；不使用已废弃的单包 `opencode/` 目录。

## 配置与常用命令

运行时配置位于 `~/.oh-my-sdd/config.json`。常用命令：

```bash
npm test
npm run lint:baseline
npm run sync:opencode
npm run release:check
npm run release:version

oms status [--tool <id>] [--json]
oms doctor [--tool <id>] [--json]
oms repair [--tool <id>] [--apply]
oms-git-hooks install|uninstall|status [path]
```

## 开发与排障

- 安装、升级、验证、修复和卸载：[INSTALL.md](INSTALL.md)
- 贡献边界、测试与 PR 流程：[CONTRIBUTING.md](CONTRIBUTING.md)
- 面向 Claude Code 的仓库速览：[CLAUDE.md](CLAUDE.md)
- 面向各类 Agent 的完整工作约束：[AGENTS.md](AGENTS.md)
