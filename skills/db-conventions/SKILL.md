---
name: db-conventions
description: 本 skill 在用户说"设计表"/"加索引"/"配连接池"/"SQL 优化"/"分库分表"/"线程池"时使用。涵盖数据库选型、Schema 设计、池化技术（线程池/连接池/缓存池）、金融行业多库规范（MySQL/Oracle/GaussDB/OceanBase/达梦）。
---

# 数据库规范 Skill

涉及数据库设计、SQL 编写、池化配置时按需加载 resources。

## 加载决策

| 任务 | Read 这个 resource |
|------|------------------|
| 数据库选型、Schema 变更、表设计、查询规范、数据安全、备份恢复 | `resources/db-configuration.md` |
| **金融行业强约束项目**（多数据库统一规范：MySQL/Oracle/GaussDB/OceanBase/达梦） | `resources/database-conventions.md`（优先） |
| 线程池、连接池、通信连接池、缓存池配置 | `resources/pooling-conventions.md` |

## 核心规则（无需 Read resources 也必须遵守）

- **每个表必须有主键**——禁止无主键表
- **单表大小不超 10GB / 行数不超 1000 万**——超过必须分表
- **字符集统一 UTF8**（OceanBase 用 utf8mb4）
- **所有表和字段必须加中文注释**
- **禁止存储图片、文件等大二进制数据**——用对象存储
- **SQL 必须参数化**——禁止字符串拼接（注入风险）
- **应用账号禁止 DDL**（`CREATE/ALTER/DROP`）——读写分离
- **线程池禁用 Executors 内置方法**（无界队列/无界线程 OOM 风险）——必须用 ThreadPoolExecutor

## 何时不应使用

- 前端 localStorage/IndexedDB（浏览器 API，不是企业数据库）
- Redis/MQ 选型（→ `api-design` 的 `middleware-conventions.md`）
- 数据分析/数仓建模（不在企业规范范围）
