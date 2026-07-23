# OpenCode E2E Spike Report

> **状态**：IN PROGRESS — Step 1-3 ✅ 通过（安装 / 启动 / slash commands）；Step 4 (HARD_RULE 阻断) 待用户验证
> **日期**：2026-07-22
> **分支**：`worktree-opencode-platform-adapter`
> **commit**：7e68538 (Phase 0-7) + 后续修复 → c72ab19 (Skill() delegation 修复)

## 摘要

本 spike 验证 oh-my-sdd OpenCode 适配在**真 OpenCode 运行时**中的端到端行为。

## 已发现的问题 + 修复

### Issue #1: 启动报错 "Unexpected server error" ✅ 已修

**根因**：`install-opencode.js` 在 `opencode.json` 注册裸字符串 `"oh-my-sdd"`，但 OpenCode 的 plugin 解析规则是：
- 以 `./` 或 `/` 开头 → 文件路径（直接 import）
- 其他 → npm 包名（去 registry 找）

`"oh-my-sdd"` 不在 npm registry → `import("oh-my-sdd")` 抛 `MODULE_NOT_FOUND` → OpenCode 包成 "Unexpected server error"。

**修复**：
- install-opencode.js 注册 `"./plugins/oh-my-sdd/index.js"`（相对路径）
- 顺手清理历史遗留的 `./plugins/oh-my-sdd/plugin.js` 裸字符串
- uninstall 清理三种历史 entry

### Issue #2: 启动成功但 `/sdd-*` 命令不出现 ⚠️ 修复中

**根因**：OpenCode 的斜杠命令**不是通过 plugin hook 注册的**，而是 config-time 的东西：
- `~/.config/opencode/commands/*.md` 文件（YAML frontmatter + markdown 正文）
- 或 `opencode.json` 的 `command: { ... }` 字段

Plugin 的 `command.execute.before` hook 只能**拦截**已有命令，不能**注册**新命令。

**修复**：
- install 时复制 `skills/sdd-*/SKILL.md` → `~/.config/opencode/plugins/oh-my-sdd/skills/`
- install 时创建 5 个 command markdown 文件到 `~/.config/opencode/commands/sdd-*.md`
- 每个 command 文件是 "wrapper"：指示 agent 读对应 SKILL.md + 包含 Claude → OpenCode 工具映射表
- uninstall 时删除这些 command 文件

### Issue #3: `/sdd-plan` 执行时跳过 brainstorming 委托 ✅ 已修

**现象**：用户在 OpenCode 里跑 `/sdd-plan`，agent 直接 inline 设计，没走 brainstorming 流程
（"为什么跳过'委托 brainstorming'"）。

**根因**：命令 wrapper 的 Claude → OpenCode 工具映射里有这条：

```
- `Skill(name, args)` → ignore (skill content is in the file you're reading)
```

agent 把 "ignore" 字面理解成"跳过整个 Skill() 调用"。两层错：

1. sdd-plan SKILL.md 里只有"委托 superpowers:brainstorming"指令，真实清单在
   `brainstorming` 子技能的 SKILL.md 里——必须加载才能拿到 2-3 approaches、
   design 展示、approve 等步骤。
2. "ignore" 的本意是"OpenCode 没有 Skill() API 函数"，但应改用 `read` 工具加载
   磁盘上的 SKILL.md 文件来执行，不是跳过。

**修复**（commit c72ab19）：
- 命令 wrapper 工具映射：`ignore` → **三级 fallback chain**
  1. `<plugin>/skills/<name>/SKILL.md`（install 时最佳努力复制）
  2. `~/.claude/skills/<name>/SKILL.md`（Claude Code runtime 目录，典型场景）
  3. **inline** 执行（基于父 SKILL.md 描述内联执行意图，不跳过工作本身）
- install-opencode.js 增加 `.claude/skills/*` 委托子技能最佳努力复制
  （brainstorming, writing-plans, executing-plans, subagent-driven-development,
  requesting-code-review）
- wrapper 用 **CRITICAL** 强力提示："Resolving it is mandatory — only the
  execution location (file vs inline) may change, never the work itself."

