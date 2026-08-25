# Issue #74 OpenCode 测试基础设施设计

## 目标

让 OpenCode 相关测试在干净 checkout、macOS、Ubuntu、Windows 与 Node 18/20/22 上使用同一套可重复的环境、资源和宿主契约，而不改变 OMS 的运行时功能或 doctor 判定策略。

## 源码与测试事实

- `scripts/run-tests.js` 直接发现并启动所有测试，未在启动前执行 `opencode/scripts/copy-resources.mjs`。
- `.gitignore` 忽略 `opencode/.opencode/skills/`；干净 checkout 缺少该目录时，`__tests__/integration/sdd-review.test.js` 的镜像一致性测试不能读取 `sdd-review/SKILL.md`。在本分支基线上执行 `npm test` 得到 781 通过、1 个该 ENOENT 失败、3 个环境跳过。
- `__tests__/helpers/opencode-e2e-harness.js` 已隔离 E2E 的 HOME、USERPROFILE、XDG、OpenCode 配置与 npm prefix/cache，并且使用 `path.delimiter`；它尚未成为 unit、integration、activation 与 doctor fixture 的统一入口。
- 真实 OpenCode E2E 已通过 `.js` loader 和相邻的 `package.json` 的 `type: module` 声明建模 Node 18 的发现契约；该契约必须保持为回归断言而非测试的隐式前提。

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

## 测试策略

- 先为资源准备、环境变量、路径分隔符、Windows `.cmd`、loader 发现和时钟边界写最小失败测试，再添加最少实现。
- 将现有 E2E loader 测试扩展为真实 CLI 已调用 `tool.execute.before` 且危险写入被拒绝的验证；Node 18 使用可发现的 `.js` ESM 入口。
- `npm test` 和 `npm run test:coverage` 必须从干净 checkout 通过。CI 继续在 macOS、Ubuntu、Windows × Node 18/20/22 执行，真实 CLI E2E 保留固定运行时条件。

## 非目标

- 不修改企业 HARD/SOFT 规则、插件 hook 语义、OpenCode production 配置格式或 doctor 判定策略。
- 不为非 OpenCode host adapter 做重构。
