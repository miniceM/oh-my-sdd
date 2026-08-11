# OpenCode 官方 Instructions 注入设计

## 背景

Issue #28 要求移除 OpenCode `experimental.chat.system.transform` 的企业 baseline 注入。该 hook 会把插件追加内容作为额外的 system message；同时 OpenCode 的标题、摘要和压缩请求不会向插件暴露可靠的请求类型标识，因此插件无法只对正常对话注入规则。

## 目标与非目标

目标：

- 使用 OpenCode 官方全局 Rules/Instructions 发现机制注入企业 baseline。
- 只维护 oh-my-sdd 自己的内容区块，保留用户已有 `AGENTS.md` 内容。
- 安装、升级、卸载在 POSIX 和 Windows 路径约定下可重复执行且不会重复或误删。
- 不再由插件 hook 生成额外 system message，内部模型请求自然不包含企业 baseline。

非目标：

- 不修改 OpenCode 上游代码。
- 不通过提示词文本或 `sessionID` 判断标题、摘要等内部请求。
- 不改变 Claude Code、Lingma 等宿主的 baseline 注入。

## 方案

### 受管文件区块

安装器在 `~/.config/opencode/AGENTS.md` 中维护一个稳定 sentinel 区块：

```text
<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->
<baseline body, stripped of frontmatter and Sync Impact Report>
<!-- OH-MY-SDD:END -->
```

安装时先移除已有 oh-my-sdd 区块，再在文件末尾写入当前 baseline，因而重复安装和升级只保留一个最新区块。用户内容位于区块外时原样保留。

卸载时只移除该区块；若文件剩余内容为空，则删除文件，否则保留文件。没有 sentinel 的同名文件视为用户文件，不由卸载器删除。

### 运行时与生命周期边界

- `opencode/scripts/postinstall.mjs` 负责读取已打包的 baseline，调用受管区块写入逻辑，并继续同步 skills/commands。
- `opencode/scripts/uninstall.mjs` 在移除 npm 资源时调用同一受管区块清理逻辑。
- `opencode/src/index.ts` 不再注册 `experimental.chat.system.transform`。
- 删除仅服务于旧注入路径的 `handleSystemTransform`、`buildSystemPrompt`、实验 hook 探测和无效配置字段，避免形成第二条注入路径。
- 路径计算集中到可测试的 helper；真实运行使用当前宿主的 home 目录和 `.config/opencode/AGENTS.md` 约定，测试通过注入 POSIX/Windows path 实现覆盖两端。

## 错误处理

postinstall 延续现有 fail-open 约定：受管文件读写失败只记录 warning，不让 npm 安装因 baseline 注入失败而中断。卸载器对缺失文件或缺失 sentinel 采取 no-op，并保留无法安全识别的用户内容。

## 测试策略

- 单元测试覆盖新建文件、保留用户内容、升级替换、重复安装、只含插件区块时删除、用户修改区块后卸载保留，以及 POSIX/Windows 路径。
- 安装/卸载测试覆盖 postinstall 与 uninstaller 的实际调用链和幂等性。
- 插件测试断言不再注册 `experimental.chat.system.transform`，其他安全、命令和事件 hooks 保持存在。
- 更新旧 baseline 注入测试和用户文档，运行 OpenCode `build`、`typecheck`、相关单元/集成测试及根项目全套测试。
