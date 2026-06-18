⚠️ **未通过 iam 身份认证**

你正在使用企业 Claude Code 插件（oh-my-sdd），但当前 `iam auth status` 显示无有效凭据。

**完成认证：**

```bash
oms-login
# 或交互式：iam login -u <你的用户名> -p <你的密码>
```

认证后**重启 Claude Code**，baseline 将自动注入。

在认证完成前：
- 不会注入企业 baseline
- DOP 不上报任何数据
- 部分企业命令可能受限
