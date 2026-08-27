---
name: security-check
description: 本 skill 在用户说"加鉴权"/"加密"/"写错误码"/"防注入"/"合规扫描"或写涉及用户输入、密钥、网络的代码时使用。涵盖 OWASP Top 10 检查项、企业安全红线（AES-256-GCM/TLS 1.2+）、金融行业 15 位错误码规范（如 NCM.CTM.BMN0001）、密钥管理。
---

# 安全审计 Skill

写涉及用户输入、鉴权、密钥、网络的代码时强制按本规范自检。

## 加载决策

| 任务 | Read 这个 resource |
|------|------------------|
| 加密算法、TLS、会话超时、熔断、日志安全、漏洞修复 SLA、许可证合规 | `resources/security-conventions.md` |
| **金融行业错误码格式**（15 位 `系统.模块.业务`，如 `NCM.CTM.BMN0001`）、流水号规范 | `resources/enterprise-business-rules.md` |

## OWASP Top 10 快速自查（无需 Read resources）

### A01 失效的访问控制
- 每个端点必须显式鉴权；资源访问必须校验归属（owner check）
- 越权测试：A 的 token 必须不能读/写 B 的资源（IDOR）

### A02 加密失败
- HTTP 对外强制 TLS 1.2+；密码用 bcrypt/scrypt/argon2
- 敏感字段（身份证、手机号）DB 加存储 + 日志脱敏（`138****1234`）
- JWT 用 RS256/ES256，禁止 `alg: none` / HS256 + 弱密钥

### A03 注入
- SQL 必须参数化；命令必须 `execFile(file, [args])`，禁止 `exec("ls " + userInput)`

### A04 不安全设计
- 关键流程必须有 rate limit + 验证码；一次性 token 必须 random + 短 TTL（≤ 15 分钟）

### A05 安全配置错误
- 默认账号/密码/密钥必须改；错误页禁返回 stack trace；CORS 禁 `*` + `Credentials: true`

### A06-A10
- 依赖固定版本 + `npm audit`；登录失败锁定；反序列化关 default typing；audit log；SSRF 防护（解析→白名单→IP 校验）

## 密钥管理（红线）

- ❌ 禁止硬编码密钥（包括"临时调试"）
- ❌ 禁止把密钥 commit 进 git（`.env` 必须在 `.gitignore`）
- ❌ 禁止把密钥打印到日志、错误响应
- ✅ 统一从 KMS / Vault / Secrets Manager 读取
- ✅ 轮换机制（≤ 90 天）+ dev/staging/prod 隔离

## 何时不应使用

- 纯前端表单校验（产品需求，不是安全规范）
- UI 权限展示（前端组件，不是后端授权）
