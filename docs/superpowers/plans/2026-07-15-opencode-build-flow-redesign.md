# opencode plugin 编译流程重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `oms-install --tool opencode` 在用户机器上零编译——开发者/CI 编译 dist，`npm pack` 只 ship `opencode/dist/`，install 流程直接复制 dist 到 home。

**Architecture:** 三段职责分离——dev 阶段用 tsc 编译 `opencode/src/plugin.ts` → `opencode/dist/plugin.js`，dist 进 git；publish 阶段用 `prepublishOnly` 强制 rebuild 一次；install 阶段只复制 dist 到 `~/.config/opencode/plugins/oh-my-sdd/`。`install-opencode.js` 的 `compile()` / `buildOpenCodePlugin()` 整段删除，依赖 `prepublishOnly` + CI build step 保证 dist 总是最新。

**Tech Stack:** Node.js ESM, TypeScript 5.5, `tsc` (pure ESM + Node stdlib output), npm lifecycle scripts, GitHub Actions (multi-OS matrix ubuntu/macos/windows).

## Global Constraints

**[OMSBUILD] 项目全局约束**（每个 task 隐式包含）：

- **change-id**: `[OMSBUILD]` — 所有 commit message 必含此前缀
- **提交规范**（HARD_RULE, baseline）: `[<change-id>] <type>: <subject>`，type 限 `feat` / `fix` / `docs` / `refactor` / `test` / `chore` + SDD 环 `spec` / `plan` / `task` / `review`
- **不 ship 死代码**: `package.json` `files` 数组精确到 `opencode/dist/`，**绝不**含 `opencode/src/` / `opencode/`
- **跨 OS 兼容**: `opencode/dist/plugin.js` 是纯 ESM + Node stdlib，无 native binding，无 `os` / `cpu` 特定代码。开发者本地 build 的 dist 必须在 macOS / Linux / Windows 上等价可跑
- **强约束**: `prepublishOnly` = `cd opencode && npm ci --include=dev && npm run build`，npm publish 前必跑，失败则 publish 终止
- **CI 验证**: `.github/workflows/ci.yml` `test` job 必含 `working-directory: opencode` 的 build step（multi-OS matrix 已存在）
- **身份声明**（HARD_RULE, baseline）: 协同时以"企业 SDD Agent"自报
- **密钥/凭据**（HARD_RULE, baseline）: 禁止硬编码 AK/SK/token/密码/.env/私钥
- **越权命令**（HARD_RULE, baseline）: `rm -rf /`、`git push --force` 到 main 等破坏性命令必须先确认
- **测试覆盖**（baseline）: 所有改动必加 test，coverage ≥ 70%
- **TDD 顺序**: test 先写并 RED → 改代码 → GREEN，再 commit
- **commit message** Co-Authored-By 行: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- **prior session working tree 残留不混**: 6 个 test 文件（`__tests__/integration/{git-pre-commit,git-pre-push,oms-git-hooks-install,session-end}.test.js`、`__tests__/unit/{git-diff,hook-utils}.test.js`）+ `opencode/dist/` 属于 prior session 残留，**不 add** 进本 change 的任何 commit

---

## File Structure

| 文件 | 职责 | 状态 |
|---|---|---|
| `package.json` | npm publish 配置 (`files` + `scripts.prepublishOnly`) | Modify: lines 22-32 (`files` 数组), lines ~30-40 (`scripts`) |
| `hooks/lib/install-opencode.js` | OpenCode install/uninstall 实现（删 build 流程） | Modify: lines 8 (注释), 20 (imports), 83-159 (删 `compile` / `buildOpenCodePlugin` / 调用) |
| `opencode/package.json` | OpenCode plugin 子包配置（删 dead devDeps） | Modify: devDeps 段 |
| `.github/workflows/ci.yml` | CI workflow（加 build step） | Modify: `test` job 加 step |
| `__tests__/unit/package-files.test.js` | package files 白名单回归测试（加 2 个 test case） | Modify: 追加 test 5 + test 6 |
| `__tests__/unit/install-opencode-build-flow.test.js` | install-opencode.js 删 build 后的结构断言（防回退） | Create: 3-4 个 test case |

**新文件**: `__tests__/unit/install-opencode-build-flow.test.js` — 防止有人重新加回 `compile()` 或 `buildOpenCodePlugin()`

---

## Task 1: TDD 改 `package.json` `files` + `prepublishOnly` + 加 test case

**Files:**
- Modify: `package.json:22-32` (`files` 数组), `package.json:scripts` 段
- Modify: `__tests__/unit/package-files.test.js` (追加 test 5 + test 6)

