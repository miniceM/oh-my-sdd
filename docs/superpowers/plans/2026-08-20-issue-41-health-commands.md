# Issue 41 状态、诊断与修复实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 以可审计证据报告安装后的真实保护状态，并只修复 doctor 已确认、OMS 拥有的资源。

**架构：** `health` domain 读取 #39 plan 和 #40 ownership/steps，构建不夸大结论的 status 与 doctor findings；repair 先产生同一修复计划，后在显式 apply 时执行 OMS-only steps。CLI 只渲染版本化 JSON envelope 或文本。

**技术栈：** Node.js ESM、Node 内置 `node:test`、sentinel/ownership manifest 与 HostAdapter runtime facts。

---

## 文件结构

- 创建：`install/control-plane/health.js` — 五层 protection findings、status 与 doctor。
- 创建：`install/control-plane/repair.js` — drift 到 repair plan、ownership 保护与幂等执行。
- 创建：`bin/oms.js`（或扩展既有受支持的 CLI dispatcher）— `status`、`doctor`、`repair` 子命令。
- 修改：`install/host-adapter.js`、四个 adapters — 只读运行时证据探针。
- 创建：`__tests__/unit/install/control-plane/health.test.js`、`repair.test.js`、`__tests__/unit/bin/oms.test.js`。
- 修改：`__tests__/integration/claude-install.test.js`、`__tests__/integration/install-targets.test.js`、`__tests__/integration/opencode/install.test.js` — 添加四宿主 status/doctor/repair smoke tests。

### 任务 1：以测试定义五层证据模型

**文件：** 创建 `health.js`、`health.test.js`。

- [ ] **步骤 1：编写失败测试**

```js
test('health does not infer enforced from a written config', () => {
  const finding = buildHealthFinding({ written: evidence('file'), registered: evidence('config') });
  assert.equal(finding.level, 'registered');
  assert.equal(finding.enforced.state, 'unknown');
});
test('KiloCode is always advisory even with intact OMS resources', () => {
  assert.equal(doctor(KiloCodeFacts).protection.level, 'advisory');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/control-plane/health.test.js`

预期：FAIL，找不到 health 模块。

- [ ] **步骤 3：实现严格递进 finding**

```js
export const LEVELS = ['written', 'registered', 'loaded', 'enforced', 'advisory'];
export function buildHealthFinding(evidence) {
  return { written: state(evidence.written), registered: state(evidence.registered),
    loaded: state(evidence.loaded), enforced: state(evidence.enforced),
    level: highestProvenLevel(evidence) };
}
```

`highestProvenLevel` 只能接受直接证据；无 write-before hook 的 adapter 强制覆盖为 advisory，并附带原因。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/control-plane/health.test.js`

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/control-plane/health.js __tests__/unit/install/control-plane/health.test.js && git commit -m "feat: model installation protection evidence" -m "Refs #41"`

### 任务 2：实现跨宿主 status 与 doctor 漂移检测

**文件：** 修改 adapters/`host-adapter.js`；扩展 `health.js` 测试。

- [ ] **步骤 1：编写失败的宿主事实测试**

```js
test('doctor reports a missing owned baseline as drift with repair eligibility', async () => {
  const report = await doctor({ sentinel: ownedBaseline, read: missingFile });
  assert.deepEqual(report.findings[0], { code: 'owned-resource-missing', repairable: true, level: 'written' });
});
test('Lingma distinguishes documentation compatibility from runtime loading evidence', async () => {
  const report = await doctor(LingmaFacts);
  assert.equal(report.loaded.state, 'unknown');
  assert.match(report.loaded.reason, /文档|documentation/i);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/control-plane/health.test.js __tests__/unit/install/hosts/claude-adapter.test.js __tests__/unit/install/hosts/opencode-adapter.test.js __tests__/unit/install/hosts/lingma-adapter.test.js __tests__/unit/install/hosts/kilocode-adapter.test.js`

预期：FAIL，报告缺少 findings 或错误声称 loaded/enforced。

- [ ] **步骤 3：实现只读 runtime evidence 与 drift checks**

```js
static async inspectRuntime(ctx) {
  return { written: await ctx.resourceExists(...), registered: await ctx.configContains(...),
    loaded: { state: 'unknown', reason: 'host launch evidence unavailable' } };
}
```

