# oh-my-sdd Platform Refactor — Design Spec

- **Date**: 2026-07-30
- **Status**: Draft — pending user review
- **Scope**: oh-my-sdd monorepo (root package + opencode/ sub-package)
- **Approach**: Abstraction-first with phased delivery (Approach B from brainstorming)

## 1. Background

oh-my-sdd 从 v0.1 (单宿主 Claude Code 插件) 演进到 v0.2 (多宿主：Claude Code + 通义灵码 + OpenCode)，代码结构在演进中累积了**结构性熵**：

- `hooks/lib/` 容纳 24 个文件 / 3623 行，从 hook 运行时依赖到安装逻辑到 wrapper 生成器到 TS 编译器，全堆在一起
- `wrapper/` 和 `wrappers/` 只差一个 `s`，一个是源码、一个是产物，命名迷惑
- `baseline/` 和 `content/` 概念重叠（lingma.md vs enterprise-baseline.md）
- `scaffolding/`、`package/` 是 orphan 目录
- 每个宿主接入需要在 `install.js` 的 3-4 个地方改 switch-case
- 构建/发布脚本矩阵（`build:all`, `build:opencode`, `install:opencode`, `publish:opencode`）命名混乱

v0.3 计划接入第 3 个宿主（KiloCode），当前结构下加 KiloCode 的成本过高且风险不可控。

## 2. Goals

按优先级排序：

1. **插件接入成本极低**：v0.3 发版时，新增 KiloCode 只需写一个 adapter 文件 + 在 registry 注册一行，不改 install.js 核心
2. **代码一看就懂**：所有模块有清晰边界、单一职责；外部贡献者看 README 就知道在哪加新 rule / skill / hook / host
3. **发布流程简化**：双包结构保留，但脚本矩阵收敛为 3 个明确命令（`build` / `build:opencode` / `publish:opencode`）

三个目标实际是同一个重构弧的三个视角，核心杠杆是 **HostAdapter 抽象 + 顶层目录重组**。

## 3. Constraints

- **外部行为稳定**：`oms-install --tool claude/lingma/opencode` 的 CLI 入口、stdout/stderr、exit code 必须和改造前一致。内部重构 OK，对外零变更
- **测试硬门禁**：352 个现有测试在每个 phase 完成后必须全绿
- **分阶段独立可交付**：每个 phase 都能独立发版，不强求一次做完
- **第 3 宿主目标**：KiloCode（VS Code 衍生，开源插件市场）

## 4. Current Architecture Problems

### 4.1 目录职责混乱

| 现状 | 问题 |
|---|---|
| `hooks/lib/` 含 24 个文件 | 把"hook 运行时依赖"、"install 逻辑"、"wrapper 生成"、"TS 编译"全塞在一起 |
| `wrapper/` (generator) vs `wrappers/` (artifacts) | 复数后缀迷惑；builder.js (TS 编译) 也塞进 wrapper/，但它和 wrapper 无关 |
| `baseline/lingma.md` vs `content/enterprise-baseline.md` | 两个"baseline"概念在不同目录，容易 drift |
| `scaffolding/`、`package/` | orphan 目录，无引用 |

### 4.2 Host 接入成本

`install.js` 加一个新宿主需要改 4 处：

```js
// 1. 顶部 import
import { installForNewTool } from './hooks/lib/install-newtool.js';

// 2. preflightFor() switch-case
switch (tool) {
  case 'newtool': /* ... */ break;
}

// 3. main() switch-case
switch (tool) {
  case 'newtool': return installForNewTool({ PACKAGE_ROOT }); break;
}

// 4. detectDefaultTool()
function detectDefaultTool() {
  if (isNewToolInstalled()) return 'newtool';
}
```

每加一个宿主，复制粘贴 4 段代码。

### 4.3 重复代码

