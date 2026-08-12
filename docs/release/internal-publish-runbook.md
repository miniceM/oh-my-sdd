# oh-my-sdd 内网发布 Runbook

> **目标读者**：企业内部负责把代码从外部 mac 笔记本搬到内网、跑 `npm publish` 的运维/发布工程师。
>
> **前置条件**：
> - 外部已完成 v0.1.0 tag（含代码冻结）
> - 你有内网 npm registry（`https://npm.enterprise.com/`）的写入权限
> - 你有内网 git 仓库（如 `git.enterprise.com/cli-tools/oh-my-sdd`）的 push 权限
> - 内网机器已装 Node.js ≥ 18 + npm ≥ 9 + claude CLI

---

## 总览

```
外部 mac                            内网
─────────                           ─────────
[v0.1.0 tag 已建]
    │
    │ ① 传输代码（git bundle / rsync / 物理介质）
    ▼
                                    [收到代码]
                                    ② 验证 tag + 完整性
                                    ③ 内网 dry-run
                                       (pack + 本地 install 测试)
                                    ④ 内网 git 仓库 push
                                    ⑤ npm registry publish
                                    ⑥ 安装验证（测试机）
                                    ⑦ 通知用户
```

---

## ① 传输代码到内网

### 方式 A: git bundle（推荐，保留所有历史 + tag）

**外部 mac 上**：
```bash
cd /Users/hosea/work/git/oh-my-sdd

# 创建 bundle（含所有 commit + tag）
git bundle create /tmp/oh-my-sdd-v0.1.0.bundle --all --tags

# 校验
git bundle verify /tmp/oh-my-sdd-v0.1.0.bundle
ls -lh /tmp/oh-my-sdd-v0.1.0.bundle
```

把 `oh-my-sdd-v0.1.0.bundle` 拷到内网（U 盘 / 内网传输工具）。

**内网上**：
```bash
git clone /path/to/oh-my-sdd-v0.1.0.bundle ~/work/oh-my-sdd
cd ~/work/oh-my-sdd

# 验证 tag 在
git tag -l
# 期望看到: v0.1.0

# 切到 tag
git checkout v0.1.0
```

### 方式 B: tar 包（如果 git bundle 不方便）

**外部 mac 上**：
```bash
cd /Users/hosea/work/git
tar czf /tmp/oh-my-sdd-v0.1.0.tar.gz oh-my-sdd/
```

**内网上**：
```bash
tar xzf /path/to/oh-my-sdd-v0.1.0.tar.gz
cd oh-my-sdd
git checkout v0.1.0   # tag 在 .git/ 里
```

⚠️ **不要用 `npm pack` 出来的 tgz 当源码**——它缺 `__tests__/`、`docs/` 等，没法跑测试。

---

## ② 验证 tag + 代码完整性

```bash
cd ~/work/oh-my-sdd

# 1. 看当前 HEAD
git log -1 --oneline
# 期望: 6e3481d docs(backlog): 标记 B-1 已解决

# 2. 看 tag
git describe --tags
# 期望: v0.1.0

# 3. 看 tag 完整信息（应包含 release notes）
git tag -l v0.1.0 -n50

# 4. 工作区干净
git status --short
# 期望: (空)

# 5. commit 总数
git log --oneline | wc -l
# 期望: ~43 (含 v0.1.0 tag 之前的全部历史)
```

**校验文件清单**：

```bash
ls -la
# 必须看到：
# - .claude-plugin/plugin.json
# - .claude-plugin/marketplace.json
# - install.js, uninstall.js
# - bin/ (7 个 CLI: oms-install, oms-uninstall, oms-login, oms-update,
#         oms-git-hooks, oms-welcome, oms-wrapper-verify)
# - skills/ (17 个 skill 目录：5 个 sdd-* + 12 个企业 skill)
# - content/ (4 个 .md: enterprise-baseline.md, lingma-baseline.md, auth-required.md, welcome-message.md)
# - hooks/ (4 个 hook + lib/ + git/)
# - scripts/ (dev-launch + dev-reinstall + check-baseline-tokens + ...)
# - wrappers/ (claude.sh, claude.ps1, claude.bat)
# - opencode/ (独立 TypeScript 子包，含自己的 package.json)
# - __tests__/ (单元 + 集成测试，共 352 个 case)
# - docs/ (specs + plans + roadmap + release)
# - package.json, package-lock.json, README.md
```

---

## ③ 内网 Dry-Run（关键步骤）

发布前**必须**在内网机器上跑一次完整安装测试。**不通过就停，不要硬发**。

