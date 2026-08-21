# 交互式安装宿主选择设计

## 目标

当 `oms-install` 未传 `--tool` 且检测到多个已安装宿主时，在真实终端中提供上下键选择；选中宿主后展示该宿主的安装计划，并在 `y/N` 二次确认后才执行写入。安装流程开始时展示与 `oms-login` 一致的项目 ASCII Logo 风格。

## 交互边界

交互选择只在没有 `--tool`、未指定 `--dry-run` 或 `--json`，且 `stdin` 与 `stdout` 都是 TTY 时可用。TTY 菜单以 raw mode 读取按键：上、下箭头改变当前项，回车返回选择，`Ctrl-C` 取消并返回退出码 130；任何退出路径均恢复 raw mode、监听器和光标状态。

非 TTY、`--json` 和 `--dry-run` 保持无交互：多宿主仍返回现有选择需求和退出码 2，提示使用 `--tool <name>`。`--yes/-y` 不触发菜单；它仅继续用于已确定宿主时跳过确认。

## 计划和安装流

菜单项目来自 `selection_candidates`，并显示宿主展示名与 ID。选择完成后，CLI 以选中的 ID 再次请求 dry-run 计划，因此计划仅包含该宿主。随后渲染该计划，使用现有 `确认执行此安装计划？[y/N]` 提示确认；只有 `y` 或 `yes` 执行，其他输入、EOF 或拒绝均不写入文件。

显式 `--tool` 的既有“计划、确认、执行”流程不改变。选择菜单属于 CLI 展示层，不改变 `install/main.js` 对多宿主的无副作用计划语义。

## Logo 输出

`oms-install` 复用 `bin/oms-welcome.js` 的 `LOGO`、ANSI 颜色和 ASCII 排版，但只渲染 Logo 与简短产品标识，不渲染登录成功欢迎页的功能清单或 CTA。普通安装输出开始时显示该 banner。`--json` 下 banner 必须写到 stderr，stdout 保持可解析的单一 JSON 文档；`--help` 和 `--version` 不显示 banner。

## 测试

单元测试在注入的 TTY/键盘输入和输出桩上验证菜单的初始渲染、箭头切换、回车选择、重新生成单宿主计划、取消与终端清理。保留进程级非 TTY 测试，证明多宿主输入不会阻塞且仍要求 `--tool`。新增 Logo 测试，验证正常安装有 Logo、`--json` stdout 不含 banner。

## 非目标

不引入第三方终端 UI 依赖；不修改 host adapter、安装计划 schema 或实际安装步骤；不为 KiloCode 的 advisory 保护提供新的运行时保证。
