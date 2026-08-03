# Issue #16 验收闭环实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 用离线可控 harness 证明 `/sdd-plan` 的 brainstorming → writing-plans 与缺失 skill fallback，并消除并发 prepack 的资源同步竞态。

**架构：** 测试 harness 只读取安装到隔离 HOME 的 command/skill 文件，将 command 声明的内容解析契约转换为确定性事件；生产包不包含 harness。资源同步使用同级临时目录、跨进程目录锁和可恢复替换，确保任何时刻只允许一个 writer 修改目标树。

**技术栈：** Node.js 18+、`node:test`、Node.js `fs`/`child_process`、npm pack/install。

---

## 文件结构

- 创建 `__tests__/helpers/opencode-command-harness.js`：解析发布 command、定位 skill 并输出执行事件。
- 创建 `__tests__/integration/opencode/sdd-plan-harness.test.js`：验证隔离 HOME 的正常 chain 和缺失 skill fallback。
- 修改 `__tests__/unit/opencode/resource-scripts.test.js`：验证同步失败保留旧目标、目录锁等待和公共 API 文档。
- 修改 `opencode/scripts/copy-resources.mjs`：实现锁、临时目录复制与可恢复替换。
- 修改 `opencode/scripts/postinstall.mjs`：为导出常量补齐 JSDoc。
- 修改 `docs/release/internal-publish-runbook.md`：把 harness E2E 和并发 pack 加入发布验证。

### 任务 1：可控 `/sdd-plan` 执行 harness

**文件：**
- 创建：`__tests__/helpers/opencode-command-harness.js`
- 创建：`__tests__/integration/opencode/sdd-plan-harness.test.js`
- 参考：`opencode/.opencode/commands/sdd-plan.md`
- 参考：`opencode/oms-skills/sdd-plan/SKILL.md`

- [ ] **步骤 RED 1：编写正常 chain 的失败测试**

测试在临时 HOME 中运行 `opencode/scripts/postinstall.mjs`，断言 PATH 中不存在 `claude` shim，然后调用尚不存在的 `runSddPlanHarness()`：

```js
const result = runSddPlanHarness({
  home,
  commandPath: join(home, '.config', 'opencode', 'commands', 'sdd-plan.md'),
  approved: true,
});
assert.deepEqual(result.events.map((event) => event.type), [
  'main-skill-loaded',
  'brainstorming-question',
  'brainstorming-approval-requested',
  'brainstorming-approved',
  'writing-plans-started',
]);
```

- [ ] **步骤 RED 2：运行正常 chain 测试并确认失败**

运行：

```bash
node --test __tests__/integration/opencode/sdd-plan-harness.test.js
```

预期：FAIL，错误包含 `ERR_MODULE_NOT_FOUND` 或 `runSddPlanHarness is not defined`。

- [ ] **步骤 GREEN 1：实现最小 harness**

导出以下接口：

```js
export function runSddPlanHarness({ home, commandPath, approved }) {
  // 读取 command；验证 name-without-namespace 与 inline fallback 契约。
  // 从 ~/.config/opencode/skills/sdd-plan/SKILL.md 加载主 skill。
  // resolveDelegate('superpowers:brainstorming') 后记录问答与批准事件。
  // approved === true 时继续 resolveDelegate('superpowers:writing-plans')。
  return { events, resolutions };
}
```

`resolveDelegate()` 必须去除 `superpowers:`，按 command 声明顺序检查隔离 HOME 下的 OpenCode、Agents、Claude 路径。每次解析记录 `{ requested, normalized, source, mode }`。

- [ ] **步骤 GREEN 2：运行正常 chain 测试并确认通过**

运行：

```bash
node --test __tests__/integration/opencode/sdd-plan-harness.test.js
```

预期：正常 chain 测试 PASS。

- [ ] **步骤 RED 3：编写缺失 skill fallback 的失败测试**

复制 clean HOME fixture 后删除 `~/.config/opencode/skills/brainstorming`，再次运行 harness：

```js
assert.deepEqual(result.resolutions[0], {
  requested: 'superpowers:brainstorming',
  normalized: 'brainstorming',
  source: null,
  mode: 'inline-content-resolution',
});
assert.ok(result.events.some((event) => event.type === 'brainstorming-question'));
assert.ok(result.events.some((event) => event.type === 'writing-plans-started'));
```

- [ ] **步骤 RED 4：运行 fallback 测试并确认正确失败**

运行同一测试文件。预期：FAIL，原因是 resolver 在文件缺失时停止或未记录 inline fallback。

- [ ] **步骤 GREEN 3：实现 fallback 和未批准分支**

文件缺失时，从主 skill 中对应委派段落生成 inline 内容摘要，记录 fallback 后继续。`approved === false` 时事件必须停在 `brainstorming-approval-requested`，不得记录 `writing-plans-started`。

- [ ] **步骤 REFACTOR 1：回归并提交**

运行：

```bash
node --test __tests__/integration/opencode/sdd-plan-harness.test.js __tests__/unit/opencode/resource-scripts.test.js
```

预期：全部 PASS。

提交：

```bash
git add __tests__/helpers/opencode-command-harness.js __tests__/integration/opencode/sdd-plan-harness.test.js
git commit -m "[OPEN02] test: T1 - verify sdd-plan delegation behavior"
```

### 任务 2：原子且可串行化的资源同步

