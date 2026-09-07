👋 **欢迎使用 oh-my-sdd 企业 SDD 工作流**

开始前，先为当前宿主安装适配器并检查状态：

```bash
oms-install --tool <claude|lingma|opencode|kilocode>
oms doctor --tool <id>
```

如果当前适配器要求 iam 认证，运行 `oms-login`；认证后重启或重新加载该宿主。认证不是所有宿主的通用前置条件。

安装并确认加载后，可使用：

- `/sdd-spec` `/sdd-plan` `/sdd-task` `/sdd-apply` `/sdd-review` —— SDD 五阶段流程
- `/api-design` `/security-check` `/doc-writer` —— 企业定制 skills

诊断依赖、配置漂移或真实生效状态时，使用 `oms doctor`；需要修复时先运行 `oms repair` 审阅计划。
