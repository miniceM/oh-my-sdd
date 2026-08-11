# Claude CLI 可选安装设计

## 背景

oh-my-sdd 支持多个 coding agent，Claude CLI 不是所有安装环境都具备的基础软件。当前安装器仅检查命令是否出现在 `PATH`；在 Windows 中，这可能命中无效的 `node_modules/.bin/claude` 路径。随后 wrapper 尝试备份该路径并以 `ENOENT` 失败，导致整个安装失败。

## 目标与范围

当 Claude CLI 不可实际执行时，安装应正常结束并清晰说明 Claude 专属步骤已跳过。此次变更仅影响 Claude adapter 的检测和未安装分支；不改变已安装 Claude、OpenCode、Lingma 或 Kilo Code 的安装行为。

## 设计

`ClaudeAdapter` 使用参数化子进程执行 `claude --version` 作为唯一可用性判定。只有该命令以成功状态退出，才继续注册 marketplace、安装 Claude plugin 与安装 wrapper。

执行失败、命令不存在或无法启动时，adapter 输出“未检测到可用的 Claude CLI，已跳过 Claude 专属安装步骤”的提示并成功返回。它不得创建 Claude 状态、调用 marketplace/plugin 命令或调用 wrapper 安装。该决策保留在 Claude adapter 内，通用安装入口不增加 Claude 特例。

## 错误处理

CLI 缺失或版本命令失败是可预期的可选依赖情形，不抛出异常。Claude CLI 已验证可用后，现有 marketplace、plugin 与 wrapper 错误仍按当前行为向调用方报告。

## 测试

为 Claude adapter 增加两类单元测试：

1. 模拟 `claude --version` 失败，断言 adapter 成功返回、输出跳过提示，且没有执行 Claude 安装子步骤。
2. 模拟版本命令成功，断言 adapter 继续执行既有 Claude 安装流程。

相关测试将通过依赖注入或模块级 mock 隔离真实 CLI、用户目录与 wrapper 文件操作，确保在 Windows、macOS 与 Linux 的 CI 中一致运行。

## 验收标准

- 未安装 Claude CLI 的环境执行安装命令时成功退出。
- `claude --version` 失败时不执行 Claude marketplace、plugin 或 wrapper 操作。
- `claude --version` 成功时保持现有 Claude 安装行为。
- 新增测试与全量测试均通过。
