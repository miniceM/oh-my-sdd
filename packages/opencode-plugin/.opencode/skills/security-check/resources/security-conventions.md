# 企业安全编码规范


---


## [HARD_RULE] 开源技术安全检测规范


### 检测时机

- [HARD_RULE] 互联网/重要/新建系统上线前至少T-10工作日完成安全检测
- [HARD_RULE] 周期化安全检测每年不少于1次
- [HARD_RULE] 流水线构建时自动触发开源技术安全检测
- [HARD_RULE] 制品库依赖拉取时自动触发安全检测

### 漏洞修复SLA

- [HARD_RULE] 未上线系统存在高危风险，必须上线前完成整改
- [HARD_RULE] 未上线系统存在中危风险，必须上线后1个月内完成整改
- [HARD_RULE] 无法按时整改需发起安全例外申请，经领导审批报备

### 许可证合规

- [HARD_RULE] 禁止使用GPLv3等传染性许可证（高风险）
- [HARD_RULE] 禁止使用AGPLv3等强传染性许可证（极高风险）
- [SOFT_RULE] 使用LGPL/MPL等弱传染性许可证需持续关注
- [SOFT_RULE] Apache 2.0/BSD/MIT等开放性许可证可正常使用

### 供应链安全

- [HARD_RULE] 禁止使用存在供应链投毒风险的组件（如vue-cli投毒版本）
- [HARD_RULE] 禁止使用停服超过10年缺失维护的开源软件版本
- [HARD_RULE] 发现投毒组件必须立即升级版本或替换

---

## [HARD_RULE] 代码评审规范


### 评审原则

- [HARD_RULE] 基于技术事实和数据否决，禁止个人偏好否决
- [HARD_RULE] 代码风格以风格指南为准，不在指南中的需与现有项目一致

### 评审内容

- [HARD_RULE] 评审必须覆盖：逻辑正确性、编码规范、异常处理、日志处理
- [HARD_RULE] 评审必须覆盖：单元测试有效性、代码分层合理性
- [SOFT_RULE] 评审应包含代码可读性、注释规范性、命名规范性

### 评审形式

- [HARD_RULE] 会议集中评审：每日一次下班前，时长≤60分钟，参与≤7人
- [HARD_RULE] 交叉审核：特性代码合并主干时进行，时长≤20分钟
- [HARD_RULE] 各团队必须建立团队级/项目级代码评审Checklist

### 提交规范

- [SOFT_RULE] 代码提交信息必须清晰描述变更内容
- [SOFT_RULE] 小步提交，降低冲突解决成本
- [SOFT_RULE] 特性代码应当经常合并主干

---

## [SOFT_RULE] 熔断机制规范


### 适用场景

- [HARD_RULE] 互联网高并发场景必须接入熔断（如秒杀抢购、营销活动）
- [HARD_RULE] 下游处理慢的账务类场景必须接入熔断（如支付、红包）
- [HARD_RULE] 业务支撑系统面向多渠道服务必须接入熔断

### 接入要求

- [HARD_RULE] 熔断配置必须基于性能测试结果调整，未压测禁止直接配置
- [HARD_RULE] 微服务间调用使用Feign，JDK版本≥1.8
- [HARD_RULE] 单体应用间调用交易量较大系统必须建立熔断机制

### 断路器状态

- [HARD_RULE] 断路器三状态：关闭（正常访问）、打开（拒绝访问）、半开（试探访问）
- [HARD_RULE] 半开状态仅允许一笔交易尝试，成功则关闭，失败则保持打开

---

## [SOFT_RULE] 日志安全规范


### 日志安全红线

- [HARD_RULE] 禁止输出明文密码、密文密码
- [HARD_RULE] 禁止输出明文密钥、密文密钥
- [HARD_RULE] 禁止输出用户联系方式、身份证号码、银行卡信息
- [HARD_RULE] MAC地址打印必须脱敏
- [HARD_RULE] 互联网系统文件路径打印必须脱敏

### 日志记录原则

- [HARD_RULE] 日志输出不能影响系统正常运行（隔离性）
- [HARD_RULE] 日志打印本身不能存在逻辑异常或漏洞（安全性）
- [HARD_RULE] 日志内容必须包含：级别、时间、系统名、全局流水号、类名/行号

### 日志格式

- [HARD_RULE] 必须采用格式：[时间戳][级别][系统-子系统][全局流水号][系统流水号][类:行号][线程][TID][SID][UID][SESSIONID][关键要素]消息
- [HARD_RULE] 时间戳格式：yyyy-MM-dd HH:mm:ss,SSS（毫秒级）
- [HARD_RULE] 日志文件统一使用UTF-8字符编码

### 日志禁止行为

- [HARD_RULE] 禁止向控制台输出日志（禁止System.out.print、e.printStackTrace）
- [HARD_RULE] 禁止在日志打印中进行复杂计算
- [HARD_RULE] 禁止在循环中打印日志（不定或过大循环）
- [HARD_RULE] 日志记录语句中禁止出现异常，不能阻断日志输出流程
- [HARD_RULE] 日志打印不影响业务逻辑，日志判断方法中不能有业务代码

### 日志限制

- [HARD_RULE] 每行日志原则上≤2K字节，一条日志输出代码≤40行
- [HARD_RULE] trace/debug/info级别输出必须进行日志级别开关判断
- [HARD_RULE] Logger声明必须为private static final
- [HARD_RULE] 日志文件切割标准大小20M，特殊情况≤50M

### 日志保留

- [HARD_RULE] 在线保留3-7天，近线保留1-3个月，离线保留1-3年
- [HARD_RULE] 接入统一日志平台系统，在线最少留存1个月，离线最长3年

### 日志框架

- [HARD_RULE] 禁止直接使用Log4j/Logback API，必须使用SLF4J等门面模式框架
- [HARD_RULE] 高并发系统必须引入动态日志级别调整插件
- [SOFT_RULE] 方法出入参日志优先使用@ZybLog注解

### 脱敏规则

- [HARD_RULE] 敏感数据必须脱敏，推荐使用统一开发平台日志脱敏插件
- [HARD_RULE] 脱敏字段通过sensitive.json配置管理

---

## [HARD_RULE] 通用安全底线补充

> 基于金融安全最佳实践补充

- [HARD_RULE] 生产环境必须启用HTTPS/TLS 1.2+，禁止SSL/TLS 1.0/1.1
- [HARD_RULE] 所有外部输入必须服务端验证，SQL必须参数化查询
- [HARD_RULE] 每个API端点必须验证对象级访问权限（防BOLA/IDOR）
- [HARD_RULE] 客户敏感数据必须AES-256-GCM加密存储
- [HARD_RULE] 代码提交前必须通过SAST安全扫描
- [HARD_RULE] 依赖组件必须通过SCA漏洞扫描，禁止已知高危版本
- [HARD_RULE] 高危漏洞修复SLA≤24小时，中危≤7天
- [HARD_RULE] 安全事件响应时间≤1小时
