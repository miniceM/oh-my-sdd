---
name: security-check
description: 企业安全审计规范。在写涉及用户输入、鉴权、密钥、网络的代码时主动使用。
---

# 企业安全审计 Skill

写涉及用户输入、鉴权、密钥、网络的代码时，强制按本规范自检与互检。目标：在 PR 评审阶段拦截 80% 以上的常见安全缺陷，减少上线后被安全团队打回的概率。

## OWASP Top 10 检查项

### A01 失效的访问控制
- 每个端点必须显式鉴权，不允许"默认放行 + 显式拦截"
- 资源访问必须校验主体归属（`if resource.ownerId != ctx.userId → 403`），不能只校验登录
- 越权测试：A 用户的 token 必须不能读/写 B 用户的资源（IDOR 漏洞）
- 管理后台接口必须单独 role check，不能与普通接口共用一个中间件

### A02 加密失败
- HTTP 对外必须强制 TLS 1.2+（禁用 TLS 1.0/1.1、SSLv3）
- 内部服务间通信生产环境必须 mTLS
- 密码必须用 bcrypt/scrypt/argon2，禁止 MD5/SHA1/裸 SHA256
- 敏感字段（身份证、手机号）DB 层加密存储；日志输出必须脱敏（`138****1234`）
- JWT 签名必须用 RS256/ES256，禁止 `alg: none`、禁止 HS256 + 弱密钥

### A03 注入
- SQL：必须用参数化查询 / ORM prepared statement，禁止字符串拼接 SQL
- 命令：必须用 `execFile(file, [args])` 形式，禁止 `exec("ls " + userInput)`
- NoSQL：用户输入禁止直接作为查询条件对象（`{$gt: ""}` 注入）
- LDAP/XML：禁用动态拼接，用库提供的转义接口

### A04 不安全设计
- 关键流程（注册、支付、找回密码）必须有 rate limit + 验证码 / 行为校验
- 一次性 token（激活码、重置码）必须随机生成、单次有效、短 TTL（≤ 15 分钟）
- 业务逻辑漏洞自检：负数转账、并发抢购、重复提交

### A05 安全配置错误
- 默认账号 / 默认密码 / 默认密钥必须改（数据库、中间件、CI runner）
- 错误页禁止返回 stack trace、SQL、内网路径（生产关闭 debug）
- 目录列表、`.git`、`.env`、备份文件必须禁止访问
- CORS：禁止 `Access-Control-Allow-Origin: *` 配合 `Allow-Credentials: true`

### A06 易受攻击的组件
- `package-lock.json` / `requirements.txt` 必须固定版本
- CI 跑 `npm audit` / `pip-audit` / `snyk`，Critical/High 必须修
- 引入新依赖前查 license 与维护状态（star/最近 commit/已知 CVE）

### A07 身份认证失败
- 登录失败 5 次锁定 15 分钟，锁定后不暴露"用户存在"信号
- 密码重置链接一次性 + IP 校验 + 短 TTL
- Session/JWT 必须支持吊销（黑名单或 jti + 状态表）
- 多因素：高权限操作（资金、密钥管理）强制 MFA

### A08 软件与数据完整性失败
- 反序列化（Java Jackson/Python pickle）必须关 `default typing` / 禁用 pickle
- CI/CD 流水线产物必须签名验证（SBOM + sigstore）
- 第三方 webhook 必须验签

### A09 日志与监控失败
- 登录、鉴权失败、敏感操作、配置变更必须打 audit log
- 日志禁止打印密码、token、身份证、卡号（即使 debug 级也不行）
- 日志必须含 `traceId`、`userId`、`ip`、`userAgent`

### A10 服务端请求伪造（SSRF）
- 用户输入的 URL 抓取必须先解析 → 解析后域名白名单 → 解析后 IP 检查（拒绝 `127.0.0.1`、`169.254.x`、内网段、`0.0.0.0`、十进制 IP）
- 二次 DNS 绑定攻击防护：解析后再发请求前再校验一次实际 IP

## 密钥管理

- ❌ 禁止把密钥/Token 写死在代码里（包括"临时调试"）
- ❌ 禁止把密钥 commit 进 git（`.env` 必须 `.gitignore`，预提交 hook 跑 `gitleaks`/`detect-secrets`）
- ❌ 禁止把密钥打印到日志、错误响应、debug 信息
- ✅ 密钥统一从 KMS / Vault / AWS Secrets Manager / Doppler 读取
- ✅ 密钥必须有轮换机制（默认 ≤ 90 天），代码不直接持有密钥，运行时拉取
- ✅ 不同环境（dev/staging/prod）必须用不同密钥集，禁止共享
- ✅ 密钥泄露应急预案：1 小时内吊销 + 重新签发 + 全量审计调用日志

## 网络安全

### TLS / 证书
- 对外服务必须 TLS 1.2+，证书有效期 ≤ 90 天（自动续期），过期告警
- 客户端（脚本/SDK）必须开启证书校验，禁止 `verify=false` / `INSECURE_SKIP_VERIFY`
- 内部 mTLS：所有跨服务调用强制双向证书，证书由内部 CA 签发

### 超时与限流
- 所有 HTTP 调用必须设 connect timeout ≤ 5s、read timeout ≤ 30s，禁止默认无限等
- 入口网关必须配 rate limit（按 IP / userId / API），关键接口更严
- 调用下游必须有熔断（Hystrix/Resilience4j），失败率 > 50% 触发降级

### 输入校验
- 所有外部输入（path/query/body/header）必须在边界层做 schema 校验（joi/zod/pydantic）
- 字符串长度、数字范围、枚举集合必须显式约束，禁止"传啥就用啥"
- 文件上传必须校验 magic number + 大小 + 类型白名单，不能只看扩展名
- 富文本/HTML 入库前必须消毒（DOMPurify / bleach），输出必须转义

## 权限边界

- 最小权限原则：服务账号只申请必需的 scope，禁止 `*:*`
- DB 账号读写分离，应用账号禁止 DDL（`CREATE/ALTER/DROP`）
- CI/CD runner 不持有 prod 凭证，部署通过临时 OIDC token
- 凡是访问其他用户数据的操作，必须走"授权委托"表，不能默认全权代理

## 自检清单（PR 前必过）

- [ ] 没有把密钥/Token 写进代码或日志
- [ ] 所有外部输入都过了 schema 校验
- [ ] 所有 SQL/命令都用了参数化
- [ ] 所有写接口都做了 owner check
- [ ] 所有 HTTP 调用都设了超时
- [ ] 所有密码 / 敏感字段都做了加密或脱敏
- [ ] 新增依赖没有 Critical/High CVE
- [ ] 错误响应不泄露内部信息
