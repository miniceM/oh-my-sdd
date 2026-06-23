# 私域框架规范 - Framework Conventions

> 本文件定义企业自研框架的使用约束，所有项目必须遵守 | 估算token：~800


---

## [HARD_RULE] 项目结构


### 标准目录结构
```
project-root/
├── src/
│   ├── main/
│   │   ├── java/com/{company}/{domain}/
│   │   │   ├── application/          # 应用层：用例编排、事务管理
│   │   │   │   ├── service/          # 应用服务
│   │   │   │   ├── dto/              # 数据传输对象
│   │   │   │   └── assembler/        # 对象转换器
│   │   │   ├── domain/               # 领域层：业务逻辑
│   │   │   │   ├── model/            # 领域模型/实体
│   │   │   │   ├── repository/       # 仓储接口
│   │   │   │   ├── service/          # 领域服务
│   │   │   │   └── event/            # 领域事件
│   │   │   ├── infrastructure/       # 基础设施层
│   │   │   │   ├── persistence/      # 数据访问实现
│   │   │   │   │   ├── entity/       # 数据库实体
│   │   │   │   │   ├── mapper/       # MyBatis Mapper/JPA Repository
│   │   │   │   │   └── converter/    # 实体转换器
│   │   │   │   ├── external/         # 外部服务调用
│   │   │   │   │   ├── client/       # 第三方客户端
│   │   │   │   │   └── dto/          # 外部DTO
│   │   │   │   ├── config/           # 配置类
│   │   │   │   └── mq/               # 消息队列
│   │   │   ├── interfaces/           # 接口层
│   │   │   │   ├── rest/             # REST控制器
│   │   │   │   ├── rpc/              # RPC服务实现
│   │   │   │   ├── mq/               # 消息消费者
│   │   │   │   └── job/              # 定时任务
│   │   │   └── common/               # 公共组件
│   │   │       ├── exception/        # 异常定义
│   │   │       ├── constants/        # 常量
│   │   │       └── util/             # 工具类
│   │   └── resources/
│   │       ├── application.yml       # 主配置
│   │       ├── application-{env}.yml # 环境配置
│   │       ├── mapper/               # MyBatis XML
│   │       └── db/migration/         # Flyway/Liquibase脚本
│   └── test/
│       ├── java/                     # 测试代码（同main结构）
│       └── resources/                # 测试资源
├── docs/                             # 项目文档
├── scripts/                          # 构建/部署脚本
└── pom.xml / build.gradle            # 构建配置
```

### 包命名
- 基础包：`com.{company}.{domain}`
- 子包按分层命名，禁止按功能平铺
- 禁止创建`util`包存放业务逻辑，仅允许纯工具类

---

## [HARD_RULE] 企业自研框架约束


### 企业基础框架（Enterprise Starter）
- 所有项目必须继承企业父POM：`com.{company}:enterprise-parent`
- 必须使用企业统一日志配置：`enterprise-logging-starter`
- 必须使用企业统一异常处理：`enterprise-exception-starter`
- 禁止绕过企业框架直接使用第三方组件

### 企业Web框架（Enterprise Web）
- 控制器必须继承`BaseController`，使用统一响应包装
- 请求验证必须使用企业验证注解：`@EnterpriseValid`
- 权限校验必须使用企业安全拦截器：`@EnterpriseSecurity`
- 禁止在控制器中编写业务逻辑，仅负责参数校验和响应组装

### 企业数据访问框架（Enterprise Data）
- 必须使用企业统一数据源配置：`enterprise-datasource-starter`
- 多数据源必须使用企业路由：`@EnterpriseDataSource("name")`
- 分页必须使用企业分页插件，禁止手写LIMIT
- 批量操作必须使用企业批量工具，单次批量≤1000条

### 企业消息框架（Enterprise MQ）
- 消息生产者必须使用企业消息模板：`EnterpriseMessageTemplate`
- 消息消费者必须实现`EnterpriseMessageHandler`接口
- 消息必须包含：`messageId`, `timestamp`, `source`, `traceId`
- 消费失败必须进入死信队列，重试策略由企业框架统一管理

---

## [HARD_RULE] 模块划分

### 模块边界
- **领域层**：纯业务逻辑，不依赖任何框架注解
- **应用层**：用例编排，可依赖领域层和基础设施层接口
- **基础设施层**：技术实现，实现领域层定义的接口
- **接口层**：对外暴露，仅依赖应用层

### 依赖方向
```
interfaces → application → domain ← infrastructure
```
- 禁止反向依赖
- 禁止跨层调用（如interfaces直接调用infrastructure）
- 禁止同级模块循环依赖

### 模块通信
- 模块间通过接口通信，禁止直接依赖实现类
- 使用依赖注入，禁止静态方法调用跨模块逻辑
- 领域事件用于模块间异步通信，禁止同步调用

---

## [HARD_RULE] 代码组织

### 类设计
- 单个类≤500行，方法≤50行
- 公共方法必须有Javadoc，包含`@param`、`@return`、`@throws`
- 私有方法使用解释性命名，禁止单字母或缩写
- 构造函数参数≤5个，超过时使用Builder模式

