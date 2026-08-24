# OpenCode 安装状态输出设计

## 目标

让 OpenCode 的成功安装结果只报告真实错误。npm 插件生命周期尚待宿主完成属于后续操作，不应显示为 warning 或计入 warning 汇总。修复通过全局 npm 符号链接启动 `oms` 时 CLI 不执行、无输出的问题。

## 范围

1. OpenCode 安装结果把三个 postinstall 资源的待处理状态汇总为一条普通后续操作。
2. 移除要求用户确认 `loaded/enforced` 的提示；明确状态仅为“已注册，重启 OpenCode 后完成插件加载”。
3. 保持真正的安装失败、配置无效和资源漂移为错误或 warning。
4. 让 `oms` 通过符号链接入口执行 `status`、`doctor` 时正常渲染报告。

不在本变更中实现 OpenCode 插件运行时加载或写入拦截的证据采集；`loaded` 和 `enforced` 仍如实报告为未知。

## 方案

### 安装结果

OpenCode adapter 将 postinstall 资源标记为非告警的 deferred 状态。执行汇总层不把这种状态计入 `warnings`，并按资源所有者/阶段合并为一条 next action：`重启 OpenCode 后完成插件加载；随后可运行 oms status --tool opencode 查看注册状态。`

安装成功后的附加提示不得宣称 `status` 或 `doctor` 能确认 `loaded/enforced`。运行时保护层保留未知状态及其原因，以免将静态文件存在误报为运行时生效。

### CLI 入口

CLI 的直接执行判断会把模块 URL 解析为真实文件路径，却把 `process.argv[1]` 保持为 npm bin 符号链接路径，二者不相等时不会调用 `runOmsCli`。入口比较前应解析 entry path 的真实路径；无法解析时维持现有绝对路径比较的安全回退。

## 错误处理

- 真实 apply 失败继续产生 error。
- postinstall 资源确实被用户修改时，继续产生 drift warning，不合并或隐藏。
- OpenCode 配置缺失、无效或未注册时，`status`/`doctor` 继续如实报告对应状态。

## 测试

- OpenCode 安装计划在仅有 postinstall deferred 资源时，汇总为成功、`warnings: 0`，且只有一条匹配的后续操作。
- 真实 warning 仍保留在汇总中。
- CLI 以符号链接调用时，`status` 和 `doctor` 产生文本报告且退出码符合原有规则。
- 现有直接 Node 入口和 JSON 输出测试继续通过。

## 验收映射

- 成功安装且无 warning：安装汇总单测。
- 单条非告警后续操作：安装渲染/汇总单测。
- 不再承诺验证 `loaded/enforced`：OpenCode adapter 输出断言。
- npm 符号链接入口有输出：CLI 子进程集成测试。
