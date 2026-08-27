# #78 跨宿主 workspace 锁步版本实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将跨宿主企业 SDD 产品包与 OpenCode 原生桥接包迁入 npm workspaces，并通过 Changesets 固定版本组、单一 lockfile 和资源等价校验保证锁步发布。

**架构：** `packages/product` 是唯一的企业 SDD 能力源，保留 Claude、Lingma、KiloCode、OpenCode 四类宿主适配器；`packages/opencode-plugin` 只承载 OpenCode 原生生命周期和从产品包同步得到的交付快照。根目录是私有工作区控制器，负责依赖、测试、版本、发布预检和文档，不再是公开产品包。

**技术栈：** Node.js 18/20/22、npm workspaces、`@changesets/cli@^2.29.7`、Node 内置 `node:test`、TypeScript、GitHub Actions。

---

## 预期文件结构

| 路径 | 职责 |
|---|---|
| `package.json` | 私有 workspace 根、跨包脚本、Changesets 开发依赖 |
| `package-lock.json` | 唯一 npm lockfile，记录两个 workspace 与工具依赖 |
| `packages/product/` | `@cli-tools/oh-my-sdd`：统一 CLI、规则、技能、内容、安装控制平面和四宿主适配器 |
| `packages/product/lib/opencode/` | 非公开 OpenCode 共享资源层：所有权、AGENTS 路径与卸载规则的权威实现 |
| `packages/opencode-plugin/` | `@cli-tools/oh-my-sdd-opencode`：OpenCode 原生插件运行时和产品资源快照 |
| `.changeset/config.json` | 两个公开包的 `fixed` 版本组 |
| `scripts/release-check.mjs` | 版本、插件清单、workspace 和 OpenCode 快照的只读一致性门禁 |
| `scripts/run-tests.js` | 根级测试执行器；调用工作区资源同步而不依赖旧 `opencode/` 位置 |
| `__tests__/helpers/workspace-layout.js` | 根级测试的唯一仓库、产品包、OpenCode 包路径常量 |
| `__tests__/unit/workspace/release-contract.test.js` | 版本、单 lockfile、Changesets、Claude 清单和资源快照契约 |
| `.github/workflows/ci.yml`、`.github/workflows/opencode-e2e.yml` | 用 root npm workspaces 安装、构建、同步和测试 |
| `docs/release/internal-publish-runbook.md`、`docs/release/npm-publish-guide.md` | 当前锁步版本与发布命令；历史归档不修改 |

### 目录迁移清单

```text
.claude-plugin/  install.js  install/  bin/  wrapper/  skills/  content/  hooks/  lib/
  └── git mv → packages/product/

opencode/
  └── git mv → packages/opencode-plugin/

scripts/check-baseline-tokens.mjs
  └── git mv → packages/product/scripts/check-baseline-tokens.mjs

scripts/run-tests.js、scripts/dev-*.sh、scripts/diag-session.sh、scripts/mock-cli.mjs、scripts/{iam,dop}*
  └── 保留根目录；改为从 workspace 路径读取产品与插件位置

__tests__/
  └── 保留根目录作为跨包验收测试；所有指向旧根包或 opencode/ 的导入和 fixture 路径
      改为 __tests__/helpers/workspace-layout.js 导出的路径
```

### 任务 1：先建立 workspace 发布契约的失败测试

**文件：**
- 创建：`__tests__/helpers/workspace-layout.js`
- 创建：`__tests__/unit/workspace/release-contract.test.js`
- 创建：`__tests__/unit/workspace/release-check.test.js`
- 创建：`scripts/release-check.mjs`

- [ ] **步骤 1：编写失败的 layout 与版本契约测试**

```js
// __tests__/unit/workspace/release-contract.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PRODUCT_ROOT = path.join(REPO_ROOT, 'packages', 'product');
const OPENCODE_PLUGIN_ROOT = path.join(REPO_ROOT, 'packages', 'opencode-plugin');

const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('two public workspaces are fixed to one version and use one root lockfile', () => {
  const root = json(`${REPO_ROOT}/package.json`);
  const product = json(`${PRODUCT_ROOT}/package.json`);
  const plugin = json(`${OPENCODE_PLUGIN_ROOT}/package.json`);
  assert.equal(root.private, true);
  assert.deepEqual(root.workspaces, ['packages/*']);
  assert.equal(product.version, plugin.version);
  assert.equal(existsSync(`${PRODUCT_ROOT}/package-lock.json`), false);
  assert.equal(existsSync(`${OPENCODE_PLUGIN_ROOT}/package-lock.json`), false);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/workspace/release-contract.test.js`

