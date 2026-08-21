# Issue #56 检测状态一致性设计

## 目标

修正四个宿主 adapter 在检测失败时把 `host_runtime.level` 报告为 `detected` 的问题，并补齐 OpenCode postinstall 资源漂移的诊断与修复保护测试。

## 设计

Claude、Lingma、KiloCode、OpenCode 都保留现有 `detected` 布尔值和探测来源，只调整 capability level 映射：探测成功为 `detected`，探测失败为 `missing`，探测异常为 `unknown`。不改变宿主选择、安装写入或运行时保护逻辑。

OpenCode 测试使用临时 HOME 创建有效 ownership manifest 和受管资源，再修改资源内容，调用真实 `OpenCodeAdapter.inspectRuntime()` 与 `doctor()`，断言 `resource-drifted`、current/expected digest 和人工处理动作；将 repair plan 交给真实 adapter executor 时不得覆盖漂移文件。

## 验证

先运行新增定向测试确认旧实现失败，再运行定向测试、完整 `npm test`、覆盖率、baseline lint 和 OpenCode TypeScript build。
