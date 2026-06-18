# oh-my-sdd 发布前手动冒烟测试清单

**每次发版前，在三平台（macOS / Linux / Windows）各跑一遍。**

## 安装与认证

- [ ] 1. `npm install -g @cli-tools/oh-my-sdd`（无报错）
- [ ] 2. `oms-install` 在已装状态下重跑（升级场景）
- [ ] 3. `oms-login` 交互式输入用户名密码，看到 "✓ 登录成功"
- [ ] 4. `iam auth status -json` 显示 credentials 含 sdd system

## Claude Code 会话

- [ ] 5. 启动新 Claude Code 会话
- [ ] 6. 系统提示符里有"企业 SDD Agent"baseline（说明 session-start 注入成功）
- [ ] 7. 输入 `/sdd-spec` 看到完整 Ring 1 工作流指令
- [ ] 8. 依次验证 `/sdd-plan` `/sdd-task` `/sdd-apply` `/sdd-review`
- [ ] 9. 修改一个文件，会话结束时 DOP 收到 `session.end`（含 `code_delta`）

## 异常路径

- [ ] 10. 项目根目录建 `.sdd-no-telemetry` 文件，重启会话，DOP **不上报**
- [ ] 11. 设置 `~/.oh-my-sdd/config.json` 的 `telemetry_disabled: true`，DOP **不上报**
- [ ] 12. 断网跑一个会话，结束后恢复网络，下次启动时积压事件被 flush
- [ ] 13. 删除 iam 凭据（`iam logout`），启动会话，看到红色 stderr 提示 + 无 baseline

## 卸载

- [ ] 14. `npm uninstall -g @cli-tools/oh-my-sdd`
- [ ] 15. `~/.claude/plugins/oh-my-sdd/` 已删
- [ ] 16. `~/.oh-my-sdd/` 仍存在（state 保留）
- [ ] 17. 重装后配置和会话历史可继续使用

## 跨平台验证

- [ ] 18. 在 Windows 上重复 1-13（重点：hook 命令字符串引号、path.sep）
- [ ] 19. 在 Linux 上重复 1-13（重点：文件权限 0o700/0o600）
- [ ] 20. 在 macOS 上重复 1-13（keychain 不需要——iam 自己管）
