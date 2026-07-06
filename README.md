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

## 强制约束体系（洋葱模型）

oh-my-sdd 采用 **7 层洋葱模型** 实现强制约束，借鉴自 spec-kit 的 Constitution 体系。每一层从外到内逐步收紧，核心原则是"安全 > 合规 > 稳定 > 效率"。

```
┌─────────────────────────────────────────────────────┐
│  Layer 7: CI gate                                   │ ← 测试守护 baseline 完整性
│  (constitution-integrity.test.js + lint)            │
├─────────────────────────────────────────────────────┤
│  Layer 6: Amendment 治理                            │ ← /sdd-constitution SemVer 修订流程
│  (sdd-constitution skill + Sync Impact Report)      │
├─────────────────────────────────────────────────────┤
│  Layer 5: Mandatory hooks                           │ ← PreToolUse hard gate (真正阻断)
│  (pre-tool-use.js: HARD deny / SOFT warn)           │
├─────────────────────────────────────────────────────┤
│  Layer 4: Analyze CRITICAL                          │ ← /sdd-review 自动升级 HARD_RULE 违反
│  (sdd-review skill + OVERRIDE 扫描)                 │
├─────────────────────────────────────────────────────┤
│  Layer 3: Plan gate                                 │ ← /sdd-plan 强制 Constitution Check 节
│  (sdd-plan skill + design.md 必须含规则清单)         │
├─────────────────────────────────────────────────────┤
│  Layer 2: 注入层                                    │ ← system prompt 注入 baseline
│  (wrapper --append-system-prompt-file)              │
├─────────────────────────────────────────────────────┤
│  Layer 1: 数据层                                    │ ← 版本化治理文档
│  (enterprise-baseline.md + frontmatter)             │
└─────────────────────────────────────────────────────┘
```

### 各层详解

**Layer 1: 数据层**
- 文件：`content/enterprise-baseline.md`
- 格式：YAML frontmatter（`oms_version` / `ratified` / `last_amended`）+ Sync Impact Report + 正文
- 版本化：SemVer bump 流程（MAJOR=原则重定义，MINOR=新原则，PATCH=措辞）
- Token 预算：正文 ≤ 1000 token（`scripts/check-baseline-tokens.mjs` 校验）

**Layer 2: 注入层**
- 路径：`wrappers/claude.sh` / `wrappers/claude.ps1` → `claude` 命令入口
- 机制：通过 `--append-system-prompt-file` 参数自动注入 `rules/enterprise-baseline.md`
- 安装：npm postinstall 自动安装 wrapper 到 `~/.local/bin/`（无需管理员权限）
- 绕过：`claude --no-enterprise` 可临时跳过企业约束

**Layer 3: Plan gate**
- Skill：`/sdd-plan`
- 强制：`design.md` 必须含 `## Constitution Check` 节
- 内容：列出本 change 触发的 HARD_RULE / SOFT_RULE + 合规策略

**Layer 4: Analyze CRITICAL**
- Skill：`/sdd-review`
- 规则：HARD_RULE 违反自动标 Critical，SOFT_RULE 标 Important
- 逃生舱：PR 描述写 `[OVERRIDE] <规则名>: <理由>` 可降级

**Layer 5: Mandatory hooks**
- 钩子：`hooks/pre-tool-use.js`（PreToolUse，工具执行前）
- 硬阻断：`permissionDecision: "deny"` 阻止违规 Edit/Write 落盘
- 规则集：5 HARD（AK/SK 硬编码、`rm -rf /`、`git push --force` 到 main、`.env` 直编）+ 2 SOFT（README 缺 Quick Start、公共 API 缺 docstring）
- Fail-safe：规则引擎异常时 deny（而非绕过）

**Layer 6: Amendment 治理**
- Skill：`/sdd-constitution`
- 流程：8 步修订（读 baseline → 收集变更 → SemVer bump → 更新 frontmatter → Sync Report → 一致性检查 → 写回 → lint）
- 留痕：每次修订更新 `last_amended` + Sync Impact Report

**Layer 7: CI gate**
- 测试：`__tests__/integration/constitution-integrity.test.js`
- 校验：frontmatter 字段齐全 + 正文 ≤ 1000 token + marker 幂等

### 安全优先级

遇到规则冲突时按此排序裁决：**安全 > 合规 > 稳定 > 效率**

- **HARD_RULE**（不可覆盖）：违反会被 PreToolUse hook 阻断或 `/sdd-review` 标 Critical
- **SOFT_RULE**（可显式覆盖）：违反时须在 PR 写 `[OVERRIDE] <规则名>: <理由>`

### Spike 验证记录

