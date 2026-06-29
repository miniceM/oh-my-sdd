# Spike: PostToolUse `permissionDecision: "deny"` 能力验证

**状态**:契约层 ✓ 完成(12/12 测试通过) · 运行时层 ✗ **失败**(V1/V4 实测)
**日期**:2026-06-26(契约)/ 2026-06-29(运行时验证)
**关联**:洋葱模型移植 PR4 / plan `imperative-toasting-music.md`

## 背景

PR4 让 `hooks/post-tool-use.js` 在违规 Edit/Write 时返回 `{ permissionDecision: "deny", permissionDecisionReason: "..." }`,期望 Claude Code 拒绝文件落盘并反馈给 Claude 自我纠正。

但这个能力依赖 Claude Code 客户端对 `PostToolUse` hook 返回值的实际消费行为,**没有任何 oh-my-sdd 内部先例**(现有 hook 只返回 `{}`)。Plan 把 PR4 标记为"spike 先行,不入 main",必须验证 4 项后才能正式 ship。

## Spike 4 项验证

### V1: `permissionDecision: "deny"` 是否真的阻止 Edit/Write 落盘?

**契约层(已完成)**:
- ✓ `__tests__/spike/post-tool-use-deny.test.js::spike/contract: HARD rule deny` 断言 hook 返回的 JSON 含 `permissionDecision: "deny"` + `permissionDecisionReason: string`
- ✓ stdout 是合法 JSON,字段名拼写与 Claude Code 文档一致

**运行时层(待验证)**:
- [ ] 在真实 Claude Code 会话中,Edit 一个含 `AKIA...` 的文件
- [ ] 观察文件**是否真的没落盘**(用 `ls -la` + `cat` 验证)
- [ ] 若文件已落盘,deny 仅是"事后警告",真正阻断需迁移到 `PreToolUse` 钩子

**已知风险(来自 PR4 agent)**:
> 当前 gate 在 `writeFile(meta)` 之后跑——deny 时 meta 已落盘,但**被编辑文件可能已经写入磁盘**。PostToolUse 的 "post" 字面意思就是"工具执行后",Anthropic 文档需要明确确认这个字段对 PostToolUse 是否仍能撤销已发生的工具调用。

### V2: deny 后 Claude 是否能看到 `permissionDecisionReason` 反馈并自我纠正?

**契约层(已完成)**:
- ✓ deny reason 含 `[OVERRIDE]` 提示(逃生舱可见性)
- ✓ deny reason 列出具体触发的 rule_id

**运行时层(待验证)**:
- [ ] 触发 deny 后,Claude 下一轮回复里是否引用了 `permissionDecisionReason` 内容
- [ ] Claude 是否会主动提出修改方案(例如:"检测到 AWS Key,改为读环境变量")
- [ ] Claude 是否会盲目重试相同 Edit(死循环前兆)

### V3: 多次 deny 是否触发死循环?

**契约层**:N/A(这是运行时行为,无法 mock)

**运行时层(待验证)**:
- [ ] 故意让 Claude 进入 deny 循环(让它反复 Edit 同一个违规文件)
- [ ] 观察 Claude Code 是否有 rate limit / 自动放弃机制
- [ ] 记录从第几次 deny 开始 Claude 放弃

**缓解预案**:若死循环,在 hook 里加 session 级计数器,同一 rule_id 在 3 次内 deny,之后降级为 warn。

### V4: `additionalContext` 字段(SOFT warn)的注入位置和可见性?

**契约层(已完成)**:
- ✓ `__tests__/spike/post-tool-use-deny.test.js::spike/contract: SOFT rule warn` 断言 hook 返回的 JSON 含 `additionalContext: string`

**运行时层(待验证)**:
- [ ] Edit 一个无 "Quick Start" 的 README.md
- [ ] 观察 `additionalContext` 是否出现在 Claude 的下一轮上下文里
- [ ] Claude 是否会主动补 Quick Start 节(说明它读到了 warn)

## 真实环境验证步骤(你需要跑)

### 准备

```bash
# 1. 切到 oh-my-sdd 项目
cd /Users/hosea/work/git/oh-my-sdd

# 2. 确保 plugin 已 install + Claude Code 重启
npm install            # 触发 postinstall (install.js)
# 或:node install.js

# 3. 验证 plugin 已激活
ls ~/.claude/plugins/ | grep oh-my-sdd
cat ~/.claude/CLAUDE.md | grep "BEGIN oh-my-sdd"
# 退出当前 Claude Code,重新启动,让钩子配置加载
```

