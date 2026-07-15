# opencode plugin 编译流程重设计

- **change-id**: `[OMSBUILD]`
- **type**: `fix` + `refactor`
- **SDD 形态**: 轻量（spec+plan 合并写，apply+review 单独跑）
- **author**: hosea
- **date**: 2026-07-15
- **scope**: `package.json` `files` 数组、`prepublishOnly` hook、`install-opencode.js` 编译流程、`opencode/package.json` devDeps、CI workflow

## 1. 问题陈述

[OMSTOOLS] 把 `opencode/` 目录加进 npm tarball 后，用户 `npm install -g` 装上 oh-my-sdd 后跑 `oms-install --tool opencode`，**编译步骤仍然在用户机器上跑**，且经常失败：

```
→ 安装 OpenCode 适配
  ✓ 已复制 17 个 skills -> /Users/hosea/.config/opencode/skills
  ✓ baseline 已注入（哨兵块）: /Users/hosea/.config/opencode/AGENTS.md
  ✓ 哨兵文件: /Users/hosea/.oh-my-sdd/baseline-opencode.sentinel
  ⚠️  OpenCode plugin 编译失败 (exit 2):
     请手动运行: cd opencode && npm install && npm run build
  ✓ OpenCode plugin 已安装: /Users/hosea/.config/opencode/plugins/oh-my-sdd

✓ oh-my-sdd (OpenCode) 安装完成
```

输出矛盾（⚠️ 编译失败 + ✓ 已安装 + ✓ 安装完成）但实际**功能可能正常**——因为 install 流程把 tarball 里 ship 的旧 `dist/plugin.js` 复制到 home 用了。这个状态不是设计意图，是三个连锁 bug 的意外结果。

### 1.1 三个根因

#### 根因 1：mtime check 在 tarball 场景必失败

`hooks/lib/install-opencode.js:121` 判断 `distStat.mtimeMs > srcStat.mtimeMs`（严格大于）。tarball 解压后所有文件 mtime 被 reset 为同一时间（实测 `Oct 26 1985`），**src 和 dist mtime 相等**，严格大于不成立 → 跳过判断失败 → 调 `compile()`。

#### 根因 2：`npx tsc` 找到非官方 tsc 包

`opencode/` 解压后没有 `node_modules`，`npx tsc` 默认去 npm 远程拉"tsc"包。npm registry 里有同名的非官方 `tsc@2.0.3` 包，npm 10+ 拒绝执行并打印"This is not the tsc command you are looking for"。

#### 根因 3：编译失败不影响后续 install

`compile()` 失败时 `resolveCb()` 不抛错，`buildOpenCodePlugin` 返回；`installOpenCodePluginToHome` 看到 dist 存在就复制，仍报 ✓ 已安装；main 流程不检查 compile 状态，结尾仍报"安装完成"。

### 1.2 设计意图

`oms-install --tool opencode` 应当**只做"复制开发者/CI 编译好的 dist 到 home"**——编译是开发者职责，发布是 npm 职责，install 是用户职责。**用户机器零编译、零 npx、零网络下载 TypeScript**。

## 2. 目标

1. **用户机器零编译**：`oms-install --tool opencode` 不再调用 `compile()` / `buildOpenCodePlugin()`，直接复制 tarball 里 ship 的 `dist/plugin.js`
2. **强约束**：dist 一定是最新 build 产物——通过 `prepublishOnly` 强制 publish 前 build 一次
3. **跨 OS 兼容**：开发者本地 build 出的 dist 能在 macOS / Linux / Windows 用户机器上跑（纯 ESM + Node stdlib，无 native deps）
4. **不 ship 死代码**：tarball 只含 `opencode/dist/`，不含 `opencode/src/`
5. **状态自洽**：install 输出不再出现 ⚠️ 编译失败 + ✓ 已安装 + ✓ 安装完成的矛盾
6. **CI 验证 build 链路**：每次 push 跑 `cd opencode && npm ci --include=dev && npm run build` 验证 build 可重现

## 3. 范围

