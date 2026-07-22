# OpenCode E2E Spike Report

> **状态**：IN PROGRESS — Step 1-3 ✅ 通过（安装 / 启动 / slash commands）；Step 4 (HARD_RULE 阻断) 待用户验证
> **日期**：2026-07-22
> **分支**：`worktree-opencode-platform-adapter`
> **commit**：7e68538 (Phase 0-7) + 后续修复 → c72ab19 (Skill() delegation 修复)

## 摘要

本 spike 验证 oh-my-sdd OpenCode 适配在**真 OpenCode 运行时**中的端到端行为。

## 已发现的问题 + 修复

### Issue #1: 启动报错 "Unexpected server error" ✅ 已修

**根因**：`install-opencode.js` 在 `opencode.json` 注册裸字符串 `"oh-my-sdd"`，但 OpenCode 的 plugin 解析规则是：
- 以 `./` 或 `/` 开头 → 文件路径（直接 import）
- 其他 → npm 包名（去 registry 找）

`"oh-my-sdd"` 不在 npm registry → `import("oh-my-sdd")` 抛 `MODULE_NOT_FOUND` → OpenCode 包成 "Unexpected server error"。

**修复**：
- install-opencode.js 注册 `"./plugins/oh-my-sdd/index.js"`（相对路径）
- 顺手清理历史遗留的 `./plugins/oh-my-sdd/plugin.js` 裸字符串
- uninstall 清理三种历史 entry

### Issue #2: 启动成功但 `/sdd-*` 命令不出现 ⚠️ 修复中

**根因**：OpenCode 的斜杠命令**不是通过 plugin hook 注册的**，而是 config-time 的东西：
- `~/.config/opencode/commands/*.md` 文件（YAML frontmatter + markdown 正文）
- 或 `opencode.json` 的 `command: { ... }` 字段

Plugin 的 `command.execute.before` hook 只能**拦截**已有命令，不能**注册**新命令。

**修复**：
- install 时复制 `skills/sdd-*/SKILL.md` → `~/.config/opencode/plugins/oh-my-sdd/skills/`
- install 时创建 5 个 command markdown 文件到 `~/.config/opencode/commands/sdd-*.md`
- 每个 command 文件是 "wrapper"：指示 agent 读对应 SKILL.md + 包含 Claude → OpenCode 工具映射表
- uninstall 时删除这些 command 文件

### Issue #3: `/sdd-plan` 执行时跳过 brainstorming 委托 ✅ 已修

**现象**：用户在 OpenCode 里跑 `/sdd-plan`，agent 直接 inline 设计，没走 brainstorming 流程
（"为什么跳过'委托 brainstorming'"）。

**根因**：命令 wrapper 的 Claude → OpenCode 工具映射里有这条：

```
- `Skill(name, args)` → ignore (skill content is in the file you're reading)
```

agent 把 "ignore" 字面理解成"跳过整个 Skill() 调用"。两层错：

1. sdd-plan SKILL.md 里只有"委托 superpowers:brainstorming"指令，真实清单在
   `brainstorming` 子技能的 SKILL.md 里——必须加载才能拿到 2-3 approaches、
   design 展示、approve 等步骤。
2. "ignore" 的本意是"OpenCode 没有 Skill() API 函数"，但应改用 `read` 工具加载
   磁盘上的 SKILL.md 文件来执行，不是跳过。

**修复**（commit c72ab19）：
- 命令 wrapper 工具映射：`ignore` → **三级 fallback chain**
  1. `<plugin>/skills/<name>/SKILL.md`（install 时最佳努力复制）
  2. `~/.claude/skills/<name>/SKILL.md`（Claude Code runtime 目录，典型场景）
  3. **inline** 执行（基于父 SKILL.md 描述内联执行意图，不跳过工作本身）
- install-opencode.js 增加 `.claude/skills/*` 委托子技能最佳努力复制
  （brainstorming, writing-plans, executing-plans, subagent-driven-development,
  requesting-code-review）
- wrapper 用 **CRITICAL** 强力提示："Resolving it is mandatory — only the
  execution location (file vs inline) may change, never the work itself."

