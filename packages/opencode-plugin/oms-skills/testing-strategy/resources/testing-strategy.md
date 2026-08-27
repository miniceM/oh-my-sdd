# 测试要求规范

> 定义团队测试策略、分层测试要求、覆盖率标准和 TDD 实践。


---

## 1. 测试分层


[HARD_RULE] 测试必须遵循测试金字塔：

```
        /\
       /  \      E2E 测试（少量）
      /────\
     /      \    集成测试（适量）
    /────────\
   /          \  单元测试（大量）
  /────────────\
```

| 层级 | 范围 | 速度 | 覆盖率目标 | 执行时机 |
|------|------|------|------------|----------|
| 单元测试 | 单个类/方法 | 毫秒级 | 行覆盖率 ≥ 70% | 每次提交 |
| 集成测试 | 组件交互 | 秒级 | 关键路径 100% | 每次 PR |
| E2E 测试 | 完整流程 | 分钟级 | 核心场景 100% | 合并前 |

## 2. 单元测试


### 2.1 测试范围

[HARD_RULE] 单元测试必须覆盖：
- 所有公共方法
- 业务逻辑分支（if/else/switch）
- 边界条件（空值、零值、最大值）
- 异常路径

[SOFT_RULE] 测试命名格式：`should{预期行为}When{条件}`，如 `shouldReturnEmptyListWhenNoOrdersFound()`。

### 2.2 测试结构

[HARD_RULE] 测试遵循 AAA 模式：
```
Arrange（准备） → Act（执行） → Assert（断言）
```

示例：
```java
@Test
void shouldCalculateCorrectTotalWhenItemsAdded() {
    // Arrange
    Cart cart = new Cart();
    cart.addItem(new Item("BOOK", 29.99));
    cart.addItem(new Item("PEN", 5.00));

    // Act
    BigDecimal total = cart.calculateTotal();

    // Assert
    assertThat(total).isEqualByComparingTo(new BigDecimal("34.99"));
}
```

### 2.3 Mock 使用

[HARD_RULE] Mock 使用规范：
- 仅 Mock 外部依赖（数据库、网络、文件系统）
- 不 Mock 值对象和领域对象
- Mock 行为必须与断言相关
- 优先使用真实实现的轻量替代（Fake）

[SOFT_RULE] 单个测试方法 Mock 对象不超过 3 个。

## 3. 集成测试


### 3.1 测试范围

[HARD_RULE] 集成测试必须覆盖：
- 数据库操作（Repository 层）
- 外部服务调用（Client 层）
- 消息队列生产消费
- API 端点（Controller 层）

### 3.2 测试数据

[HARD_RULE] 集成测试数据管理：
- 使用测试容器（Testcontainers）或内存数据库
- 每个测试独立数据，不共享状态
- 测试后自动清理数据
- 使用 Fixture/Factory 创建测试数据

## 4. 规格注入指引

[GUIDELINE] 项目级规格引用本规范时：
- 测试分层全量注入
- 覆盖率要求按项目阶段调整（初期可降低）
- TDD 实践作为推荐注入
