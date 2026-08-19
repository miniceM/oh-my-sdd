# Issue 42 OpenCode 打包 CI 契约实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（- [ ]）语法来跟踪进度。

**目标：** 将 OpenCode 的源码构建、npm 打包和隔离 tarball 安装拆成显式 CI 门禁，消除干净环境下的隐式 devDependencies 依赖，并让 Windows/npm 输出差异在 CI 中直接暴露。

**架构：** prepack 只同步发布资源；prepublishOnly 和 CI 显式执行 TypeScript 构建。CI 先用锁文件安装依赖并构建，再在生命周期脚本开启且不静默的条件下生成 tarball，最后只安装 tarball 到隔离 HOME/prefix/cache。测试代码不再在 E2E 中隐式安装 OpenCode 依赖。

**技术栈：** Node.js 内置测试运行器、npm lifecycle、GitHub Actions 矩阵、OpenCode tarball E2E。

---

### 任务 1：锁定 OpenCode 发布生命周期边界

**文件：**
- 修改：opencode/package.json:29-35
- 测试：__tests__/unit/opencode/package-json.test.js

- [ ] **步骤 1：编写失败的测试**

在 package-json.test.js 增加一个测试，读取 pkg.scripts 并断言：

~~~js
test('package lifecycle separates pack sync from publish build', () => {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  assert.equal(pkg.scripts.build, 'tsc');
  assert.equal(pkg.scripts.prepack, 'npm run sync:resources');
  assert.equal(pkg.scripts.prepublishOnly, 'npm run sync:resources && npm run build');
});
~~~

- [ ] **步骤 2：运行测试验证失败**

运行：

~~~bash
node --test __tests__/unit/opencode/package-json.test.js
~~~

预期：FAIL，当前 prepack 仍包含 npm run build。

- [ ] **步骤 3：编写最少实现代码**

将 opencode/package.json 的 scripts 调整为：

~~~json
"build": "tsc",
"typecheck": "tsc --noEmit",
"sync:resources": "node scripts/copy-resources.mjs",
"postinstall": "node scripts/postinstall.mjs",
"prepack": "npm run sync:resources",
"prepublishOnly": "npm run sync:resources && npm run build"
~~~

- [ ] **步骤 4：运行测试验证通过**

运行：

~~~bash
node --test __tests__/unit/opencode/package-json.test.js
~~~

预期：PASS。

- [ ] **步骤 5：Commit**

~~~bash
git add opencode/package.json __tests__/unit/opencode/package-json.test.js
git commit -m "fix(opencode): separate pack sync from publish build" -m "Refs #42"
~~~

### 任务 2：建立显式构建门禁并移除 E2E 隐式安装

**文件：**
- 修改：.github/workflows/ci.yml
- 修改：.github/workflows/opencode-e2e.yml
- 修改：__tests__/integration/opencode/real-cli-e2e.test.js:160-185
- 测试：__tests__/unit/install/ci-contract.test.js
- 测试：__tests__/unit/opencode/e2e-harness.test.js

- [ ] **步骤 1：编写失败的测试**

在 CI contract tests 中增加断言：

~~~js
test('CI builds OpenCode explicitly after installing its locked dependencies', () => {
  const testJob = workflow.slice(workflow.indexOf('  test:'), workflow.indexOf('  coverage:'));
  const coverageJob = workflow.slice(workflow.indexOf('  coverage:'), workflow.indexOf('  smoke-check:'));
  assert.match(testJob, /npm ci --ignore-scripts/);
  assert.match(testJob, /npm run --prefix opencode build/);
  assert.match(coverageJob, /npm ci --ignore-scripts/);
  assert.match(coverageJob, /npm run --prefix opencode build/);
});
~~~

在 OpenCode E2E workflow contract 中增加同样的显式 build 断言，并断言 workflow 负责安装依赖。测试不再接受 real-cli-e2e.test.js 内部执行 npm ci --prefix opencode 的隐藏安装路径。

- [ ] **步骤 2：运行测试验证失败**

运行：

~~~bash
node --test __tests__/unit/install/ci-contract.test.js __tests__/unit/opencode/e2e-harness.test.js
~~~

预期：FAIL，当前 CI 没有显式 build contract；当前 E2E 测试仍在测试体内安装 OpenCode 依赖。

- [ ] **步骤 3：编写最少实现代码**

对 .github/workflows/ci.yml 的 test、coverage job：

~~~yaml
- run: npm ci --ignore-scripts
- run: npm ci --prefix opencode --ignore-scripts
- run: npm run --prefix opencode build
~~~

对 .github/workflows/opencode-e2e.yml：

~~~yaml
- run: npm ci --ignore-scripts
- run: npm ci --prefix opencode --ignore-scripts
- run: npm run --prefix opencode build
- run: npm run sync:resources --prefix opencode
~~~

