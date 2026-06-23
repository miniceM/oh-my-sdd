# 企业数据库设计开发规范

> 提取策略：合并同类项，保留量化指标，每条 ≤ 50 字 | 估算token：~600
> 职责边界：本文件仅含金融行业特有数据库约束，通用数据库设计见 domain/technology/db-configuration.md

---



## 通用约束（所有数据库适用）

### 1. 整体要求

- [HARD_RULE] 数据库和表字符集统一使用 UTF8（OceanBase 用 utf8mb4）
- [HARD_RULE] 所有表和字段必须添加中文注释
- [HARD_RULE] 符合 3NF 范式，兼顾规范与效率
- [HARD_RULE] 不依赖数据库特性，避免迁移影响
- [HARD_RULE] 不符合原则需在设计文档中详细说明

### 2. 表设计

- [HARD_RULE] 每个表必须有主键
- [HARD_RULE] 单表字段数不超过 50（GaussDB 不超过 1000）
- [HARD_RULE] 单表大小不超 10GB，行数不超 1000 万，否则分表
- [HARD_RULE] 每库表数量不超过 2000
- [HARD_RULE] 禁止使用实体表存储临时数据
- [HARD_RULE] 禁止存储图片、文件等大二进制数据
- [HARD_RULE] 冷热数据分离，减小表宽度
- [HARD_RULE] 历史表必须指定清理策略
- [HARD_RULE] 联机业务数据与历史数据分离（分表/分库/物理分离）

### 3. 列设计

- [HARD_RULE] 字段定义为 NOT NULL 并设默认值
- [HARD_RULE] 相同概念字段在不同表中类型、长度必须一致
- [HARD_RULE] 禁止使用 ENUM 类型，用 TINYINT 代替
- [HARD_RULE] 金额类数据必须使用 DECIMAL，禁止 FLOAT/DOUBLE
- [HARD_RULE] 禁止使用 BLOB 数据类型
- [HARD_RULE] 原则上禁止使用 LOB/TEXT 字段
- [HARD_RULE] 禁止存储影像、音视频、图片等静态资源，仅存 ID 或 URL
- [HARD_RULE] 日期用 TIMESTAMP/DATETIME，不用字符类型
- [HARD_RULE] 手机号用 VARCHAR(20)，不用整数
- [HARD_RULE] 自增标识用 INT 或 BIGINT，大量删除重写入用 BIGINT
- [HARD_RULE] 逻辑删除字段用 INT（1 删除，0 未删除），全系统统一

### 4. 索引设计

- [HARD_RULE] 单表索引数量不超过 5 个（GaussDB 不超过 20）
- [HARD_RULE] 复合索引列数不超过 3 个
- [HARD_RULE] 禁止建立冗余索引和重复索引
- [HARD_RULE] 复合索引区分度最高的列放最左侧
- [HARD_RULE] 禁止在区分度低的列上建索引（如性别）
- [HARD_RULE] 过长 VARCHAR 字段用前缀索引或 CRC32/MD5 伪列索引
- [HARD_RULE] 索引字段总宽度不超过 50 字节（GaussDB）
- [HARD_RULE] 小表（不足 1000 条）不适合建索引

### 5. SQL 编写

- [HARD_RULE] 禁止使用 SELECT *，必须指定列名
- [HARD_RULE] INSERT 语句必须指定字段列表
- [HARD_RULE] JOIN 关联表不超过 3 个
- [HARD_RULE] 关联条件数据类型必须一致，避免隐式转换
- [HARD_RULE] 禁止 WHERE 子句中对列进行函数转换或计算
- [HARD_RULE] 禁止全模糊查询（%xxx%），可用右模糊（xxx%）
- [HARD_RULE] OR 判断用 IN 代替，IN 值不超过 500 个
- [HARD_RULE] OLTP 系统 SQL 必须绑定变量
- [HARD_RULE] 分页查询必须带排序条件
- [HARD_RULE] LIMIT/ROWNUM 查询必须先子查询排序再取值
- [HARD_RULE] 禁止使用 ORDER BY RAND() 随机排序
- [HARD_RULE] 明确无重复时用 UNION ALL 代替 UNION
- [HARD_RULE] 拆分复杂大 SQL 为多个小 SQL
- [HARD_RULE] 非结构化数据（影像、图片）不允许存数据库
- [HARD_RULE] 大批量 DML 分批提交，防止大事务
- [HARD_RULE] 条件列上禁止使用函数或表达式运算

