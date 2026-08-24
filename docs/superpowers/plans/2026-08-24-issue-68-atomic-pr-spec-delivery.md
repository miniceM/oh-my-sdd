# Issue 68：代码与 Spec 同 PR 原子交付实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 SDD 第 5 环收敛为“AI 审查通过后，在实现分支 archive 并创建包含代码和正式 Spec 的 PR”，随后自动执行 `dop change done <change-id>`。

**架构：** `sdd-review` 主技能及 OpenCode 镜像成为流程的唯一编排来源；它在创建 PR 前写入 DOP 完成意图，并在 PR 创建成功后执行 `done`。归档元数据提供可恢复的 pending 意图；SessionStart 只读扫描 archive 目录并提示窄范围 DOP 补偿，不再等待或检查 PR 合并。

**技术栈：** Node.js ESM、Node 内置测试运行器、Bash/Node DOP mock、OpenSpec CLI、GitHub CLI。

---

## 文件结构

- 修改：`skills/sdd-review/SKILL.md` — Claude 主技能的单阶段 Ring 5、archive-before-PR、DOP 完成与补偿契约。
- 修改：`opencode/oms-skills/sdd-review/SKILL.md` — 与主技能字节一致的 OpenCode 运行时副本。
- 修改：`skills/sdd-spec/SKILL.md`、`opencode/oms-skills/sdd-spec/SKILL.md` — 删除“未 finalize 阻断新变更”的旧前置说明，说明仅 Ring 5 会使用 DOP `done`。
- 修改：`lib/sdd-context.js`、`opencode/lib/sdd-context.js` — 提供 archive 元数据的 DOP completion-pending 判定，供 hook 使用并保持双副本一致。
- 修改：`lib/sdd-validation.js`、`opencode/lib/sdd-validation.js` — 用“PR 提交前 readiness”取代“merge 后 finalize readiness”。
- 修改：`hooks/session-start.js` — 扫描归档目录的 pending completion intent；不再提及 `--finalize` 或 PR merge。
- 修改：`scripts/dop`、`scripts/mock-cli.mjs` — mock `dop change done <code>` 与可控失败路径。
- 修改：`scripts/set-mock-env.sh`、`scripts/set-mock-env.cmd` — 记录 `OMS_MOCK_DOP_FAIL_DONE`，替换旧 update 说明。
- 修改：`docs/release/runbook-internal-test-v0.2.md` — 将演练流程收敛为五环与同 PR archive。
- 修改：`__tests__/integration/sdd-review.test.js` — 验证新技能顺序、禁止旧 merge/finalize 操作、镜像一致性及补偿描述。
- 修改：`__tests__/integration/session-start.test.js` — 验证 archive 中 pending DOP intent 的提醒与无旧 finalize 提示。
- 修改：`__tests__/unit/lib/sdd-context.test.js`、`__tests__/unit/lib/sdd-validation.test.js` — 覆盖新的 metadata 谓词及 PR 提交前校验。
- 修改：`__tests__/unit/scripts/mock-cli.test.js` — 覆盖 Node mock 的 `done` 成功与失败契约。

### 任务 1：先固定 DOP `done` mock 契约

**文件：**
- 修改：`__tests__/unit/scripts/mock-cli.test.js`
- 修改：`scripts/mock-cli.mjs`
- 修改：`scripts/dop`
- 修改：`scripts/set-mock-env.sh`
- 修改：`scripts/set-mock-env.cmd`

- [ ] **步骤 1：编写 DOP done 的失败测试**

在 `__tests__/unit/scripts/mock-cli.test.js` 增加两个 `spawnSync` 用例：成功命令返回 0 和 `status: "done"`；`OMS_MOCK_DOP_FAIL_DONE=1` 返回非零并在 stderr 含 `done failed`。

```js
const result = spawnSync(process.execPath, [script, 'dop', 'change', 'done', 'ARD123456'], {
  env: { ...process.env }, encoding: 'utf8',
});
assert.equal(result.status, 0, result.stderr);
assert.equal(JSON.parse(result.stdout).status, 'done');
```

- [ ] **步骤 2：运行新增测试并确认失败**

运行：`node --test __tests__/unit/scripts/mock-cli.test.js`

预期：FAIL；Node mock 尚不识别 `change done`。

- [ ] **步骤 3：实现最小的跨平台 mock 行为**

在两份 mock 中为 `done` 增加仅接受非空 code 的分支，记录命令，成功时输出下列 JSON；使用独立失败开关，不复用 create/update 的开关。

```json
{ "id": "ARD123456", "status": "done" }
```

将 help 文案的子命令列表改为 `create / list / view / done`，将已废弃的 `update` 提示改为“无 update，但支持 done”，并在两个 mock-env 说明文件中加入 `OMS_MOCK_DOP_FAIL_DONE=1`。

- [ ] **步骤 4：运行 mock 与跨平台 shim 测试**

运行：`node --test __tests__/unit/scripts/mock-cli.test.js`

预期：PASS；现有 Windows shim 测试仍通过，新增成功/失败用例均通过。

- [ ] **步骤 5：提交 mock 契约**