- `announce()` 函数在 3 个 install 文件里各写一遍
- `rmIfExists()` 在 install-lingma.js 和 install-opencode.js 各写一遍
- CLI-in-PATH 检测（`process.platform === 'win32' ? 'where' : 'which'`）复制 3 次
- OpenCode 和 Lingma 各实现一份 `copyDir()`，逻辑略有差异

### 4.4 不对称

- Lingma 和 OpenCode 有 `uninstall()`；Claude 没有。破坏对称性，让 dispatcher 无法统一处理卸载。

## 5. Target Architecture

### 5.1 顶层目录结构

```
oh-my-sdd/
├── hooks/                        ← Claude Code + git hook 入口（约定位置）
│   ├── session-start.js
│   ├── pre-tool-use.js
│   ├── post-tool-use.js
│   ├── session-end.js
│   ├── user-prompt-submit.js
│   ├── hooks.json
│   └── git/
│       ├── commit-msg-check.js
│       ├── pre-commit-check.js
│       ├── pre-push-check.js
│       ├── prepare-commit-msg-check.js
│       └── lib/hook-utils.js
│
├── lib/                          ← 全局共享库
│   │  # 基础设施
│   ├── paths.js
│   ├── platform.js
│   ├── constants.js
│   ├── log.js
│   ├── config.js
│   ├── state-dir.js
│   │
│   │  # 企业能力
│   ├── rules.js
│   ├── constitution.js
│   ├── iam-cli.js
│   ├── dop-client.js
│   ├── event-queue.js
│   │
│   │  # 工具
│   ├── git-diff.js
│   ├── command-generator.js
│   └── update-check.js
│
├── install/                      ← 安装子系统
│   ├── main.js                   ← dispatcher (npm postinstall shim 调用)
│   ├── uninstall.js
│   ├── host-adapter.js           ← Phase 1 加
│   ├── host-registry.js          ← Phase 1 加
│   ├── hosts/
│   │   ├── claude-adapter.js
│   │   ├── lingma-adapter.js
│   │   ├── opencode-adapter.js
│   │   └── kilocode-adapter.js   ← Phase 2 加
│   └── common/                   ← install-only 内部共享
│       ├── announce.js
│       ├── fs.js                 ← 合并 copy-utils + rmIfExists
│       ├── detect.js             ← isCliInPath helper
│       ├── sentinel.js
│       ├── config-patch.js
│       └── fixtures/             ← 若 scaffolding/lingma-settings.json 是活的
│           └── lingma-settings.json
│
├── wrapper/                      ← wrapper 脚本 generator + 产物
│   ├── wrapper.js                ← 从 hooks/lib/wrapper.js 搬来
│   ├── claude.sh
│   ├── claude.ps1
│   └── claude.bat
│
├── bin/                          ← CLI 入口
├── content/                      ← 治理内容单源（合并 baseline/）
│   ├── enterprise-baseline.md
│   ├── lingma-baseline.md        ← 从 baseline/lingma.md 搬来
│   ├── welcome-message.md
│   └── auth-required.md
├── skills/
├── scripts/
├── docs/
├── __tests__/                    ← 镜像新结构
├── opencode/                     ← 自包含子包
│   ├── src/
│   ├── dist/
│   ├── build.js                  ← 从 hooks/lib/builder.js 搬来
│   ├── package.json
│   └── tsconfig.json
├── install.js                    ← 根 1 行 shim (npm 约定)
└── package.json
```

### 5.2 顶层目录职责划分

| 目录 | 一句话职责 | 判定标准 |
|---|---|---|
| `hooks/` | Claude Code + git hook 入口 | 必须是 hook manifest 约定的位置 |
| `lib/` | 被 ≥2 个顶层模块调用的共享代码 | 可能被其他模块调用 → lib/；只在子模块中用 → 子模块内 |
| `install/` | 安装/卸载子系统 | 仅 install 流程用到 |
| `wrapper/` | wrapper 脚本 generator + 它的产物 | generator 和产物共居一处 |
| `bin/` | npm `package.json` `bin` 注册的 CLI 入口 | 用户全局安装的工具 |
| `content/` | 治理内容单源 | baseline、welcome、auth 等 |
| `skills/` | SKILL.md 集合 | 每个子目录含 SKILL.md |
| `scripts/` | 开发/诊断脚本 | 开发者本地用，不进 npm 包 |
| `opencode/` | OpenCode 子包（自包含） | 独立 npm 发布单元 |

