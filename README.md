# @cli-tools/oh-my-sdd

企业级 SDD 工作流 Claude Code 插件。

**核心能力：**
- 5 个 SDD 斜杠命令：`/sdd-spec` `/sdd-plan` `/sdd-task` `/sdd-apply` `/sdd-review`
- 企业 Agent baseline 注入到主会话 system prompt
- 与企业统一身份认证（AIH / `iam` CLI）对接，首次引导 + 静默续期
- 与企业绩效管理平台（DOP）对接，上报会话/命令/代码量

## 快速开始

```bash
# 1. 全局安装
npm install -g @cli-tools/oh-my-sdd

# 2. 完成 iam 身份认证（首次）
oms-login

# 3. 重启 Claude Code，开始使用
#    /sdd-spec <change-name>
```

## 配置

配置文件位置：`~/.oh-my-sdd/config.json`

```json
{
  "dop_endpoint": "https://dop.enterprise.com",
  "aih_system_name": "sdd",
  "log_level": "info",
  "telemetry_disabled": false
}
```

**退出埋点：**
- 用户全局：设 `telemetry_disabled: true`
- 项目级：在项目根目录创建 `.sdd-no-telemetry` 文件

## 卸载

```bash
npm uninstall -g @cli-tools/oh-my-sdd
# 或彻底清理：
oms-uninstall --purge
```

## 设计文档

完整设计见 `docs/superpowers/specs/2026-06-18-oh-my-sdd-design.md`。

实施计划见 `docs/superpowers/plans/2026-06-18-oh-my-sdd-v0.1.md`。

## 系统要求

- Node.js ≥ 18
- 操作系统：Windows 10/11、macOS、Linux（x64/arm64）
- `iam` CLI（企业统一身份认证工具）

## 许可

UNLICENSED（企业内部使用）