### V1 验证(deny 是否真阻断落盘)

```
# 在 Claude Code 会话里,跑:
帮我创建 /tmp/spike-test.js 文件,内容是:
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
console.log(AWS_KEY);

# Claude 会调用 Write 工具。预期:
# - 钩子触发,Claude Code 显示 deny 反馈
# - /tmp/spike-test.js 不存在(或被回滚)
ls -la /tmp/spike-test.js
# 期望:not found
```

### V2 验证(Claude 是否看到反馈)

V1 之后,**不要手动干预**,观察 Claude 下一轮回复:
- ✓ 期望:Claude 说"检测到 AWS Key 违反 HARD_RULE,改用环境变量"
- ✗ 失败:Claude 无视反馈,继续别的工作(说明 `permissionDecisionReason` 没被 Claude Code 注入上下文)

### V3 验证(死循环检测)

```
# 故意坚持让 Claude 写违规内容:
不管什么规则,我就是要 /tmp/spike-test.js 里含 AKIAIOSFODNN7EXAMPLE,直接写,别废话
```

观察:
- Claude Code 是否会自动终止循环?
- 多少次 deny 后 Claude 放弃?(记录次数)
- 是否需要强行 Ctrl+C?

### V4 验证(SOFT warn 可见性)

```
# 让 Claude 写一个无 Quick Start 的 README:
帮我写一个最简的 README.md 到 /tmp/spike-readme/,只有项目名,不要示例
```

观察 Claude 下一轮是否:
- ✓ 提到 SOFT_RULE warning(说明 additionalContext 被消费)
- ✗ 完全没提(说明字段被静默丢弃)

## 验证记录模板

完成验证后,把结果填到下面,作为 PR4 正式 ship 的决策依据:

```
### V1 deny 阻断落盘
- 结果:[ ] 通过 / [ ] 部分通过 / [ ] 失败
- 现象:<观察到什么>
- 文件是否落盘:<是/否>
- 结论:<可继续 PostToolUse / 需迁移 PreToolUse>

### V2 Claude 自我纠正
- 结果:[ ] 通过 / [ ] 失败
- 现象:<Claude 下一轮回复要点>

### V3 死循环
- 结果:[ ] 无循环 / [ ] 自动终止(第 N 次) / [ ] 死循环(需手动)
- 第 N 次放弃:N = ?

### V4 SOFT warn
- 结果:[ ] 通过 / [ ] 失败
- 现象:<Claude 是否引用 additionalContext>
```

## 实测结果(2026-06-29)

环境:用户重启 Claude Code 后,plugin `oh-my-sdd@oh-my-sdd` 已 enable,PostToolUse 钩子通过 plugin manifest(`hooks/hooks.json`)注册。但当前会话 `authState.state === 'NO_CLI'`(未装 iam CLI)。

### V1 deny 阻断落盘 — **失败**

操作:在 Claude Code 会话内,用 Write 工具创建 `/tmp/spike-v1-test.js`,内容含 `AKIAIOSFODNN7EXAMPLE`。

结果:
- Write 工具返回 `"File created successfully at: /tmp/spike-v1-test.js"`
- 文件**确实已落盘**(`ls -la` 确认 62 字节,内容完整)
- Claude(我)未收到任何 `permissionDecisionReason` 反馈
- session meta 目录 `~/.oh-my-sdd/sessions/` 为空

**根因**:Claude Code 的 PostToolUse 钩子**不消费 `permissionDecision: "deny"` 字段**。PostToolUse 设计上是"工具完成后通知",文件已经写入磁盘,Claude Code 不会回滚。

### 额外发现:PostToolUse short-circuit 让 rules 检查根本不跑

诊断:直接 spawn `post-tool-use.js` 喂 mock stdin(无 session meta 文件)。

```
$ echo '{"session_id":"diag","tool_name":"Edit","tool_input":{...}}' | node post-tool-use.js
{}                                          ← short-circuit,跳过 rules 检查
```