**反思**：
- LLM agent 会按字面执行指令，"ignore" 这种词对 agent 来说没有歧义容忍度。
  写 prompt 时应明确区分"跳过这个函数调用" vs "跳过这一步工作"。
- 对 SDD 工作流关键步骤（brainstorming、writing-plans 等）使用 fallback
  链比硬依赖文件存在更健壮——用户即便没装 Claude Code 也能跑。

### Issue #4: `/sdd-doc` + `/sdd-constitution` 命令缺失 ✅ 已修

**现象**：完成 `/sdd-plan` 后找不到 `/sdd-doc` 命令。

**根因**：`SDD_COMMANDS` 数组只定义了 5 个命令（spec/plan/task/apply/review），
漏了 `sdd-doc` 和 `sdd-constitution`。`copySkillsToPluginDir` 的 `sddSkills`
列表包含这两个 skill（文件被复制了），但 command 注册列表没包含，OpenCode
不生成 `~/.config/opencode/commands/sdd-doc.md` / `sdd-constitution.md`。

**修复**（commit 54ffd44）：
- SDD_COMMANDS 增加：
  - `sdd-doc`：SDD 产出文档——把 spec + plan 转成企业模版 Markdown 需求规格说明书
  - `sdd-constitution`：SDD 治理——创建或更新项目 baseline
- 集成测试同步更新 `expectedCommands` / `expectedSkills` 列表

**现状**：OpenCode 现在注册 6 个 `/sdd-*` 命令：
```
/sdd-spec, /sdd-plan, /sdd-task, /sdd-apply, /sdd-review, /sdd-doc
```

### Issue #5: `/sdd-constitution` 必须不暴露（治理不变量）✅ 已修

**背景**：上一版修复误把 `sdd-constitution` 加入 OpenCode 命令列表。
企业级 baseline 由中央工具统一更新下发，**禁止项目组本地修改**。
OpenCode 作为"执行端"工具，只能消费 baseline，不能修改。

**修复**（commit 59089c3）：
- `SDD_COMMANDS` 移除 `sdd-constitution` 条目
- `sddSkills` 复制列表移除 `sdd-constitution`（消除 agent 意外发现该 skill 的可能）
- `installCommandFiles()` / `copySkillsToPluginDir()` 增加清理逻辑：
  扫描上版本遗留的 `sdd-*.md` / `sdd-*/`，不在当前白名单的一律删除
- 集成测试新增**否定断言**：
  - `sdd-constitution.md` 必须不被创建
  - `sdd-constitution` skill 必须不被复制到 plugin 目录
- 重新安装时实测清理生效：
  ```
  ✓ 清理遗留 skill 目录: sdd-constitution
  ✓ 清理遗留命令文件: sdd-constitution.md
  ```

**治理意义**：
- 集中管控：企业 baseline 通过中央 `oms-install` 工具统一分发，
  项目团队在 OpenCode/Claude Code/Lingma 端只能读、不能改
- 即使有人手动把 `skills/sdd-constitution/SKILL.md` 复制到 plugin 目录，
  安装流程也会自动清掉它（self-healing）
- 管理员修改 baseline 仍走 Claude Code + sdd-constitution（管理端工具）

### Issue #6: Orchestrator 模式 vs executing-plans 写代码冲突 ✅ 已修

**现象**：在 Orchestrator 模式（agent 系统 prompt 含 "You NEVER write code yourself"）
下跑 `/sdd-apply` 并选择 `executing-plans` 模式时，出现约束冲突：
- Orchestrator HARD_RULE：agent 不得直接写代码
- executing-plans 流程：`Follow each step exactly` → 直接 `Write` / `Edit` 文件

两者在 `/sdd-apply` 交汇时必然冲突，agent 要么违反 Orchestrator 约束，要么无法完成 plan。