### 3.1 范围内

| 文件 | 变更 | 行为变化 |
|---|---|---|
| `package.json` | `files` 数组：`"opencode/"` → `"opencode/dist/"` | tarball 只含 dist，不含 src |
| `package.json` | 新增 `"scripts": { "prepublishOnly": "cd opencode && npm ci --include=dev && npm run build" }` | npm publish 前强制 build |
| `hooks/lib/install-opencode.js` | 删 `compile()` 函数 (line 83-105) | install 流程不再 spawn tsc |
| `hooks/lib/install-opencode.js` | 删 `buildOpenCodePlugin()` 函数 (line 107-132) | install 流程不再做 mtime check + 编译决策 |
| `hooks/lib/install-opencode.js` | 删 main 流程 `await buildOpenCodePlugin(PACKAGE_ROOT, announce)` 调用 (line 158) | install main 不调 build |
| `hooks/lib/install-opencode.js` | 改顶部注释"编译 opencode/src/plugin.ts → dist/plugin.js"为"复制 ship 的 dist/plugin.js 到 home" | 注释反映新流程 |
| `opencode/package.json` | 删 devDep `@opencode-ai/plugin` + `@types/node` | 移除 dead deps（已 verify `plugin.ts` 只用 Node stdlib） |
| `.github/workflows/ci.yml` | `test` job 在 `npm test` 后加一个 step：`working-directory: opencode`, `run: npm ci --include=dev && npm run build` | CI 验证 build 链路（multi-OS matrix 已存在：ubuntu/macos/windows） |
| `__tests__/unit/package-files.test.js` | 新增 2 个 test case：files 含 `"opencode/dist/"` 且不含 `"opencode/src/"` | 防回退 |

### 3.2 范围外（不动）

- `opencode/src/plugin.ts` 源码（已正确）
- `opencode/dist/plugin.js` 产物（已正确，仅跟随 tsc 更新）
- `opencode/tsconfig.json`（已正确）
- `hooks/lib/install-opencode.js` 的其他 install 流程（baseline 注入、skills 复制、sentinel 写入、uninstall 流程）
- `hooks/lib/install-claude.js` / `hooks/lib/install-lingma.js`（无同款问题）
- `uninstall.js` / `preuninstall` 钩子（已正确）
- `__tests__/unit/package-files.test.js` 现有的 4 个 test cases（继续有效）

## 4. 设计

### 4.1 `package.json` `files` 数组

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

精确到 `opencode/dist/`，`opencode/src/`、`opencode/package.json`、`opencode/tsconfig.json` 全部不进 tarball。

### 4.2 `package.json` `scripts.prepublishOnly`

```diff
   "scripts": {
+    "prepublishOnly": "cd opencode && npm ci --include=dev && npm run build"
   },
```

**约束链**：
- 开发者 commit src + dist → push → CI 跑 build step 验证
- 发布时 `npm publish` → 自动跑 `prepublishOnly` → 装 typescript devDep → `tsc` 重 build dist → 验证 build 可过
- build 失败 → publish 终止，不会 ship 旧 dist

### 4.3 `hooks/lib/install-opencode.js` 改动

**删除** (line 83-105):
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

**删除** (line 107-132):
```js
async function buildOpenCodePlugin(packageRoot, announce) {
  const opencodeDir = join(packageRoot, 'opencode');
  const distDir = join(opencodeDir, 'dist');
  const pluginTs = join(opencodeDir, 'src', 'plugin.ts');

  if (!existsSync(pluginTs)) {
    announce('  ⚠️  OpenCode plugin 源文件不存在，跳过编译');
    return false;
  }

  if (existsSync(join(distDir, 'plugin.js'))) {
    try {
      const [srcStat, distStat] = await Promise.all([stat(pluginTs), stat(join(distDir, 'plugin.js'))]);
      if (distStat.mtimeMs > srcStat.mtimeMs) {
        announce('  ✓ OpenCode plugin 已编译（跳过）');
        return true;
      }
    } catch {
      // stat 失败 → 重新编译
    }
  }

  await compile(opencodeDir, announce);
  return true;
}
```