**反思**：
- LLM agent 会按字面执行指令，"ignore" 这种词对 agent 来说没有歧义容忍度。
  写 prompt 时应明确区分"跳过这个函数调用" vs "跳过这一步工作"。
- 对 SDD 工作流关键步骤（brainstorming、writing-plans 等）使用 fallback
  链比硬依赖文件存在更健壮——用户即便没装 Claude Code 也能跑。

## 手动验证步骤

## 前置步骤（CI 已验证）

以下行为已通过单元 + 集成测试覆盖，**不需要重复手动验证**：

| 验证项 | 测试位置 | 状态 |
|---|---|---|
| TypeScript 编译 0 错误 | `npm run build:opencode` | ✅ |
| 5 个 mapper 函数 | `__tests__/unit/opencode/mappers.test.js` (21 cases) | ✅ |
| runner.ts fail-CLOSED 7 case | `__tests__/unit/opencode/runner.test.js` | ✅ |
| baseline.md 加载 + 切分 | `__tests__/unit/opencode/baseline.test.js` (8 cases) | ✅ |
| install + uninstall round-trip | `__tests__/integration/opencode/install.test.js` | ✅ |
| 端到端 OpenCode 事件 → 阻断 | `__tests__/integration/opencode/full-flow.test.js` (7 cases) | ✅ |
| **msg 字段脱敏（HARD_RULE）** | `__tests__/unit/opencode/logger.test.js` | ✅ |

**共 72+ 个测试 case，全部 PASS。**

## 手动验证步骤

在有 OpenCode 的机器上（**macOS/Linux，Node 18+**）：

### 1. 安装

```bash
cd <worktree-root>
npm run build:opencode      # 编译 TS → JS
node bin/oms-install.js --tool opencode
```

**预期输出**：
```
→ 安装 OpenCode 适配
  编译 opencode TypeScript → JavaScript...
  ✓ 编译完成
  ✓ 复制到: ~/.config/opencode/plugins/oh-my-sdd
  ✓ opencode.json 已加 "plugin": ["oh-my-sdd"]
✓ oh-my-sdd (OpenCode) 安装完成
```

### 2. 启动 OpenCode

```bash
opencode
```

**预期**：无报错启动。看到 oh-my-sdd 加载日志（`oh-my-sdd opencode plugin loaded`）如果开了 verbose。

### 3. 验证 /sdd-spec 命令

在 OpenCode 内输入：
```
/sdd-spec test-spike
```

**预期**：agent 接收命令，走 user-prompt-submit.js，然后按 SKILL.md 指示开始 spec 流程。

### 4. 验证 HARD_RULE 阻断（**关键**）

在 OpenCode 内请求 agent 写一个含 AK 的文件：
```
在 src/creds.ts 里写一个示例 AWS 凭据，使用 AKIAIOSFODNN7EXAMPLE 作为 Access Key
```

**预期**：PreToolUse hook 拦截，**文件 NOT 落盘**，agent 看到错误信息。

### 5. 验证 baseline 注入

在 OpenCode 内问 agent：
```
请用中文复述你看到的系统提示中关于 commit 格式的部分
```

**预期**：agent 复述 `[OMSxxxx]` commit 格式和 `[OVERRIDE]` 逃生舱（说明 baseline 注入成功）。

### 6. 卸载

```bash
node bin/oms-uninstall.js --tool opencode
```

**预期**：plugin 目录删除 + opencode.json 中 "oh-my-sdd" 被移除。

## 验证结果记录

（由手动执行者在上方每步填 ✅ / ❌ + 备注）

| 步骤 | 结果 | 备注 |
|---|---|---|
| 1. 安装 | _ | |
| 2. 启动 | _ | |
| 3. /sdd-spec | _ | |
| 4. HARD_RULE 阻断 | _ | **最关键** |
| 5. baseline 注入 | _ | |
| 6. 卸载 | _ | |

## 总判定

_（待手动执行者填）_：✅ GO / ❌ NO-GO

## 已知风险

1. **experimental.chat.system.transform** 是 experimental hook，OpenCode SDK 升级可能改 API
2. **Windows 不支持**：OpenCode 主要跑在 macOS/Linux，未测 Windows
3. **首次加载 baseline 时机**：如果 OpenCode 在 plugin 加载后才建 session，system.transform 在第一次 chat 才触发