### 3.1 测试 + schema 验证

```bash
# 1. 单元 + 集成测试（352 个）
npm test
# 期望: pass 352, fail 0

# 2. baseline token lint
npm run lint:baseline
# 期望: ✓ baseline token 估算: ~550 / 1000

# 3. Claude Code plugin schema 验证（金标准）
claude plugin validate .
# 期望: ✔ Validation passed
# 如果有 warning/error，停下查 spec

# 4. OpenCode 子包构建 + 测试
npm run build:opencode
cd opencode && npm run typecheck
# 期望: TypeScript 编译 0 错误
```

### 3.2 打包验证

```bash
# 打 tgz（这就是要 publish 的产物）
npm pack

# 看 tgz 内容（确保含所有必要文件，不含多余）
tar -tzf cli-tools-oh-my-sdd-0.1.0.tgz | sort
```

**期望 tgz 内容**（约 133 个文件）：

关键目录结构：
```
package/.claude-plugin/marketplace.json
package/.claude-plugin/plugin.json
package/README.md
package/install.js
package/uninstall.js
package/package.json
package/content/lingma-baseline.md
package/bin/oms-{install,uninstall,login,update,git-hooks,welcome,wrapper-verify}.js (7 个)
package/content/{auth-required,enterprise-baseline,welcome-message}.md
package/hooks/{hooks.json,pre-tool-use.js,post-tool-use.js,session-start.js,...} (4 个主 hook)
package/hooks/lib/*.js (~20 个库文件)
package/hooks/git/*.js (4 个 git hook 脚本)
package/hooks/git/lib/*.js (3 个 git hook 库)
package/skills/{sdd-spec,sdd-plan,sdd-task,sdd-apply,sdd-review,sdd-constitution,sdd-doc}/SKILL.md (7 个 sdd skill)
package/skills/{api-design,business-modeling,db-conventions,doc-writer,security-check,testing-strategy,fe-*}/SKILL.md (10 个企业 skill)
package/wrappers/claude.{sh,ps1,bat}
package/opencode/dist/*.js + *.d.ts + *.js.map + *.d.ts.map (OpenCode 编译产物)
```

⚠️ **如果 tgz 缺关键文件**（如 `.claude-plugin/`、`install.js`）：
- 检查 `package.json` 的 `files` 字段
- 检查 `opencode/dist/` 是否已构建（缺失时 `npm run build:opencode` 会自动编译）
- 不能 publish，重打包

### 3.3 本地安装端到端测试

```bash
# 用一个干净的测试账号或测试 HOME
TESTHOME=$(mktemp -d)
HOME=$TESTHOME npm install -g --foreground-scripts ./cli-tools-oh-my-sdd-0.1.0.tgz 2>&1 | tail -20

# 验证安装产物
HOME=$TESTHOME ls $TESTHOME/.claude/plugins/cache/oh-my-sdd/ 2>&1
# 期望: oh-my-sdd (plugin cache)

HOME=$TESTHOME cat $TESTHOME/.claude/CLAUDE.md | grep "BEGIN oh-my-sdd"
# 期望: 有 marker（baseline 已注入）

HOME=$TESTHOME claude plugin list 2>&1 | grep oh-my-sdd
# 期望: oh-my-sdd@oh-my-sdd ... enabled

# 卸载测试
HOME=$TESTHOME npm uninstall -g @cli-tools/oh-my-sdd 2>&1 | tail -5
HOME=$TESTHOME cat $TESTHOME/.claude/CLAUDE.md | grep "BEGIN oh-my-sdd"
# 期望: 无 marker（baseline 已清理）

# 清理测试 HOME
rm -rf $TESTHOME
```

**全部通过 → 进下一步。任一失败 → 停，回到外部 mac 修复后重新打 tag。**

---

## ④ 内网 Git 仓库 Push

```bash
# 添加内网 remote（如果还没有）
git remote add origin git@git.enterprise.com:cli-tools/oh-my-sdd.git

# push 主分支
git push -u origin main

# push tag
git push origin v0.1.0

# 验证
git ls-remote --tags origin | grep v0.1.0
# 期望: 看到 v0.1.0 tag
```

---

## ⑤ npm Registry Publish

### 5.1 配置 registry 凭据

```bash
# 配置 scope registry
npm config set @cli-tools:registry https://npm.enterprise.com/

# 登录（首次需要）
npm login --scope=@cli-tools --registry=https://npm.enterprise.com/
# 提示输入用户名/密码/邮箱（企业 SSO 或 npm enterprise 账号）

# 验证登录
npm whoami --registry=https://npm.enterprise.com/
# 期望: 你的用户名
```

