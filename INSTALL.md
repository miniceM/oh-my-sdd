# 安装指南

本文档提供 oh-my-sdd 插件的详细安装步骤，支持多种 AI 编程工具。

## 快速导航

- [前置依赖](#前置依赖)
- [Claude Code 安装](#claude-code-安装默认)
- [OpenCode 安装](#opencode-安装)
- [通义灵码 Lingma 安装](#通义灵码-lingma-安装)
- [多工具并存](#多工具并存)
- [验证安装](#验证安装)
- [故障排除](#故障排除)
- [卸载](#卸载)

---

## 前置依赖

### 通用依赖（所有工具路径）

| 依赖 | 版本要求 | 检查命令 | 安装方式 |
|------|---------|---------|---------|
| Node.js | ≥ 18 | `node --version` | [nodejs.org](https://nodejs.org/) |
| npm | ≥ 9 | `npm --version` | 随 Node.js 安装 |
| openspec CLI | 最新版 | `openspec --version` | `npm install -g @fission-ai/openspec` |

### 工具特定依赖

| 工具 | 必需依赖 | 可选依赖 |
|------|---------|---------|
| Claude Code | `claude` CLI + `iam` CLI（企业认证） | `gh` CLI（GitHub 集成） |
| OpenCode | OpenCode CLI 或桌面应用 | - |
| 通义灵码 | 通义灵码 IDE | - |

### 安装 openspec CLI

```bash
npm install -g @fission-ai/openspec
```

> ⚠️ **重要**：未安装 openspec 时，`/sdd-review` 归档阶段会**阻塞**。

---

## Claude Code 安装（默认）

### 步骤 1：全局安装插件

```bash
# 必须加 --foreground-scripts 才能看到 postinstall 输出
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

> **为什么需要 --foreground-scripts？**
> npm 默认静默 postinstall 输出（即使 stderr 也吞）。加这个 flag 才能看到安装进度和"下一步"提示。
>
> 如果想默认看到，可以设置：
> ```bash
> npm config set foreground-scripts true
> ```

### 步骤 2：企业身份认证（首次使用）

```bash
oms-login
```

这会调用企业统一身份认证（AIH），获取访问令牌。

### 步骤 3：重启 Claude Code

关闭并重新打开 Claude Code，插件会自动加载。

### 步骤 4：验证安装

```bash
# 检查插件是否加载
ls -la ~/.claude/skills/sdd-spec/

# 应该看到 SKILL.md 文件
```

### 步骤 5：开始使用

在 Claude Code 中输入：

```
/sdd-spec <change-name>
```

---

## OpenCode 安装

### 前置条件

- OpenCode CLI 或桌面应用已安装（[opencode.ai](https://opencode.ai)）
- `@opencode-ai/plugin` SDK ≥ 1.15（安装时自动安装）

### 步骤 1：全局安装插件

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

### 步骤 2：显式选择工具

```bash
oms-install --tool opencode
```

这会：
- 构建 TypeScript 插件（`opencode/dist/`）
- 复制到 `~/.config/opencode/plugins/oh-my-sdd/`
- 更新 `~/.config/opencode/opencode.json`

### 步骤 3：验证安装

```bash
# 检查插件目录
ls -la ~/.config/opencode/plugins/oh-my-sdd/

# 检查配置文件
cat ~/.config/opencode/opencode.json | grep oh-my-sdd
```

### 步骤 4：开始使用

启动 OpenCode，输入：

```
/sdd-spec <change-name>
```

### 技术说明

OpenCode 路径使用：
- **TypeScript 适配器**：`opencode/src/*.ts` → `opencode/dist/*.js`
- **experimental hook**：`experimental.chat.system.transform` 注入 baseline
- **Fail-CLOSED 安全模型**：任何 hook 错误都阻断工具执行

---

## 通义灵码 Lingma 安装

### 前置条件

- 通义灵码 IDE 已安装（[help.aliyun.com/zh/lingma/lingma-cn](https://help.aliyun.com/zh/lingma/lingma-cn)）

### 步骤 1：全局安装插件

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

### 步骤 2：显式选择工具

```bash
oms-install --tool lingma
```

这会：
- 复制 skills 到 `~/.lingma/skills/`
- 合并 hooks 到 `~/.lingma/settings.json`
- 创建 baseline 规则 `~/.lingma/rules/oh-my-sdd.md`

### 步骤 3：重启通义灵码 IDE

关闭并重新打开 IDE，插件会自动加载。

### 步骤 4：验证安装

```bash
# 检查 skills 目录
ls -la ~/.lingma/skills/sdd-spec/

# 检查 rules 文件
cat ~/.lingma/rules/oh-my-sdd.md
```

### 步骤 5：开始使用

在通义灵码中输入：

```
/sdd-spec <change-name>
```

### ⚠️ 注意事项

通义灵码路径基于文档解读实现，未在真实 lingma 上做完整 e2e 验证。如有问题，请提交 issue。

---

## 多工具并存

### 同一台机器装多工具

```bash
# 先装 Claude（自动检测）
oms-install

# 再装 OpenCode
oms-install --tool opencode

# 再装 Lingma
oms-install --tool lingma
```

### 自动检测优先级

不传 `--tool` 时，按以下顺序检测：

1. `which claude`（Claude Code）
2. `which lingma`（通义灵码）

### 独立安装路径

每个工具有独立的 skills 目录，互不覆盖：

- Claude Code: `~/.claude/skills/`
- OpenCode: `~/.config/opencode/plugins/oh-my-sdd/`
- Lingma: `~/.lingma/skills/`

共享状态目录：`~/.oh-my-sdd/`（DOP 埋点、会话元数据）

---

## 验证安装

### 通用验证步骤

1. **检查命令是否可用**

```bash
which oms-install
which oms-uninstall
which oms-login
```

2. **检查版本信息**

```bash
node --version  # ≥ 18
npm --version   # ≥ 9
openspec --version  # 最新版
```

3. **检查配置文件**

```bash
cat ~/.oh-my-sdd/config.json
```

默认配置：
```json
{
  "dop_endpoint": "https://dop.enterprise.com",
  "aih_system_name": "sdd",
  "log_level": "info",
  "telemetry_disabled": false
}
```

### 工具特定验证

#### Claude Code

```bash
# 检查 skills
ls ~/.claude/skills/sdd-spec/SKILL.md

# 检查 wrapper
which claude
claude --version
```

#### OpenCode

```bash
# 检查插件目录
ls ~/.config/opencode/plugins/oh-my-sdd/index.js

# 检查配置
grep oh-my-sdd ~/.config/opencode/opencode.json
```

#### Lingma

```bash
# 检查 skills
ls ~/.lingma/skills/sdd-spec/SKILL.md

# 检查 rules
ls ~/.lingma/rules/oh-my-sdd.md
```

---

## 故障排除

### 问题 1：`npm install` 没有输出

**原因**：npm 默认静默 postinstall 输出。

**解决方案**：
```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

或永久设置：
```bash
npm config set foreground-scripts true
```

### 问题 2：`oms-login` 命令找不到

**原因**：插件未正确安装或 PATH 未更新。

**解决方案**：
```bash
# 检查 npm 全局 bin 目录
npm config get prefix

# 添加到 PATH（在 ~/.bashrc 或 ~/.zshrc）
export PATH="$(npm config get prefix)/bin:$PATH"

# 重新加载配置
source ~/.bashrc  # 或 ~/.zshrc
```

### 问题 3：Claude Code 不识别 `/sdd-spec` 命令

**原因**：
- 插件缓存未刷新
- skills 目录不存在

**解决方案**：
```bash
# 运行开发重装脚本
./scripts/dev-reinstall.sh

# 或手动清理缓存后重装
npm uninstall -g @cli-tools/oh-my-sdd
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

### 问题 4：OpenCode 插件加载失败

**原因**：
- TypeScript 未编译
- SDK 版本不兼容

**解决方案**：
```bash
# 手动构建
cd opencode
npm install
npx tsc

# 检查编译产物
ls dist/

# 检查 SDK 版本
cat opencode/node_modules/@opencode-ai/plugin/package.json | grep version
```

### 问题 5：`openspec` 命令找不到

**原因**：openspec 未全局安装。

**解决方案**：
```bash
npm install -g @fission-ai/openspec
```

### 问题 6：认证失败（Claude Code）

**原因**：`iam` CLI 未安装或未认证。

**解决方案**：
```bash
# 检查 iam CLI
which iam

# 运行认证
oms-login
```

### 问题 7：权限错误（Permission denied）

**原因**：npm 全局安装权限不足。

**解决方案**：

**macOS/Linux**：
```bash
# 使用 nvm 管理 Node.js（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Windows**：
```powershell
# 以管理员身份运行 PowerShell
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

### 问题 8：会话启动慢

**原因**：SessionStart hook 超时（默认 5s）。

**解决方案**：
```bash
# 检查 DOP 连接
curl -I https://dop.enterprise.com/health

# 检查日志
tail -f ~/.oh-my-sdd/logs/session-*.log
```

---

## 卸载

### 单工具卸载（推荐）

保留其他工具的安装：

```bash
# 仅卸载 Claude Code 路径
oms-uninstall --tool claude

# 仅卸载 OpenCode 路径
oms-uninstall --tool opencode

# 仅卸载 Lingma 路径
oms-uninstall --tool lingma
```

### 完整卸载

```bash
npm uninstall -g @cli-tools/oh-my-sdd
```

这会触发 `preuninstall` 钩子，自动清理 Claude/Lingma 两套产物。

**状态目录保留**：`~/.oh-my-sdd/` 默认保留（可重装复用）。

### 彻底清空（含状态目录）

必须按顺序执行：

```bash
oms-uninstall --purge && npm uninstall -g @cli-tools/oh-my-sdd && rm -rf ~/.oh-my-sdd/
```

> ⚠️ **为什么不能反过来？**
> 旧版"先 npm uninstall 再 oms-uninstall --purge"会在第二步失败——`oms-uninstall` 命令本身由被卸载的包提供，包卸了命令也消失了。

---

## 下一步

安装完成后，参考以下文档开始使用：

- **快速开始**：[README.md](README.md#快速开始)
- **设计文档**：[README.md](README.md#设计文档)
- **企业基线**：[content/enterprise-baseline.md](content/enterprise-baseline.md)
- **问题反馈**：项目 issue 跟踪系统

---

**最后更新**：2026-07-24
**维护者**：oh-my-sdd 团队