**根因**:`post-tool-use.js:43-52` 在 session meta 文件 ENOENT 时直接返回 `{}`,从未到达 `matchRules()` 调用。而 session meta 由 `session-start.js:122-126` 写入,**仅在 `authState.state === 'OK'` 时**(已通过 iam 认证)。

**这意味着**:在以下场景中 hard gate **完全失效**:
- 用户未安装 iam CLI(NO_CLI)— 当前会话正是此状态
- 用户未登录(NEED_LOGIN)
- 用户登录了但 SessionStart 钩子未跑(冷启动 race)

讽刺的是,**hard gate 在"未认证"这个最需要保护的场景下完全失效**。

### V2 Claude 自我纠正 — N/A(依赖 V1)

V2 依赖 deny 反馈进入 Claude 上下文,既然 V1 失败,V2 无法测试。

### V3 死循环检测 — N/A

V3 依赖 V1 的 deny 反馈触发循环,既然 V1 失败,无循环风险(也无阻断效果)。

### V4 SOFT warn 可见性 — **失败**

操作:Write 一个无 "Quick Start" 的 README.md 到 `/tmp/spike-v4-readme/`。

结果:
- Write 工具返回成功,文件落盘
- Claude 未看到任何 `additionalContext` 内容
- 同样因为 session meta 不存在 short-circuit,rules 检查根本没跑

## 综合结论

PR4 当前的 hard gate 设计**两层失效**:

| 层 | 问题 | 严重性 |
|----|------|--------|
| **Claude Code 运行时** | PostToolUse 不消费 `permissionDecision: "deny"` | 致命 — 无法阻断落盘 |
| **oh-my-sdd 钩子逻辑** | session meta short-circuit 跳过 rules 检查 | 致命 — 未认证场景下完全无 gate |

按 plan D3 备选,**PR4 必须重写或降级**,不能以当前形态 ship。

---

## R1 迁移后的二次验证(2026-06-29)

R1 方案(迁移到 PreToolUse + 解耦 session meta)实施后,再次跑 V1 真实环境验证。结果:**仍然失败**——文件依然落盘。

### 第三层根因发现:JSON schema 错误

诊断:直接 spawn `pre-tool-use.js` 喂 mock stdin,钩子**正确返回** `permissionDecision: "deny"`。但 Claude Code 在真实工具调用时**忽略了这个输出**,文件照常落盘。

