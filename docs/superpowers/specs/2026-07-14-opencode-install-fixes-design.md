# OpenCode 安装包发布修复 + 卸载文档修正

- **change-id**: `[OMSTOOLS]`
- **type**: `fix`
- **SDD 形态**: 轻量（spec+plan 合并写，apply+review 单独跑）
- **author**: hosea
- **date**: 2026-07-14
- **scope**: 配置 + 文档 + 测试（不改动运行时逻辑）

## 1. 问题陈述

`d3b9bf1 [OMSTOOLS] feat(plan): 多 AI 工具兼容适配 — OpenCode + 通义灵码 Qoder CN` 引入 OpenCode 适配后，npm 包未能在新装环境独立工作。具体：

1. **`package.json` `files` 白名单缺 `baseline/` 和 `opencode/`**——install 路径在以下两处读源数据目录，发布后找不到文件：
   - `hooks/lib/install-opencode.js:60` `readFile('../../baseline/opencode.md')`
   - `hooks/lib/install-opencode.js:121` `stat('opencode/src/plugin.ts')` 和 `:107` `compile(opencodeDir, ...)`
2. **README "卸载" 章节的"完整卸载"步骤顺序错**——`oms-uninstall --purge` 在 `npm uninstall -g` **之后**无法执行（命令本身由被卸载的包提供）。
3. **`hooks/lib/install-opencode.js:170` 的 OpenCode postinstall 文案有相同问题**——建议用户 `npm uninstall -g @cli-tools/oh-my-sdd && node uninstall.js --tool opencode`，但 `uninstall.js` 在 npm 卸载后不存在。
4. **`hooks/lib/install-lingma.js:126` 存在相同 bug**（`卸载：npm uninstall -g ... && node uninstall.js --tool lingma`）——同一类错误，**本次同步修复**以保持安装提示文案一致性。

### 1.1 触发场景

| 场景 | 现象 | 影响 |
|---|---|---|
| 干净 tmp 目录 `npm install -g @cli-tools/oh-my-sdd` | postinstall 跑 `install.js` → OpenCode 路径触发 `readFile('baseline/opencode.md')` 抛 ENOENT | OpenCode 完全装不上；basline 哨兵块写不进去；plugin.js 也读不到 |
| 用户照 README 跑"完整卸载" | `npm uninstall -g` 完成后 `oms-uninstall --purge` 报 `command not found` | 卸载残留无法清理；用户需手动 `rm -rf ~/.oh-my-sdd/` |
| 用户照 `hooks/lib/install-opencode.js` postinstall 提示跑卸载 | `npm uninstall -g` 完成后 `node uninstall.js --tool opencode` 报 file not found | 误以为卸载失败 |

## 2. 目标

1. **发布后 npm 包的 OpenCode 路径能独立工作**——`npm install -g` 后 `~/.config/opencode/AGENTS.md` 自动含 baseline 哨兵块，`~/.config/opencode/plugins/oh-my-sdd/plugin.js` 自动存在。
2. **卸载文档在所有路径下自洽**——单工具卸载、完整卸载、彻底 purge 三种场景的步骤顺序都正确。
3. **新增白名单有回归保护**——CI / `npm test` 能 catch "有人误删 files 数组里的 baseline/" 之类的回退。

## 3. 范围

### 3.1 范围内

| 文件 | 变更 | 行为变化 |
|---|---|---|
| `package.json` | `files` 数组加 `"baseline/"` 和 `"opencode/"` | npm pack 包含这两个目录 |
| `.gitignore` | 新增 `!/opencode/dist/` 和 `!/opencode/dist/**` 例外 | `opencode/dist/plugin.js` 被 git 跟踪 |
| `README.md` | 重写"卸载"章节 | 单工具 / 完整 / purge 三种路径步骤顺序正确 |
| `hooks/lib/install-opencode.js` | 修正第 170 行 OpenCode postinstall 文案 | 提示用户用 `oms-uninstall --tool opencode` 和 `npm uninstall -g` |
| `hooks/lib/install-lingma.js` | 修正第 126 行 lingma postinstall 文案 | 提示用户用 `oms-uninstall --tool lingma` 和 `npm uninstall -g` |
| `__tests__/unit/package-files.test.js` | 新建 | 断言 `files` 包含 `baseline/` 和 `opencode/`；`npm pack --dry-run` 输出包含对应路径；`.gitignore` 有例外 |

### 3.2 范围外（不动）