```bash
git add scripts/dop scripts/mock-cli.mjs scripts/set-mock-env.sh scripts/set-mock-env.cmd __tests__/unit/scripts/mock-cli.test.js
git commit -m "test(dop): model change completion command" -m "Refs: #68"
```

### 任务 2：建立 archive completion intent 与 PR 提交前校验

**文件：**
- 修改：`__tests__/unit/lib/sdd-context.test.js`
- 修改：`__tests__/unit/lib/sdd-validation.test.js`
- 修改：`lib/sdd-context.js`
- 修改：`opencode/lib/sdd-context.js`
- 修改：`lib/sdd-validation.js`
- 修改：`opencode/lib/sdd-validation.js`

- [ ] **步骤 1：为 metadata 谓词和新 readiness 编写失败测试**

测试 `isDopCompletionPending({ dop_completion: { status: 'pending' } })` 为真，`succeeded`、缺失字段为假；将 finalize tests 改为 `checkPrSubmissionReadiness`，它要求 review ring、`archive_done_at` 和新鲜验证，但拒绝已有 `pr_url` 的已提交变更。

```js
assert.equal(isDopCompletionPending({ dop_completion: { status: 'pending' } }), true);
const result = await checkPrSubmissionReadiness({
  sdd: { ring: 'review', validation: readyValidation },
  archive_done_at: '2026-08-24T00:00:00Z',
});
assert.equal(result.allowed, true);
```

- [ ] **步骤 2：运行单元测试确认失败**

运行：`node --test __tests__/unit/lib/sdd-context.test.js __tests__/unit/lib/sdd-validation.test.js`

预期：FAIL；新导出和新 readiness 名称尚不存在。

- [ ] **步骤 3：实现元数据与 readiness API，并同步 OpenCode 副本**

在 `sdd-context.js` 导出纯函数：

```js
export function isDopCompletionPending(meta) {
  return meta?.dop_completion?.status === 'pending';
}
```

用 `checkPrSubmissionReadiness(meta, cwd)` 替换 `checkFinalizeReadiness`：要求 `meta.sdd.ring === 'review'`、`archive_done_at` 存在、`pr_url` 尚不存在，并调用 `checkPrePrReadiness` 使 archive 前的最终校验不能过期。将完全相同的实现复制到 `opencode/lib/` 对应文件。

- [ ] **步骤 4：运行单元测试和副本一致性检查**

运行：

```bash
node --test __tests__/unit/lib/sdd-context.test.js __tests__/unit/lib/sdd-validation.test.js
cmp -s lib/sdd-context.js opencode/lib/sdd-context.js
cmp -s lib/sdd-validation.js opencode/lib/sdd-validation.js
```

预期：全部成功；两个 `cmp` 的退出码均为 0。

- [ ] **步骤 5：提交状态基础设施**

```bash
git add lib/sdd-context.js opencode/lib/sdd-context.js lib/sdd-validation.js opencode/lib/sdd-validation.js __tests__/unit/lib/sdd-context.test.js __tests__/unit/lib/sdd-validation.test.js
git commit -m "feat(sdd): prepare archive delivery before PR" -m "Refs: #68"
```

### 任务 3：将 SessionStart 从 merge/finalize 提醒改为 DOP 补偿提醒

**文件：**
- 修改：`__tests__/integration/session-start.test.js`
- 修改：`hooks/session-start.js`

- [ ] **步骤 1：编写 archive pending intent 的 hook 失败测试**

用现有 `makeStubIam` 与 `runHook` 创建临时项目目录，写入 `openspec/changes/archive/ARD123456/.meta.json`：

```json
{
  "change_id": "ARD123456",
  "dop_completion": { "status": "pending", "prepared_at": "2026-08-24T00:00:00Z" }
}
```

断言 `additionalContext` 含 change-id 与 `--retry-dop`，且不含 `--finalize`、`merge PR` 或 `openspec/specs/ drift`。

- [ ] **步骤 2：运行 hook 集成测试确认失败**

运行：`node --test __tests__/integration/session-start.test.js`

预期：FAIL；当前 hook 只扫描活动 change 的 `pr-created` 状态并输出 `--finalize`。

- [ ] **步骤 3：替换扫描函数和提示文本**

把 `scanUnfinalizedReviews` 改为扫描 `openspec/changes/archive/*/.meta.json` 的 `scanPendingDopCompletions`，使用 `isDopCompletionPending`。提醒只说明“PR 已提交后的 DOP 完成待补偿”，并给出：

```text
/sdd-review --retry-dop <slug>
```

保持扫描失败非阻塞，且不要从 SessionStart 直接执行 `dop change done`、不要调用 GitHub CLI、不要等待 PR 合并。

- [ ] **步骤 4：运行 hook 测试**

运行：`node --test __tests__/integration/session-start.test.js`

预期：PASS；既有认证、超时和 JSON 输出测试保持通过。

- [ ] **步骤 5：提交 hook 改动**

```bash
git add hooks/session-start.js __tests__/integration/session-start.test.js
git commit -m "fix(sdd): remind pending DOP completion after PR submission" -m "Refs: #68"
```

