# Issue 38: 企业安装体验与多宿主交付控制面设计

## 背景与源码事实

安装器已经以 `HostAdapter` 表达 Claude、OpenCode、Lingma 与 KiloCode 四种宿主，且每个适配器实现了探测、预检、安装和卸载。当前 `install/main.js` 选择单一适配器后，直接输出文本预检并执行安装；没有可供 CLI、自动化或后续诊断共同消费的结构化事实。资源复制已保留部分 ownership 和失败恢复基础，但该事实没有统一投影到安装进度或健康诊断。

Issue #38 由 #39、#40、#41 依次实现。后项只消费前项公开的控制面契约，不能重建自己的宿主、ownership 或保护等级模型。

## 目标

用户在不写入前能获得跨宿主一致的安装计划；写入期间能看到可恢复、可归因的结果；写入后能获得不夸大实际保护水平的状态、诊断与修复建议。文本输出和 `--json` 必须是同一事实模型的两种渲染。

## 方案与边界

### 1. Installer domain 契约（#39）

新增 installer control-plane 模块，定义版本化的只读 `InstallationPlan`。它包含：

- `hosts[]`：宿主 ID、显示名、CLI/配置目录/版本/来源的探测结果；
- `dependencies[]`：必需或可选依赖、状态、失败原因与可执行下一步；
- `capabilities[]`：skill/command、baseline、hook、plugin、write-prevention 和 advisory；每项有 `supported`、证据和限制；
- `resources[]`：将 create、update、merge、register-plugin 或 skip 的 OMS 资源；
- `risks[]` 与 `recommendation`：重启、登录、版本不兼容、未实机验证和 install/repair/skip 建议。

适配器只收集本宿主事实并声明候选资源；control-plane 负责标准化、缺失依赖分类、能力矩阵和计划渲染。`oms-install --dry-run` 只构造与输出 plan，绝不调用写入、配置 patch 或 npm 安装。默认交互安装在 apply 前展示相同 plan 并要求确认；`--tool` 是显式选择，多宿主自动探测只能给出建议。

### 2. 可观察 apply 与 ownership（#40）

新增 `InstallStepResult` 事件模型：`id`、`host`、`resource`、`action`、`status`、`owned`、用户说明、机器原因、恢复动作和下一步。执行器由 plan 生成步骤，按 `pending → running → succeeded|warning|failed|rolled-back` 记录与输出。交互模式逐步渲染事件，JSON 模式输出相同事件及最终汇总。

每个适配器继续负责实际资源操作；公共执行层负责把操作包装成步骤、最小化备份/rollback 描述和跨宿主汇总。只回滚本次执行且 OMS 拥有的资源；已有或后来被用户修改的内容保留并报告。某个宿主失败不应阻止其它独立宿主的已完成结果，最终退出码和摘要必须标明部分失败。

现有 sentinel、配置块和 resource ownership 数据将迁移/扩展为统一 ownership manifest，而不是删除已有恢复逻辑。OpenCode 分别报告 plugin 注册、资源同步和“等待宿主加载”。

### 3. 运行时状态、诊断与修复（#41）

`oms status` 从安装事实和 ownership manifest 输出版本、范围、资源、能力等级及已知风险。`oms doctor` 对依赖、配置漂移、baseline、hook/plugin 注册、资源完整性和运行时证据分别作出结论。结论固定分层为：`written`、`registered`、`loaded`、`enforced`、`advisory`，每层必须带证据或未验证原因；更高层状态绝不由低层状态推断。

`oms repair` 默认先生成 dry-run plan，只执行 doctor 已确认且属于 OMS 的修复步骤；用户修改过的资源只报告漂移和人工操作。真实强制验证优先依赖安全的内置自检、配置和运行时证据，不向用户项目写违规探针。KiloCode 永远标注 advisory；Lingma 的文档适配与实机 E2E 证据分别呈现。

### 4. CLI 与兼容性

现有安装、升级和卸载入口保留兼容行为。新选项以显式 flag 或子命令增加，不改变既有默认单宿主安装的资源语义。所有机器输出采用单一版本化 JSON envelope；人类输出仅渲染该 envelope。未知宿主、缺少依赖、不可读配置和不支持的运行时能力必须产生分类结果，而非未处理异常。

## 数据流

```text
Host adapters (discover/preflight/resource candidates)
       ↓
control-plane plan + capability/ownership contracts
       ├── dry-run / interactive plan renderer / JSON renderer
       ↓
apply executor → step events → ownership manifest
       ↓
status / doctor → evidence-based findings → repair plan → OMS-only repair
```

## 测试策略

每个子 Issue 采用 RED → GREEN → REFACTOR：

1. #39：先锁定 plan JSON 契约、dry-run 零写入、四宿主计划快照和未知依赖分类；再接入 adapters 与 CLI。
2. #40：先锁定 step 生命周期、部分失败、用户内容保护、失败后 rollback 与重试；再实现执行器和 manifest 扩展。
3. #41：先锁定五层保护结论、JSON 契约、典型漂移和 OMS-only repair 幂等性；再实现命令与诊断。

测试继续使用 Node 内置 `node:test`，分别覆盖 unit、每宿主集成和端到端冒烟路径。全 Epic 验证包括 `npm test`、`npm run lint:baseline` 与 `git diff --check`。

## 非目标

- 不宣称 KiloCode 具有写前强制。
- 不以写入配置或注册 plugin 替代已加载/已强制的证据。
- 不覆盖用户管理的配置、命令、规则或资源。
- 不为诊断向用户项目写测试性违规内容。
- 不在本 Epic 中重构无关的 HostAdapter 安装语义。

## 交付与依赖

按 #39 → #40 → #41 各自独立 Issue 分支和 PR 交付。#39 提供稳定契约；#40 只能扩展其 execution/ownership 部分；#41 只能读取计划、执行记录和 ownership 作为诊断事实源。每个 PR 必须只暂存该 Issue 的文件、通过针对性验证，并关联对应 Issue；Epic #38 在三项全部合并且四宿主验收通过后关闭。
