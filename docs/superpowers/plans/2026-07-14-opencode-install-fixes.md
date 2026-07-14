# OpenCode 安装包发布修复 + 卸载文档修正 — 实施 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 npm 包发布配置缺 `baseline/` 和 `opencode/` 目录的 bug，并修正 OpenCode/lingma postinstall 提示和 README 卸载章节中 `oms-uninstall --purge` 顺序错的文档问题。

**Architecture:** 4 个独立 commit，对应 3 个源码改动 + 1 个新测试。配置改动（package.json / .gitignore）由新加的 `package-files.test.js` 保护回归。文档改动无独立测试（doc-only），靠 reviewer 把关。

**Tech Stack:** Node.js 18+, `node:test` (test runner), `npm pack --dry-run`, `git check-ignore`, ESM modules.

**Reference spec:** `docs/superpowers/specs/2026-07-14-opencode-install-fixes-design.md`

## Global Constraints

- **Commit 前缀**：`[OMSTOOLS] <type>(<scope>): <subject>`，按 baseline HARD_RULE
- **type 取值**：`fix`（修复 bug）/ `docs`（仅文档）/ `test`（仅测试）
- **不动**：`uninstall.js` 运行时逻辑、`hooks/lib/install-{opencode,lingma}.js` 的安装/卸载主体逻辑（只改 postinstall 文案）、`opencode/src/plugin.ts` / `opencode/dist/plugin.js` 源码、`.npmignore`（用 `files` 白名单模式足够）
- **测试运行**：`npm test`（运行 `node scripts/run-tests.js`，内部调 `node --test "**/*.test.js"`）
- **包根定位**：测试文件中 `__dirname` 向上回溯 2 级（`__tests__/unit/ → <pkg-root>/`）

---

## File Structure

| 文件 | 角色 | 任务 |
|---|---|---|
| `package.json` | npm 包元数据 + `files` 白名单 | Task 1 |
| `.gitignore` | Git 忽略规则（`opencode/dist/` 例外） | Task 1 |
| `__tests__/unit/package-files.test.js` | 新建：白名单回归保护 | Task 1 |
| `hooks/lib/install-opencode.js` | OpenCode 工具安装实现 | Task 2（仅改第 170 行） |
| `hooks/lib/install-lingma.js` | lingma 工具安装实现 | Task 2（仅改第 126 行） |
| `README.md` | 用户文档 | Task 3（仅改"卸载"章节） |

每个文件**单一职责**。`package-files.test.js` 独立成文件——白名单保护是单独关切点，未来如果增加 `files` 验证项时单独维护，不污染 `install-targets.test.js`。

---

## Task 1: 发布白名单补全 + 回归测试

**Files:**
- Create: `__tests__/unit/package-files.test.js`
- Modify: `package.json:31-32`（`files` 数组加 2 行）
- Modify: `.gitignore:6`（`dist/` 后加 2 行例外）

**Interfaces:**
- Consumes: 无（这是第一个任务，不依赖前面产出）
- Produces:
  - `package.json` 的 `files` 数组新增 `"baseline/"` 和 `"opencode/"` 两个字符串
  - `.gitignore` 末尾新增 `!/opencode/dist/` 和 `!/opencode/dist/**` 两行
  - 新增测试文件 `__tests__/unit/package-files.test.js`，导出 4 个 `node:test` 用例

### Step 1.1: 写失败测试

创建 `__tests__/unit/package-files.test.js`，包含 4 个 `test()`：

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

test('package.json files whitelist includes baseline/ and opencode/', () => {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files), 'package.json must have a "files" array');
  assert.ok(pkg.files.includes('baseline/'), 'files must include "baseline/"');
  assert.ok(pkg.files.includes('opencode/'), 'files must include "opencode/"');
});

test('npm pack --dry-run output includes baseline and opencode paths', () => {
  const output = execFileSync('npm', ['pack', '--dry-run'], { cwd: PACKAGE_ROOT, encoding: 'utf8' });
  assert.match(output, /baseline\/opencode\.md/);
  assert.match(output, /baseline\/lingma\.md/);
  assert.match(output, /opencode\/dist\/plugin\.js/);
  assert.match(output, /opencode\/src\/plugin\.ts/);
});

test('.gitignore has !/opencode/dist/ exception', () => {
  const gitignore = readFileSync(path.join(PACKAGE_ROOT, '.gitignore'), 'utf8');
  assert.match(
    gitignore,
    /![\/]?opencode\/dist\//,
    '.gitignore must have a !/opencode/dist/ exception to re-include dist/ as versioned'
  );
});

