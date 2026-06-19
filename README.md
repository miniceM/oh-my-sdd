# @cli-tools/oh-my-sdd

企业级 SDD 工作流 Claude Code 插件。

**核心能力：**
- 5 个 SDD 斜杠命令：`/sdd-spec` `/sdd-plan` `/sdd-task` `/sdd-apply` `/sdd-review`
- 企业 Agent baseline 注入到主会话 system prompt
- 与企业统一身份认证（AIH / `iam` CLI）对接，首次引导 + 静默续期
- 与企业绩效管理平台（DOP）对接，上报会话/命令/代码量

## 快速开始

```bash
# 1. 全局安装（加 --foreground-scripts 才能看到 postinstall 输出）
npm install -g --foreground-scripts @cli-tools/oh-my-sdd

# 2. 完成 iam 身份认证（首次）
oms-login

# 3. 重启 Claude Code，开始使用
#    /sdd-spec <change-name>
```

> 💡 **关于 `--foreground-scripts`**：npm 默认静默 postinstall 输出（即使 stderr 也吞），加这个 flag 才能看到安装进度和"下一步"提示。**不加也能装成功**，只是看不到提示——安装失败时 npm 会自动显示所有输出。
>
> 如果想默认看到，可以设 npm config：
> ```bash
> npm config set foreground-scripts true
> ```

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

**必需**：
- Node.js ≥ 18
- npm ≥ 9
- claude CLI（Claude Code）
- `iam` CLI（企业统一身份认证工具）
- `openspec` CLI —— spec 保鲜的核心，archive 时自动 merge delta 到 `openspec/specs/`，让项目 specs 永远反映系统现状
  ```bash
  npm install -g @fission-ai/openspec
  ```
  未装时 `/sdd-review` 归档阶段会**阻塞**（不再有 mv fallback——mv 不 merge，破坏保鲜）。

**推荐（非必需）**：
- `superpowers` 6.x Claude Code 插件 —— `/sdd-spec/plan/apply/review` 委托它做工作流指导（brainstorming/writing-plans/executing-plans/code-review）
- `gh` CLI —— `/sdd-spec` 创建 issue + 分支、`/sdd-review` 创建 PR

**操作系统**：Windows 10/11、macOS、Linux（x64/arm64）

## 许可

UNLICENSED（企业内部使用）