删除 real-cli-e2e.test.js 中测试体内的 execNpm(['ci', '--prefix', 'opencode'], ...)；让 workflow 成为唯一的依赖安装和构建入口，保留 pack/install 的隔离 HOME、prefix、cache 和 stdout/stderr 诊断。

- [ ] **步骤 4：运行测试验证通过**

运行：

~~~bash
node --test __tests__/unit/install/ci-contract.test.js __tests__/unit/opencode/e2e-harness.test.js
~~~

预期：PASS。

- [ ] **步骤 5：Commit**

~~~bash
git add .github/workflows/ci.yml .github/workflows/opencode-e2e.yml __tests__/unit/install/ci-contract.test.js __tests__/unit/opencode/e2e-harness.test.js __tests__/integration/opencode/real-cli-e2e.test.js
git commit -m "test(opencode): make CI build and pack gates explicit" -m "Refs #42"
~~~

### 任务 3：验证干净 tarball 契约与完整回归

**文件：**
- 创建：__tests__/integration/opencode/clean-pack.test.js
- 参考：__tests__/helpers/opencode-e2e-harness.js
- 参考：__tests__/helpers/resolve-npm-cli.js

- [ ] **步骤 1：编写失败的 clean-pack 回归测试**

在隔离临时目录验证打包命令不依赖当前 worktree 的 opencode/node_modules：复制 skills、content、hooks、lib、opencode 到临时 repository，删除复制结果中的 opencode/node_modules，使用复制的 dist 执行启用 lifecycle 的 npm pack --json，并通过共享 parser 读取 stdout/stderr。

测试必须断言：

~~~js
assert.equal(result.status, 0);
const manifest = parseNpmPackJson(result.stdout, result.stderr);
assert.ok(firstNpmPackEntry(manifest).filename.endsWith('.tgz'));
~~~

在当前实现上先运行该测试；预期在 prepack 仍执行 build 且临时目录没有 devDependencies 时失败。

- [ ] **步骤 2：运行测试验证失败**

运行：

~~~bash
node --test __tests__/integration/opencode/install.test.js
~~~

预期：新增 clean-pack 场景在当前 prepack 行为下暴露 tsc 依赖缺失，现有安装/卸载用例保持可见。

- [ ] **步骤 3：编写最少实现代码**

任务 1 的生命周期边界应使 clean-pack 只执行资源同步，不再加载 TypeScript/devDependencies；任务 2 的显式 build gate 保证 CI 在 pack 前仍验证源码构建。clean-pack.test.js 只调用共享 parser，不得新增私有 manifest parser。

- [ ] **步骤 4：运行分层验证**

依次运行：

~~~bash
npm run --prefix opencode build
node --test __tests__/unit/opencode/package-json.test.js __tests__/unit/opencode/e2e-harness.test.js __tests__/unit/install/ci-contract.test.js
node --test __tests__/integration/opencode/concurrent-pack.test.js __tests__/integration/opencode/install.test.js
npm test
npm run test:coverage
npm run lint:baseline
git diff --check
~~~

预期：所有命令成功；本机未启用的真实 OpenCode CLI 测试只允许按既有 skip 条件跳过，不能新增 skip。

- [ ] **步骤 5：Commit**

~~~bash
git add __tests__/integration/opencode/clean-pack.test.js __tests__/unit/opencode/package-json.test.js __tests__/unit/opencode/e2e-harness.test.js __tests__/unit/install/ci-contract.test.js .github/workflows/ci.yml .github/workflows/opencode-e2e.yml opencode/package.json
git commit -m "fix(opencode): make clean tarball validation hermetic" -m "Closes #42"
~~~

### 任务 4：提交前审查与 PR

**文件：**
- 检查：本计划涉及的全部变更

- [ ] **步骤 1：检查范围和敏感文件**

运行：

~~~bash
git status --short
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD
~~~

确认只包含 Issue #42 的设计、生命周期、CI、测试变更，不包含 node_modules、临时 tarball、用户配置或其他工作区改动。

- [ ] **步骤 2：请求代码审查**

基于 origin/main 与当前 HEAD 审查，重点检查：

- prepack 是否仍依赖 devDependencies
- CI 是否显式 build
- 主 pack/install 路径是否关闭了 --silent/--ignore-scripts
- Windows 失败是否保留 stdout/stderr 诊断
- 测试是否真正使用 tarball 而不是源码

- [ ] **步骤 3：推送并创建 PR**

~~~bash
git push -u origin fix/issue-42-opencode-packaging
gh pr create --draft --base main --head fix/issue-42-opencode-packaging --title "fix(opencode): make packaging CI gates hermetic" --body-file <pr-body-file>
~~~

PR body 必须包含变更范围、根因、验证命令、已知限制，并关联 Closes #42。