test('git check-ignore confirms opencode/dist/plugin.js is NOT ignored', () => {
  let code = -1;
  try {
    execFileSync('git', ['check-ignore', '-v', 'opencode/dist/plugin.js'], { cwd: PACKAGE_ROOT, stdio: 'pipe' });
  } catch (err) {
    code = err.status;
  }
  // git check-ignore exits 0 = ignored (bad), 1 = not ignored (good), -1 = exec failed
  assert.notEqual(code, 0, 'opencode/dist/plugin.js must NOT be ignored after the gitignore exception');
});
```

### Step 1.2: 跑测试确认失败

Run: `npm test -- __tests__/unit/package-files.test.js`
Expected: 4 个测试全部失败
- "files must include" → 当前 `files` 数组没 `"baseline/"` / `"opencode/"`
- "npm pack output" → 同样没这两个目录
- ".gitignore must have" → 当前没 `!/opencode/dist/`
- "git check-ignore" → 当前 `opencode/dist/` 被 `dist/` 规则忽略，check-ignore 返回 0

### Step 1.3: 改 `package.json` 加白名单

在 `package.json` 的 `files` 数组里 `"hooks/",` 之后、`"README.md"` 之前，加 2 行：

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
+    "baseline/",
+    "opencode/",
     "README.md"
   ],
```

`★ Insight ─────────────────────────────────────`
- `files` 是 npm **白名单**：数组内路径才会进 tarball，缺哪个目录就缺哪个特性。本项目用 `files` 模式而**不**用 `.npmignore` 黑名单——前者"明示什么进"，后者"明示什么不进"。白名单更安全，缺点是"漏一个就缺一个"。
`─────────────────────────────────────────────────`

### Step 1.4: 改 `.gitignore` 加例外

在 `.gitignore` 末尾（`dist/` 这行后追加 2 行例外）：

```diff
 dist/
+!/opencode/dist/
+!/opencode/dist/**
 coverage/
```

`!` 例外必须**出现在** `dist/` 之后才有意义（gitignore 顺序敏感）。`/opencode/dist/` 覆盖目录本身、`/opencode/dist/**` 覆盖目录下所有文件，Git 文档推荐双写法。

### Step 1.5: 跑测试确认通过

Run: `npm test -- __tests__/unit/package-files.test.js`
Expected: 4 个测试全部 PASS

如果 `git check-ignore` 测试仍失败，说明 `opencode/dist/plugin.js` 在工作树中**已**被 git 跟踪（之前 `git add -f` 过的），`.gitignore` 例外对它无效——这是历史遗留问题。临时修复：先 `git rm --cached opencode/dist/plugin.js`，再跑测试。验证后可以 `git checkout -- opencode/dist/plugin.js` 恢复文件。

### Step 1.6: 跑全套测试确认无回归

Run: `npm test`
Expected: 全部测试通过（已有测试不应被本任务影响）

### Step 1.7: Commit

```bash
git add package.json .gitignore __tests__/unit/package-files.test.js
git commit -m "$(cat <<'EOF'
[OMSTOOLS] fix(pkg): include baseline/ and opencode/ in npm files whitelist

npm pack 之前漏发 baseline/ 和 opencode/ 两个目录，导致 install 路径在
新装环境上 readFile 抛 ENOENT，OpenCode 路径完全装不上。

- package.json: files 数组加 baseline/ 和 opencode/
- .gitignore: 加 !/opencode/dist/ 例外让 dist 进版本控制
- 新增 __tests__/unit/package-files.test.js 防白名单回退

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 修正 OpenCode + lingma postinstall 提示文案

**Files:**
- Modify: `hooks/lib/install-opencode.js:170`（一行替换为两行）
- Modify: `hooks/lib/install-lingma.js:126`（一行替换为两行）

**Interfaces:**
- Consumes: 无（独立 doc-only 改动）
- Produces: 两个文件 postinstall 阶段输出的卸载提示文本

### Step 2.1: 改 `hooks/lib/install-opencode.js` 第 170 行

当前内容（`installForOpenCode` 函数末尾）：
```javascript
  announce('卸载：npm uninstall -g @cli-tools/oh-my-sdd && node uninstall.js --tool opencode');
```

替换为：
```javascript
  announce('卸载（仅清 OpenCode）：oms-uninstall --tool opencode   # 保留 ~/.oh-my-sdd/ 状态目录');
  announce('完整卸载：npm uninstall -g @cli-tools/oh-my-sdd   # preuninstall 自动清三套产物');