**Interfaces:**
- Consumes: 无（首个 task）
- Produces: `package.json` `files` 数组含 `"opencode/dist/"`、不含 `"opencode/src/"` 或 `"opencode/"`；`scripts.prepublishOnly` = `"cd opencode && npm ci --include=dev && npm run build"`

- [ ] **Step 1: 在 `__tests__/unit/package-files.test.js` 追加 2 个新 test case (RED)**

打开 `__tests__/unit/package-files.test.js`，在 `test 4` 之后追加：

```js
test('package.json files whitelist contains opencode/dist/ (exact path, not opencode/)', () => {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files), 'package.json must have a "files" array');
  assert.ok(
    pkg.files.includes('opencode/dist/'),
    'files must include "opencode/dist/" (exact path) so tarball ships the build artifact'
  );
  assert.ok(
    !pkg.files.includes('opencode/') && !pkg.files.includes('opencode/src/'),
    'files must NOT include "opencode/" or "opencode/src/" — only the exact "opencode/dist/" path'
  );
});

test('package.json scripts has prepublishOnly hook for opencode build', () => {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts, 'package.json must have a "scripts" object');
  assert.equal(
    pkg.scripts.prepublishOnly,
    'cd opencode && npm ci --include=dev && npm run build',
    'prepublishOnly must force opencode build before npm publish'
  );
});
```

- [ ] **Step 2: 跑新 test 确认 RED**

Run: `npm test -- --test-name-pattern="package.json files whitelist contains opencode/dist/|prepublishOnly hook"`

Expected: 2 个 fail（因为 `package.json` 还没改）:
```
not ok 5 - package.json files whitelist contains opencode/dist/ (exact path, not opencode/)
not ok 6 - package.json scripts has prepublishOnly hook for opencode build
```

- [ ] **Step 3: 改 `package.json` `files` 数组**

打开 `package.json`，找到 `files` 数组，**精确**改 line 31:

```diff
   "files": [
     ".claude-plugin/",
     "install.js",
     "uninstall.js",
     "bin/",
     "wrappers/",
     "skills/",
     "content/",
     "hooks/",
     "baseline/",
-    "opencode/"
+    "opencode/dist/"
     "README.md"
   ],
```

注意：**只**把 `"opencode/"` 改成 `"opencode/dist/"`，不要改成 `"opencode/dist"`（无末尾斜杠）或加 `opencode/src/`。

- [ ] **Step 4: 改 `package.json` `scripts` 加 `prepublishOnly`**

找到 `package.json` 的 `"scripts"` 段（如果不存在则新增），在任意位置（推荐放在已有 scripts 后面）插入：

```diff
   "scripts": {
+    "prepublishOnly": "cd opencode && npm ci --include=dev && npm run build"
   },
```

如果 `scripts` 段已有别的键，**保留**它们，只加 `prepublishOnly` 一行（按 JSON 风格加逗号）：

```json
  "scripts": {
    "test": "node --test __tests__/unit/*.test.js",
    "prepublishOnly": "cd opencode && npm ci --include=dev && npm run build"
  },
```

- [ ] **Step 5: 跑新 test 确认 GREEN**

Run: `npm test -- --test-name-pattern="package.json files whitelist contains opencode/dist/|prepublishOnly hook"`

Expected: 2 个 pass:
```
ok 5 - package.json files whitelist contains opencode/dist/ (exact path, not opencode/)
ok 6 - package.json scripts has prepublishOnly hook for opencode build
```

- [ ] **Step 6: 跑全套 `npm test` 确认无回归**

Run: `npm test`

Expected: 271/271 全过（269 旧 + 2 新）。

- [ ] **Step 7: Commit**

```bash
cd /Users/hosea/work/git/oh-my-sdd
git add package.json __tests__/unit/package-files.test.js
git status --short
# 确认只 add 了 2 个文件，没有 prior session 残留（6 个 test modified + opencode/dist/）
git commit -m "$(cat <<'EOF'
[OMSBUILD] fix(pkg): ship opencode/dist/ only + prepublishOnly hook

TDD: 加 2 个 test case（files 含 opencode/dist/ 不含 opencode/src/ + prepublishOnly
hook 存在），RED 确认 fail，改 package.json 后 GREEN。

约束：
- "不 ship 死代码" — files 精确到 opencode/dist/，不 ship 整 opencode/ 目录
- "强约束" — prepublishOnly = cd opencode && npm ci --include=dev && npm run build，
  npm publish 前必 build，失败 publish 终止

这步是 dev → publish 链条的入口：dist 必须随 tarball ship，且 publish 前 dist
必须是最新 build 产物。后续 task 删 install-opencode.js 的 compile 流程、
改 opencode/devDeps、加 CI build step。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 删 `install-opencode.js` 编译流程

**Files:**
- Modify: `hooks/lib/install-opencode.js:8` (注释), `:20` (imports), `:83-132` (函数体), `:158` (调用)
- Create: `__tests__/unit/install-opencode-build-flow.test.js` (3-4 个 test case 防回退)

**Interfaces:**
- Consumes: Task 1 已 fix `package.json` `files` 数组 → tarball 不含 `opencode/src/`
- Produces: `install-opencode.js` 不再含 `compile()` / `buildOpenCodePlugin()` 函数，不 import `node:child_process` 的 `spawn`，main 流程不调 build 流程

- [ ] **Step 1: 写防回退 test (RED)**

创建 `__tests__/unit/install-opencode-build-flow.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INSTALL_FILE = path.resolve(__dirname, '..', '..', 'hooks', 'lib', 'install-opencode.js');