**删除** (line 158 in main 流程):
```js
  await buildOpenCodePlugin(PACKAGE_ROOT, announce);
```

**改** (顶部注释 line 8):
```diff
-//   3. 编译 opencode/src/plugin.ts → dist/plugin.js（Bun 自动加载）
-//   4. 复制 dist/ 到 ~/.config/opencode/plugins/oh-my-sdd/
+//   3. 复制 ship 的 dist/plugin.js 到 ~/.config/opencode/plugins/oh-my-sdd/
+//      （dist 是开发者/CI 编译的产物，由 prepublishOnly 强制保证最新；用户机器零编译）
```

**install main 流程改后** (line 149-170 范围):
```js
export async function installForOpenCode({ PACKAGE_ROOT, announce }) {
  if (isHomeDir(process.cwd())) {
    announce('⚠️  当前目录是 HOME 目录，建议 cd 到项目目录后再装（继续执行但会有副作用）');
  }

  announce('→ 安装 OpenCode 适配');
  await copySkillsToDir(join(PACKAGE_ROOT, 'skills'), OPENCODE_SKILLS_DIR, announce);
  await injectOpenCodeBaseline(announce);
  await writeSentinel('opencode', OPENCODE_AGENTS_MD, 'OH-MY-SDD:BEGIN/END', announce);
  await installOpenCodePluginToHome(PACKAGE_ROOT, announce);
  // ... 后续不变
}
```

**不再需要的 import** (line 20):
```diff
 import { spawn } from 'node:child_process';
```
（`spawn` 只被 `compile()` 用，删了 `compile()` 后 `spawn` 不再被引用）

### 4.4 `opencode/package.json` 改动

```diff
   "devDependencies": {
-    "@opencode-ai/plugin": "^1.0.0",
-    "@types/node": "^20.0.0",
     "typescript": "^5.5.0"
   }
```

**已 verify**：
- `opencode/src/plugin.ts` 只 import Node stdlib（`node:child_process` / `node:path` / `node:url`），不需要 `@opencode-ai/plugin` 运行时，不需要 `@types/node` 类型
- `tsc` 是 build 唯一依赖，保留

### 4.5 `.github/workflows/ci.yml` 改动

在 `test` job 的 `npm run lint:baseline` step 之后追加：

```yaml
      - name: Verify opencode plugin build
        working-directory: opencode
        run: |
          npm ci --include=dev
          npm run build
```

**多 OS 覆盖**：`test` job 已有 `matrix.os: [ubuntu-latest, macos-latest, windows-latest]`，build step 自动在 3 个 OS 上跑——这是 cross-OS build 验证的免费保险。

**位置选择理由**：`npm test` 后跑 build——确保常规测试先过，build 失败不掩盖 test 失败。

### 4.6 `__tests__/unit/package-files.test.js` 新增 test cases

在现有 4 个 test cases 之后追加：

```js
test('package.json files whitelist excludes opencode/src/ (no dead code shipped)', () => {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files), 'package.json must have a "files" array');
  assert.ok(!pkg.files.some(f => f === 'opencode/src/' || f === 'opencode/src'),
    'files must not include opencode/src/ — only opencode/dist/ should ship');
  assert.ok(pkg.files.includes('opencode/dist/'),
    'files must include "opencode/dist/" (exact path) so tarball contains build artifact');
});
```

`npm test` 跑后断言：`files` 数组不含 `opencode/src/`、含 `opencode/dist/`。