### 5.2 正式 publish

```bash
# 双重检查包名 + 版本
npm view @cli-tools/oh-my-sdd --registry=https://npm.enterprise.com/ 2>&1 | head -3
# 期望: 如果是首次发布 → npm error E404
#       如果已有 → 显示已发布的版本列表（不应有 0.1.0）

# publish
npm publish --registry=https://npm.enterprise.com/

# 期望输出：
# npm notice 🔒 暂时禁用 Node 源码完整性验证...
# npm notice === Tarball Contents ===
# npm notice 32 files...
# npm notice total files: 32
# + @cli-tools/oh-my-sdd@0.1.0
```

⚠️ **publish 失败常见原因**：

| 错误 | 原因 | 修复 |
|------|------|------|
| `E403 Forbidden` | 没权限 / 未登录 | `npm login` 重新登录 |
| `E409 Conflict` | 0.1.0 已发布过 | 不能 republish，需 bump 到 0.1.1 |
| `E404` | scope 没配 registry | `npm config set @cli-tools:registry ...` |
| `ENEEDAUTH` | 凭据过期 | 重新 `npm login` |

### 5.3 验证 publish

```bash
npm view @cli-tools/oh-my-sdd@0.1.0 --registry=https://npm.enterprise.com/
# 期望: 显示包元信息（version: 0.1.0, dist.tarball, ...)

# 看版本列表
npm view @cli-tools/oh-my-sdd versions --registry=https://npm.enterprise.com/
# 期望: [ '0.1.0' ]
```

### 5.4 OpenCode 子包发布（可选）

OpenCode 插件是独立的 npm 包 `@cli-tools/oh-my-sdd-opencode`，发布流程独立：

```bash
# 进入 opencode 子目录
cd opencode

# 构建（编译 TypeScript）
npm run build

# 打 tgz 验证
npm pack
# 以 npm pack 输出为准；必须包含 dist/、.opencode/commands/、oms-skills/、
# delegated-skills/、bin/、hooks/、content/、scripts/ 和 README.md

# 发布前自动化验收（离线、可控 harness，不调用真实模型；从仓库根目录执行）
node --test \
  __tests__/integration/opencode/sdd-plan-harness.test.js \
  __tests__/integration/opencode/concurrent-pack.test.js \
  __tests__/unit/opencode/resource-scripts.test.js
# 期望: 0 failure；harness 覆盖 /sdd-plan 的 brainstorming → writing-plans 链路、
#       委派 skill 缺失时的 inline-content-resolution fallback、隔离 HOME/PATH
#       （无 claude shim）以及并发 npm pack 的资源同步串行化

# 并发 prepack 稳定性（两个进程同时打包）
mkdir -p /private/tmp/oms-pack-a /private/tmp/oms-pack-b
npm pack --dry-run --json --cache /private/tmp/oms-pack-a --pack-destination /private/tmp/oms-pack-a &
npm pack --dry-run --json --cache /private/tmp/oms-pack-b --pack-destination /private/tmp/oms-pack-b &
wait
# 期望: 两个进程均退出码 0，pack 清单各含 5 个主委派 skill

# pack 后工作区无内容漂移
git status --porcelain
# 期望: 无输出（prepack 的资源同步不得污染工作区）

# 发布到企业 registry
npm publish --registry=https://npm.enterprise.com/

# 验证
npm view @cli-tools/oh-my-sdd-opencode@0.2.1 --registry=https://npm.enterprise.com/
# 期望: 显示包元信息
```

⚠️ **OpenCode 包特殊点**：
- 用户安装后 `postinstall` 脚本自动复制 skills/commands 到 `~/.config/opencode/`
- `postinstall` 在 `~/.config/opencode/AGENTS.md` 维护一个 oh-my-sdd baseline 区块；重复安装幂等，卸载只删除该区块
- 版本号独立管理（主包 0.1.0，OpenCode 包 0.2.1）

---

## ⑥ 安装验证（内网测试机）

选一台**没参与开发**的机器模拟真实用户安装：

### 6.1 主包 `@cli-tools/oh-my-sdd` 验证