预期：FAIL，断言 `packages/product/package.json` 存在失败。

- [ ] **步骤 3：编写 release-check 的失败路径测试**

```js
// __tests__/unit/workspace/release-check.test.js
test('release check reports mismatched OpenCode snapshot as a failure', () => {
  assert.equal(existsSync(join(REPO_ROOT, 'scripts', 'release-check.mjs')), true);
});
```

- [ ] **步骤 4：运行失败路径测试**

运行：`node --test __tests__/unit/workspace/release-check.test.js`

预期：FAIL，断言 `scripts/release-check.mjs` 存在失败。

- [ ] **步骤 5：实现独立、只读的校验器骨架**

```js
// scripts/release-check.mjs
export function checkReleaseContract({ productRoot, opencodeRoot, compareTree }) {
  const errors = [];
  if (!compareTree(join(productRoot, 'skills'), join(opencodeRoot, 'oms-skills'))) {
    errors.push('OpenCode resource snapshot differs: skills -> oms-skills');
  }
  return { ok: errors.length === 0, errors };
}
```

创建模块后，将第二个测试替换为对 `checkReleaseContract` 的直接导入与不一致资源
快照断言：

```js
const result = checkReleaseContract({ productRoot: fixture.productRoot, opencodeRoot: fixture.opencodeRoot, compareTree: () => false });
assert.equal(result.ok, false);
assert.match(result.errors.join('\n'), /OpenCode resource snapshot differs/);
```

校验器还必须读取两个包的 `package.json`、产品包 `.claude-plugin/plugin.json`、产品包
`.claude-plugin/marketplace.json`、根 `.changeset/config.json` 与两个包目录的 lockfile
状态；它收集所有错误后由 CLI 输出到 stderr 并以退出码 1 失败。

- [ ] **步骤 6：运行两个单元测试验证通过**

运行：`node --test __tests__/unit/workspace/release-contract.test.js __tests__/unit/workspace/release-check.test.js`

预期：在任务 2 和任务 3 完成前仍因真实目录未迁移失败；保留失败，禁止为通过测试伪造 fixture。

- [ ] **步骤 7：提交测试与校验器契约**

```bash
git add __tests__/helpers/workspace-layout.js __tests__/unit/workspace scripts/release-check.mjs
git commit -m "test: define workspace release contract" -m "Refs #78"
```

### 任务 2：迁移跨宿主产品包，不改变宿主能力边界

**文件：**
- 创建：`packages/product/package.json`
- 移动：`.claude-plugin/`、`install.js`、`install/`、`bin/`、`wrapper/`、`skills/`、`content/`、`hooks/`、`lib/` → `packages/product/`
- 移动：`scripts/check-baseline-tokens.mjs` → `packages/product/scripts/check-baseline-tokens.mjs`
- 修改：`packages/product/bin/oms.js`、`packages/product/install/main.js`、`packages/product/install/uninstall.js`
- 修改：`__tests__/helpers/workspace-layout.js` 与所有引用旧 `lib/`、`install/`、`hooks/`、`bin/`、`skills/`、`content/`、`wrapper/` 的根级测试

- [ ] **步骤 1：扩展失败测试，证明产品包仍注册四个宿主**

```js
test('product package remains host-neutral and registers every supported host', async () => {
  const { listTools } = await import(`${PRODUCT_ROOT}/install/host-registry.js`);
  assert.deepEqual(listTools(), ['claude', 'lingma', 'opencode', 'kilocode']);
  assert.equal(existsSync(`${PRODUCT_ROOT}/.claude-plugin/plugin.json`), true);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test __tests__/unit/workspace/release-contract.test.js`

预期：FAIL，旧仓库没有 `packages/product`。

- [ ] **步骤 3：使用 git mv 迁移产品资产并建立产品清单**

运行：

```bash
mkdir -p packages/product/scripts
git mv .claude-plugin install.js install bin wrapper skills content hooks lib packages/product/
git mv scripts/check-baseline-tokens.mjs packages/product/scripts/check-baseline-tokens.mjs
```

