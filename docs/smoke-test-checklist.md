# oh-my-sdd 发布前手动冒烟测试清单

**每次发版前，在三平台（macOS / Linux / Windows）各跑一遍。**

---

## 1. 安装器交互与控制面验证

### 安装计划与交互确认

- [ ] 1. `oms-install --dry-run`（输出只读安装计划，不写入任何文件，退出码 0）
- [ ] 2. `oms-install --tool claude`（终端渲染 Installation Plan，提示 `确认执行此安装计划？[y/N]`；输入 `n` 取消，验证未写入文件）
- [ ] 3. `oms-install --tool claude -y`（免交互确认，成功执行安装并输出 step 结果）
- [ ] 4. 多宿主安全阻断：当检测到多个工具且不带 `--tool` 时，验证返回退出码 2 并提示使用 `--tool <name>` 明确选择

### 统一控制面 (`oms` CLI)

- [ ] 5. `oms status`（显示所有工具探测事实与能力分层：`written/registered/loaded/enforced/advisory`）
- [ ] 6. `oms doctor`（诊断依赖、缺少项与配置漂移；无异常时输出 `✓ No issues detected.`）
- [ ] 7. `oms repair`（默认 dry-run 预览自愈计划；`oms repair --apply` 执行自愈并保护用户改动）
- [ ] 8. `oms-git-hooks install && oms-git-hooks status`（安装 git 门禁钩子并输出 INSTALLED）

### 身份认证

- [ ] 9. `oms-login` 交互式认证（密码输入隐藏，devops + gitee 登录成功）
- [ ] 10. `iam auth status --json` 显示 credentials 数组满足认证要求

---

## 2. 宿主集成与 SDD 工作流

### Claude Code

- [ ] 11. 启动 Claude Code 会话（通过 wrapper `--append-system-prompt-file` 注入 baseline）
- [ ] 12. 系统提示词含"企业 SDD Agent"
- [ ] 13. 执行 `/sdd-spec`、`/sdd-plan`、`/sdd-task`、`/sdd-apply`、`/sdd-review` 流程
- [ ] 14. 触发安全门禁（尝试写含硬编码 AK 的文件，验证 PreToolUse 阻断落盘）

### OpenCode

- [ ] 15. `oms-install --tool opencode -y`
- [ ] 16. `~/.config/opencode/skills/`、`~/.config/opencode/commands/` 与 `~/.config/opencode/AGENTS.md` 包含受管内容
- [ ] 17. 启动 OpenCode，验证 `/sdd-spec` 与 HARD_RULE 运行时拦截（throw Error）
- [ ] 18. 卸载：`oms-uninstall --tool opencode`，验证受管区块清理且用户配置保留

### 通义灵码 Lingma

- [ ] 19. `oms-install --tool lingma -y`
- [ ] 20. `~/.lingma/skills/` 含技能，`~/.lingma/rules/oh-my-sdd.md` 包含 baseline
- [ ] 21. `oms-uninstall --tool lingma`，验证只清理 oms 相关 hooks 和 skills

### KiloCode

- [ ] 22. `oms-install --tool kilocode -y`
- [ ] 23. `~/.kilo/skills/` 包含技能，`~/.config/kilo/AGENTS.md` 包含 baseline
- [ ] 24. `oms status --tool kilocode` 输出保护级别为 `advisory`

---

## 3. 异常路径与卸载

- [ ] 25. 项目根目录建 `.sdd-no-telemetry` 文件，重启会话，DOP 不上报
- [ ] 26. 设置 `~/.oh-my-sdd/config.json` 的 `telemetry_disabled: true`，DOP 不上报
- [ ] 27. `oms-uninstall && npm uninstall -g @cli-tools/oh-my-sdd`，验证 `~/.oh-my-sdd/` 状态目录默认保留
- [ ] 28. `oms-uninstall --purge && npm uninstall -g @cli-tools/oh-my-sdd`，验证完全清空

---

## 4. 跨平台验证

- [ ] 29. Windows 平台重复上述流程（重点：ComSpec、PATHEXT、CRLF、引号转义）
- [ ] 30. Linux 平台重复上述流程（重点：文件权限 0o700/0o600）
- [ ] 31. macOS 平台重复上述流程