```bash
# 模拟用户安装
npm install -g --foreground-scripts @cli-tools/oh-my-sdd

# 期望输出（用户视角）：
# ⚠️  未检测到 iam CLI。可继续安装...
# → 检查 Node 版本与 iam CLI
# → 初始化 ~/.oh-my-sdd/ 状态目录
# → 注册 marketplace
#   ✓ 已注册 marketplace：/opt/.../node_modules/@cli-tools/oh-my-sdd
# → 安装 plugin
#   ✓ 已安装 plugin：oh-my-sdd@oh-my-sdd
# → 注入 baseline 到 ~/.claude/CLAUDE.md
#   ✓ 已注入 baseline 到 /Users/<user>/.claude/CLAUDE.md
# 
# ✓ oh-my-sdd 安装完成

# 验证 plugin 注册
claude plugin list | grep oh-my-sdd
# 期望: oh-my-sdd@oh-my-sdd ... enabled

# 验证 baseline 注入
grep "BEGIN oh-my-sdd" ~/.claude/CLAUDE.md
# 期望: 命中

# 验证 CLI 命令
oms-install --help
oms-login --help
# 期望: 显示帮助信息

# 启动 Claude Code 测试
claude
# 在会话里问："你是谁？"
# 期望回答含: "企业 SDD Agent"
```

### 6.2 OpenCode 子包 `@cli-tools/oh-my-sdd-opencode` 验证（可选）

```bash
# 安装 OpenCode 插件
npm install -g @cli-tools/oh-my-sdd-opencode

# 验证 postinstall 脚本执行
ls ~/.config/opencode/skills/
# 期望: 含 sdd-spec, sdd-plan, sdd-task, sdd-apply, sdd-review 等

ls ~/.config/opencode/commands/
# 期望: 含 sdd-spec.md, sdd-plan.md, sdd-task.md, sdd-apply.md, sdd-review.md

# 启动 OpenCode
opencode
# 在会话里问："你是谁？"
# 期望回答含: "企业 SDD Agent"

# 测试 /sdd-spec
/sdd-spec test-change
# 期望: 看到 Ring 1 工作流指令
```

**全通过 → 进 ⑦ 通知。失败 → 走 Rollback 流程。**

---

## ⑦ 通知用户

发布完成后通知目标用户群（邮件 / IM 群 / wiki）：

```
主题: [发布通知] oh-my-sdd v0.1.0 已发布

@cli-tools/oh-my-sdd v0.1.0 已发布到企业 npm registry。

【新安装】
  npm install -g --foreground-scripts @cli-tools/oh-my-sdd
  oms-login  # 用 iam 凭据登录
  # 重启 Claude Code

【已安装用户】
  无需操作，v0.1.0 是首个正式版本。

【变更摘要】
  - 5 个 SDD 斜杠命令 (/sdd-spec, /sdd-plan, /sdd-task, /sdd-apply, /sdd-review)
  - 12 个企业 skills (api-design, security-check, db-conventions, business-modeling, testing-strategy, doc-writer, fe-*)
  - 企业 baseline 自动注入到 ~/.claude/CLAUDE.md
  - iam 身份校验 + DOP 埋点
  - 支持 3 种 AI 工具: Claude Code, 通义灵码 Lingma, OpenCode
  - macOS / Linux / Windows 跨平台

【OpenCode 用户（可选）】
  npm install -g @cli-tools/oh-my-sdd-opencode
  # 启动 OpenCode 即可使用 /sdd-* 命令

【已知限制】
  - 受 Claude Code bug #16538 影响，plugin SessionStart hook 的
    additionalContext 不工作。当前通过 ~/.claude/CLAUDE.md 绕过。

【文档】
  - README: README.md
  - 安装指南: INSTALL.md
  - 发布 Runbook: docs/release/internal-publish-runbook.md
  - 冒烟测试: docs/smoke-test-checklist.md

【反馈】
  问题/建议请回复本邮件或建 issue: 
  https://git.enterprise.com/cli-tools/oh-my-sdd/issues
```

---

## 🚨 Rollback 流程

### 场景 A: 发现严重 bug，需要回退

npm registry **不允许 republish 同版本号**。两个选项：

#### 选项 1: 发布补丁版（推荐）
```bash
# 在外部 mac 修复 bug
# bump 版本
npm version patch  # 0.1.0 → 0.1.1
# 提交 + 打 tag
git push origin main v0.1.1
# 内网重新走流程 publish 0.1.1
```

通知用户升级：
```
主题: [紧急] oh-my-sdd 0.1.0 有严重 bug，请升级到 0.1.1

问题: <bug 描述>
影响: <哪些用户/场景>
修复: 0.1.1

升级步骤:
  npm install -g --foreground-scripts @cli-tools/oh-my-sdd@0.1.1
```