## 5. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `prepublishOnly` 失败时开发者绕过 publish | npm 默认行为：`prepublishOnly` 失败 publish 终止。开发者只能用 `npm publish --ignore-scripts` 绕过——记录为 [OVERRIDE] |
| 开发者改了 src 但忘 build | 本地 `git status` 提示 dist modified；CI build step 兜底验证 |
| 开发者改了 src 但没 commit 新 dist | publish 时 `prepublishOnly` 跑 build 强制重生成 dist 到 working tree，npm pack 时含新 dist |
| 跨 OS 不兼容 | 已 verify：纯 ESM + Node stdlib 跨 OS；无 native deps；tsc 产物跨 OS 字节级一致 |
| `@opencode-ai/plugin` 删了后未来扩展需重加 | 后续如要接入 SDK，加回 devDep 即可，不影响 spec 设计 |
| CI build step 慢 | 装 typescript ~30-50MB，build 几秒；按需 cache npm ci |
| `opencode/dist/` 不进 tarball 后用户机器无 src 兜底 | 这是设计意图：dist 是 product，src 是 dev artifact |

## 6. 实施计划（spec+plan 合并）

| Task | 文件 | 预计耗时 |
|---|---|---|
| 1. 改 `package.json` `files` + 加 `prepublishOnly` | `package.json` | 1 min |
| 2. 删 `install-opencode.js` 编译流程 | `hooks/lib/install-opencode.js` | 2 min |
| 3. 改 `opencode/package.json` 删 dead devDeps | `opencode/package.json` | 1 min |
| 4. 改 CI workflow 加 build step | `.github/workflows/ci.yml` | 2 min |
| 5. 加 package-files.test.js 新 test case | `__tests__/unit/package-files.test.js` | 2 min |
| 6. 跑 `npm test` 验证（应 271/271 = 269 旧 + 2 新） | - | 1 min |
| 7. 跑 E2E：tmp HOME `npm install -g` → `oms-install --tool opencode` 验证无 ⚠️ 编译失败 | - | 5 min |
| 8. commit + push | - | 1 min |

## 7. 验收

- [ ] `package.json` `files` 含 `"opencode/dist/"`、**不**含 `"opencode/src/"` / `"opencode/"`
- [ ] `package.json` `scripts.prepublishOnly` = `"cd opencode && npm ci --include=dev && npm run build"`
- [ ] `hooks/lib/install-opencode.js` 不再 import `node:child_process` 的 `spawn`
- [ ] `hooks/lib/install-opencode.js` 不再有 `compile()` / `buildOpenCodePlugin()` 函数
- [ ] `opencode/package.json` devDeps 仅含 `typescript`，不含 `@opencode-ai/plugin` / `@types/node`
- [ ] `.github/workflows/ci.yml` `test` job 含 `working-directory: opencode` 的 build step
- [ ] `npm test` 全绿，新 test cases 通过（271/271）
- [ ] 干净 tmp HOME `npm install -g` tarball 后跑 `oms-install --tool opencode` 输出**无任何 ⚠️ 编译相关文案**
- [ ] 干净 tmp HOME install 后 `~/.config/opencode/plugins/oh-my-sdd/plugin.js` 与 tarball 内 `package/opencode/dist/plugin.js` 字节级一致
- [ ] `npm run prepublishOnly` 在 `opencode/` 不存在 dist 场景下能 build 成功（fresh clone 验证）
- [ ] 7 个 commit 形如 `[OMSBUILD] <type>: <subject>`

## 8. 后续 TODO

- [ ] 在 release notes 加 "opencode plugin 编译流程重设计" 段
- [ ] 考虑 `package.json` `scripts` 加 `"build:opencode": "cd opencode && npm ci --include=dev && npm run build"` 让开发者本地一键 build（与 prepublishOnly 一致）
- [ ] 监控 `oms-install --tool opencode` 在野生用户的 install 输出，确认无 ⚠️ 编译相关报告

## 9. 参考

- `hooks/lib/install-opencode.js:83-159`（待删除的 build 流程）
- `opencode/src/plugin.ts`（已 verify 只用 Node stdlib）
- `opencode/package.json`（待清理 devDeps）
- `package.json:22-31`（files 数组）
- [OMSTOOLS] spec: `docs/superpowers/specs/2026-07-14-opencode-install-fixes-design.md`
- npm `prepublishOnly` 文档：https://docs.npmjs.com/cli/v10/using-npm/scripts#prepublish