### 5.3 删除的目录

- `baseline/` → 内容合并进 `content/`
- `wrappers/` → 改名 `wrapper/`
- `package/` → Phase 0 grep 判定：零引用则删除
- `scaffolding/` → Phase 0 grep 判定：有用则搬到 `install/common/fixtures/`，否则删除

### 5.4 根目录 install.js 的 shim 方案

保留根 `install.js` 作为 npm postinstall 约定的入口（npm 生态熟悉），但内部退化为 1 行 shim：

```js
// install.js (root) — ~3 行，仅做转发
import('./install/main.js').then(m => m.main()).catch((err) => {
  process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
  process.exit(1);
});
```

真正的 dispatcher 在 `install/main.js`（~30 行，零 switch-case）。这样根目录的 `install.js` 和 `install/main.js` 的职责边界清晰：前者是 npm 约定入口（永远不变），后者是业务 dispatcher（随 phase 演进）。

## 6. Phase 0: Top-Level Directory Restructure

### 6.1 范围

- 拆分 `hooks/lib/` 为 4 个去处：`lib/`、`install/common/`、`wrapper/`、`opencode/`
- 合并 `baseline/lingma.md` → `content/lingma-baseline.md`
- 改名 `wrappers/` → `wrapper/`，把 `hooks/lib/wrapper.js` 搬进 `wrapper/wrapper.js`
- 把 `hooks/lib/builder.js` 搬到 `opencode/build.js`
- 重命名根 `install.js` 的逻辑部分为 `install/main.js`，根文件保留为 1 行 shim
- Orphan 目录决策（package/、scaffolding/）：grep 判定，零引用则删除
- 更新所有 import 路径
- 更新 `package.json` 的 `files` 字段、`bin` 字段、`scripts` 字段
- 更新 `__tests__/` 镜像新结构
- 更新 `CLAUDE.md`、`README.md`、`AGENTS.md` 的架构图

### 6.2 硬门禁

- 352 个测试全绿
- `npm pack` dry-run 产物正确
- `oms-install --tool claude` 在干净环境端到端跑通
- `oms-install --tool lingma` 同上
- `oms-install --tool opencode` 同上

### 6.3 独立交付价值

即使后续 phase 全不做，Phase 0 完成时也获得：

- 9 个顶层目录，每个单一职责
- 消除所有"目录拜物教"和命名迷惑
- 新人看目录名就知道代码在哪
- 为 Phase 1 的 HostAdapter 抽象提供干净的画布

### 6.4 风险

- **Import 路径遗漏**：用脚本扫描所有 `.js` 文件的 import 语句，确保全量更新
- **测试路径失效**：`__tests__/` 镜像新结构后，需要批量更新测试里的 import
- **Wrapper 脚本路径硬编码**：`bin/oms-wrapper-verify.js` 等脚本可能硬编码了 `wrappers/` 路径，需要 grep 检查

### 6.5 实施顺序（建议）

1. 先建 4 个新目录的"家"：`lib/`、`install/`、`wrapper/`（空的），`content/`（已有）
2. 按文件逐个搬迁，每次搬迁后跑测试，确保 import 路径更新
3. 最后删除空目录（baseline/、wrappers/、scaffolding/、package/ 决策后的结果）
4. 文档更新（CLAUDE.md、README.md、AGENTS.md）

## 7. Phase 1: HostAdapter Abstraction

### 7.1 接口定义