- `uninstall.js` 运行时逻辑（`preuninstall` 钩子已能正确处理，问题是文档，不是代码）
- `hooks/lib/install-opencode.js` 内部安装逻辑（`readFile(baseline/opencode.md)` 等已正确；本次只改第 170 行 postinstall 文案）
- `hooks/lib/install-lingma.js` 内部安装逻辑（同上，只改第 126 行文案）
- `opencode/src/plugin.ts` 或 `opencode/dist/plugin.js` 本身（不需改源码）
- `.npmignore`（用 `files` 模式，足够）
- `package.json` `engines` / `publishConfig` / `dependencies`（无变化）
- 单元测试中已有 TOOL_MAP / SENTINEL_RE 等测试
- `hooks/lib/install-claude.js`（该文件 postinstall 段无同款问题，**不需改**）

## 4. 设计

### 4.1 `package.json` `files` 变更

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

加 `"baseline/"` 和 `"opencode/"` 两个白名单条目，让它们整体进 tarball。

### 4.2 `.gitignore` 变更

```diff
 dist/
+!/opencode/dist/
+!/opencode/dist/**
```

加两条 `!` 例外，让 `opencode/dist/` 目录及内容**重新**纳入 git 跟踪。双写法（`/dir/` + `/dir/**`）覆盖目录本身和子文件，Git 文档推荐。

### 4.3 README "卸载" 章节

```markdown
## 卸载

### 单工具卸载（推荐，保留其他工具的安装）

\`\`\`bash
oms-uninstall --tool claude     # 仅清 Claude 路径
oms-uninstall --tool opencode   # 仅清 OpenCode 路径
oms-uninstall --tool lingma     # 仅清 lingma 路径
\`\`\`

### 完整卸载

`npm uninstall -g` 会触发 `preuninstall` 钩子，自动清理 Claude / OpenCode / lingma 三套产物的 skills、rules、plugin、wrapper。状态目录 `~/.oh-my-sdd/` 默认保留（可重装复用）。

\`\`\`bash
# 一步搞定（保留 ~/.oh-my-sdd/ 状态目录，重装可复用）
npm uninstall -g @cli-tools/oh-my-sdd

# 彻底清空（含状态目录）—— 必须按顺序执行：
#   1. oms-uninstall --purge 先清状态（命令必须在包还装着时跑）
#   2. 再 npm uninstall -g 卸包
#   3. 最后手动删状态目录
oms-uninstall --purge && npm uninstall -g @cli-tools/oh-my-sdd && rm -rf ~/.oh-my-sdd/
\`\`\`
```

### 4.4 `hooks/lib/install-opencode.js` 第 170 行 OpenCode postinstall 文案

```diff
-  announce('卸载：npm uninstall -g @cli-tools/oh-my-sdd && node uninstall.js --tool opencode');
+  announce('卸载（仅清 OpenCode）：oms-uninstall --tool opencode   # 保留 ~/.oh-my-sdd/ 状态目录');
+  announce('完整卸载：npm uninstall -g @cli-tools/oh-my-sdd   # preuninstall 自动清三套产物');
```

### 4.5 `hooks/lib/install-lingma.js` 第 126 行 lingma postinstall 文案

```diff
-  announce('卸载：npm uninstall -g @cli-tools/oh-my-sdd && node uninstall.js --tool lingma');
+  announce('卸载（仅清 lingma）：oms-uninstall --tool lingma   # 保留 ~/.oh-my-sdd/ 状态目录');
+  announce('完整卸载：npm uninstall -g @cli-tools/oh-my-sdd   # preuninstall 自动清三套产物');
```

### 4.6 新增测试 `__tests__/unit/package-files.test.js`

测试用例：

1. `package.json` 的 `files` 数组包含 `"baseline/"` 和 `"opencode/"`。
2. `npm pack --dry-run` 输出包含 `baseline/opencode.md`、`baseline/lingma.md`、`opencode/dist/plugin.js`、`opencode/src/plugin.ts`。
3. `.gitignore` 包含 `!/opencode/dist/` 例外。
4. `git check-ignore -v opencode/dist/plugin.js` 返回非零（说明 dist 不被 ignore）。

### 4.7 手动验证步骤（apply 阶段跑）

1. `npm pack` 在工作树根目录生成 tarball
2. `tar -tzf oh-my-sdd-*.tgz | grep -E 'baseline/|opencode/'` 验证内容
3. 在干净 tmp 目录 `npm install <tarball>`（或 `npm install -g`），跑 `oms-install --tool opencode`，验证：
   - `~/.config/opencode/AGENTS.md` 出现 `<!-- OH-MY-SDD:BEGIN -->` 哨兵块
   - `~/.config/opencode/plugins/oh-my-sdd/plugin.js` 存在
   - `~/.oh-my-sdd/baseline-opencode.sentinel` 存在