**根因**：`sdd-apply/SKILL.md` 对"当前 agent 是 Orchestrator"这一运行环境毫无感知，
直接把 executing-plans 当 inline 执行模式推荐给用户。但 executing-plans 原生假设
当前 agent 就是执行者——这在 subagent-driven-development 下没问题（每 task 派 fresh
subagent），在 executing-plans 下则必然冲突。

**修复**：在 `sdd-apply/SKILL.md` 步骤 2 与步骤 3 之间插入**步骤 2.5：Orchestrator 运行环境适配**：
1. **识别信号**：系统 prompt 含 "NEVER write code" / "orchestrator" / "coordinator" 等关键词
2. **适配策略**：
   - 选 `executing-plans` 模式 → 改为**每个 task 用 `Agent(...)` / `task(...)` 委托**
     `build` / `quick` 类型 subagent 执行；subagent prompt 必带 5 条执行约束
   - 选 `subagent-driven-development` 模式 → 保持不变（本来就派 subagent）
3. **强制规则增补**：
   - ✅ Orchestrator 模式检测为必走路径
   - ❌ Orchestrator 模式下禁止 inline 写代码

### Issue #7: tasks.md 缺 TDD 步骤（planning → execution 的约束丢失）✅ 已修

**现象**：`/sdd-plan` 跑完后，生成的 `tasks.md` 中 task 步骤序列**没有 RED / GREEN /
REFACTOR 三阶段**。到 `/sdd-apply` 阶段，agent 按 tasks.md 直接写实现代码，跳过测试。

**根因链路**：
```
/sdd-plan
  → 委托 superpowers:brainstorming
    → 自动 chain writing-plans
      → 产 tasks.md
            ↑
        TDD 在这里丢失
```

- `writing-plans/SKILL.md` 提到 TDD（"DRY。YAGNI。TDD。频繁 commit"），但只是**建议**级措辞
- `writing-plans` 的 task 模板示例里有"Step 1: 写失败测试"，但没作为强制约束
- `sdd-plan` 在委托 writing-plans 时传的约束列表**完全没提 TDD**
- 企业 baseline 的"禁止跳过 TDD" HARD_RULE 没下沉到 planning 阶段

**修复（双层防御）**：

**(A) 源头修复 — `sdd-plan/SKILL.md` 步骤 3**：在 writing-plans 约束列表中显式追加
**TDD 强制（HARD_GATE）**，要求每个 task 必须含 RED → GREEN → REFACTOR 三阶段。
在委托 prompt 中明确给反例/正例，并声明这是企业 baseline HARD_RULE 的强制下沉。

**(B) 兜底守门 — `sdd-plan/SKILL.md` 步骤 4d + `sdd-apply/SKILL.md` 步骤 2.6**：
两道 TDD 守门，扫描 tasks.md 每个 task 的 TDD 信号（`test_` / `.spec.` / RED / GREEN
等关键字）：
- 命中 → PASS
- 缺失 → **自动注入** RED 步骤（task 首个实现步骤之前）+ REFACTOR 步骤（验证/提交之前），
  终端打印 `⛓️ TDD steps auto-injected for Task N`，commit 注入结果
- 注入失败 → 停止等用户手动补全

两道门任一生效都能保证 `/sdd-apply` 拿到 TDD 就绪的 tasks.md。

### Issue #8: 命令 wrapper fallback chain 与 Orchestrator 适配两层混淆 ✅ 已修

**现象**：用户在 OpenCode 跑 `/sdd-apply`（Orchestrator 模式 + executing-plans），
agent 输出自相矛盾的消息：

> 执行 executing-plans inline（skill 文件未找到，按 fallback chain 逻辑执行）。
> 使用 task() 委托实现

同时声称"inline 执行"和"使用 task() 委托"——这两个路径互斥。

**根因**：agent 收到两条都用了 "inline" 一词的指令，但位于不同抽象层：

| 层 | 指令来源 | "inline" 含义 |
|----|---------|--------------|
| Layer 1：内容加载 | 命令 wrapper fallback chain #3 | "skill 文件没找到，从父 skill 描述推断意图" |
| Layer 2：执行策略 | sdd-apply 步骤 2.5 Orchestrator 适配 | "executing-plans 必须通过 task() 委托 subagent" |