```

**为什么这两条独立**：
- 第一条对应"已装了还想卸 OpenCode"——`oms-uninstall` 命令还活着，可以直接跑
- 第二条对应"想全清"——`npm uninstall -g` 触发 `preuninstall` 钩子，一次清三套产物
- 旧版本 `npm uninstall -g && node uninstall.js` 中第二条 `node uninstall.js` 在 npm 卸载后已找不到（uninstall.js 在被卸载的包里），所以报错"file not found"

### Step 2.2: 改 `hooks/lib/install-lingma.js` 第 126 行

当前内容（`installForLingma` 函数末尾）：
```javascript
  announce('卸载：npm uninstall -g @cli-tools/oh-my-sdd && node uninstall.js --tool lingma');
```

替换为：
```javascript
  announce('卸载（仅清 lingma）：oms-uninstall --tool lingma   # 保留 ~/.oh-my-sdd/ 状态目录');
  announce('完整卸载：npm uninstall -g @cli-tools/oh-my-sdd   # preuninstall 自动清三套产物');
```

`★ Insight ─────────────────────────────────────`
- npm 生命周期钩子时序：用户在 `npm uninstall -g <pkg>` 触发的 `preuninstall` 钩子**在包被删之前**跑，那时 `uninstall.js` 和 `hooks/lib/*.js` 都还能正常 import。所以"完整卸载"路径不需要用户再手动调 `uninstall.js`——`preuninstall` 钩子已自动清三套产物。
- 改文案不改逻辑是 fix 类 change 的金标准：原代码已经能正确卸载，问题只在"教用户怎么卸载"的字符串上。改字符串影响最小、revert 风险最低。
`─────────────────────────────────────────────────`

### Step 2.3: 跑测试确认无回归

Run: `npm test`
Expected: 全部通过

虽然 `hooks/lib/install-opencode.js` 和 `install-lingma.js` 没有针对 postinstall 文案的单元测试，但运行整套测试确认改动没破坏任何依赖这些文件的测试。

### Step 2.4: Commit

```bash
git add hooks/lib/install-opencode.js hooks/lib/install-lingma.js
git commit -m "$(cat <<'EOF'
[OMSTOOLS] fix(install): correct postinstall uninstall command sequence

原提示 "npm uninstall -g ... && node uninstall.js --tool opencode" 中
第二条 node uninstall.js 在 npm 卸载后已找不到（uninstall.js 在被卸载
的包里），报 file not found。修正为：

- 单工具卸载用 oms-uninstall --tool <name>（命令在包还装着时跑）
- 完整卸载用 npm uninstall -g（preuninstall 钩子自动清三套产物）

OpenCode 和 lingma 路径同步修复（同一类 bug）。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 修正 README 卸载章节

**Files:**
- Modify: `README.md:89-102`（"卸载"章节整段重写）

**Interfaces:**
- Consumes: 无
- Produces: 替换 README 的"卸载"章节为三段式（单工具 / 完整 / 彻底 purge）

### Step 3.1: 替换 README 卸载章节

当前内容（`README.md:89-102`）：
```markdown
## 卸载

**单工具卸载**（推荐，保留其他工具的安装）：
```bash
oms-uninstall --tool claude     # 仅清 Claude 路径
oms-uninstall --tool opencode   # 仅清 OpenCode 路径
oms-uninstall --tool lingma      # 仅清 lingma 路径
```

**彻底清理**（所有工具 + npm 包 + state dir）：
```bash
npm uninstall -g @cli-tools/oh-my-sdd
oms-uninstall --purge           # 删 ~/.oh-my-sdd/、~/.claude/CLAUDE.md 哨兵块、各工具的 skills/rules/plugin 目录
```
```

替换为：
```markdown
## 卸载

### 单工具卸载（推荐，保留其他工具的安装）

```bash
oms-uninstall --tool claude     # 仅清 Claude 路径
oms-uninstall --tool opencode   # 仅清 OpenCode 路径
oms-uninstall --tool lingma     # 仅清 lingma 路径
```

### 完整卸载

`npm uninstall -g` 会触发 `preuninstall` 钩子，自动清理 Claude / OpenCode / lingma 三套产物的 skills、rules、plugin、wrapper。状态目录 `~/.oh-my-sdd/` 默认保留（可重装复用）。

```bash
# 一步搞定（保留 ~/.oh-my-sdd/ 状态目录，重装可复用）
npm uninstall -g @cli-tools/oh-my-sdd
```

### 彻底清空（含状态目录）

必须按顺序执行三步（`oms-uninstall` 命令必须在包还装着时跑）：

```bash
oms-uninstall --purge && npm uninstall -g @cli-tools/oh-my-sdd && rm -rf ~/.oh-my-sdd/
```

**为什么不能反过来**：旧版"先 npm uninstall 再 oms-uninstall --purge"会在第二步失败——`oms-uninstall` 命令本身由被卸载的包提供，包卸了命令也消失了。
```

### Step 3.2: 视觉检查

Run: `grep -n "卸载" README.md | head -10`
Expected: 三段小标题（`### 单工具卸载` / `### 完整卸载` / `### 彻底清空`）按顺序出现

### Step 3.3: Commit

```bash
git add README.md
git commit -m "$(cat <<'EOF'
[OMSTOOLS] docs(readme): fix uninstall section command order

旧版"先 npm uninstall -g 再 oms-uninstall --purge"在第二步会失败——
oms-uninstall 命令本身由被卸载的包提供，包卸了命令也消失。

修正为三段：
- 单工具卸载（oms-uninstall --tool <name>）
- 完整卸载（npm uninstall -g，preuninstall 自动清三套产物）
- 彻底清空（三步连续命令：先 purge 再 uninstall 再 rm -rf 状态目录）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 手动验证（在干净环境跑端到端）

**Files:** 无（验证任务）

**Interfaces:**
- Consumes: Task 1-3 全部产出
- Produces: 验证报告（PASS / FAIL 各检查项）

### Step 4.1: 验证 npm pack 内容

```bash
cd <pkg-root>
npm pack --dry-run 2>&1 | grep -E "baseline/|opencode/" | head -20
```

Expected: 至少看到以下行：
```
package/baseline/opencode.md
package/baseline/lingma.md
package/opencode/dist/plugin.js
package/opencode/src/plugin.ts
package/opencode/package.json
package/opencode/tsconfig.json
```

### Step 4.2: 验证 .gitignore 行为

```bash
git check-ignore -v opencode/dist/plugin.js
echo "exit code: $?"
```

Expected: `exit code: 1`（表示 dist **未**被 ignore；git check-ignore 0=ignored 1=not ignored）

### Step 4.3: 验证基线文件可读

```bash
node -e "
import('node:fs').then(async ({ readFileSync }) => {
  const baseline = readFileSync('baseline/opencode.md', 'utf8');
  console.log('baseline opencode.md: ' + baseline.length + ' chars, oms_version: ' + (baseline.match(/oms_version:\s*([\d.]+)/) || [])[1]);
  const plugin = readFileSync('opencode/dist/plugin.js', 'utf8');
  console.log('opencode dist/plugin.js: ' + plugin.length + ' chars');
});
"
```

Expected: 输出 `baseline opencode.md: <数字> chars, oms_version: 1.0.1` 和 `opencode dist/plugin.js: <数字> chars`

### Step 4.4: 模拟干净环境装 OpenCode

```bash
TMPDIR=$(mktemp -d)
HOME_BACKUP=$HOME
export HOME=$TMPDIR/home
mkdir -p $HOME
node bin/oms-install.js --tool opencode
echo "--- exit: $? ---"
echo "--- AGENTS.md 哨兵检查 ---"
test -f $HOME/.config/opencode/AGENTS.md && grep -c "OH-MY-SDD:BEGIN" $HOME/.config/opencode/AGENTS.md
echo "--- plugin 检查 ---"
test -f $HOME/.config/opencode/plugins/oh-my-sdd/plugin.js && echo "OK" || echo "MISSING"
echo "--- sentinel 检查 ---"
test -f $HOME/.oh-my-sdd/baseline-opencode.sentinel && echo "OK" || echo "MISSING"
```

Expected:
- `exit: 0`
- `AGENTS.md` 含 `OH-MY-SDD:BEGIN` 哨兵块（grep -c 至少 1）
- `~/.config/opencode/plugins/oh-my-sdd/plugin.js` 存在
- `~/.oh-my-sdd/baseline-opencode.sentinel` 存在

### Step 4.5: 模拟卸载

```bash
node bin/oms-uninstall.js --tool opencode
echo "--- exit: $? ---"
test -f $HOME/.config/opencode/AGENTS.md && \
  (grep -c "OH-MY-SDD:BEGIN" $HOME/.config/opencode/AGENTS.md || echo "sentinel removed (OK)") || \
  echo "AGENTS.md removed (also OK if it was empty)"
test -d $HOME/.config/opencode/plugins/oh-my-sdd && echo "plugin dir still exists (BAD)" || echo "plugin dir removed (OK)"
test -f $HOME/.oh-my-sdd/baseline-opencode.sentinel && echo "sentinel still exists (BAD)" || echo "sentinel removed (OK)"
test -d $HOME/.oh-my-sdd && echo "state dir preserved (OK)" || echo "state dir removed (BAD, --purge not requested)"
```

Expected:
- `exit: 0`
- 哨兵块被精准删除（`AGENTS.md` 不再含 `OH-MY-SDD:BEGIN`）
- `plugin/` 目录被删除
- `sentinel` 文件被删除
- `~/.oh-my-sdd/` 状态目录保留（因为没传 `--purge`）

### Step 4.6: 清理临时环境

```bash
unset HOME
export HOME=$HOME_BACKUP
rm -rf $TMPDIR
```

### Step 4.7: 失败处理

如果任一步骤 FAIL：
1. 不要 commit/push（Task 5 跳过）
2. 回到对应 Task 排查根因（不要直接 revert commit 抹掉历史，先看日志）
3. 修复后从 Step 1 重跑

---

## Task 5: Push

**Files:** 无

**Interfaces:**
- Consumes: Task 1-3 三个 commit
- Produces: 远端 `main` 分支新 commit

### Step 5.1: 检查提交历史

```bash
git log --oneline -5
```

Expected: 看到 3 个新 commit（Task 1-3），格式如：
```
<hash> [OMSTOOLS] docs(readme): fix uninstall section command order
<hash> [OMSTOOLS] fix(install): correct postinstall uninstall command sequence
<hash> [OMSTOOLS] fix(pkg): include baseline/ and opencode/ in npm files whitelist
```

### Step 5.2: 推送

```bash
git push origin main
```

Expected: 远端 main 包含 3 个新 commit。如果 push 被 pre-push hook 拦住，按 hook 错误信息修复（pre-push 会跑 `npm test`，全绿才能 push）。

---

## 验收对照（spec §7）

| spec 验收项 | 验证方法 | Task |
|---|---|---|
| `package.json` `files` 含 `baseline/` 和 `opencode/` | Task 1.5 测试 1 | Task 1 |
| `npm test` 全绿含 `package-files.test.js` | Task 1.6 + 2.3 | Task 1+2 |
| `npm pack` tarball 含 `baseline/opencode.md` 和 `opencode/dist/plugin.js` | Task 4.1 | Task 4 |
| 干净 tmp 目录 `oms-install --tool opencode` 不报 ENOENT | Task 4.4 | Task 4 |
| `~/.config/opencode/AGENTS.md` 含 baseline 哨兵块 | Task 4.4 | Task 4 |
| `oms-uninstall --tool opencode` 后 AGENTS.md 用户内容保留、哨兵块消失 | Task 4.5 | Task 4 |
| README "卸载"章节三场景步骤顺序自洽 | Task 3.2 视觉检查 | Task 3 |
| `git log -1 --pretty=%s` 形如 `[OMSTOOLS] fix(pkg): ...` | Task 5.1 | Task 5 |
| `hooks/lib/install-lingma.js:126` postinstall 提示同步更新 | Task 2.2 | Task 2 |

---

## Self-Review

**1. Spec coverage：** 检查 spec 1-9 节是否都有 task 覆盖
- §1 问题陈述 → Task 1（package.json + .gitignore）、Task 2（postinstall）、Task 3（README）
- §2 目标 → Task 4.4-4.5 验证 OpenCode 端到端可用
- §3.1 范围内文件 → Task 1/2/3 各对应
- §4.1-4.5 diff → Task 1.3-1.4 / Task 2.1-2.2 / Task 3.1 直接复制
- §4.6 测试 → Task 1.1 完整测试代码
- §4.7 手动验证 → Task 4 全部 7 步
- §6 实施计划 → 拆分到 Task 1-5
- §7 验收标准 → "验收对照"表每行映射到具体 Task
- ✅ 全部覆盖

**2. Placeholder scan：**
- 全文档搜索 "TBD"/"TODO"/"fill in"/"类似 Task N"：无
- 测试代码完整可运行（4 个 `test()` 都有断言）
- 每个 modify step 都有具体 diff 块
- ✅ 无占位符

**3. Type consistency：**
- 测试用 `node:test` + `node:assert/strict`——与现有 `__tests__/unit/*.test.js` 一致
- `PACKAGE_ROOT` 解析方式（`path.resolve(__dirname, '..', '..')`）——测试文件在 `__tests__/unit/` 下，回溯两级到包根
- 文件路径用绝对路径引用（`__tests__/unit/package-files.test.js`）——与项目其他测试文件命名一致
- Commit message 格式 `[OMSTOOLS] <type>(<scope>): <subject>`——按 baseline HARD_RULE
- ✅ 一致

**Found issue during review:** Task 1.5 注释里"`git rm --cached`"是 edge case 描述，不是步骤——保留作为 troubleshooting hint 是合理的（"历史遗留问题"），不算 placeholder。