**文件：**
- 修改：`opencode/scripts/copy-resources.mjs:24-106`
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`

- [ ] **步骤 RED 1：测试复制失败不破坏旧目标**

向 `syncResourceTree()` 注入在复制时抛错的 `copy` 操作：

```js
assert.throws(() => syncResourceTree(src, dst, {
  copy: () => { throw new Error('copy failed'); },
}), /copy failed/);
assert.equal(readFileSync(join(dst, 'stable.txt'), 'utf8'), 'stable');
```

- [ ] **步骤 RED 2：测试现有锁会阻塞同步**

父测试创建 `${dst}.oh-my-sdd-sync.lock`。子进程调用 `syncResourceTree(src, dst)`；父进程等待 200 ms 后删除锁。断言子进程在锁删除前未完成，之后退出码为 0 且目标完整。

- [ ] **步骤 RED 3：运行测试并确认旧实现失败**

运行：

```bash
node --test __tests__/unit/opencode/resource-scripts.test.js
```

预期：至少两个新增测试 FAIL；旧目标已被删除或子进程忽略锁。

- [ ] **步骤 GREEN 1：实现目录锁**

新增并导出带 JSDoc 的 helper：

```js
export function withSyncLock(target, action, {
  mkdir = mkdirSync,
  remove = rmSync,
  now = Date.now,
  wait = defaultWait,
  timeoutMs = 10_000,
} = {}) { /* mkdir lockDir；EEXIST 时短暂等待；finally 清锁 */ }
```

仅锁定同一目标目录；超时错误必须包含目标路径和等待时长。

- [ ] **步骤 GREEN 2：实现临时目录复制和可恢复替换**

`syncResourceTree(src, dst, ops = {})` 在锁内执行：

```js
const staging = `${dst}.oh-my-sdd-staging-${process.pid}-${nonce}`;
const backup = `${dst}.oh-my-sdd-previous-${process.pid}-${nonce}`;
copy(src, staging, { recursive: true, force: true, filter });
if (exists(dst)) rename(dst, backup);
try {
  rename(staging, dst);
  remove(backup, { recursive: true, force: true });
} catch (error) {
  if (exists(backup) && !exists(dst)) rename(backup, dst);
  throw error;
} finally {
  remove(staging, { recursive: true, force: true });
}
```

- [ ] **步骤 GREEN 3：运行聚焦测试**

运行：

```bash
node --test __tests__/unit/opencode/resource-scripts.test.js
```

预期：全部 PASS，且无残留 `.oh-my-sdd-staging-*`、`.oh-my-sdd-previous-*` 或 lock 目录。

- [ ] **步骤 REFACTOR 1：验证两个并发 pack**

同时启动两个命令：

```bash
npm pack --dry-run --json --cache /private/tmp/oms-pack-a
npm pack --dry-run --json --cache /private/tmp/oms-pack-b
```

预期：两者退出码均为 0，pack 均含 5 个主委派 skill，`git status --short` 无变化。

- [ ] **步骤 REFACTOR 2：提交**

```bash
git add opencode/scripts/copy-resources.mjs __tests__/unit/opencode/resource-scripts.test.js
git commit -m "[OPEN02] fix: T2 - serialize package resource sync"
```

### 任务 3：文档注释、发布验证与最终验收

**文件：**
- 修改：`opencode/scripts/postinstall.mjs:74-90`
- 修改：`docs/release/internal-publish-runbook.md`
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`

- [ ] **步骤 RED 1：增加公共导出文档测试**

读取 `postinstall.mjs`，断言 `DELEGATED_SKILLS_SOURCE`、`DELEGATED_SKILL_NAMES`、`DELEGATED_SUPPORT_SKILL_NAMES` 前均存在 `/** ... */` JSDoc。

- [ ] **步骤 RED 2：运行并确认失败**

运行：

```bash
node --test __tests__/unit/opencode/resource-scripts.test.js
```

预期：FAIL，指出首个缺少 JSDoc 的导出。

- [ ] **步骤 GREEN 1：补齐 JSDoc 与 runbook**

JSDoc 必须说明固定来源、5 个强依赖、3 个传递依赖及只读数组语义。发布 runbook 增加：隔离 harness、fallback、并发 pack 和 pack 后 clean status 四项命令。

- [ ] **步骤 GREEN 2：运行聚焦测试与构建**

```bash
node --test __tests__/integration/opencode/sdd-plan-harness.test.js __tests__/integration/opencode/install.test.js __tests__/unit/opencode/resource-scripts.test.js
npm run build
cd opencode && npm run build
```

预期：全部 PASS。

- [ ] **步骤 REFACTOR 1：安全与发布检查**

```bash
cd opencode
npm audit --omit=dev --cache /private/tmp/oms-audit-cache
npm pack --dry-run --json --cache /private/tmp/oms-final-pack-cache
```

预期：0 vulnerabilities；pack 包含 5 个主委派 skill、6 个 commands 和卸载器。

- [ ] **步骤 REFACTOR 2：对照 Issue #16 验收并提交**

逐项记录 11/11 PASS 的文件与测试证据。运行 `git diff --check`，确认工作树仅包含本任务文件。

```bash
git add opencode/scripts/postinstall.mjs docs/release/internal-publish-runbook.md __tests__/unit/opencode/resource-scripts.test.js
git commit -m "[OPEN02] docs: T3 - document deterministic acceptance checks"
```

## 计划自检

- 规格覆盖：harness 正常链路、fallback、隔离环境、原子同步、并发 pack、JSDoc 和最终验收均有对应任务。
- 占位符扫描：无待定实现、TODO 或未定义接口。
- 类型一致性：统一使用 `runSddPlanHarness(options)`、`syncResourceTree(src, dst, ops)` 和 `withSyncLock(target, action, ops)`。
- 执行模式：使用 subagent-driven-development；每个任务先规格审查，再代码质量审查。