test('install-opencode.js does not import spawn from node:child_process (no compile process)', () => {
  const src = readFileSync(INSTALL_FILE, 'utf8');
  // accept "node:child_process" import only if it doesn't destructure 'spawn'
  const cpImport = src.match(/import\s*\{[^}]*\}\s*from\s*['"]node:child_process['"]/);
  if (cpImport) {
    assert.ok(
      !/spawn/.test(cpImport[0]),
      'import { ... } from "node:child_process" must not include "spawn" — no compile process needed'
    );
  }
  // also check top-level spawn reference (e.g. default-style or destructured elsewhere)
  assert.ok(
    !/^\s*spawn\s*\(/m.test(src),
    'install-opencode.js must not call spawn(...) — compile process removed'
  );
});

test('install-opencode.js does not define compile() or buildOpenCodePlugin() functions', () => {
  const src = readFileSync(INSTALL_FILE, 'utf8');
  assert.ok(
    !/function\s+compile\s*\(/.test(src) && !/const\s+compile\s*=/.test(src),
    'install-opencode.js must not define compile() function'
  );
  assert.ok(
    !/function\s+buildOpenCodePlugin\s*\(/.test(src) && !/const\s+buildOpenCodePlugin\s*=/.test(src),
    'install-opencode.js must not define buildOpenCodePlugin() function'
  );
});

test('install-opencode.js main flow does not call buildOpenCodePlugin', () => {
  const src = readFileSync(INSTALL_FILE, 'utf8');
  // main flow is installForOpenCode function — search for buildOpenCodePlugin references
  assert.ok(
    !/buildOpenCodePlugin\s*\(/.test(src),
    'install-opencode.js must not call buildOpenCodePlugin(...) — build is publisher concern, not installer'
  );
});
```

- [ ] **Step 2: 跑新 test 确认 RED (编译流程仍在)**

Run: `npm test -- --test-name-pattern="install-opencode.js does not import spawn|does not define compile|main flow does not call buildOpenCodePlugin"`

Expected: 3 个 fail（编译流程还没删）:
```
not ok 1 - install-opencode.js does not import spawn from node:child_process
not ok 2 - install-opencode.js does not define compile() or buildOpenCodePlugin() functions
not ok 3 - install-opencode.js main flow does not call buildOpenCodePlugin
```

- [ ] **Step 3: 改 `install-opencode.js` 顶部注释**

打开 `hooks/lib/install-opencode.js`，line 8-9 的注释块，改成：

```js
// OpenCode 路径特有逻辑：
//   1. skills 复制到 ~/.config/opencode/skills/
//   2. baseline 注入到 ~/.config/opencode/AGENTS.md（哨兵块追加，保留用户内容）
//   3. 复制 ship 的 dist/plugin.js 到 ~/.config/opencode/plugins/oh-my-sdd/
//      （dist 是开发者/CI 编译产物，由 prepublishOnly + CI 保证最新；用户机器零编译）
//   4. 写入哨兵文件 ~/.oh-my-sdd/baseline-opencode.sentinel
```

- [ ] **Step 4: 删 `import { spawn }`**

打开 `hooks/lib/install-opencode.js`，line 20:

```diff
-import { spawn } from 'node:child_process';
 import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
```

**完整删除** `import { spawn } from 'node:child_process';` 整行（注意保留其它 import 行）。`stat` import 也变成 unused（`buildOpenCodePlugin` 是唯一用户），下一步会一起处理。

- [ ] **Step 5: 删 `compile()` 函数 (line 83-105)**

打开 `hooks/lib/install-opencode.js`，**整段删除** `compile` 函数定义：

```js
function compile(opencodeDir, announce) {
  return new Promise((resolveCb) => {
    const proc = spawn('npx', ['tsc'], {
      cwd: opencodeDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        announce('  ✓ OpenCode plugin 编译成功');
      } else {
        announce(`  ⚠️  OpenCode plugin 编译失败 (exit ${code}): ${stderr.slice(0, 500)}`);
        announce('     请手动运行: cd opencode && npm install && npm run build`);
      }
      resolveCb();
    });
    proc.on('error', (err) => {
      announce(`  ⚠️  编译命令失败: ${err.message}`);
      resolveCb();
    });
  });
}
```

包括它上面 1 行的 `// ====...` 注释分隔（如果存在）。

- [ ] **Step 6: 删 `buildOpenCodePlugin()` 函数 (line 107-132)**

**整段删除** `buildOpenCodePlugin` 函数定义（包括它的注释分隔）。

- [ ] **Step 7: 删 main 流程的 `buildOpenCodePlugin` 调用 (line 158)**

在 `installForOpenCode` 函数体里找到 `await buildOpenCodePlugin(PACKAGE_ROOT, announce);` 这行（**紧接在** `await writeSentinel(...)` **之后**、**`await installOpenCodePluginToHome(...)` **之前**），整行删除。

- [ ] **Step 8: 清理 unused import `stat`**

`stat` 在原代码里只被 `buildOpenCodePlugin` 用。检查全文（`grep -n "stat" hooks/lib/install-opencode.js`），如果没其它 `stat(...)` 调用，从 import 行删除 `stat`：

```diff
-import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
+import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
```

如果 grep 还显示 `stat` 出现（比如 type annotation），保留 import。

- [ ] **Step 9: 跑防回退 test 确认 GREEN**

Run: `npm test -- --test-name-pattern="install-opencode.js does not import spawn|does not define compile|main flow does not call buildOpenCodePlugin"`

Expected: 3 个 pass。

- [ ] **Step 10: 跑全套 `npm test` 确认无回归**

Run: `npm test`

Expected: 274/274 全过（269 旧 + 2 Task 1 + 3 这次）。

- [ ] **Step 11: 视觉检查 `install-opencode.js` 编译段全删干净**

Run: `grep -n "compile\|buildOpenCodePlugin\|npx\|tsc" hooks/lib/install-opencode.js`

Expected: 无输出（除非有 comment line 提到这些词——可以保留，但无函数定义 / 调用）。

- [ ] **Step 12: Commit**

```bash
cd /Users/hosea/work/git/oh-my-sdd
git add hooks/lib/install-opencode.js __tests__/unit/install-opencode-build-flow.test.js
git status --short
git commit -m "$(cat <<'EOF'
[OMSBUILD] refactor(install): remove opencode compile from user installer

install-opencode.js 删 compile() / buildOpenCodePlugin() 两个函数 + main 流程
调用 + spawn import。理由：编译是开发者/CI 职责，prepublishOnly 强制 publish
前 build；用户机器零编译、零 npx、零网络下载 TypeScript。

3 个连锁 bug 因此彻底消除：
1. mtime check (>) 在 tarball 解压后必失败 (mtime reset) — 整个 mtime 机制删
2. npx tsc 拉非官方 tsc@2.0.3 包 — npx 调用删
3. compile 失败不阻断 install 后续 — compile 流程删

加 3 个防回退 test case（package-files.test.js 风格）：断言不再 import
spawn、不再定义 compile/buildOpenCodePlugin、main 流程不调 buildOpenCodePlugin。
TDD: RED（编译流程还在）→ 删 → GREEN。

install 流程改后：
  copySkillsToDir → injectOpenCodeBaseline → writeSentinel →
  installOpenCodePluginToHome (直接复制 ship dist) → ✓ 安装完成
无任何 ⚠️ 编译相关文案、状态自洽。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 删 `opencode/package.json` dead devDeps

**Files:**
- Modify: `opencode/package.json` (devDeps 段)

**Interfaces:**
- Consumes: Task 1 已 fix `package.json` `files` 数组 → tarball 不含 `opencode/src/`，因此 `opencode/package.json` 也**不进** tarball（不在 files 列表）→ opencode/package.json 是 dev 期间用
- Produces: `opencode/package.json` devDeps 仅含 `typescript: ^5.5.0`；`@opencode-ai/plugin` 和 `@types/node` 已 verify 是 dead dep（plugin.ts 只用 Node stdlib）后清理

- [ ] **Step 1: 确认 dead dep 真的 dead**

Run: `grep -E "import|from" opencode/src/plugin.ts`

Expected: 输出仅含 Node stdlib (`node:child_process` / `node:path` / `node:url`)。**如果发现** `@opencode-ai/plugin` import，**abort task** 并报告 spec 漏洞——这意味着需要 SDK，需要 devDeps 保留。

- [ ] **Step 2: 改 `opencode/package.json` devDeps**

打开 `opencode/package.json`，找到 `devDependencies` 段，改成：

```diff
   "devDependencies": {
-    "@opencode-ai/plugin": "^1.0.0",
-    "@types/node": "^20.0.0",
     "typescript": "^5.5.0"
   }
```

**完整删除** `@opencode-ai/plugin` 和 `@types/node` 两行，**保留** `typescript`。

- [ ] **Step 3: 在 `opencode/` 跑 `npm install` 验证 build 链路**

Run: `cd opencode && npm install --include=dev && npm run build && cd ..`

Expected:
- `npm install --include=dev` 装 typescript ~30-50MB，exit 0
- `npm run build` 跑 tsc，重新生成 `opencode/dist/plugin.js`，exit 0
- 无 TS 编译错误

- [ ] **Step 4: 跑全套 `npm test` 确认无回归**

Run: `npm test`

Expected: 274/274 全过（Task 1+2 之后的数字不变——这 task 没动 test code）。

- [ ] **Step 5: Commit**

```bash
cd /Users/hosea/work/git/oh-my-sdd
git add opencode/package.json
# 重新生成的 opencode/dist/plugin.js 也要 add（dist 是 git tracked）
git add opencode/dist/plugin.js
git status --short
# 确认只 add 了 2 个文件（opencode/package.json + opencode/dist/plugin.js）
git commit -m "$(cat <<'EOF'
[OMSBUILD] chore(opencode): remove dead devDeps

opencode/src/plugin.ts 只 import Node stdlib（child_process / path / url），不
用 @opencode-ai/plugin SDK 运行时（devDep 是 dead import 或 type-only），也不
需要 @types/node（plugin.ts 是手写类型推断，不需要 types 包）。两个 devDep
是噪声，清理后 dev install 更快、tarball 子包更小。

build 链路 verify：cd opencode && npm install --include=dev && npm run build
退出 0，dist 重新生成。

dist (opencode/dist/plugin.js) 同步重新 build 后 commit，因为 dist 是 git tracked
且 prepublishOnly 强制 publish 前 rebuild。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 改 `.github/workflows/ci.yml` 加 build step

**Files:**
- Modify: `.github/workflows/ci.yml` (test job 加 step)

**Interfaces:**
- Consumes: Task 1 已加 `prepublishOnly` hook，Task 3 已删 dead devDeps
- Produces: CI `test` job 跑 multi-OS (ubuntu/macos/windows) × multi-Node (18/20/22) 时，每个组合都跑 `cd opencode && npm ci --include=dev && npm run build` 验证 build 链路

- [ ] **Step 1: 读 `ci.yml` 定位插入点**

Run: `cat .github/workflows/ci.yml`

定位：
- `test` job 现有 step 列表 (line 17-25)
- `lint:baseline` step 之后的位置（line 25）作为新 step 插入点

- [ ] **Step 2: 加 build step**

在 `lint:baseline` step 之后、`smoke-check` job 之前，添加新 step：

```yaml
      - name: Verify opencode plugin build
        working-directory: opencode
        run: |
          npm ci --include=dev
          npm run build
```

完整插入位置示例（基于 `ci.yml` line 25 之后）：

```yaml
      - run: npm run lint:baseline
      - name: Verify opencode plugin build
        working-directory: opencode
        run: |
          npm ci --include=dev
          npm run build
```

- [ ] **Step 3: 验证 YAML 语法**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML OK"`

Expected: `YAML OK`

- [ ] **Step 4: 本地 lint workflow (可选)**

Run: `actionlint .github/workflows/ci.yml 2>&1 | head -20 || echo "actionlint not installed; skip"`

Expected: 无错误（或者 `actionlint not installed; skip`）。

- [ ] **Step 5: 不本地跑 CI — push 后由 GitHub Actions 验证**

本 task 不在本地跑 CI。Step 6 的 commit + push 后，CI 会自动跑 multi-OS × multi-Node × build step 验证。

- [ ] **Step 6: Commit + push（推到远端触发 CI）**

```bash
cd /Users/hosea/work/git/oh-my-sdd
git add .github/workflows/ci.yml
git status --short
git commit -m "$(cat <<'EOF'
[OMSBUILD] ci(workflow): verify opencode build on multi-OS matrix

test job 加一个 step: working-directory: opencode + npm ci --include=dev +
npm run build。multi-OS matrix (ubuntu/macos/windows) 自动覆盖，每次 push /
PR 验证 build 链路可重现。

为什么需要：
- prepublishOnly 在 developer 机器跑过但 publish 失败场景下无 audit trail
- CI 是 cross-OS build 一致性的免费保险 (pure ESM + Node stdlib 跨 OS，
  但 CI 提供"试过即可信"的事实证据)
- 任何 opencode/src/plugin.ts 改动都会被 CI 立即验证 build 成功

如果 build 失败 → CI 红 → PR 不可 merge → 不会 ship 旧 dist。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push origin main
```

- [ ] **Step 7: 验证 CI 跑过（用 gh CLI）**

Run: `gh run list --workflow=ci.yml --limit 1 --json status,conclusion,headSha 2>&1 | head -10`

Expected: 最新 run 的 `status: completed`, `conclusion: success`（等待几秒后 status 会从 `in_progress` 变 `completed`）。

如果 `conclusion: failure`，**不要 mark task 完成**：用 `gh run view <run-id> --log-failed` 查看具体哪个 OS × Node 组合失败，修复后重 commit + push。

---

## Task 5: 端到端 E2E 验证 + 全部 commit cleanup

**Files:**
- 无文件改动（纯验证）
- 用 `mktemp` 隔离 tmp HOME，模拟用户 `npm install -g` → `oms-install --tool opencode` → `oms-uninstall --tool opencode` 完整链路

**Interfaces:**
- Consumes: Task 1+2+3+4 全部完成，本地 working tree 含 4 个 fix commit + 1 个 CI fix commit，**全部已 push 到 origin/main**（Task 4 末尾 push）
- Produces: 12 步 E2E 验证全部通过；`docs/superpowers/reports/2026-07-15-task-5-e2e-verification.md` 留痕（git tracked artifact）

- [ ] **Step 1: 创建隔离 tmp HOME**

Run:
```bash
cd /Users/hosea/work/git/oh-my-sdd
TMPDIR_TEST=$(mktemp -d)
export HOME=$TMPDIR_TEST/home
mkdir -p $HOME
echo "TMPDIR_TEST=$TMPDIR_TEST"
echo "HOME=$HOME"
```

- [ ] **Step 2: 在当前 work tree 跑 `npm pack` 生成 tarball**

Run:
```bash
cd /Users/hosea/work/git/oh-my-sdd
npm pack
ls -la *.tgz
```

Expected: `cli-tools-oh-my-sdd-0.1.0.tgz` 存在。

- [ ] **Step 3: 在 tmp HOME 模拟 `npm install -g`**

Run:
```bash
cd "$TMPDIR_TEST"
npm install -g /Users/hosea/work/git/oh-my-sdd/cli-tools-oh-my-sdd-0.1.0.tgz 2>&1 | tail -10
echo "exit: $?"
```

Expected: install 成功，exit 0。`which oms-install` 应返回路径。

- [ ] **Step 4: 跑 `oms-install --tool opencode`，验证无 ⚠️ 编译相关文案**

Run:
```bash
cd /Users/hosea/work/git/oh-my-sdd
HOME=$HOME oms-install --tool opencode 2>&1 | tee /tmp/oms-install-output.txt
echo "--- exit: $? ---"
echo
echo "=== 关键断言：output 应无任何 ⚠️ 编译相关文案 ==="
if grep -E "编译|compile|tsc|build|npx" /tmp/oms-install-output.txt; then
  echo "❌ FAIL: output 含编译相关文案"
  exit 1
else
  echo "✅ PASS: output 无编译相关文案"
fi
```

Expected:
- 4 个 ✓ 标记（skills / baseline / sentinel / plugin installed）
- **无任何 ⚠️ 编译相关文案**（这是 task 1+2 修复的关键指标）
- exit 0

- [ ] **Step 5: 验证 plugin.js 被 ship dist 正确复制到 home**

Run:
```bash
test -f $HOME/.config/opencode/plugins/oh-my-sdd/plugin.js && echo "plugin.js exists (OK)" || echo "plugin.js missing (FAIL)"
test -f $HOME/.oh-my-sdd/baseline-opencode.sentinel && echo "sentinel exists (OK)" || echo "sentinel missing (FAIL)"
test -f $HOME/.config/opencode/AGENTS.md && echo "AGENTS.md exists (OK)" || echo "AGENTS.md missing (FAIL)"

echo
echo "=== 字节级一致性：home plugin.js == tarball opencode/dist/plugin.js ==="
tarball_plugin=$(tar -tzf /Users/hosea/work/git/oh-my-sdd/cli-tools-oh-my-sdd-0.1.0.tgz | grep 'opencode/dist/plugin.js' | head -1)
echo "tarball 内路径: $tarball_plugin"
mkdir -p "$TMPDIR_TEST/extract"
cd "$TMPDIR_TEST/extract"
tar -xzf /Users/hosea/work/git/oh-my-sdd/cli-tools-oh-my-sdd-0.1.0.tgz "$tarball_plugin"
if cmp -s "package/$tarball_plugin" "$HOME/.config/opencode/plugins/oh-my-sdd/plugin.js"; then
  echo "✅ PASS: home plugin.js == tarball dist/plugin.js (byte-identical)"
else
  echo "❌ FAIL: byte difference"
  diff <(md5 "package/$tarball_plugin") <(md5 "$HOME/.config/opencode/plugins/oh-my-sdd/plugin.js")
fi
```

Expected: 3 个 OK + ✅ PASS byte-identical。

- [ ] **Step 6: 跑 `oms-uninstall --tool opencode`，验证 cleanup**

Run:
```bash
cd /Users/hosea/work/git/oh-my-sdd
HOME=$HOME oms-uninstall --tool opencode 2>&1 | tail -10
echo "--- exit: $? ---"
echo
test -d $HOME/.config/opencode/plugins/oh-my-sdd && echo "plugin 目录仍存在 (FAIL)" || echo "plugin 目录已删 (OK)"
test -f $HOME/.oh-my-sdd/baseline-opencode.sentinel && echo "sentinel 仍存在 (FAIL)" || echo "sentinel 已删 (OK)"
test -d $HOME/.oh-my-sdd && echo "状态目录保留 (OK, --purge 未传)" || echo "状态目录被删 (FAIL)"
```

Expected: exit 0, plugin 目录已删, sentinel 已删, 状态目录保留。

- [ ] **Step 7: 验证 tarball 不含 opencode/src/（"不 ship 死代码" 验收）**

Run:
```bash
echo "=== tarball 内 opencode/ 内容清单 ==="
tar -tzf /Users/hosea/work/git/oh-my-sdd/cli-tools-oh-my-sdd-0.1.0.tgz | grep -E "^package/opencode/" | head -20
echo
echo "=== 断言：不应出现 opencode/src/ ==="
if tar -tzf /Users/hosea/work/git/oh-my-sdd/cli-tools-oh-my-sdd-0.1.0.tgz | grep -E "opencode/src/"; then
  echo "❌ FAIL: tarball 含 opencode/src/ (死代码泄漏)"
  exit 1
else
  echo "✅ PASS: tarball 不含 opencode/src/"
fi
echo
echo "=== 断言：应含 opencode/dist/plugin.js ==="
if tar -tzf /Users/hosea/work/git/oh-my-sdd/cli-tools-oh-my-sdd-0.1.0.tgz | grep -qE "opencode/dist/plugin\.js"; then
  echo "✅ PASS: tarball 含 opencode/dist/plugin.js"
else
  echo "❌ FAIL: tarball 缺 opencode/dist/plugin.js"
  exit 1
fi
```

Expected: tarball 内 opencode/ 路径清单仅含 `opencode/dist/plugin.js`（和可能的 `opencode/package.json` 等元数据，**但 Task 1 限定 `opencode/dist/` 精确路径** → 应该只有 dist/plugin.js）。

实际上 package.json `files` 是 `opencode/dist/`，所以 tarball 只 pack 这个子目录 → `package/opencode/dist/plugin.js` 唯一项。`opencode/package.json` / `tsconfig.json` **不**进 tarball（因为它们在 `opencode/` 根，不在 `opencode/dist/` 子目录下）。

- [ ] **Step 8: 写 E2E 验证报告**

创建 `docs/superpowers/reports/2026-07-15-task-5-e2e-verification.md`，包含 8 步验证结果（参考 [OMSTOOLS] task-4 report 模板，路径 + 表格 + 关键发现 + 提交记录）。这个文件是 git tracked artifact（不在 `.superpowers/sdd/` 下所以不被 ignore）。

- [ ] **Step 9: 清理 tmp + 恢复 HOME**

Run:
```bash
cd /Users/hosea/work/git/oh-my-sdd
rm -rf "$TMPDIR_TEST"
rm -f /Users/hosea/work/git/oh-my-sdd/cli-tools-oh-my-sdd-0.1.0.tgz
unset HOME
export HOME=/Users/hosea
echo "HOME 恢复: $HOME"
echo "tmp 清理: $TMPDIR_TEST (removed)"
ls -la /Users/hosea/.config/opencode 2>&1 | head -3
```

Expected: tmp 删, HOME 恢复, 原 HOME 无污染。

- [ ] **Step 10: 跑全套 `npm test` 确认无回归**

Run: `npm test`

Expected: 274/274 全过（与 Task 2 末尾数字一致——本 task 不动 test code）。

- [ ] **Step 11: Commit E2E report**

```bash
cd /Users/hosea/work/git/oh-my-sdd
git add docs/superpowers/reports/2026-07-15-task-5-e2e-verification.md
git status --short
git commit -m "$(cat <<'EOF'
[OMSBUILD] docs: archive task 5 e2e verification report

8 步 E2E 验证（隔离 tmp HOME 下 install + uninstall + cleanup）全过，把"用户
机器零编译"这一 spec 核心目标事实化：tarball 内 opencode/ 仅含
opencode/dist/plugin.js，install 复制到 home 的 plugin.js 与 tarball 内 dist
字节级一致，install 输出无任何 ⚠️ 编译相关文案。

报告归档至 docs/superpowers/reports/（git tracked），不进 .superpowers/sdd/
（被该目录内嵌 .gitignore 排除）。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push origin main
```

- [ ] **Step 12: 最终自检**

Run:
```bash
cd /Users/hosea/work/git/oh-my-sdd
echo "=== git log (本 change 5 个 commit + spec + plan) ==="
git log --oneline origin/main -7
echo
echo "=== 远端 ahead/behind ==="
git status -sb | head -3
echo
echo "=== 全套测试 ==="
npm test 2>&1 | tail -8
```

Expected:
- 5 个 `[OMSBUILD]` commit + 1 个 spec commit + 1 个 plan commit
- `## main...origin/main` 无 `[ahead N]`（push 后同步）
- 274/274 全过

---

## Self-Review

### 1. Spec coverage

| Spec section | Task |
|---|---|
| §3.1 package.json files 改 | Task 1 |
| §3.1 package.json prepublishOnly | Task 1 |
| §3.1 install-opencode.js 删 compile + buildOpenCodePlugin + 调用 + 注释 + spawn import | Task 2 |
| §3.1 opencode/package.json 删 dead devDeps | Task 3 |
| §3.1 .github/workflows/ci.yml 加 build step | Task 4 |
| §3.1 package-files.test.js 加 2 test case | Task 1 |
| §3.1 install-opencode-build-flow.test.js 新建 (3 test case) | Task 2 (Step 1) |
| §6 plan 8 task | 5 task 覆盖（含 verification） |
| §7 验收 11 项 | Task 1 (3 项), Task 2 (3 项), Task 3 (0 项, devDeps 清理), Task 4 (1 项), Task 5 (4 项 E2E) |

✅ All spec sections covered.

### 2. Placeholder scan

- 无 "TBD" / "TODO" / "implement later" 出现
- 步骤中所有代码块完整
- 步骤中所有命令含期望输出

✅ No placeholders.

### 3. Type / signature consistency

- `install-opencode.js` 删除的函数名 `compile` / `buildOpenCodePlugin` 在 spec §3.1 + §4.3 + 注释中一致
- `package.json` `files` 数组的精确路径 `"opencode/dist/"` 在 spec + plan + test code 中一致
- `prepublishOnly` script 字符串 `"cd opencode && npm ci --include=dev && npm run build"` 在 spec §4.2 + plan Task 1 Step 4 + test code 中一致
- devDeps 字段名 `@opencode-ai/plugin` + `@types/node` + `typescript` 在 spec §4.4 + plan Task 3 一致

✅ Consistent.

### 4. Edge cases

- **CI 失败怎么办**？Task 4 Step 7 明确"不要 mark task 完成"，用 `gh run view --log-failed` 调查
- **Task 1 RED 失败**？说明 prior session 残留被 add 进了 commit——立即 `git reset HEAD~1` 重试
- **Task 5 字节级 cmp 失败**？说明 `oms-install` 复制 plugin.js 时改了字节（不可能，但保险检查）—— 报告 bug，不 mark 完成
- **mtime 问题在 install 阶段没暴露**？因为 mtime 整个机制删了，Task 2 防回退 test 守护

✅ Edge cases covered.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-opencode-build-flow-redesign.md`. 5 个 task（含 E2E 验证），每 task 5-12 step。

**Two execution options**:

1. **Subagent-Driven (recommended)** - 我 dispatch 5 个 fresh subagent（每 task 1 个），per-task 2-stage review，最后 dispatch 1 个 final whole-branch reviewer。匹配 [OMSTOOLS] 模式。

2. **Inline Execution** - 在本 session 用 executing-plans 串行执行 5 个 task，无 per-task review gate，只在最后做 1 次 final review。

Which approach?