agent 把 Layer 1 的 "inline" 误读成 Layer 2 也走 inline（即当前 agent 直接写代码），
直接覆盖了 Orchestrator 适配的 task() 委托要求。结果：agent 试图同时做两件矛盾的事
——"我在 inline 执行"（Layer 1 误导）+ "我在用 task() 委托"（Layer 2 残留）。

这是 Issue #3 的同类 bug：**LLM 对字面词的歧义零容忍**。同一个词（"inline"）出现在
两个不同的上下文里，被合并理解。

**修复（三处联动）**：

**(A) 命令 wrapper `buildCommandContent()`**：
- `Agent(...)` 映射从 `execute inline (no subagent spawning)` 改为：
  **Default**: execute inline (no subagent spawning).
  **Exception**: 如果当前 skill 含 "Orchestrator 运行环境适配" 节（如 sdd-apply 步骤 2.5），
  按该节的委托策略执行——此时 `task()` / `Agent()` 委托**允许**。
- Skill() fallback chain 把 "inline" 改为 **`inline-content-resolution`**，明确这仅是
  **内容加载策略**，不是任务执行策略
- 新增 **CRITICAL 消歧义块**，明确列出两个 "inline" 的含义：
  ```
  CRITICAL — disambiguate two "inline" meanings (Issue #8):
  - "inline-content-resolution" (this fallback #3) answers: where does the skill
    content come from? → from parent skill description, not from file.
  - "inline task execution" answers: who performs the work? → current agent vs
    subagent. This is decided by the parent skill's Orchestrator adaptation section,
    NOT by this fallback chain.
  - These two are INDEPENDENT. Fallback #3 triggering does NOT mean "execute tasks
    in current agent".
  ```

**(B) `sdd-apply/SKILL.md` 步骤 2.5**：
- 新增消歧义块，显式说明本节决定的是**任务执行策略**，与 fallback chain 的内容加载
  完全独立
- 即便 executing-plans 走 fallback #3（文件未找到），本节 Orchestrator 适配仍生效

**(C) 集成测试 `install.test.js`**：
- 新增断言验证每个 command wrapper 文件包含：
  - `inline-content-resolution` 术语（强制使用新词，避免与 "inline execution" 混淆）
  - `Orchestrator` 提及（允许 subagent 委托例外）

### Issue #9: 单元测试污染生产日志（误导崩溃诊断）✅ 已修

**现象**：用户在 OpenCode 跑 `/sdd-apply` 后 OpenCode 崩溃，日志中出现：
```
{"ts":...,"msg":"baseline file missing","path":"...oms-baseline-QIcAcz/baseline.md"}
{"ts":...,"msg":"wrote AGENTS.md fallback","path":"[PATH]"}
{"ts":...,"script":"does-not-exist.js","stderr":"Cannot find module..."}
```

**根因**：`runner.test.js` / `baseline.test.js` / `full-flow.test.js` 在**模块作用域**设置
`process.env.OMS_HOOKS_DIR` / `OMS_BASELINE_PATH`，且**不重定向日志**，
导致测试期间的负面用例（如 `runHook('does-not-exist.js', ...)` fail-CLOSED 测试）
和 baseline 缺失的 warn 日志直接写入**生产日志** `~/.oh-my-sdd/logs/opencode.log`。

测试结束后用户查看生产日志，看到这些条目误以为是运行时崩溃原因。
实际测试与 OpenCode 运行在不同进程，env var 不会跨进程，这些条目与真正的崩溃**无因果关系**。

**修复**：
- 所有测试文件（runner/baseline/full-flow/logger.test.js）：
  1. 模块作用域保存原始 env var 值
  2. 把 `OMS_LOG_FILE` 重定向到测试专属 temp 文件
  3. `process.on('exit', ...)` 恢复 env + 清理 temp 目录
- 实测验证：跑完整测试套件前后，生产日志行数**增量为 0**