```js
// install/host-adapter.js

/**
 * HostAdapter — 单一宿主工具的完整安装/卸载/检测能力。
 *
 * 每个 adapter 文件只描述"这个宿主长什么样"，不知道其他宿主的存在。
 * dispatcher (install/main.js) 只调用多态方法，不做 switch-case。
 *
 * 静态方法而非实例：安装是一次性脚本动作，没有多实例共存场景。
 * 如果未来出现需要实例化的场景（同一宿主多 profile），再改成 class instance。
 */
export class HostAdapter {
  /** 宿主标识符（CLI 参数、sentinel 文件名、日志都用这个） */
  static id = 'abstract';

  /** 用户可见的名字（错误提示、announce） */
  static displayName = 'Abstract Host';

  /**
   * 检测本机是否安装了这个宿主。
   * 用于 `--tool auto` 的默认选择；返回 boolean。
   */
  static isInstalled() { return false; }

  /**
   * 安装前置检查（CLI 依赖、IDE 存在性等）。
   * 不通过时打 warning 但不阻塞安装（向后兼容当前行为）。
   */
  static preflight(ctx) {}

  /**
   * 执行安装。
   * @param {Object} ctx - { PACKAGE_ROOT, announce }
   */
  static async install(ctx) {
    throw new Error(`${this.displayName}: install() not implemented`);
  }

  /**
   * 执行卸载。必须幂等：重复调用不报错。
   * 可选：默认 no-op。需要清理的 adapter 才 override。
   */
  static async uninstall(ctx) {}
}
```

**设计取舍**：

- **`uninstall()` 可选**：默认 no-op，Claude 暂时不实现（留给 Phase 3）
- **`ctx` 瘦设计**：只有 `{PACKAGE_ROOT, announce}`；其他能力通过 import `lib/` 获取
- **静态方法**：避免无意义的 `new ClaudeAdapter()` 实例化

### 7.2 Registry

```js
// install/host-registry.js

import { ClaudeAdapter } from './hosts/claude-adapter.js';
import { LingmaAdapter } from './hosts/lingma-adapter.js';
import { OpenCodeAdapter } from './hosts/opencode-adapter.js';

const REGISTRY = new Map([
  ['claude',   ClaudeAdapter],
  ['lingma',   LingmaAdapter],
  ['opencode', OpenCodeAdapter],
  // Phase 2:
  // ['kilocode', KiloCodeAdapter],
]);

export function getAdapter(tool) {
  const adapter = REGISTRY.get(tool);
  if (!adapter) {
    const supported = [...REGISTRY.keys()].join(', ');
    throw new Error(`未知工具: ${tool}。支持: ${supported}`);
  }
  return adapter;
}

export function listTools() { return [...REGISTRY.keys()]; }

export function detectDefault() {
  for (const [id, Adapter] of REGISTRY) {
    if (Adapter.isInstalled()) return id;
  }
  return 'claude'; // 向后兼容 v0.1 fallback
}
```

### 7.3 install/main.js 简化后

```js
// install/main.js
import { ensureStateDir } from '../lib/state-dir.js';
import { getAdapter, detectDefault } from './host-registry.js';
import { checkNodeVersion } from '../lib/platform.js';
import { announce } from './common/announce.js';

async function main(options = {}) {
  if (!checkNodeVersion('18.0.0')) {
    process.stderr.write(`❌ Node 版本过低。需要 >= 18.0.0，当前 ${process.version}\n`);
    process.exit(1);
  }
  await ensureStateDir();

  const tool = options.tool ?? detectDefault();
  const Adapter = getAdapter(tool);
  const ctx = { PACKAGE_ROOT, announce };

  Adapter.preflight(ctx);
  return Adapter.install(ctx);
}

export { main };
```

从 141 行、3 处 switch-case → ~30 行、0 switch-case。

### 7.4 install/common/ 内容

**只抽真正公共的**：

```
install/common/
├── announce.js          ← 3 个 adapter 都用（消除 3x 重复）
├── fs.js                ← rmIfExists + 统一的 copyDir（合并 lingma 和 opencode 的两套实现）
├── detect.js            ← isCliInPath(name)（消除 3x 重复）
├── sentinel.js          ← 哨兵系统（按 tool 键控，设计上是多宿主）
└── config-patch.js      ← 配置深度合并（lingma settings.json + opencode opencode.json 都用）
```

