# API接口规范 - API Standards

> 企业级API接口设计规范，来源：金融行业接口规范文档


---

## [HARD_RULE] 统一报文规范


### 报文结构
- 组成：报文长度(10进制6位) + 报文头(16字段) + 报文体
- 报文头相当于信封，报文体相当于信内容

### 报文头字段（XML/JSON统一）
| 字段 | 类型 | 必输 | 说明 |
|------|------|------|------|
| TRAN_CODE | STRING(8) | Y | 交易码，前2位类型+后6位代码 |
| SERVICE_CODE | STRING(24) | N | 服务领域（仅核心系统） |
| SEQ_NO | STRING(24) | Y | 全局流水号，端到端一致 |
| USER_ID | STRING(30) | Y | 服务请求者身份（柜员号等） |
| CONSUMER_ID | STRING(3) | Y | 请求系统编号（架构治理平台3位标识） |
| TRAN_DATE | STRING(8) | Y | 交易日期YYYYMMDD |
| TRAN_TIMESTAMP | STRING(9) | Y | 交易时间HHMMSSNNN |
| SERVER_ID | STRING(30) | Y | 请求方服务器IP |
| SOURCE_TYPE | STRING(2) | Y | 渠道类型 |
| COMPANY_ID | STRING(10) | N | 法人代码 |

### 报文组建原则
- 禁止使用空内容标签（`<TAG></TAG>`或`<TAG/>`）
- 数组使用`<Row>`标签包裹，禁止空数组
- 报文体禁止使用与报文头含义相同的字段
- 交易码8位：前2位报文类型(01金融/02非金融/03联机批量/04冲正/05查询)

### JSON报文
- 请求报文头字段：seqNo(24位), companyId, extras(扩展节点)
- 应答报文头字段：retCode(15位交易返回码)

---

## [HARD_RULE] 金融行业接口设计规范


### URI规范
- 格式：`http(s)://[domain]/api/[系统简称-微服务标识]/[模块]/[接口类型]/[对象]/[动作]`
- 系统简称：3位小写字母，架构组统一规划
- 微服务标识：16位小写字母，系统内唯一
- 接口类型：f(金融)/n(非金融)/b(联机批量)/r(冲正)/q(查询)
- 接口全行唯一：[系统简称-微服务标识]全行唯一

### 请求约束
- 仅允许GET和POST方法
- GET仅用于公共资源查询，禁止传递用户信息
- POST通过request body传递数据，用于创建/更新/删除
- 禁止动态URL，参数以`?name1=value1&name2=value2`形式附加

### 数据类型约束
- 整型：Integer/Long
- 字符型：String
- 浮点型：Float/Double
- 精度数字：BigDecimal[有效位,精度]，示例[14,2]
- 日期：yyyy-MM-dd HH:mm:ss（可配置）
- 布尔：true/false

---

> [HARD_RULE] 不可覆盖 | [SOFT_RULE] 可显式覆盖（需[OVERRIDE]声明）
