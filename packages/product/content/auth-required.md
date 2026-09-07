⚠️ **未通过 iam 身份认证**

当前适配器需要 iam 身份认证。

当前会话所属的 oh-my-sdd 适配器检测到 `iam auth status` 没有有效凭据。

**完成认证：**

```bash
oms-login
```

认证成功后，重启或重新加载当前宿主，再运行 `oms doctor --tool <id>` 确认该适配器的加载与保护状态。

此提示只适用于启用了 iam 校验的适配器情境（例如 Claude Code 企业路径），并不表示每个 oh-my-sdd 宿主都要求 iam 认证。若不确定当前宿主或认证要求，运行：

```bash
oms doctor
```
