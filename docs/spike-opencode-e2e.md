# OpenCode E2E Spike Report

> **状态**：PENDING MANUAL VERIFICATION
> **日期**：2026-07-21
> **分支**：`worktree-opencode-platform-adapter`
> **commit**：7e68538 (Phase 0-7 完成)

## 摘要

本 spike 验证 oh-my-sdd OpenCode 适配在**真 OpenCode 运行时**中的端到端行为。由于当前测试环境未安装 OpenCode，需手动在有 OpenCode 的环境中执行以下步骤并记录结果。

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
