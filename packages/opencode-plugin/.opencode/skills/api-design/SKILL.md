---
name: api-design
description: 本 skill 在用户说"设计 API"/"写 OpenAPI"/"评审接口"/"选中间件"/"规划项目结构"时使用。涵盖 REST/gRPC 设计、版本管理、错误码、统一报文规范、自研框架约束、中间件选型（缓存/MQ/RPC）。金融行业强约束项目优先加载统一报文/多库规范。
---

# API 设计 Skill

设计企业级 API 时按需加载 resources——避免一次全加载污染上下文。

## 加载决策

| 任务 | Read 这个 resource |
|------|------------------|
| 设计 REST/gRPC 端点、版本管理、错误码 | `resources/api-design.md` |
| **金融行业强约束项目**（统一报文、仅 GET/POST） | `resources/api-standards.md`（优先于 api-design） |
| 项目结构、控制器层、模块划分、代码组织 | `resources/framework-conventions.md` |
| 中间件选型（缓存/MQ/RPC/配置中心） | `resources/middleware-conventions.md` |

## 核心规则（无需 Read resources 也必须遵守）

- **路径强制带版本**：`/v1/`、`/v2/`——禁止 query/header 传版本
- **错误码语义化**：HTTP 状态码 + 业务错误码（`<DOMAIN>_<REASON>`，如 `AUTH_TOKEN_EXPIRED`）
- **写接口必须支持幂等**：`Idempotency-Key` header，服务端记 24h+
- **列表强制分页**：`size` 默认 20、最大 100；优先 cursor 分页
- **金额用字符串 + 货币单位**：`{"amount": "99.50", "currency": "CNY"}`——禁止 float
- **时间用 UTC ISO 8601**：`2026-06-18T08:00:00Z`
- **错误响应禁泄露内部信息**：不返回栈跟踪、SQL、内网路径

## 何时不应使用

- 前端组件 props 传递（那是前端 API，不是 RESTful）
- 数据库表设计（→ `db-conventions` skill）
- 业务异常错误码的金融行业格式（→ `security-check` skill 的 `enterprise-business-rules.md`）