**不进 common/**（adapter-only 逻辑）：

- `copySkillsToDir` — lingma 专属（OpenCode 有自己的 `copySkillsToPluginDir`）
- `superpowers-installer` — opencode 专属
- `command-generator` — opencode 专属
- `builder` — 已搬到 `opencode/build.js`

### 7.5 三个现有 adapter 的迁移

| adapter | 当前行数 | 目标行数 | 关键变化 |
|---|---|---|---|
| `claude-adapter.js` | 136 | ~80 | 抽 announce + isCliInPath；uninstall 暂不实现 |
| `lingma-adapter.js` | 187 | ~120 | 抽 announce + rmIfExists + isCliInPath + sentinel |
| `opencode-adapter.js` | 279 | ~200 | 抽 announce + rmIfExists + isCliInPath + 统一 copyDir；5 个子操作作为 private method 留下（OpenCode 真实的复杂度） |

**关键取舍**：OpenCode adapter 不强行瘦到 150 行 —— 它的 plugin model 就是比其他宿主复杂，adapter 应该反映这一点，而不是为了"看起来对称"把复杂度藏到 common/。

### 7.6 硬门禁

- 352 个测试全绿
- 新增测试：
  - `host-registry.test.js`：注册、查询、detectDefault、未知 tool 报错
  - `host-adapter.test.js`：接口一致性（每个 adapter 必须实现 id/displayName/isInstalled/install）
  - `hosts/*.test.js`：每个 adapter 的 isInstalled/install/uninstall 行为（mock 文件系统 + CLI）

### 7.7 独立交付价值

即使 Phase 2 不做，Phase 1 完成后：

- 加新宿主的成本从"改 N 个文件"降为"加 1 文件 + 注册 1 行"
- install.js 从 141 行 → ~30 行
- 重复代码消除（announce、rmIfExists、CLI 检测、copyDir）
- `install/` 目录职责单一

## 8. Phase 2: KiloCode Validation

### 8.1 调研（1-2 天）

KiloCode plugin model 调研：

- 插件装在哪？（推测 `~/.kilocode/extensions/` 或 VS Code 风格目录）
- 怎么注册 skills/hooks？（manifest.json？package.json 字段？）
- 怎么注入 baseline？（rules 文件？settings 合并？）
- 是否需要 build 步骤？（TS 编译？还是直接 JS？）

### 8.2 实现

`install/hosts/kilocode-adapter.js`，目标 100-150 行。

> **关于下方代码的 `/* ... */`**：这些是**有意**的研究占位符，不是遗漏。Phase 2 的第一步（8.1）就是调研 KiloCode 的 plugin model；adapter 内部实现取决于调研结果（装在哪、怎么注册、怎么注入 baseline）。本 spec 只规定 adapter 的**形状**（类名、方法签名、注册方式），不规定内部细节 —— 内部细节在 Phase 2 调研后填充。这也是 KiloCode 作为 acid test 的意义：抽象正确与否由"能不能在调研后 100-150 行内写完"来判断。

```js
// install/hosts/kilocode-adapter.js
import { HostAdapter } from '../host-adapter.js';
// import 其他 helper，依调研结果而定

export class KiloCodeAdapter extends HostAdapter {
  static id = 'kilocode';
  static displayName = 'KiloCode';

  // 以下 4 个方法的签名固定，实现依调研结果而定
  static isInstalled() { /* 调研后填 */ }
  static preflight(ctx) { /* 调研后填 */ }

  static async install(ctx) {
    // KiloCode-specific 步骤（调研后填）
  }

  static async uninstall(ctx) {
    // KiloCode-specific 清理（调研后填）
  }
}
```

注册到 `install/host-registry.js`（只加一行）：

```js
import { KiloCodeAdapter } from './hosts/kilocode-adapter.js';