### 6. 约束与对象

- [HARD_RULE] 原则上禁止使用外键约束
- [HARD_RULE] 原则上禁止使用存储过程、触发器、Event
- [HARD_RULE] 不建议使用联合主键
- [HARD_RULE] 数据库服务器不允许运行非数据库程序

### 7. 数据库连接

- [HARD_RULE] 应用连接数据库必须使用域名
- [HARD_RULE] 连接池参数：连接数 = (核心数 × 2) + 有效磁盘数
- [HARD_RULE] 数据库异常时应用须具备重连功能
- [HARD_RULE] 连接超时最大 1 秒，空闲超时最大 30 秒
- [HARD_RULE] 交易量较大系统建议读写分离

### 8. 数据库安全

- [HARD_RULE] 禁止存储明文密码，禁止 MD5 存储密码
- [HARD_RULE] 密码至少 8 位，含大小写字母、数字、特殊字符中 3 种
- [HARD_RULE] 每个数据库创建只读用户，查询只能用只读用户
- [HARD_RULE] 禁止跨库访问，不同数据库用不同账号
- [HARD_RULE] 开发/测试/生产环境相同用户权限必须完全一致
- [HARD_RULE] Java 系统用统一平台加密工具加密密码配置
- [HARD_RULE] 定期修改数据库用户密码
- [HARD_RULE] 清理无关账号及匿名账号

---

## 特定数据库约束

### MySQL

- [SOFT_RULE] 采用 5.7 版本，主从或主主架构，不允许单点
- [SOFT_RULE] 业务表必须使用 InnoDB 存储引擎
- [SOFT_RULE] 单表大小不超 16GB，行数不超 2000 万
- [SOFT_RULE] 不建议使用分区表，可用分表策略替代
- [SOFT_RULE] 默认事务隔离级别 REPEATABLE-READ
- [SOFT_RULE] 单节点最大连接数不超 1000
- [SOFT_RULE] 主键推荐 UNSIGNED 整数，使用 AUTO_INCREMENT
- [SOFT_RULE] TEXT 类型可存 64K，特殊需求需设计文档说明

### Oracle

- [SOFT_RULE] 生产系统必须采用 RAC 架构
- [SOFT_RULE] A+/A 类系统用 ADG 建立同城容灾
- [SOFT_RULE] 单表大小不超 10GB，行数不超 1000 万
- [SOFT_RULE] 表超 10GB 或 1000 万行应考虑分区
- [SOFT_RULE] Range 分区必须设置 P_MAX(maxvalue) 分区
- [SOFT_RULE] 分区键为 date 类型时用 range+interval 自增分区
- [SOFT_RULE] 所有字段总长度不能超出一个数据块(BLOCK)
- [SOFT_RULE] 大表先建唯一索引再加主键约束
- [SOFT_RULE] OLTP 系统单表索引不超 3 个，混合型不超 5 个
- [SOFT_RULE] 索引 initrans 建议调整至 50 防索引分裂
- [SOFT_RULE] 单节点最大连接数不超 2000
- [SOFT_RULE] 默认事务隔离级别 READ-COMMITTED
- [SOFT_RULE] 物化视图刷新间隔最小 3 分钟，基表必须建主键
- [SOFT_RULE] 生产库不允许建数据库 job，统一归 ScheduleSvr
- [SOFT_RULE] Sequence 需指定 cache 值和 noorder 属性
- [SOFT_RULE] OLTP 系统 DB_BLOCK_SIZE 设为 8K

### GaussDB