#### 选项 2: unpublish（24 小时内 + 无人 install 时才能用）
```bash
# 24 小时窗口内可以 unpublish
npm unpublish @cli-tools/oh-my-sdd@0.1.0 --registry=https://npm.enterprise.com/

# 如果已超过 24h 或有人 install 过，npm 会拒绝
# 此时只能走选项 1（发新版本）
```

⚠️ **unpublish 风险**：
- 已 install 的用户 `npm install` 会失败
- 企业 registry 可能配置了更严格的策略（72h 或永久不可 unpublish）
- 优先用选项 1（补丁版）

### 场景 B: 已 install 用户报错

让用户跑：
```bash
# 诊断
oms-doctor 2>&1 || node $(npm root -g)/@cli-tools/oh-my-sdd/bin/oms-install.js

# 卸载重装
npm uninstall -g @cli-tools/oh-my-sdd
rm -rf ~/.claude/plugins/cache/oh-my-sdd
grep -v "oh-my-sdd:enterprise-baseline" ~/.claude/CLAUDE.md > /tmp/x && mv /tmp/x ~/.claude/CLAUDE.md
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
```

---

## 📋 版本策略（semver）

| 变更类型 | semver | 例子 |
|---------|--------|------|
| baseline 文本改（即使是 1 行） | MINOR | 0.1.0 → 0.2.0 |
| 新增 SDD 命令 / skill | MINOR | 0.1.0 → 0.2.0 |
| hook schema 变更（破坏性） | MAJOR | 0.x → 1.0.0 |
| Bug 修复 | PATCH | 0.1.0 → 0.1.1 |
| 配置文件 schema 变更 | MINOR | 0.1.0 → 0.2.0 |

**0.x 阶段**允许 minor 版本里有"小破坏"，1.0 起严格 semver。

---

## 📝 发布日志模板

每次发布填一份，存到 `docs/release/CHANGELOG.md`：

```markdown
# Changelog

## [0.1.1] - YYYY-MM-DD

### Fixed
- <bug 描述> (issue #X)

### Changed
- <变更描述>

### Known Issues
- <已知问题>

## [0.1.0] - 2026-06-19

### Added (首版)
- 5 个 SDD 斜杠命令
- 12 个企业 skills (api-design, security-check, db-conventions, business-modeling, testing-strategy, doc-writer, fe-*)
- iam 身份校验 + DOP 埋点
- 跨平台支持 (macOS/Linux/Windows)
- 多工具支持 (Claude Code, 通义灵码 Lingma, OpenCode)

### Known Issues
- plugin SessionStart hook additionalContext 受 Claude Code bug #16538 影响
  （通过 ~/.claude/CLAUDE.md 绕过）
```

---

## ✅ 发布前最终 Checklist

发布工程师执行：

- [ ] 代码已传内网，`git tag -l v0.1.0` 能看到
- [ ] `git status` 干净
- [ ] `npm test` → 352/352 pass
- [ ] `npm run lint:baseline` → 通过
- [ ] `claude plugin validate .` → ✔ Validation passed
- [ ] `npm run build:opencode` → TypeScript 编译 0 错误
- [ ] `npm pack` 产出的 tgz 含 ~133 个文件
- [ ] 本地 install + uninstall 测试通过（在测试 HOME 里）
- [ ] 已 push 到内网 git 仓库
- [ ] `npm login` 成功
- [ ] `npm publish` 成功
- [ ] `npm view @cli-tools/oh-my-sdd@0.1.0` 能查到
- [ ] 测试机安装一遍 → plugin enabled + baseline 注入
- [ ] 通知已发送

### OpenCode 子包 Checklist（可选）

- [ ] `cd opencode && npm run build` → TypeScript 编译成功
- [ ] `npm pack` → 包含 `.opencode/commands/`、`oms-skills/`、`delegated-skills/` 和 `bin/`
- [ ] `npm publish` 成功
- [ ] `npm view @cli-tools/oh-my-sdd-opencode@0.2.1` 能查到
- [ ] 测试机安装 → postinstall 复制 skills/commands 到 `~/.config/opencode/`

**全部勾选 = 发布成功** 🎉

任一失败 = 走 Rollback。

---

## 📞 联系人

| 角色 | 名字 | 联系方式 |
|------|------|---------|
| 发布工程师 | <填> | <邮箱/IM> |
| npm registry 管理员 | <填> | <邮箱/IM> |
| 紧急 rollback 审批 | <填> | <邮箱/IM> |
| 用户支持 | <填> | <邮箱/IM> |