const REGISTRY = new Map([
  ['claude',   ClaudeAdapter],
  ['lingma',   LingmaAdapter],
  ['opencode', OpenCodeAdapter],
  ['kilocode', KiloCodeAdapter],   // ← 只加这一行
]);
```

### 8.3 Acid test 判据

- **成功**：adapter 在 100-150 行内完成 → 抽象对了
- **需调整**：adapter 超过 200 行 → 分析原因：
  - 漏了 common helper → 提升之
  - 接口太死板 → 放宽之
  - KiloCode 真的复杂 → 接受之，但写下来
- **失败**：需要在 install.js 主流程里加 KiloCode-specific 的 if/switch → 抽象漏了东西，回去改接口

### 8.4 硬门禁

- 352 个测试全绿
- 新增 KiloCode adapter 单测 + 集成测试（mock KiloCode 环境）
- 端到端验证：在干净环境跑 `oms-install --tool kilocode`，能成功安装
- README 更新：把 KiloCode 加入支持列表

### 8.5 独立交付价值

- 第 3 宿主接入完成
- 抽象得到真实验证
- "加新宿主"这件事被彻底降格为"写 adapter 文件 + 注册 1 行"

## 9. Phase 3: Platform-ization + Final Cleanup

### 9.1 发布脚本收敛

双包结构保留（两个产品、两个版本、两个发布节奏），脚本矩阵收敛：

| 脚本 | 作用 | 调用时机 |
|---|---|---|
| `npm run build` | 构建主包（主包是纯 JS，等价于 lint + test） | CI / 本地验证 |
| `npm run build:opencode` | 构建 opencode 子包（cd opencode && npm install && npx tsc） | CI / 发布前 |
| `npm run publish:opencode` | 发布 opencode 子包到 npm | 手动（release 流程） |
| `prepublishOnly` | npm 发布前自动跑 build | 自动 |

**删除**：

- `build:all`（等价于 `build && build:opencode`，不需要单独命名）
- `install:opencode`（用户不需要单独跑，合并到 `build:opencode`）

### 9.2 Claude adapter 补齐 uninstall

Phase 1 推迟的 Claude uninstall 在此阶段补上：

```js
// install/hosts/claude-adapter.js
import { uninstallWrapper } from '../../wrapper/wrapper.js';