- [SOFT_RULE] 主要用于 OLAP 场景，不适合 OLTP
- [SOFT_RULE] 字符集默认 GBK（已有集群），新建可用 UTF8
- [SOFT_RULE] 用户表必须指定 schema 名：create table schema.table
- [SOFT_RULE] 用户表禁止使用自增序列或自增数据类型
- [SOFT_RULE] 单表分布键不超 5 个字段
- [SOFT_RULE] 单表列数控制在 1000 以内
- [SOFT_RULE] 数据源字段长度不超 47 字节
- [SOFT_RULE] 批处理场景默认不建索引
- [SOFT_RULE] 列存表不支持主键/唯一约束/check 约束
- [SOFT_RULE] 主键约束不超 9 个字段
- [SOFT_RULE] 禁止使用 check 约束
- [SOFT_RULE] 禁止个人用户创建存储过程
- [SOFT_RULE] 禁止创建触发器
- [SOFT_RULE] 原则上用户表使用列存
- [SOFT_RULE] 默认事务隔离级别 READ-COMMITTED
- [SOFT_RULE] 数据倾斜超 5% 视为倾斜，超 10% 必须调整分布列
- [SOFT_RULE] 禁止使用 UPDATE 和 merge into，用 DELETE+INSERT
- [SOFT_RULE] 禁止无条件 DELETE，清表用 TRUNCATE
- [SOFT_RULE] 结果集超 100 万时 JOIN 不超 4 个表
- [SOFT_RULE] 子查询不超 2 层
- [SOFT_RULE] 禁止使用 WITH AS
- [SOFT_RULE] 数据量超 1000 条时禁止游标、递归、序列
- [SOFT_RULE] 必须使用列式表，分布键个数不大于 5
- [SOFT_RULE] 数据变化后必须执行 ANALYZE
- [SOFT_RULE] 禁止项目组创建自定义函数
- [SOFT_RULE] 需具备旁路逃生机制

### OceanBase

- [SOFT_RULE] 字符集统一 utf8mb4
- [SOFT_RULE] 单表行数超 10 亿或容量超 2000GB 才考虑分区表
- [SOFT_RULE] Range 分区必须设置 P_MAX(maxvalue) 分区
- [SOFT_RULE] 单表列数不超 50
- [SOFT_RULE] 禁止使用 ENUM、SET 类型
- [SOFT_RULE] 原则上禁止 LOB、TEXT 字段
- [SOFT_RULE] VARCHAR 长度不超 256K
- [SOFT_RULE] 自增列推荐 BIGINT 类型
- [SOFT_RULE] 索引类型必须为 BTREE
- [SOFT_RULE] 单索引记录长度不超 64KB
- [SOFT_RULE] 单表索引不超 5 个
- [SOFT_RULE] 唯一索引在建表时指定
- [SOFT_RULE] 主键长度之和 ≤ 16K，单行长度 ≤ 1.5M
- [SOFT_RULE] 不得使用外键与级联
- [SOFT_RULE] 不支持临时表、存储过程、触发器、游标
- [SOFT_RULE] 禁止使用 EVENT 功能
- [SOFT_RULE] 禁止使用用户自定义变量
- [SOFT_RULE] SELECT 禁止 UNION，推荐 UNION ALL，子句 ≤ 5 个
- [SOFT_RULE] IN 集合元素控制在 100 内，最大 8192
- [SOFT_RULE] 中间结果集限制 10000 行以内
- [SOFT_RULE] 单事务操作行数控制在 2000 以内
- [SOFT_RULE] 并发插入控制在 200 以内
- [SOFT_RULE] 单 SQL 大小限制 5MB 以内
- [SOFT_RULE] SQL 结果集必须限制 1MB 以内
- [SOFT_RULE] 数据分片场景 SQL 必须带分区键
- [SOFT_RULE] 删除/更新粒度 ≤ 100 条，WHERE 条件有索引
- [SOFT_RULE] 默认事务隔离级别 READ-COMMITTED
- [SOFT_RULE] 频繁写场景推荐写缓存机制
- [SOFT_RULE] 应用需申请专用租户，禁止使用 sys 租户建表

### 达梦(DM)