`packages/product/package.json` 保留现有公开名称、`bin`、`postinstall` 与
`preuninstall`，并设置版本 `0.2.1`；其 `files` 只包含产品自身的发布资产，不能再
携带 OpenCode 的 dist 或脚本。产品构建脚本只校验产品 baseline 与测试，不再执行
OpenCode 编译。

```json
{
  "name": "@cli-tools/oh-my-sdd",
  "version": "0.2.1",
  "type": "module",
  "main": "install.js",
  "scripts": {
    "postinstall": "node install.js",
    "preuninstall": "node install/uninstall.js",
    "lint:baseline": "node scripts/check-baseline-tokens.mjs"
  }
}
```

- [ ] **步骤 4：修正包内路径和根测试路径**

产品运行时代码继续用自身 `import.meta.url` 推导 `PACKAGE_ROOT`，不得引用仓库根。
根测试只能通过 `workspace-layout.js` 获取 `PRODUCT_ROOT`，例如：

```js
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PRODUCT_ROOT = path.join(REPO_ROOT, 'packages', 'product');
export const OPENCODE_PLUGIN_ROOT = path.join(REPO_ROOT, 'packages', 'opencode-plugin');
```

将测试中 `new URL('../../lib/...', import.meta.url)` 等静态导入改为以
`pathToFileURL(join(PRODUCT_ROOT, 'lib', '...')).href` 为目标的动态导入；文件系统
fixture 使用相同常量。不得保留根级产品源目录或 symlink 兼容层。

- [ ] **步骤 5：运行跨宿主产品测试验证通过**

运行：

```bash
node --test __tests__/unit/install __tests__/unit/lib __tests__/unit/hooks \
  __tests__/integration/claude-install.test.js __tests__/integration/install-targets.test.js
```

预期：PASS，且 `listTools()` 仍返回四个宿主。

- [ ] **步骤 6：提交产品包迁移**

```bash
git add packages/product __tests__
git commit -m "refactor: move cross-agent product into workspace" -m "Refs #78"
```

### 任务 3：迁移 OpenCode 原生桥接并将共享能力固定为派生快照

**文件：**
- 移动：`opencode/` → `packages/opencode-plugin/`
- 修改：`packages/opencode-plugin/package.json`
- 修改：`packages/opencode-plugin/scripts/copy-resources.mjs`
- 修改：`packages/opencode-plugin/scripts/postinstall.mjs`
- 修改：`packages/product/install/hosts/opencode-adapter.js`
- 创建：`packages/product/lib/opencode/ownership.js`
- 创建：`packages/product/lib/opencode/agents.js`
- 创建：`packages/product/lib/opencode/uninstall.js`
- 修改：`__tests__/unit/opencode/resource-scripts.test.js`
- 修改：`__tests__/integration/opencode/clean-pack.test.js`
- 修改：`__tests__/integration/opencode/concurrent-pack.test.js`
- 修改：`__tests__/integration/opencode/install.test.js`
- 修改：`__tests__/helpers/opencode-e2e-harness.js`
- 修改：`__tests__/helpers/opencode-test-env.js`

- [ ] **步骤 1：将资源同步测试改为要求产品包是唯一来源**

```js
test('sync copies canonical product resources into every OpenCode delivery layout', () => {
  main({ rootDir: PRODUCT_ROOT, opencodeDir: OPENCODE_PLUGIN_ROOT, report: () => {} });
  assert.equal(treeDigest(join(PRODUCT_ROOT, 'skills')), treeDigest(join(OPENCODE_PLUGIN_ROOT, 'oms-skills')));
  assert.equal(treeDigest(join(PRODUCT_ROOT, 'lib')), treeDigest(join(OPENCODE_PLUGIN_ROOT, 'lib')));
});
```

- [ ] **步骤 2：运行资源同步测试验证失败**

运行：`node --test __tests__/unit/opencode/resource-scripts.test.js`

预期：FAIL，旧同步脚本把 `opencode/` 的父目录误认为产品根。

- [ ] **步骤 3：先提取产品内 OpenCode 共享资源层**

将产品适配器当前直接导入的 OpenCode `resource-ownership.mjs`、`agents-md.mjs` 与
`uninstall.mjs` 中的可复用资源所有权、AGENTS 路径、资源清理逻辑提取为：