static async uninstall(ctx) {
  // 1. 卸载 plugin（走 claude CLI 官方命令）
  await this.#runClaude(['plugin', 'uninstall', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
  // 2. 移除 wrapper（复用已有的 uninstallWrapper）
  await uninstallWrapper(ctx.announce);
}
```

`wrapper/wrapper.js` 已导出 `uninstallWrapper(announce)`（当前位于 `hooks/lib/wrapper.js` line 257，Phase 0 搬迁到 `wrapper/wrapper.js` 后保留此 API）。

**硬门禁**：

- Claude uninstall 端到端跑通：`oms-uninstall --tool claude` 后 `~/.claude/` 相关产物清除，原 `claude` 二进制恢复
- 测试覆盖 uninstall 行为（mock `claude` CLI + wrapper 状态）

### 9.3 CONTRIBUTING.md

新增贡献者文档，覆盖 4 个扩展场景：

1. **如何添加新宿主 adapter**（用 KiloCode 作示例）
   - 在 `install/hosts/` 下新建文件
   - 继承 `HostAdapter`
   - 实现 `id`, `displayName`, `isInstalled`, `install`（+ 可选 `uninstall`, `preflight`）
   - 在 `host-registry.js` 注册一行
   - 跑测试
2. **如何添加新企业规则（HARD_RULE/SOFT_RULE）** — 链接到 `sdd-constitution` skill
3. **如何添加新 skill** — 链接到 superpowers skill 约定
4. **如何修改 baseline** — 链接到 SemVer bump 流程

### 9.4 扩展点声明

显式声明稳定 API 和内部实现：

**稳定 API**（SemVer 保护）：

- `HostAdapter` 接口
- `hooks/hooks.json` 声明的 5 个 hook 事件名
- `content/enterprise-baseline.md` frontmatter schema
- `skills/*/SKILL.md` frontmatter schema
- `bin/oms-*.js` 的 CLI 参数

**内部实现**（不承诺稳定）：

- `lib/` 下所有模块
- `install/common/` 下所有模块
- `wrapper/` 内部结构

写入 CONTRIBUTING.md 顶部。

### 9.5 硬门禁

- 352 个测试全绿
- CONTRIBUTING.md 里的"代码示例"必须可执行（CI 验证）
- `npm run build` / `build:opencode` / `publish:opencode` 三个脚本端到端跑通

## 10. Cross-Phase: Testing Strategy

| Phase | 硬门禁 | 新增测试 |
|---|---|---|
| Phase 0 | 352 个测试全绿 | 0（纯搬家） |
| Phase 1 | 同上 | host-registry + adapter 接口一致性 + 每个 adapter 行为测试 |
| Phase 2 | 同上 + KiloCode e2e 跑通 | KiloCode adapter 单测 + 集成测试 |
| Phase 3 | 同上 | contributor docs 代码示例可执行（CI 验证） |

**测试硬门禁是 phase 完成的必要条件**。任何 phase 让测试数下降或失败数上升，视为 phase 未完成。

## 11. Risks & Mitigations

| 风险 | 严重度 | 缓解 |
|---|---|---|
| Phase 0 import 路径遗漏导致运行时错误 | 高 | 用脚本扫描所有 `.js` 的 import，CI 加 lint 门禁 |
| Phase 1 adapter 行为回归 | 高 | 现有 352 个测试覆盖 install 流程，全绿才放行 |
| Phase 2 KiloCode plugin model 和预期不符 | 中 | 调研阶段（1-2 天）先确认模型，再开始写代码 |
| Phase 2 抽象不够用 | 中 | 用 KiloCode 作为 acid test，超标时回到 Phase 1 调接口 |
| Phase 3 Claude uninstall 实现困难 | 低 | Claude 的 `plugin uninstall` 是官方支持的命令 |
| 重构周期过长导致 v0.3 延期 | 中 | 每个 phase 独立可交付；如果时间紧，可以只做 Phase 0+1+2，Phase 3 推到 v0.4 |

## 12. Out of Scope

本次重构**不做**：

- 修改 hooks/*.js 的内部逻辑（除了 import 路径）
- 修改 skills/*/SKILL.md 的内容
- 修改 content/enterprise-baseline.md 的规则
- 修改 opencode/ 子包的 TypeScript 源码
- 实现 Lingma 端到端测试（已知未验证，单独项目）
- 解决 openspec 的依赖问题（/sdd-review 归档阶段）

这些是其他项目的范围，不在本次重构的目标内。

## 13. Appendix: Before/After Metrics

| 指标 | Before | After Phase 0 | After Phase 1 | After Phase 2 | After Phase 3 |
|---|---|---|---|---|---|
| 顶层目录数 | 11 | 9 | 9 | 9 | 9 |
| `hooks/lib/` 文件数 | 24 | 0 | 0 | 0 | 0 |
| `install.js`（根 shim）行数 | 141 | ~5 | ~5 | ~5 | ~5 |
| `install/main.js`（真 dispatcher）行数 | N/A | ~30 | ~30 | ~30 | ~30 |
| install-{claude,lingma,opencode}.js 总行数 | 602 | N/A（已重构成 adapter） | ~400 | ~500（+KiloCode） | ~500 |
| 重复 `announce()` 定义 | 3 | 1 | 1 | 1 | 1 |
| 重复 `rmIfExists()` 定义 | 2 | 1 | 1 | 1 | 1 |
| 加新宿主需改文件数 | 4 | 4 | 1 | 1 | 1 |
| 贡献者文档 | 无 | 无 | 无 | 无 | CONTRIBUTING.md |
| 测试数 | 352 | 352 | 352 + ~20 | + ~10 | 同上 |