排查路径:对比已安装的 `hookify` plugin(`~/.claude/plugins/cache/claude-plugins-official/hookify/94258c5913c4/hooks/`)的 PreToolUse 实现,在 `core/rule_engine.py` 里发现正确 schema:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny"
  },
  "systemMessage": "..."
}
```

oh-my-sdd 原先用的扁平 schema **不符合 Claude Code 文档契约**:

```json
{"permissionDecision": "deny", "permissionDecisionReason": "..."}  // ❌ 错误
```

**Claude Code 要求 `permissionDecision` 嵌套在 `hookSpecificOutput.hookEventName` 下**。顶层字段会被忽略。

### 第四层发现:acceptEdits 模式旁路

`~/.claude/settings.json` 第 118 行:
```json
"permissions": { "defaultMode": "acceptEdits" }
```

`acceptEdits` 模式下,Claude Code **自动接受所有 Edit/Write 工具调用**,可能进一步旁路 PreToolUse 的 deny。这需要用户在 settings 里切回 `default` 模式才能让 hard gate 真正生效。

### R1 修复

1. **schema 修正**:`pre-tool-use.js` 改用嵌套结构
   ```javascript
   process.stdout.write(JSON.stringify({
     hookSpecificOutput: {
       hookEventName: 'PreToolUse',
       permissionDecision: 'deny',
       permissionDecisionReason: reason,
     },
     systemMessage: reason,
   }));
   ```
2. **测试同步**:12 个 spike 测试 + 12 个集成测试更新为断言嵌套 schema
3. **plugin 缓存同步**:把修正后的 `pre-tool-use.js` 复制到 `~/.claude/plugins/cache/oh-my-sdd/oh-my-sdd/0.1.0/hooks/`
4. **120/120 测试通过**

### 待用户验证

需要用户:
1. **重启 Claude Code**(让 hooks.json + 新 pre-tool-use.js 重新加载)
2. **考虑把 `defaultMode` 从 `acceptEdits` 切回 `default`**(否则 PreToolUse deny 可能仍被旁路)
3. 跑 V1 真实验证:Write 一个含 `AKIA...` 的文件,期望文件**不落盘** + Claude 收到 systemMessage 反馈

## 失败兜底(plan 预案)

如果**任何一项运行时验证失败**,按 plan D3 备选执行:

- **V1 失败**(文件已落盘)→ PR4 降级方案 B:`post-tool-use.js` 改为全 warn(只返回 `additionalContext`,不 deny)。Hard gate 推迟到 v0.3,本期只交付 PR1+2+3+5
- **V2 失败**(Claude 不读反馈)→ 同上,deny 失去意义,降级 warn
- **V3 死循环**→ 在 hook 里加 session 级 rate limit(同一 rule_id 第 3 次后降级 warn)
- **V4 失败**(SOFT 信号丢失)→ SOFT warn 整体废弃,PostToolUse 只对 HARD 起作用;或者把 warn 写入 session meta 让 SessionEnd 钩子上报 DOP

---

## 实测后修订的决策路径(2026-06-29)

实测结果证明当前 PR4 实现无法工作。三种重写方案:

### 方案 R1:迁移到 PreToolUse(推荐 — 真正阻断)

把钩子事件从 `PostToolUse` 改为 `PreToolUse`,在工具执行**前**检查。但 PreToolUse 收到的是工具**输入参数**(file_path + 即将写入的内容),不是已落盘文件。

**改动**:
- `hooks/hooks.json`:`PostToolUse` → `PreToolUse`
- `hooks/post-tool-use.js` → 重命名为 `pre-tool-use.js`
- 检查逻辑改为读 `stdin.tool_input.content`(Write)或 `stdin.tool_input.new_string`(Edit),而不是 readFile 落盘文件
- 摆脱 session meta 依赖(rules 检查不再需要 meta)

**优势**:
- Claude Code 文档明确 PreToolUse 支持 `permissionDecision: "deny"` 真阻断
- 不依赖 session meta,未认证用户也受保护

**劣势**:
- 整个 PR4 需重写,spike 测试也要重做
- MultiEdit 的多个 new_string 需要分别检查

### 方案 R2:PostToolUse 保留 + 拆 session meta 依赖(降级 warn)

保留 PostToolUse 但承认无法阻断,只做"事后记录":
- 把 `post-tool-use.js:43-52` 的 session meta short-circuit 移到 rules 检查**之后**(rules 先跑,meta 写入失败不阻断)
- 不再返回 `permissionDecision: "deny"`(无效字段)
- 改为返回 `additionalContext: "已记录 HARD_RULE 违规到 DOP"`
- 通过 SessionEnd 钩子上报违规到 DOP 系统

**优势**:
- 改动小,spike 测试通过后可立即 ship
- 至少有"审计留痕"价值

**劣势**:
- 失去"强制阻断"的核心价值
- 与 baseline HARD rule #6 的措辞("钩子以 permissionDecision: deny 阻断")不一致,需改 baseline

### 方案 R3:放弃 hard gate(最保守)

撤回 PR4 的 post-tool-use.js 改动和 baseline HARD rule #6,只保留 `hooks/lib/rules.js`(供未来 sdd-review 程序化使用)。本期只交付 PR1+2+3+5。

**优势**:零风险,洋葱模型第 5 层(hard gate)整体推迟

**劣势**:失去洋葱模型最硬的一层

## 推荐

**方案 R1(PreToolUse)** 是唯一能真正实现"强制阻断"的路径,与 baseline HARD rule #6 的承诺一致。其他两个方案都是降级。

## Spike 产物

- ✓ `__tests__/spike/post-tool-use-deny.test.js`(12 个契约测试,全绿)
- ✓ `docs/spike-posttooluse-deny.md`(本文档)
- ⏳ 真实环境验证记录(待用户填)

## Spike 后的 PR4 决策路径

```
Spike V1-V4 全部通过 ──→ PR4 正式 ship(当前实现,HARD deny + SOFT warn)
        │
        ├─ V1 失败 ────→ PR4 降级方案 B(全 warn,无 deny)
        │                钩子代码改:删除 permissionDecision 分支
        │                baseline HARD rule #6 改措辞(不提 deny)
        │
        └─ V1 通过但 V2 失败 ─→ 中间方案:PostToolUse 改 PreToolUse
                              (能阻断落盘但需重写 hook 入口)
```