PostToolUse 的 `permissionDecision: "deny"` 经 spike 验证无法阻断落盘（文件已写入）。PreToolUse 是正确的阻断机制。详见 `docs/spike-posttooluse-deny.md`。

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
- `superpowers` 6.x Claude Code 插件 —— `/sdd-plan` 委托 writing-plans、`/sdd-apply` 委托 subagent-driven-development、`/sdd-review` 委托 requesting-code-review
- `gh` CLI —— `/sdd-spec` 创建 issue + 分支、`/sdd-review` 创建 PR

**每个项目首次使用前**：
```bash
cd your-project
openspec init --tools claude
```
此命令在项目本地生成 `/opsx:*` 命令（propose/apply/archive/explore）。`/sdd-spec` 等会**直调 openspec CLI**，不依赖项目本地 `/opsx:*`——但你也可以直接用 `/opsx:propose` 跳过企业包装。

**多 sdd-* 命令并存的说明**：
- `/sdd-*`（oh-my-sdd 提供）：含 iam/dop/gh 集成 + 委托 openspec/superpowers，**企业内部推荐**
- `/opsx:*`（openspec 项目本地提供）：纯 openspec 工作流，无企业集成
- `/superpowers:*`（superpowers 提供）：通用 agentic 工作流（brainstorming/writing-plans/executing-plans/code-review）

**操作系统**：Windows 10/11、macOS、Linux（x64/arm64）

## 多工具兼容

oh-my-sdd v0.2+ 支持在多种 AI 编程工具中加载。skills + hooks + HARD_RULE 安全门禁跨工具复用。

| 工具 | 状态 | 安装命令 | Skill 路径 | Hook 机制 |
|------|------|---------|-----------|-----------|
| **Claude Code** | ✅ 完整支持（默认） | `npm install -g @cli-tools/oh-my-sdd` | `~/.claude/skills/` | JSON hooks + wrapper |
| **OpenCode** | ✅ 完整支持 | `oms-install --tool opencode` | `~/.config/opencode/skills/` | TS plugin（事件名映射） |
| **通义灵码 Qoder CN** | ✅ 完整支持（基于文档解读） | `oms-install --tool qoder` | `~/.lingma/skills/` | JSON hooks（与 Claude Code 同构） |
| **KiloCode** | ❌ 暂不支持 | — | — | 无 hook 机制，HARD_RULE 无法强制 |
| **Cursor** | 📋 v0.3 路线 | — | — | — |
| **Windsurf** | 📋 v0.3 路线 | — | — | — |

**自动检测**：不传 `--tool` 时，install.js 按 `which claude > which opencode > which lingma` 顺序检测。检测到哪个就装哪个。

**多工具并存**：同一台机器可同时为多个工具装 oh-my-sdd。卸载时用 `--tool <name>` 精准卸载单一工具，不影响其他。

### 工具特定说明

**OpenCode**：
- 安装时自动尝试编译 `opencode/src/plugin.ts`（需 `npx tsc`）
- 编译失败不影响 skills 安装——`~/.config/opencode/skills/` 仍可用，只是 hooks 不工作
- OpenCode plugin 把小写工具名（`write`/`edit`/`apply_patch`）映射到大写（`Write`/`Edit`/`MultiEdit`），复用 `hooks/pre-tool-use.js`
- 阻断方式：`throw new Error`（OpenCode plugin 协议）vs Claude Code 的 `permissionDecision: deny`

**通义灵码 Qoder CN**：
- 工具名**与 Claude Code 完全一致**（大写），`hooks/*.js` 零修改
- baseline 注入到 `~/.lingma/rules/oh-my-sdd.md`（Always 类型规则自动生效）
- 卸载时从 `~/.lingma/settings.json` 精准删除 4 个 oms hook 事件，保留用户其他 hook
- ⚠️ 适配基于 `help.aliyun.com/zh/lingma/qoder-cn` 文档解读，未在真实 lingma 上做完整 e2e 验证

**为什么 hooks/*.js 能在多工具共用**：它们按 **stdin/stdout JSON 协议** 实现，本身工具无关。Claude Code / 通义灵码的事件名和工具名一致所以零修改；OpenCode 通过薄 TS 包装做事件名 + 工具名映射 + child_process.spawn 调用。

### 已知风险

1. **OpenCode plugin API 不稳定性**：`session.created`/`tool.execute.before` 等事件名可能在 OpenCode 升级时改名。plugin.ts 当前 lock `opencode: ^1.0.0`。
2. **用户级安装的副作用**：skills 装到 `~/.config/opencode/skills/` 后对所有项目可见。用户的非企业项目也会加载企业 skill。SKILL.md 的 description 已尽量精确，但仍可能误触发。如需隔离，非企业项目下手动 `rm -rf ~/.config/opencode/skills/{sdd-*,security-check,api-design}`。
3. **通义灵码 docs 部分未官方验证**：`Stop` 事件与 session-end 的等价关系是文档解读推测，需在 v0.3 实机验证。

## 许可

UNLICENSED（企业内部使用）
