# Claude Code 仓库速览

oh-my-sdd 是支持 Claude Code、Lingma、OpenCode 和 KiloCode 的企业 SDD 工作流与控制面。它是 npm workspace 项目，而非单一包：

- `packages/product/` 提供 `@cli-tools/oh-my-sdd`，包括多宿主安装器、`oms` CLI、hooks、skills 和 baseline。
- `packages/opencode-plugin/` 提供 `@cli-tools/oh-my-sdd-opencode`，包括 OpenCode 原生 npm 插件及资源同步。

两个公开包通过 Changesets fixed group 锁步版本化。OpenCode 通过 npm 插件和 `postinstall` 同步资源，不使用旧的单包 `opencode/` 路径。

## 常用命令

```bash
npm test
npm run lint:baseline
npm run sync:opencode
npm run release:check
npm run release:version

oms status [--tool <id>] [--json]
oms doctor [--tool <id>] [--json]
oms repair [--tool <id>] [--apply]
oms-install --tool claude|lingma|opencode|kilocode [--dry-run] [--json] [-y]
oms-uninstall [--tool <name>] [--purge]
oms-git-hooks install|uninstall|status [path]
```

多宿主自动检测会拒绝并要求 `--tool`。Claude Code 与 OpenCode 可以运行期强制执行 HARD_RULE；KiloCode 仅 advisory。

## 关键实现约束

- PreToolUse 是写入前的安全门禁；PostToolUse 只用于写后遥测，不能阻断写入。
- baseline 位于 `packages/product/content/enterprise-baseline.md`；修改它必须维护版本治理信息并运行 `npm run lint:baseline`。
- hooks 的 stdin 是 JSON，stdout 也是 JSON；使用 `CLAUDE_PLUGIN_ROOT` 定位产品根，并保持 1–5 秒超时。
- 产品包与 OpenCode 插件包的职责不得交叉；跨包变更需验证两个包的发布和同步边界。

完整工作规则、硬性安全约束和交付流程见 [AGENTS.md](AGENTS.md)。
