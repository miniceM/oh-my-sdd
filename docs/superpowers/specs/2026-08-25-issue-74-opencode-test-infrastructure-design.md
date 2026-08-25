# Issue #74 OpenCode 测试基础设施设计

## 目标

让 OpenCode 相关测试在干净 checkout、macOS、Ubuntu、Windows 与 Node 18/20/22 上使用同一套可重复的环境、资源和宿主契约，而不改变 OMS 的运行时功能或 doctor 判定策略。

## 源码与测试事实

- `scripts/run-tests.js` 直接发现并启动所有测试，未在启动前执行 `opencode/scripts/copy-resources.mjs`。
- `.gitignore` 忽略 `opencode/.opencode/skills/`；干净 checkout 缺少该目录时，`__tests__/integration/sdd-review.test.js` 的镜像一致性测试不能读取 `sdd-review/SKILL.md`。在本分支基线上执行 `npm test` 得到 781 通过、1 个该 ENOENT 失败、3 个环境跳过。
- `__tests__/helpers/opencode-e2e-harness.js` 已隔离 E2E 的 HOME、USERPROFILE、XDG、OpenCode 配置与 npm prefix/cache，并且使用 `path.delimiter`；它尚未成为 unit、integration、activation 与 doctor fixture 的统一入口。
- 真实 OpenCode E2E 已通过 `.js` loader 和相邻的 `package.json` 的 `type: module` 声明建模 Node 18 的发现契约；该契约必须保持为回归断言而非测试的隐式前提。
- 当前部分测试只匹配 CI YAML 文本或 fixture 输出格式。这些测试能诊断测试基础设施，但不能证明干净 checkout 可测试、插件被真实宿主加载，或危险写入被实际阻止。

## 方案选择

采用专用、可组合的 OpenCode 测试 helper，而不是把变量写进每个测试，也不将整个测试运行器变成全局环境注入器。

1. 在 `__tests__/helpers/` 新增环境 helper，负责创建临时根目录、显式的 HOME/USERPROFILE/XDG/OPENCODE/npm/PATH/TEMP 变量、可注入时钟以及清理。
2. 将现有 E2E sandbox 收敛到该 helper；保留 E2E 专属的 tarball、provider、artifact 与 OpenCode loader 逻辑。
3. 在根测试入口显式同步受忽略的 OpenCode 资源。同步是启动测试前的确定性准备步骤，不依赖 `npm install` 的 lifecycle 副作用。
4. 将 Windows 行为集中在 helper：Node fake CLI、`.cmd` 调用、`path.delimiter`、可验证的 junction/symlink 策略和传入子进程的参数。测试在非 Windows 平台模拟输入，不调用 POSIX shell。
5. activation/doctor 测试从 helper 注入固定 `now`，分别覆盖有效 TTL、过期 TTL、未来时间、损坏记录和跨子进程读取；生产时钟保持不变。

## 边界与数据流

```
test runner
  ├─ sync OpenCode generated resources
  └─ Node test files
       ├─ OpenCode sandbox helper → isolated env + stable clock + cleanup
       ├─ platform fixture helper → fake CLI/npm + Windows-safe invocation
       └─ real CLI E2E → discovered .js ESM loader → tool.execute.before → pre-tool-use deny
```

共享 helper 只提供 fixture 和断言能力；它不修改 OpenCode 配置格式、激活状态语义、规则引擎或 doctor 的结论。各测试仍明确选择需要的 fixture，以避免隐藏依赖。

## 错误处理与可观测性

- 资源同步失败时，runner 在运行任何测试前以非零状态失败，并保留脚本的源/目标上下文。
- helper 的子进程失败信息包含平台、Node 版本、命令、参数、sandbox 与 artifact 路径；不回显密钥或用户 HOME。
- 清理为 best effort，但每个 sandbox 将根目录暴露给失败报告，便于 CI 上传诊断产物。

## 测试价值与验收证据

测试的首要目的，是证明项目源码向用户交付的行为满足业务需求；覆盖率、YAML 结构或 helper 实现本身都不是业务验收证据。每条验收标准必须保留至少一项以下表中的可重复证据。

| 用户可观察价值 | 必需测试证据 | 不可替代为 |
| --- | --- | --- |
| 新贡献者从干净 checkout 能运行项目测试 | 在无生成资源、无本机 OpenCode 状态的隔离副本中执行根 `npm test`，并验证其成功读取同步后的发布资源 | CI YAML 中存在 `sync:resources` 文本 |
| Node 18 用户的插件会被 OpenCode 发现并执行安全门 | Node 18 真实 OpenCode CLI 从 `.js` ESM loader 加载打包安装的插件，并对危险写入产生 deny | loader 文件扩展名、`package.json` 或 re-export 字符串断言 |
| 安装后的企业规则确实保护用户 | 打包安装、启动真实 CLI，确认 `tool.execute.before` 通过 pre-tool-use 阻止 AWS key、OpenAI key、`.env` 和破坏性命令，同时允许安全写入 | hook 是否被注册、日志是否包含特定内部字段 |
| doctor 不会向用户误报保护状态 | 固定时钟与子进程下验证有效、过期、未来、损坏 activation；只有有效且带 `tool.execute.before` 的记录可报告 loaded/enforced | JSON 字段存在或 `Date.now()` 附近的偶然时间值 |
| Windows 用户可完成安装和运行 | Windows runner 实际执行 `.cmd`/junction 路径并验证 CLI 收到正确参数和产生预期结果 | 在 POSIX 上仅匹配 Windows shell/YAML 文本 |

环境、npm pack JSON、路径分隔符、错误报告与清理的 unit 测试仍然保留，但仅标记为“测试可信度保障”：它们证明上述验收测试没有污染、能诊断失败或跨平台执行，不能单独关闭任何 Issue 验收标准，也不用于宣称业务覆盖。

## 测试策略

- 每项业务验收先写最小失败测试，再写最少实现；单元测试覆盖边界与错误路径，集成测试覆盖安装/doctor 边界，真实 CLI E2E 只覆盖少量关键用户旅程。
- 根 runner 在运行 Node 测试前显式同步资源；回归测试必须直接执行 runner，而非检查工作流步骤的字符串顺序。
- Node 18 的真实 E2E 使用可发现的 `.js` ESM 入口并验证拒绝危险写入；Node 20/22 保持同一关键旅程。环境不具备真实 CLI 时可跳过，但 CI 必须有至少一个非跳过的对应任务。
- activation/doctor fixture 注入固定 `now`，覆盖有效 TTL、过期 TTL、未来时间、损坏记录与跨子进程读取；生产时钟保持不变。
- `npm test` 和 `npm run test:coverage` 必须从干净 checkout 通过。CI 继续在 macOS、Ubuntu、Windows × Node 18/20/22 执行，覆盖率仅作为回归信号，不替代验收证据。

## 非目标

- 不修改企业 HARD/SOFT 规则、插件 hook 语义、OpenCode production 配置格式或 doctor 判定策略。
- 不为非 OpenCode host adapter 做重构。