- [SOFT_RULE] 生产系统采用主备数据守护集群架构
- [SOFT_RULE] A+/A 类系统用一主多备建容灾环境
- [SOFT_RULE] 表数量不超 2000，单表不超 20GB
- [SOFT_RULE] 簇大小建议 32 页，页大小建议 32K
- [SOFT_RULE] 字符集统一 UTF-8
- [SOFT_RULE] 单表列数不超 50
- [SOFT_RULE] 所有字段总长度不能超出一个数据块(BLOCK)
- [SOFT_RULE] Range 分区必须设置 P_MAX(maxvalue) 分区
- [SOFT_RULE] 大表先建唯一索引再加主键约束
- [SOFT_RULE] OLTP 系统单表索引不超 5 个
- [SOFT_RULE] 小表（< 1000 条）不建索引
- [SOFT_RULE] 记录数超 1000 万时 JOIN 大表不超 4 个
- [SOFT_RULE] 默认事务隔离级别 READ-COMMITTED
- [SOFT_RULE] 物化视图刷新间隔最小 3 分钟
- [SOFT_RULE] 原则上禁止使用存储过程
- [SOFT_RULE] 原则上尽量不使用触发器
- [SOFT_RULE] Sequence cache 值调整为 10000 或更高
- [SOFT_RULE] 禁止在程序中执行 DDL
- [SOFT_RULE] 开发/测试/生产页大小、大小写敏感等参数必须一致
- [SOFT_RULE] 关键字 ROWID/TRXID 等不能作为列名

---

## 自增序列规范

- [HARD_RULE] 循环序列必须拼接日期（YYYYMMDD 或 YYMMDD）确保全生命周期唯一
- [HARD_RULE] 非循环序列须预留足够值域和字段长度
- [HARD_RULE] 非循环序列须添加监控，使用超 80% 阈值时自动报警
- [HARD_RULE] 拼接日期的业务字段须考虑每日极端峰值，预留足够序列长度
- [HARD_RULE] 无法拼接日期的字段（账号、客户号等）必须用非循环序列
- [HARD_RULE] 使用数据库序列均应设置缓存（如 CACHE 100）
- [HARD_RULE] 外部算法生成序列号须通过唯一键约束保障唯一性
- [HARD_RULE] 新建/重构系统必须满足该规范
- [HARD_RULE] 存量系统新增序列场景必须满足该规范
- [SOFT_RULE] UUID 不适合作为数据库主键（无序、占空间、影响性能）
- [SOFT_RULE] Snowflake 算法须规避时钟回拨问题，使用单例模式+线程安全
- [SOFT_RULE] 文件名规则：系统简称 + 文件业务类型 + 八位日期 + 八位序列号
- [SOFT_RULE] 业务编号规则：系统简称 + 业务类型 + 八位日期 + 序列号
- [SOFT_RULE] 批次号规则：系统简称 + 批次业务类型 + 八位日期 + 八位序列号
- [SOFT_RULE] 账号规则：机构 + 币种 + 产品类型 + 八位序列值

---

## 连接池配置参考

| 参数 | 公式/值 | 说明 |
|------|---------|------|
| 连接数 | (核心数 × 2) + 有效磁盘数 | 通用公式 |
| MySQL 最大连接 | ≤ 1000 | 单节点 |
| Oracle 最大连接 | ≤ 2000 | 单节点 |
| 连接超时 | ≤ 1 秒 | OceanBase 要求 |
| 空闲超时 | ≤ 30 秒 | OceanBase 要求 |
| 连接回收 | ≤ 3600 秒 | OceanBase 要求 |

## 数据量阈值汇总

| 指标 | MySQL | Oracle | GaussDB | OceanBase | 达梦 |
|------|-------|--------|---------|-----------|------|
| 单表最大行数 | 2000 万 | 1000 万 | - | 10 亿 | - |
| 单表最大容量 | 16GB | 10GB | - | 2000GB | 20GB |
| 单表最大字段 | 50 | 50 | 1000 | 50 | 50 |
| 单库最大表数 | 2000 | - | - | - | 2000 |
| 单表最大索引 | 5 | 3(OLTP)/5(混合) | 20 | 5 | 5 |
| 复合索引列数 | 3 | 3 | - | - | - |
| JOIN 表数 | 3 | 3 | 4(>100万) | 3 | 4(>1000万) |