```text
packages/product/lib/opencode/ownership.js
packages/product/lib/opencode/agents.js
packages/product/lib/opencode/uninstall.js
```

产品 `install/hosts/opencode-adapter.js` 只能导入这些产品内模块。插件 lifecycle 脚本
导入本地 `lib/opencode/` 副本；该副本由后续同步生成，不能从产品包或仓库使用跨包相对
路径。为每个导出函数先写单元测试，覆盖所有权清单读取、用户修改资源保护、AGENTS
路径和卸载边界。

- [ ] **步骤 4：移动插件并修正同步根路径**

运行：`git mv opencode packages/opencode-plugin`

将 `copy-resources.mjs` 中的源根从插件父目录改为插件相邻的
`packages/product`，并保留当前的原子复制、并发锁、Windows 重命名重试和
`.opencode/commands → .agents/command` 镜像。同步映射必须仍覆盖：

```js
const SYNC_MAP = [
  ['skills', 'skills'], ['skills', 'oms-skills'], ['skills', '.opencode/skills'],
  ['skills', '.agents/skills'], ['content', 'content'], ['hooks', 'hooks'], ['lib', 'lib'],
];
```

`prepack` 继续调用 `sync:resources`，以确保 npm tarball 包含派生快照；`postinstall`
继续调用 OpenCode 自身 bootstrap 和 ownership 逻辑。它们不得从已安装用户目录回读
产品包，也不得把资源同步失败降级为成功。

- [ ] **步骤 5：修正产品的 OpenCode 安装适配器**

产品适配器仍以 `@cli-tools/oh-my-sdd-opencode` 注册 npm 插件，但不再查找
`product/opencode/dist` 或调用旧 `build:opencode`。开发期构建改为根工作区命令：

```js
const args = ['run', 'build', '--workspace=@cli-tools/oh-my-sdd-opencode'];
execFileSync(npmCmd, args, { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
```

只在开发安装流程确实需要未编译插件时执行这条路径；已发布产品安装必须注册已发布的
OpenCode npm 插件，不在用户机器编译 TypeScript。

- [ ] **步骤 6：运行 OpenCode 单元与打包回归测试验证通过**

运行：

```bash
npm run sync:resources --workspace=@cli-tools/oh-my-sdd-opencode
npm run build --workspace=@cli-tools/oh-my-sdd-opencode
node --test __tests__/unit/opencode __tests__/integration/opencode/clean-pack.test.js \
  __tests__/integration/opencode/concurrent-pack.test.js __tests__/integration/opencode/install.test.js
```

预期：PASS；并发 `npm pack` 无残留 staging/lock 目录，资源不漂移。

- [ ] **步骤 7：提交 OpenCode 桥接迁移**

```bash
git add packages/opencode-plugin packages/product/install/hosts/opencode-adapter.js __tests__
git commit -m "refactor: isolate OpenCode native plugin workspace" -m "Refs #78"
```

### 任务 4：建立 npm workspaces、Changesets 与唯一 lockfile

**文件：**
- 修改：`package.json`
- 修改：`package-lock.json`
- 删除：`packages/product/package-lock.json`
- 删除：`packages/opencode-plugin/package-lock.json`
- 创建：`.changeset/config.json`
- 创建：`.changeset/issue-78-workspace-versioning.md`
- 修改：`scripts/release-check.mjs`
- 修改：`__tests__/unit/workspace/release-contract.test.js`

- [ ] **步骤 1：补充 Changesets 固定组的失败断言**

```js
test('Changesets fixes product and OpenCode bridge to one release version', () => {
  const config = json(`${REPO_ROOT}/.changeset/config.json`);
  assert.deepEqual(config.fixed, [[
    '@cli-tools/oh-my-sdd',
    '@cli-tools/oh-my-sdd-opencode',
  ]]);
});
```

- [ ] **步骤 2：运行版本契约测试验证失败**

运行：`node --test __tests__/unit/workspace/release-contract.test.js`

预期：FAIL，根 package manifest 尚非 private workspace 且 Changesets 配置不存在。

- [ ] **步骤 3：替换根 manifest 并初始化固定版本组**