### 任务 4：重写 Ring 5 为 archive-before-PR，并同步所有流程文档

**文件：**
- 修改：`__tests__/integration/sdd-review.test.js`
- 修改：`skills/sdd-review/SKILL.md`
- 修改：`opencode/oms-skills/sdd-review/SKILL.md`
- 修改：`skills/sdd-spec/SKILL.md`
- 修改：`opencode/oms-skills/sdd-spec/SKILL.md`
- 修改：`docs/release/runbook-internal-test-v0.2.md`

- [ ] **步骤 1：先扩展技能集成测试**

在 `sdd-review.test.js` 增加主/镜像文件字节一致性测试，以及流程顺序和禁用项断言：`openspec archive` 必须出现在 `gh pr create` 前，`dop change done <change-id>` 必须出现在其后；文件不得包含 `--finalize`、`gh pr view`、`git checkout main`、`git pull origin main` 或 `git push origin main`。

```js
assert.ok(skill.indexOf('openspec archive <slug>') < skill.indexOf('gh pr create'));
assert.ok(skill.indexOf('gh pr create') < skill.indexOf('dop change done <change-id>'));
assert.doesNotMatch(skill, /--finalize|git push origin main|gh pr view/);
```

- [ ] **步骤 2：运行技能测试确认失败**

运行：`node --test __tests__/integration/sdd-review.test.js`

预期：FAIL；当前 skill 仍含两个阶段和 `--finalize`。

- [ ] **步骤 3：实施单阶段技能文本**

重写两份 `sdd-review`：移除 `--finalize` argument-hint 和阶段 2；在 AI review、严格 validate 后执行 archive、验证 canonical specs、写入并提交 `dop_completion: { status: 'pending', prepared_at, prepared_head }`；推送 Issue 分支并创建同 PR。成功创建 PR 后执行：

```bash
dop change done <change-id>
```

成功输出 PR URL 与 DOP 完成；失败输出 PR URL、失败摘要和 `--retry-dop <slug>`，不撤销 PR、不声称五环完成。`--retry-dop` 只能读取 archive metadata 的 `change_id` 并重试 `done`，不得做 archive、GitHub 审核或 merge 操作。

同步修改 `sdd-spec` 的前置检查和 Issue 模板文案，删除“未 finalize”阻断；更新内部演练 runbook，使第 5 环的期望产物包含 archive、PR URL 和 DOP done，删除旧第 6 环。

- [ ] **步骤 4：运行技能测试并检查镜像**

运行：

```bash
node --test __tests__/integration/sdd-review.test.js
cmp -s skills/sdd-review/SKILL.md opencode/oms-skills/sdd-review/SKILL.md
cmp -s skills/sdd-spec/SKILL.md opencode/oms-skills/sdd-spec/SKILL.md
```

预期：全部成功；主/镜像技能完全一致。

- [ ] **步骤 5：提交流程与文档变更**

```bash
git add skills/sdd-review/SKILL.md opencode/oms-skills/sdd-review/SKILL.md skills/sdd-spec/SKILL.md opencode/oms-skills/sdd-spec/SKILL.md docs/release/runbook-internal-test-v0.2.md __tests__/integration/sdd-review.test.js
git commit -m "refactor(sdd): finish Ring 5 when the atomic PR is submitted" -m "Refs: #68"
```

### 任务 5：完成回归与交付前核验

**文件：**
- 修改：仅在前四项验证发现遗漏时修改对应文件；不得扩展到无关工作流文档。

- [ ] **步骤 1：运行变更范围内的完整测试集**

运行：

```bash
npm test
npm run lint:baseline
```

预期：两个命令均以 0 退出；测试无失败，baseline lint 不报告 token 或 schema 错误。

- [ ] **步骤 2：执行文本回归扫描**

运行：

```bash
rg -n -- '--finalize|git push origin main|PR merge 后' skills/sdd-review opencode/oms-skills/sdd-review skills/sdd-spec opencode/oms-skills/sdd-spec hooks/session-start.js docs/release/runbook-internal-test-v0.2.md
```

预期：无匹配；`rg` 退出码为 1，表示旧流程文本已全部移除。

- [ ] **步骤 3：检查变更完整性与敏感信息**

运行：

```bash
git diff origin/main...HEAD --check
git diff origin/main...HEAD --name-only
git status --short
```

预期：无 whitespace error；文件仅属于本计划的范围；工作树无未提交改动。

- [ ] **步骤 4：更新 Issue 验收证据并提交最终测试修复（若测试暴露问题）**

若前两步揭示了本计划文件范围内的缺陷，先新增复现测试、再作最小修复，重新运行步骤 1–3；提交格式：

```bash
git add <仅本计划范围内的修复文件>
git commit -m "fix(sdd): complete atomic PR delivery checks" -m "Refs: #68"
```

- [ ] **步骤 5：准备 PR 前验收记录**

使用 `gh issue view 68 --repo miniceM/oh-my-sdd --json title,body,state,url` 读取开放 Issue，逐条将验收标准与对应测试命令、输出摘要及人工文本核对记录写入 PR 描述草稿；只有全部达成才创建目标为 `main` 的 PR。
