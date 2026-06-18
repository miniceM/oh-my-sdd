---
name: api-design
description: 企业 API 设计规范。当用户设计 REST/gRPC API、写 OpenAPI spec、或评审接口设计时主动使用。
---

# 企业 API 设计 Skill

设计企业级对外/对内 API 时遵守本规范。目标：长期可维护、可演进、对调用方友好；同时满足安全、可观测与合规审计。

## 必须遵循

### 命名规范
- REST 资源统一用复数小写名词、`kebab-case`：`/v1/users`、`/v1/orders/{order-id}/line-items`
- 字段名统一 `camelCase`（JSON 输出）或 `snake_case`（团队有约定时全项目一致即可，禁止混用）
- gRPC `method` 用 `<Verb><Noun>`：`CreateOrder`、`ListOrders`、`GetUser`；`Verb` 用 `Create/Get/List/Update/Delete`
- 时间字段统一后缀 `At`（`createdAt`/`expiresAt`），布尔字段统一 `is/has` 前缀（`isActive`）
- 枚举值用 `SCREAMING_SNAKE_CASE`：`ORDER_STATUS_PENDING`

### 版本控制
- URI 路径强制带主版本号：`/v1/`、`/v2/`，禁止用 query/header 传版本
- 破坏性变更必须升大版本（v1 → v2），并维护旧版本至少 2 个迭代周期
- 字段新增视为兼容性变更，不算升级版本；删字段/改语义必须升版本
- gRPC 使用 `package acme.order.v1`；字段用 protobuf `reserved` 标记已删除字段编号

### 错误码
- HTTP 状态码必须语义化：2xx 成功、4xx 调用方错误、5xx 服务端错误；禁止一切错误都返 200 + `code: 0`
- 错误体统一结构，至少包含 `code`（业务错误码字符串）、`message`（人读）、`details`（机器可解析）、`requestId`：
  ```json
  {"code": "ORDER_NOT_FOUND", "message": "...", "details": {...}, "requestId": "..."}
  ```
- 业务错误码命名：`<DOMAIN>_<REASON>`，全大写下划线：`AUTH_TOKEN_EXPIRED`、`PAYMENT_INSUFFICIENT_FUNDS`
- 禁止用通用 `INVALID_REQUEST` 一码打天下；区分 `VALIDATION_FAILED` / `RESOURCE_NOT_FOUND` / `PERMISSION_DENIED`

### 分页
- 列表接口默认强制分页，禁止无上限全量返回
- 优先 `cursor` 分页（`nextCursor`），大数据量/流式场景必须用 cursor；小数据集可用 `page+size`
- `size` 默认 20、最大 100；超限返回 `VALIDATION_FAILED`，不静默截断
- 响应结构统一：`{items: [...], nextCursor?: "...", hasMore: bool, total?: number}`

### 幂等性
- 所有写接口（POST/PUT/DELETE 引发副作用）必须支持 `Idempotency-Key` header
- 服务端记录 `Idempotency-Key` + 请求体 hash 至少 24 小时，命中时返回首次结果
- 支付、扣库存、发券等关键业务强制要求 `Idempotency-Key`，缺失直接 400

### 鉴权与授权
- 对外接口默认要求 Bearer Token（JWT/OAuth2），匿名接口需在 spec 中显式标注
- 资源 ID 必须做归属校验（owner check），不能只靠"知道 ID 就能访问"
- 危险操作（删除、转移所有权）必须二次确认或要求 `scope: write:dangerous`

### 文档要求
- 所有接口必须有 OpenAPI 3.0+ spec，提交 PR 时 diff 必须同步更新
- 每个接口至少包含：`summary`、`description`、`parameters`、`requestBody`、`responses`（含错误码）、`tags`
- 字段必须标注 `required`、`nullable`、`deprecated`、`example`
- 字段变更（包括新增）必须写 `description`，禁止只留字段名

## 推荐实践
- 时间一律用 UTC ISO 8601（`2026-06-18T08:00:00Z`），输出端不输出本地时区
- 金额用字符串 + 货币单位字段（`"amount": "99.50", "currency": "CNY"`），禁止 float
- ID 优先用 ULID/Snowflake（可排序、无冲突），自增 ID 仅限内部
- 长任务用 `202 Accepted` + 轮询/回调，禁止同步阻塞 30s+
- 接口必须打 `traceId` 透传（HTTP header `X-Trace-Id`），日志可串联
- 批量接口（`POST /v1/orders:batchCreate`）单批 ≤ 100，部分成功时返回每条结果

## 禁止行为
- ❌ 用 HTTP 状态码做业务分支（如 404 表示"无权限"，混淆语义）
- ❌ 在 GET 接口里改数据（破坏幂等与缓存）
- ❌ 把内部 ORM 模型直接序列化输出（暴露内部字段、字段名混乱）
- ❌ 不带版本号或用 query 传版本（`?version=2`）
- ❌ 错误信息暴露内部实现（栈跟踪、SQL、内网路径）
- ❌ 删除字段不升版本、不维护兼容期
- ❌ 用 `code: 0` 表示成功、其他 code 表示失败（错误码必须独立于 HTTP 状态）

## 示例

### 反例（不合规）
```http
POST /api/orders
{"buyerId": "u1", "items": [...], "amount": 99.5}
→ HTTP 200 {"code": 0, "msg": "ok", "data": {...}}
```
问题：无版本、金额用 float、200 + code:0、无幂等 key。

### 正例（合规）
```http
POST /v1/orders
Headers: Authorization: Bearer <jwt>
         Idempotency-Key: 9b1c2e3f-...
         X-Trace-Id: trace-abc-123
Body: {"buyerId": "user_01H...", "items": [...], "amount": {"value": "99.50", "currency": "CNY"}}

→ HTTP 201 Created
   {"id": "order_01H...", "status": "PENDING", "createdAt": "2026-06-18T08:00:00Z"}

失败 → HTTP 409 Conflict
   {"code": "IDEMPOTENCY_REPLAY", "message": "...", "requestId": "..."}
```