根 `package.json` 必须移除公开 `name`、`version`、`main`、`bin`、`files`、安装生命周期；
保留仓库测试与开发脚本，并写入：

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "devDependencies": { "@changesets/cli": "^2.29.7" },
  "scripts": {
    "test": "node scripts/run-tests.js",
    "release:check": "node scripts/release-check.mjs",
    "release:version": "changeset version",
    "build": "npm run lint:baseline --workspace=@cli-tools/oh-my-sdd && npm run build --workspace=@cli-tools/oh-my-sdd-opencode"
  }
}
```

创建 `.changeset/config.json`：

```json
{
  "changelog": false,
  "commit": false,
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "fixed": [["@cli-tools/oh-my-sdd", "@cli-tools/oh-my-sdd-opencode"]],
  "linked": [],
  "ignore": []
}
```

创建本迁移的 minor Changeset，指定 `@cli-tools/oh-my-sdd: minor`；固定组会使两个包
同时升至同一版本。不要手工运行 `changeset version` 到工作树，避免本 Issue 同时包含
迁移实现和已准备发布的版本提交。

- [ ] **步骤 4：生成单一 lockfile并移除子包 lockfile**

运行：

```bash
git rm packages/product/package-lock.json packages/opencode-plugin/package-lock.json
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
```

预期：根 `package-lock.json` 包含两个 `packages/*` workspace 条目；两个包目录不再有
lockfile；Node 18 能安装 `@changesets/cli@^2.29.7`。

- [ ] **步骤 5：完成 release-check 并运行契约测试**

运行：

```bash
node --test __tests__/unit/workspace/release-contract.test.js __tests__/unit/workspace/release-check.test.js
npm run release:check
```

预期：PASS；临时改写任一版本或派生资源文件时测试和 `release:check` 都非零退出，恢复
文件后重新通过。

- [ ] **步骤 6：提交版本治理**

```bash
git add package.json package-lock.json .changeset scripts/release-check.mjs __tests__/unit/workspace
git add -u packages/product packages/opencode-plugin
git commit -m "build: manage package versions with workspaces" -m "Refs #78"
```

### 任务 5：统一根级脚本、CI 与当前发布文档

**文件：**
- 修改：`scripts/run-tests.js`
- 修改：`scripts/dev-reinstall.sh`
- 修改：`scripts/diag-session.sh`
- 修改：`scripts/dev-launch-claude.sh`
- 修改：`.github/workflows/ci.yml`
- 修改：`.github/workflows/opencode-e2e.yml`
- 修改：`README.md`
- 修改：`docs/release/internal-publish-runbook.md`
- 修改：`docs/release/npm-publish-guide.md`

- [ ] **步骤 1：为根脚本写失败测试，禁止旧目录与硬编码版本**

```js
test('development scripts resolve the product version and workspace paths dynamically', () => {
  for (const file of ['scripts/dev-reinstall.sh', 'scripts/diag-session.sh']) {
    const source = readFileSync(join(REPO_ROOT, file), 'utf8');
    assert.doesNotMatch(source, /0\.1\.0/);
    assert.match(source, /packages\/product|workspace/);
  }
});
```

- [ ] **步骤 2：运行脚本测试验证失败**

运行：`node --test __tests__/unit/workspace/release-contract.test.js`

预期：FAIL，旧脚本含 `0.1.0` 与旧根包路径。

- [ ] **步骤 3：实现工作区命令和动态路径解析**

`run-tests.js` 保持根测试发现逻辑，但把同步脚本改为：

```js
const OPENCODE_RESOURCE_SYNC_SCRIPT = path.join(
  PROJECT_ROOT, 'packages', 'opencode-plugin', 'scripts', 'copy-resources.mjs',
);
```

开发脚本通过 `node -p "require('./packages/product/package.json').version"` 读取版本；
开发打包使用 `npm pack --workspace=@cli-tools/oh-my-sdd`，缓存诊断路径由该值拼接，不能
重新写入固定版本。CI 使用一次 `npm ci --ignore-scripts`，随后：

```yaml
- run: npm run build --workspace=@cli-tools/oh-my-sdd-opencode
- run: npm run sync:resources --workspace=@cli-tools/oh-my-sdd-opencode
- run: npm test
- run: npm run release:check
```

OpenCode E2E workflow 用相同工作区命令，保留原有矩阵、mock PATH 和失败时 artifact。

- [ ] **步骤 4：更新当前文档，不修改历史归档**

README 与两个 `docs/release/` 当前文档必须说明：产品包覆盖 Claude、Lingma、
KiloCode、OpenCode；OpenCode 包是原生桥接而非第二套能力源；两个包由 Changesets
固定组同步版本和发布。删除“版本独立管理”说法，替换旧 `opencode/` 开发命令为工作区
命令。不得编辑 `docs/archive/`。

- [ ] **步骤 5：运行脚本、CI 等价与文档边界测试**

运行：

```bash
node --test __tests__/unit/scripts __tests__/unit/workspace
rg -n '版本号独立管理|cd opencode|--prefix opencode' README.md scripts .github docs/release
git diff -- docs/archive
```

预期：测试 PASS；前两个命令不输出旧工作区指令；第三个命令无输出。当前发布文档中的
历史版本记录可以保留，但必须与迁移后的锁步发布说明清楚分隔。

- [ ] **步骤 6：提交编排与文档更新**

```bash
git add scripts .github README.md docs/release __tests__/unit/workspace
git commit -m "ci: run release checks through npm workspaces" -m "Refs #78"
```

### 任务 6：执行完整验证并留存 Issue 验收证据

**文件：**
- 修改：`docs/release/internal-publish-runbook.md`（仅填入可重复的验证命令说明）
- 不创建发布 tag、npm 发布记录或临时试验文件

- [ ] **步骤 1：运行全量构建与测试**

运行：

```bash
npm ci --ignore-scripts
npm run build
npm test
npm run test:coverage
npm run release:check
```

预期：全部退出码 0；覆盖率仍达到项目的 80% 门禁。

- [ ] **步骤 2：在干净缓存中验证两个独立 tarball**

运行：

```bash
npm pack --dry-run --json --workspace=@cli-tools/oh-my-sdd --cache /private/tmp/oms-product-pack
npm pack --dry-run --json --workspace=@cli-tools/oh-my-sdd-opencode --cache /private/tmp/oms-opencode-pack
```

预期：第一个 tarball 含四宿主产品控制平面与 Claude 适配资源，不含 OpenCode 原生
插件 dist；第二个 tarball 含 OpenCode `dist`、命令、生命周期脚本与从产品包同步的快照。

- [ ] **步骤 3：验证 Changesets 固定组的版本计算（隔离副本）**

运行：

```bash
trial_dir=$(mktemp -d)
git archive --format=tar HEAD | tar -x -C "$trial_dir"
cd "$trial_dir"
npm ci --ignore-scripts
npx changeset version
node -e "const fs=require('fs'); const a=require('./packages/product/package.json'); const b=require('./packages/opencode-plugin/package.json'); if (a.version !== b.version) process.exit(1);"
```

预期：退出码 0，两个版本相等；试验只发生在临时目录，原工作树的 package manifest 与
lockfile 没有版本计算副作用。

- [ ] **步骤 4：执行格式与敏感内容门禁**

运行：

```bash
git diff --check origin/main...HEAD
git status --short
git diff --cached --check
```

预期：无空白错误；仅 #78 范围文件处于变更或暂存状态；暂存区无敏感文件。

- [ ] **步骤 5：提交最终验证与准备 PR 证据**

```bash
git add docs/release/internal-publish-runbook.md
git commit -m "test: verify lockstep workspace release" -m "Refs #78"
```

在创建 PR 前，使用 `gh issue view 78 --repo miniceM/oh-my-sdd --json title,body,state,url`
逐项勾验 Issue checklist，并把上述命令、退出码和 tarball 人工检查结果逐条写入 PR 的
“验收标准核验”章节。任何一项失败、证据缺失或 Issue 非 OPEN 都停止，不创建 PR。

## 计划自检

- 规格覆盖：产品跨宿主语义由任务 2 验证；OpenCode 原生桥接与派生资源由任务 3 验证；
  单 lockfile、固定版本组与版本同值由任务 4 验证；脚本、CI、文档由任务 5 验证；
  打包和隔离版控试验由任务 6 验证。
- 占位符：计划没有未决步骤；每个写代码的步骤均给出目标文件、命令或最小代码契约。
- 类型与名称：统一使用 `PRODUCT_ROOT`、`OPENCODE_PLUGIN_ROOT`、`checkReleaseContract`
  和公开包名，后续任务不重命名这些接口。
