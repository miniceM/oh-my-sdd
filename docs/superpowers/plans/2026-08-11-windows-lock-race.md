# Windows lock-race handling implementation plan

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** Windows 在锁目录刚被释放时报告 `EPERM` 不再中止资源同步。

**架构：** `withSyncLock` 已有带超时的轮询循环。将初始锁元数据读取的 `EPERM` 归为“锁状态未知但仍被占用”，复用现有轮询，不执行接管操作。通过 `ops.statSync` 注入测试桩，使竞争窗口可确定复现。

**技术栈：** Node.js ESM、`node:test`、`node:assert/strict`。

---

### 任务 1：让资源锁同步容忍 Windows 元数据竞争

**文件：**
- 修改：`__tests__/unit/opencode/resource-scripts.test.js:842-872`
- 修改：`opencode/scripts/copy-resources.mjs:129-220`
- 创建：无

- [x] **步骤 1：编写失败的回归测试**

在现有锁测试之后，传入尚未被生产代码使用的 `statSync` 桩：它首次观察锁路径时删除锁目录并抛出 `{ code: 'EPERM' }`。断言 `withSyncLock` 最终调用操作、目标锁目录被移除。

```js
let ran = false;
withSyncLock(lock, () => { ran = true; }, {
  pollMs: 1,
  statSync: (path) => {
    if (path === lock && firstProbe) {
      firstProbe = false;
      rmSync(lock, { recursive: true, force: true });
      const error = new Error('transient Windows lock metadata error');
      error.code = 'EPERM';
      throw error;
    }
    return realStatSync(path);
  },
});
assert.equal(ran, true);
```

- [x] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js --test-name-pattern 'retries after a transient Windows lock metadata error'`

预期：FAIL；当前实现忽略 `ops.statSync`，保留的活锁会使测试超时。

- [x] **步骤 3：编写最少实现代码**

让 `withSyncLock` 选择 `ops.statSync ?? statSync` 并传给 `reclaimStaleLock`；让后者在初始 `stat` 抛出 `EPERM` 时返回 `false`，交给现有轮询处理。

```js
const stat = ops.statSync ?? statSync;
// ...
if (reclaimStaleLock(lockPath, staleThresholdMs, now, rename, remove, stat)) continue;
```

```js
} catch (error) {
  if (error?.code === 'ENOENT') return true;
  if (error?.code === 'EPERM') return false;
  throw error;
}
```

- [x] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js --test-name-pattern 'retries after a transient Windows lock metadata error'`

预期：PASS；操作运行且锁被清理。

- [x] **步骤 5：重构并运行回归验证**

确认新增依赖注入只用于锁元数据读取，未改变重命名或删除路径。运行：

```bash
node --test __tests__/unit/opencode/resource-scripts.test.js
npm test
git diff --check
```

预期：全部命令成功。

- [x] **步骤 6：Commit**

```bash
git add opencode/scripts/copy-resources.mjs __tests__/unit/opencode/resource-scripts.test.js docs/superpowers/specs/2026-08-11-windows-lock-race-design.md docs/superpowers/plans/2026-08-11-windows-lock-race.md
git commit -m "fix: tolerate transient Windows lock metadata errors" -m "Closes #26"
```