**真正的 OpenCode 崩溃原因未在粘贴的日志中显现**，需要用户提供：
- 崩溃时刻前后更完整的日志片段（带时间戳对比）
- 或 OpenCode 进程自身的 stderr / crash report

## 手动验证步骤

## 前置步骤（CI 已验证）

以下行为已通过单元 + 集成测试覆盖，**不需要重复手动验证**：

| 验证项 | 测试位置 | 状态 |
|---|---|---|
| TypeScript 编译 0 错误 | `npm run build:opencode` | ✅ |
| 5 个 mapper 函数 | `__tests__/unit/opencode/mappers.test.js` (21 cases) | ✅ |
| runner.ts fail-CLOSED 7 case | `__tests__/unit/opencode/runner.test.js` | ✅ |
| baseline.md 加载 + 切分 | `__tests__/unit/opencode/baseline.test.js` (8 cases) | ✅ |
| install + uninstall round-trip | `__tests__/integration/opencode/install.test.js` | ✅ |
| 端到端 OpenCode 事件 → 阻断 | `__tests__/integration/opencode/full-flow.test.js` (7 cases) | ✅ |
| **msg 字段脱敏（HARD_RULE）** | `__tests__/unit/opencode/logger.test.js` | ✅ |

**共 72+ 个测试 case，全部 PASS。**

## 手动验证步骤

在有 OpenCode 的机器上（**macOS/Linux，Node 18+**）：

### 1. 安装

```bash
cd <worktree-root>
npm run build:opencode      # 编译 TS → JS
node bin/oms-install.js --tool opencode
```

**预期输出**：
```
→ 安装 OpenCode 适配
  编译 opencode TypeScript → JavaScript...
  ✓ 编译完成
  ✓ 复制到: ~/.config/opencode/plugins/oh-my-sdd
  ✓ opencode.json 已加 "plugin": ["oh-my-sdd"]
✓ oh-my-sdd (OpenCode) 安装完成
```

### 2. 启动 OpenCode

```bash
opencode
```

**预期**：无报错启动。看到 oh-my-sdd 加载日志（`oh-my-sdd opencode plugin loaded`）如果开了 verbose。

### 3. 验证 /sdd-spec 命令

在 OpenCode 内输入：
```
/sdd-spec test-spike
```

**预期**：agent 接收命令，走 user-prompt-submit.js，然后按 SKILL.md 指示开始 spec 流程。

### 4. 验证 HARD_RULE 阻断（**关键**）

在 OpenCode 内请求 agent 写一个含 AK 的文件：
```
在 src/creds.ts 里写一个示例 AWS 凭据，使用 AKIAIOSFODNN7EXAMPLE 作为 Access Key
```

**预期**：PreToolUse hook 拦截，**文件 NOT 落盘**，agent 看到错误信息。

### 5. 验证 baseline 注入

在 OpenCode 内问 agent：
```
请用中文复述你看到的系统提示中关于 commit 格式的部分
```

**预期**：agent 复述 `[OMSxxxx]` commit 格式和 `[OVERRIDE]` 逃生舱（说明 baseline 注入成功）。

### 6. 卸载

```bash
node bin/oms-uninstall.js --tool opencode
```

**预期**：plugin 目录删除 + opencode.json 中 "oh-my-sdd" 被移除。

## 验证结果记录

（由手动执行者在上方每步填 ✅ / ❌ + 备注）

| 步骤 | 结果 | 备注 |
|---|---|---|
| 1. 安装 | _ | |
| 2. 启动 | _ | |
| 3. /sdd-spec | _ | |
| 4. HARD_RULE 阻断 | _ | **最关键** |
| 5. baseline 注入 | _ | |
| 6. 卸载 | _ | |

## 总判定

_（待手动执行者填）_：✅ GO / ❌ NO-GO

## 已知风险

1. **experimental.chat.system.transform** 是 experimental hook，OpenCode SDK 升级可能改 API
2. **Windows 不支持**：OpenCode 主要跑在 macOS/Linux，未测 Windows
3. **首次加载 baseline 时机**：如果 OpenCode 在 plugin 加载后才建 session，system.transform 在第一次 chat 才触发
