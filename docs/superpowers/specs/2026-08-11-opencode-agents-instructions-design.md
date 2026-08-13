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

### 审查补充：原子替换

安装、升级和保留用户内容的卸载不能直接覆盖现有 `AGENTS.md`。helper 先在目标文件同目录创建唯一临时文件，写入完整的新内容并继承已有文件权限，再通过同文件系统的原子 rename 替换目标。写入或 rename 失败时删除临时文件并继续向调用方抛出异常，使 postinstall 保持原有 fail-open 日志策略，同时保证替换前的用户文件不变。

当卸载后不再有任何内容时仍直接删除仅由插件拥有的文件；不存在 sentinel 时保持 no-op。原子写入 helper 接受可注入的文件系统操作，测试通过失败注入验证原文件和权限，而不依赖磁盘空间耗尽等不稳定环境条件。

## 真实请求验证

扩展已有真实 OpenCode CLI E2E 和本地 OpenAI-compatible provider，不创建第二套运行框架。provider 保存请求 transcript，并像企业 Qwen 网关一样拒绝 system message 出现在首项以外的位置。测试对 transcript 分类并验证：

- 正常对话读取全局 `AGENTS.md` 中的唯一 baseline 标记；
- oh-my-sdd 不产生第二条 system message，严格 provider 接受正常请求；
- OpenCode 实际触发的标题请求不读取 baseline；
- 通过小上下文模型和足量历史消息稳定触发 summary/compaction 后，其内部请求不读取 baseline。

如果固定 OpenCode 版本无法通过公开 CLI 稳定触发某类内部请求，测试必须明确失败或跳过并给出可诊断原因，验收状态保持“未实测”，不得用源码假设替代运行证据。

## Windows 生命周期验证

现有 `windows-latest` OpenCode E2E runner 负责真实 Windows 证据。测试在 CRLF 用户规则文件上执行 tarball 安装、重复安装/升级和卸载，验证用户字节内容与 CRLF 保留、受管区块始终唯一、卸载只移除受管区块。删除主安装适配器中“Windows 不支持”的过期注释，使文档与 CI 支持范围一致。

## 测试策略

- 单元测试覆盖新建文件、保留用户内容、升级替换、重复安装、只含插件区块时删除、用户修改区块后卸载保留，以及 POSIX/Windows 路径。
- 安装/卸载测试覆盖 postinstall 与 uninstaller 的实际调用链和幂等性。
- 故障注入测试覆盖临时文件写入失败和 rename 失败，断言原文件内容与权限不变且无临时文件残留。
- 插件测试断言不再注册 `experimental.chat.system.transform`，其他安全、命令和事件 hooks 保持存在。
- 真实 CLI E2E 通过 provider transcript 验证正常对话与内部请求隔离，并在 Ubuntu、macOS、Windows 上执行。
- Windows runner 使用 CRLF 用户内容验证安装、升级、卸载的完整生命周期。
- 更新旧 baseline 注入测试和用户文档，运行 OpenCode `build`、`typecheck`、相关单元/集成测试及根项目全套测试。
