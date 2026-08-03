# oh-my-sdd 发布前手动冒烟测试清单

**每次发版前，在三平台（macOS / Linux / Windows）各跑一遍。**

---

## 1. 主包 `@cli-tools/oh-my-sdd`

### 安装与注册

- [ ] 1. `npm install -g @cli-tools/oh-my-sdd`（无报错，看到"✓ 已注册 marketplace"等安装进度）
- [ ] 2. `npm install -g @cli-tools/oh-my-sdd` 再次执行（升级场景，幂等）
- [ ] 3. `oms-login` 交互式认证，看到"✓ 登录成功"
- [ ] 4. `iam auth status -json` 显示 credentials 含 sdd system

### Claude Code 会话

- [ ] 5. 启动新 Claude Code 会话
- [ ] 6. 系统提示符含"企业 SDD Agent"baseline（session-start hook 注入成功）
- [ ] 7. 输入 `/sdd-spec` 看到完整 Ring 1 工作流指令
- [ ] 8. 依次验证 `/sdd-plan` `/sdd-task` `/sdd-apply` `/sdd-review`
- [ ] 9. 修改一个文件，会话结束时 DOP 收到 `session.end`（含 `code_delta`）

### Lingma 会话（可选）

- [ ] 10. `oms-install --tool lingma`，重启通义灵码 IDE
- [ ] 11. `~/.lingma/skills/` 含 sdd-* 命令
- [ ] 12. 在 Lingma 中执行 `/sdd-spec`，baseline 注入到 `~/.lingma/rules/oh-my-sdd.md`

### 异常路径

- [ ] 13. 项目根目录建 `.sdd-no-telemetry` 文件，重启会话，DOP **不上报**
- [ ] 14. 设置 `~/.oh-my-sdd/config.json` 的 `telemetry_disabled: true`，DOP **不上报**
- [ ] 15. 断网跑一个会话，结束后恢复网络，下次启动时积压事件被 flush
- [ ] 16. 删除 iam 凭据（`iam logout`），启动会话，看到红色 stderr 提示 + 无 baseline

### 卸载

- [ ] 17. `oms-uninstall && npm uninstall -g @cli-tools/oh-my-sdd`
- [ ] 18. `~/.claude/plugins/oh-my-sdd/` 已删
- [ ] 19. `~/.oh-my-sdd/` 仍存在（state 保留）
- [ ] 20. 重装后配置和会话历史可继续使用

---

## 2. OpenCode 子包 `@cli-tools/oh-my-sdd-opencode`

### 安装与注册

- [ ] 21. 在 `opencode/` 目录下 `npm install` + `npm run build`
- [ ] 22. `oms-install --tool opencode`，看到"✓ 已安装 plugin"
- [ ] 23. 在 OpenCode 会话中 `/status` 能看到 oh-my-sdd 插件

### OpenCode 会话

- [ ] 24. 输入 `/sdd-spec` 看到 Ring 1 工作流指令
- [ ] 25. 修改一个文件，`permissionDecision: "deny"` 触发（写含 AKIA 的文件验证 HARD_RULE 拦截）

### 卸载

- [ ] 26. 独立安装子包时运行 `oms-opencode-uninstall`；主包安装时运行 `oms-uninstall --tool opencode`
- [ ] 27. `~/.config/opencode/plugins/oh-my-sdd/` 已删
- [ ] 28. `opencode.json` 的 `plugin` 数组已移除 `oh-my-sdd`

---

## 3. 跨平台验证

- [ ] 29. 在 Windows 上重复 1-16（重点：hook 命令字符串引号、path.sep、CRLF）
- [ ] 30. 在 Linux 上重复 1-16（重点：文件权限 0o700/0o600）
- [ ] 31. 在 macOS 上重复 1-16

---

## 4. 多工具共存

- [ ] 32. 同时安装 Claude + Lingma + OpenCode，各自独立不覆盖
- [ ] 33. `oms-uninstall --tool claude` 只删 Claude，Lingma + OpenCode 不受影响