### 配置管理
- 配置类必须使用`@ConfigurationProperties`，禁止`@Value`分散注入
- 配置前缀：`enterprise.{module}`
- 敏感配置必须通过密钥管理服务注入，禁止明文
- 环境差异配置使用`application-{env}.yml`，禁止代码中判断环境

### 数据库规范
- 表名：`t_{模块}_{实体}`，如 `t_user_account`
- 字段名：snake_case，禁止驼峰
- 必须包含：`id`（主键）、`created_at`、`updated_at`、`is_deleted`（逻辑删除）
- 禁止使用外键，关联通过应用层维护
- 索引命名：`idx_{表名}_{字段}`，唯一索引：`uk_{表名}_{字段}`

---

## [SOFT_RULE] 推荐实践

### 项目结构
- 微服务项目使用多模块Maven/Gradle结构
- 公共组件提取到独立模块，避免代码复制
- 使用`module-info.java`（Java 9+）明确模块边界

### 企业框架
- 优先使用企业框架提供的默认实现
- 扩展企业框架时，遵循开闭原则（对扩展开放，对修改关闭）
- 定期同步企业框架最新版本，保持安全补丁更新

### 模块划分
- 新功能开发前先评估是否可复用现有模块
- 模块拆分以业务边界为依据，而非技术边界
- 使用领域驱动设计（DDD）指导模块划分

### 代码组织
- 使用包私有（package-private）限制可见性
- 优先使用不可变对象（final字段、无setter）
- 复杂查询使用Specification/QueryDSL，避免字符串拼接SQL

---

---

## [HARD_RULE] 金融行业技术栈版本约束

> 以下版本为企业强制要求，不可覆盖

| 技术栈 | 版本/约束 | 说明 |
|--------|-----------|------|
| JDK | JDK 8+ | 最低版本要求，Comparator需满足JDK7+三条件 |
| Spring Boot | 企业父POM统一管理 | 继承`enterprise-parent`，禁止自行指定版本 |
| 熔断框架 | Sentinel(UDP SDK 3.x) / Hystrix(UDP SDK 1.x/2.x) | 按SDK版本选择对应熔断技术栈 |
| 报文编码 | UTF-8 | 所有报文统一Unicode字符集 |
| 内容类型 | application/json;charset=utf-8 | POST请求和响应统一JSON格式 |

---

## [HARD_RULE] 金融行业Java编码规范


### 命名约束
- 类名UpperCamelCase，方法/变量lowerCamelCase，常量UPPER_SNAKE_CASE
- 禁止拼音与英文混合，禁止直接使用中文命名
- 包名全小写，点分隔仅含一个自然语义单词
- 异常类以Exception结尾，测试类以Test结尾
- 布尔变量禁止is前缀（防序列化错误）

### 类型约束
- POJO属性必须使用包装数据类型（Integer/Long等），禁止基本类型
- RPC方法返回值和参数必须使用包装数据类型
- 浮点数等值判断禁止用==或equals，使用BigDecimal或误差范围
- long/Long初始值必须大写L，禁止小写l

### 并发约束
- 线程资源必须通过线程池提供，禁止显式创建线程
- 线程池必须命名，定义为单例或类成员变量
- ThreadLocal变量必须调用remove()回收
- SimpleDateFormat禁止定义为static变量（线程不安全）
- 多资源加锁必须保持一致的加锁顺序

### 事务约束
- @Transactional必须设置rollbackFor=Exception.class
- try块在事务中时，catch后需手动回滚事务

### 集合约束
- 判断集合空使用isEmpty()，禁止size()==0
- Arrays.asList()返回的集合禁止修改操作
- subList结果不可强转为ArrayList

### 注释约束
- 类/方法注释必须使用Javadoc规范（/** */格式）
- 所有类必须添加@author或@创建人信息
- 枚举字段必须有注释说明用途

---

## [SOFT_RULE] 金融行业推荐实践

> 以下为推荐规范，可经[OVERRIDE]覆盖

### Java开发
- Spring框架线程池建议实现DisposableBean接口，执行shutdown和awaitTermination
- 优先使用企业框架提供的默认实现
- 定期同步企业框架最新版本，保持安全补丁更新
- 使用IDE代码规范扫描工具控制代码质量

### 微服务开发
- 数据库实例能支撑业务时，建议使用独立schema（实践C）
- 会话有效期建议15-30分钟，超过有效期会话被销毁
- 微服务内部高内聚，微服务之间松耦合
- 新功能开发前先评估是否可复用现有模块
- 使用开发平台IDE进行代码规范扫描

### 接口设计
- 接口命名体现业务操作（add/affirm/sign/submit等）
- 数据域以小驼峰命名，避免特殊符号
- 优先识别和复用企业级/领域级共享能力

### 安全配置
- Spring Boot Actuator必须配置安全访问控制，禁止未授权访问
- Swagger必须配置访问权限，生产环境禁止暴露
- 前端敏感信息（证件号、内网IP等）必须限制展示

---

> [HARD_RULE] 不可覆盖 | [SOFT_RULE] 可显式覆盖（需[OVERRIDE]声明）
> 本文件定义企业自研框架的使用约束，所有项目必须遵守