4. 跑 `oms-uninstall --tool opencode` 验证三个产物被精准删除（AGENTS.md 保留用户内容，state 目录保留）

## 5. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 加 `baseline/` 让包变大 | baseline 2 个文件共 ~7KB，影响可忽略 |
| 加 `opencode/` 让包变大 | opencode/ 全部 4 文件 ~15KB，影响可忽略 |
| `opencode/dist/` 进版本控制后 dev 改了 src 不重 build 会过期 | `hooks/lib/install-opencode.js:105-118` 已有 mtime 比较：dist 旧于 src 时自动 `npx tsc` 重 build |
| `.gitignore` 改后其他 `dist/` 仍被忽略 | `!/opencode/dist/**` 只反转 `opencode/dist/`，不影响其他 dist |
| `package-files.test.js` 失败但生产已发布 | 测试加在 pre-push hook（已有），本地 commit 时不会拦下但 push 时会拦下 |
| 卸载文档改后老用户照旧文档操作仍可能误用 | 不在本次 scope 范围（公告/发版说明走 release 流程） |

## 6. 实施计划（spec+plan 合并）

| 步骤 | 文件 | 预计耗时 |
|---|---|---|
| 1. 改 `package.json` `files` | `package.json` | 1 min |
| 2. 改 `.gitignore` 加 `opencode/dist/` 例外 | `.gitignore` | 1 min |
| 3. 改 `hooks/lib/install-opencode.js:170` OpenCode postinstall 文案 | `hooks/lib/install-opencode.js` | 1 min |
| 3a. 改 `hooks/lib/install-lingma.js:126` lingma postinstall 文案 | `hooks/lib/install-lingma.js` | 1 min |
| 4. 改 `README.md` 卸载章节 | `README.md` | 3 min |
| 5. 新建 `__tests__/unit/package-files.test.js` | 新文件 | 5 min |
| 6. 跑 `npm test` 验证 | - | 1 min |
| 7. 跑 4.7 节手动验证步骤 | - | 5-10 min |
| 8. `git add` + commit（消息 `[OMSTOOLS] fix: ...`）+ push | - | 1 min |

## 7. 验收标准

- [ ] `package.json` `files` 数组含 `"baseline/"` 和 `"opencode/"`
- [ ] `npm test` 全绿，含新增 `package-files.test.js`
- [ ] `npm pack` 生成的 tarball 含 `baseline/opencode.md` 和 `opencode/dist/plugin.js`
- [ ] 干净 tmp 目录 `npm install -g <tarball>` 后 `oms-install --tool opencode` 不报 ENOENT
- [ ] 干净 tmp 目录跑完安装后 `~/.config/opencode/AGENTS.md` 含 baseline 哨兵块
- [ ] `oms-uninstall --tool opencode` 后 `AGENTS.md` 用户内容保留、哨兵块消失
- [ ] README "卸载"章节的三种场景（单工具 / 完整 / purge）步骤顺序均自洽
- [ ] `git log -1 --pretty=%s` 形如 `[OMSTOOLS] fix(pkg): OpenCode 安装包 files 白名单补全 + 卸载文档修正`
- [ ] `hooks/lib/install-lingma.js:126` postinstall 提示同步更新（与 OpenCode 一致）

## 8. 后续 TODO（不进本次 commit）

- [ ] 发版说明（release notes）里加 "OpenCode 路径发布修复" 段
- [ ] 在 `package.json` `scripts` 里加 `"pack:verify": "npm pack --dry-run | grep -E 'baseline/|opencode/'"` 便于手动验证
- [ ] 考虑 `package.json` `scripts.prepublishOnly` 钩子里加 `pack:verify` 自动跑

## 9. 参考

- `hooks/lib/install-opencode.js:46-80`（baseline 注入 + dist 编译逻辑）
- `hooks/lib/install-opencode.js:200-260`（uninstall 逻辑，确认不需改）
- `hooks/lib/install-lingma.js:120-140`（lingma 卸载逻辑，行为正确无需改）
- `uninstall.js:124-160`（preuninstall 钩子分发，确认行为正确）
- `package.json:22-31`（当前 `files` 白名单）
- 历史 commit: `d3b9bf1 [OMSTOOLS] feat(plan): 多 AI 工具兼容适配 — OpenCode + 通义灵码 Qoder CN`