doctor 对 manifest digest、sentinel、baseline marker、hook/plugin 配置、缺少依赖逐一发出结构化 finding；文件读取错误变为 `unknown` finding，不抛出。

- [ ] **步骤 4：运行测试验证通过**

运行：同步骤 2 命令。

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/control-plane/health.js install/host-adapter.js install/hosts __tests__/unit/install/control-plane/health.test.js __tests__/unit/install/hosts/claude-adapter.test.js __tests__/unit/install/hosts/opencode-adapter.test.js __tests__/unit/install/hosts/lingma-adapter.test.js __tests__/unit/install/hosts/kilocode-adapter.test.js && git commit -m "feat: diagnose installation drift" -m "Refs #41"`

### 任务 3：先用失败测试实现 OMS-only repair plan

**文件：** 创建 `repair.js`、`repair.test.js`。

- [ ] **步骤 1：编写失败测试**

```js
test('repair dry run lists only a doctor-confirmed OMS-owned resource', async () => {
  const plan = await buildRepairPlan(reportWithOwnedDrift);
  assert.deepEqual(plan.steps.map(step => step.path), [ownedPath]);
});
test('repair refuses a digest-mismatched user-modified resource', async () => {
  const result = await applyRepair(userModifiedPlan);
  assert.equal(result.steps[0].status, 'warning');
  assert.match(result.steps[0].next_action, /手动/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/install/control-plane/repair.test.js`

预期：FAIL，找不到 repair 模块。

- [ ] **步骤 3：实现 repair plan 和幂等 apply**

```js
export function buildRepairPlan(report) {
  return { type: 'repair-plan', steps: report.findings
    .filter(f => f.repairable && f.owned && f.current_digest === f.expected_digest)
    .map(toRepairStep) };
}
```

无步骤时返回成功但说明 `no-action-required`；每一步再次验证 ownership/digest 后再写入；缺失依赖、版本不兼容、advisory 限制均不能转为 repair success。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test __tests__/unit/install/control-plane/repair.test.js`

预期：PASS。

- [ ] **步骤 5：提交**

运行：`git add -- install/control-plane/repair.js __tests__/unit/install/control-plane/repair.test.js && git commit -m "feat: repair OMS-owned installation drift" -m "Refs #41"`

### 任务 4：公开 status、doctor、repair CLI 并做端到端冒烟

**文件：** 创建/修改 CLI dispatcher、CLI tests 和 integration tests。

- [ ] **步骤 1：编写失败的 CLI 契约测试**

```js
test('oms doctor --tool opencode --json returns evidence findings', async () => {
  const report = JSON.parse(await runOms(['doctor', '--tool', 'opencode', '--json']));
  assert.equal(report.type, 'doctor-report');
  assert.ok(report.findings.every(f => 'evidence' in f));
});
test('oms repair defaults to dry run and requires --apply to write', async () => {
  const result = await runOms(['repair', '--tool', 'claude']);
  assert.equal(result.plan_only, true);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/bin/oms.test.js __tests__/integration/claude-install.test.js __tests__/integration/install-targets.test.js __tests__/integration/opencode/install.test.js`

预期：FAIL，命令未知或输出不符合 envelope。

- [ ] **步骤 3：实现 CLI dispatcher 与 renderer 接线**

```js
switch (command) {
  case 'status': return render(await status(options), options.json);
  case 'doctor': return render(await doctor(options), options.json);
  case 'repair': return render(options.apply ? await applyRepair(options) : await buildRepairPlan(options), options.json);
}
```

所有 JSON 只写 stdout；文本清楚列出 protection level、证据、风险和下一步。`repair` 没有 `--apply` 时绝不写入。

- [ ] **步骤 4：运行测试验证通过**

运行：同步骤 2 命令。

预期：PASS；四宿主 smoke tests 都包含可解释 protection 结果。

- [ ] **步骤 5：提交与全量验证**

运行：`git add -- bin/oms.js install/control-plane/health.js install/control-plane/repair.js __tests__/unit/bin/oms.test.js __tests__/integration/claude-install.test.js __tests__/integration/install-targets.test.js __tests__/integration/opencode/install.test.js && git commit -m "feat: add installation health commands" -m "Refs #41" && npm test && npm run lint:baseline && git diff --check`

预期：全部 PASS。
