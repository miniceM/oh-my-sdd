# oh-my-sdd npm 包内网发布指南 —— 面向首次执行发布的新人开发者

> 版本：v1.1 · 最后更新：2026-08-20 · 负责人：oh-my-sdd 团队 · 评审：待评审

---

## 0. 这份文档给谁读

| 你是谁 | 怎么用本文档 |
| --- | --- |
| **第一次执行发布的开发者**（本文主要读者） | 顺序通读全文，发布时对照 §10 Checklist 逐项打勾 |
| 只想了解发布机制、不执行操作 | 读 §1、§2 即可，约 5 分钟 |
| 熟练发布人，需要精确的期望输出样例 | 直接用[内网发布 Runbook](internal-publish-runbook.md) |

**本文档与 Runbook 的分工**：本文档是教学入口，解释每一步"为什么"，帮你首次独立完成发布；[Runbook](internal-publish-runbook.md) 是权威操作手册，面向运维/发布工程师，含完整期望输出和回滚细节。**两者内容不一致时，以 Runbook 为准**。

时间预期：首次发布建议预留 3-4 小时（大部分耗在内网验证和测试机验证）；熟练后全程约 1 小时。

---

## 1. 背景知识：发布的是什么、为什么要"搬运"

### 1.1 两个固定版本的 npm 包

| 包名 | 用途 | 版本在哪改 |
| --- | --- | --- |
| `@cli-tools/oh-my-sdd` | 通用企业 SDD 产品：面向 Claude Code、Lingma、KiloCode 及未来宿主的安装器、基线、skills、hooks 和控制面 | `packages/product/package.json` |
| `@cli-tools/oh-my-sdd-opencode` | OpenCode 原生桥接：满足 OpenCode npm 插件加载与生命周期要求，并消费产品包派生资源 | `packages/opencode-plugin/package.json` |

根目录仅负责工作区编排，不发布。两个公开包通过 `.changeset/config.json` 的 `fixed` 组保持相同版本；产品能力在 `packages/product/` 唯一维护，OpenCode 包中的 skills、content、hooks、lib 是可校验的派生产物。

### 1.2 为什么不能在外部机器直接 publish

企业网络是隔离的：代码在外部 Mac 开发，而 npm registry（`https://npm.enterprise.com/`）只在内网可达。所以外部机器连不上 registry，必须先把代码传进内网、从内网机器执行 `npm publish`。当前流程没有 CI/CD 自动化，全程手动。

### 1.3 全流程一览

```
外部开发机                内网发布机              企业 registry
───────────              ────────────            ─────────────
版本 bump（走 Issue→PR）
打 v<版本> tag
    │
    │ git bundle / tar 传输
    ▼
                        clone + 验证
                        npm test + npm pack
                        本地安装演练（dry-run）
                        推送到内网 git（镜像分发）
                        npm publish ──────────────► 用户可 npm install

测试机（未参与开发的机器）安装验证 ──► 通知用户
```

### 1.4 术语表

| 术语 | 含义 |
| --- | --- |
| registry | npm 包仓库服务。本项目指 `https://npm.enterprise.com/`，只在内网可达 |
| scope | 包名前的 `@命名空间`。本项目为 `@cli-tools`，npm 靠它决定包发到哪个 registry |
| git tag | 指向某次 commit 的版本标记（如 `v0.1.1`），是发布代码的"锚点"；与 npm 版本号必须一致 |
| semver | 语义化版本 `major.minor.patch`，决定 bump 哪一位，见 §3.2 的表格 |
| git bundle | 把 git 历史 + tag 打成单个文件，用于跨网传输 |
| `npm pack` | 按 `package.json` 的 `files` 白名单生成 `.tgz`，即 publish 的产物 |
| dry-run | 正式发布前的完整演练，目的把问题拦在包公开之前 |

---

## 2. 首次发布前：你需要拿到的东西

新人第一次发布，最常见的阻塞是权限和介质，而不是命令。先逐项确认：

| # | 事项 | 通常向谁申请 | 验证方式 |
| --- | --- | --- | --- |
| 1 | 内网发布机访问权限（已装 Node ≥ 18、npm ≥ 9、claude CLI） | IT / 团队负责人 | `node --version && npm --version` |
| 2 | registry 账号 + `@cli-tools` scope 发布权限 | registry 管理员 | `npm whoami --registry=https://npm.enterprise.com/` 显示用户名 |
| 3 | 内网 git 仓库 push 权限（`git@git.enterprise.com:cli-tools/oh-my-sdd.git`） | 仓库管理员 | `git ls-remote git@git.enterprise.com:cli-tools/oh-my-sdd.git` 有输出 |
| 4 | 跨网传输介质（U 盘或内部文件传输工具） | IT | — |
| 5 | 联系人清单（发布工程师 / registry 管理员 / 紧急回滚审批） | 团队 | 见 Runbook 末尾联系人表 |

首次配置 npm scope registry（一次即可，之后不用重复）：

```bash
npm config set @cli-tools:registry https://npm.enterprise.com/
```

> 本指南命令均为 bash（macOS / Linux）。内网机器若是 Windows，路径与命令的 PowerShell 等价形式参见 [INSTALL.md](../../INSTALL.md) 的"Windows 路径"一节。

---

## 3. 外部开发机：准备版本

### 3.1 确认代码就绪

```bash
# 1. 工作区干净
git status --short
# 期望: 无输出

# 2. 全量测试通过
npm test

# 3. baseline token 预算检查
npm run lint:baseline

# 4. OpenCode 原生桥接构建与资源同步
npm run build --workspace=@cli-tools/oh-my-sdd-opencode
npm run sync:opencode
```

### 3.2 bump 版本号（必须走 Issue → 分支 → PR）

本项目强制所有变更（包括版本号 bump）不得直接提交 `main`，必须走 Issue → 分支 → PR 流程：

```bash
# 1. 创建发布 Issue（标题如 "Release v0.1.1"），记下编号，下文记为 N
# 2. 从最新 main 创建发布分支
git checkout main && git pull
git checkout -b chore/issue-N-release-v0.1.1

# 3. 根据 Changeset 生成固定组版本；不要手工分别修改两个 package.json
npx changeset version
# 随后运行 npm run release:check，确认两个公开包版本和资源快照一致

# 4. 推送分支并创建 PR，正文关联 Issue（如 Closes #N）
git push -u origin chore/issue-N-release-v0.1.1

# 5. PR 审核合并后，在本地最新 main 上打 tag
git checkout main && git pull
git tag -a v0.1.1 -m "release: v0.1.1（一句话变更摘要）"
```

**版本号怎么选**：

| 变更类型 | bump 哪一位 | 示例 |
| --- | --- | --- |
| bug 修复 | patch | `0.1.0` → `0.1.1` |
| 新增 SDD 命令 / skill | minor | `0.1.0` → `0.2.0` |
| baseline 文本修改（即使 1 行） | minor | `0.1.0` → `0.2.0` |
| 配置文件 schema 变更 | minor | `0.1.0` → `0.2.0` |
| hook schema 破坏性变更 | major | `0.9.0` → `1.0.0` |

> 0.x 阶段允许 minor 版本内含少量不兼容调整；1.0 起严格 semver。

### 3.3 传输代码到内网

#### 方式 A：git bundle（推荐，保留完整历史 + tag）

```bash
# 外部机器：创建并校验 bundle
git bundle create /tmp/oh-my-sdd-v0.1.1.bundle --all --tags
git bundle verify /tmp/oh-my-sdd-v0.1.1.bundle
ls -lh /tmp/oh-my-sdd-v0.1.1.bundle
```

通过 U 盘或内网传输工具把 bundle 拷到内网。

#### 方式 B：tar 包（bundle 不方便时）

```bash
cd /path/to/parent/dir
tar czf /tmp/oh-my-sdd-v0.1.1.tar.gz oh-my-sdd/
```

> ⚠️ 不要用 `npm pack` 出来的 tgz 当源码包传输——它只含 `files` 白名单里的运行产物，缺 `__tests__/`、`docs/`，内网没法跑验证。

---

## 4. 内网发布机：验证与演练（dry-run）

> 本节目的：在包对全员可见之前，于内网环境完整演练一次。**任何一步失败就停，不要硬发**——回到外部机器修复、重新打 tag、重新传输。

### 4.1 解出代码

```bash
# bundle 方式
git clone /path/to/oh-my-sdd-v0.1.1.bundle ~/work/oh-my-sdd
cd ~/work/oh-my-sdd
git checkout v0.1.1

# tar 方式
tar xzf /path/to/oh-my-sdd-v0.1.1.tar.gz
cd oh-my-sdd
git checkout v0.1.1
```

### 4.2 验证完整性

```bash
git describe --tags          # 期望: v0.1.1
git status --short           # 期望: 无输出
ls packages/product/.claude-plugin/plugin.json packages/product/install.js packages/product/bin/ packages/product/skills/ packages/product/hooks/ packages/product/content/ packages/product/package.json packages/opencode-plugin/package.json
# 期望: 全部存在
```

### 4.3 跑测试

```bash
npm test                     # 全部 pass
npm run lint:baseline        # 通过
claude plugin validate .     # 期望: ✔ Validation passed
npm run build --workspace=@cli-tools/oh-my-sdd-opencode  # TypeScript 编译 0 错误
npm run sync:opencode
```

### 4.4 打包验证

```bash
npm pack --workspace=@cli-tools/oh-my-sdd
npm pack --workspace=@cli-tools/oh-my-sdd-opencode
tar -tzf cli-tools-oh-my-sdd-*.tgz | sort
```

文件数量以当次 `npm pack` 输出为准（随版本演进会变）。关键是核对必备目录都在：

- `package/.claude-plugin/plugin.json`
- `package/install.js`、`package/bin/oms-*.js`
- `package/skills/`、`package/content/`、`package/hooks/`
- OpenCode 桥接包中的 `package/dist/`、`package/lib/`、`package/oms-skills/`

若缺关键文件：检查对应工作区 `package.json` 的 `files` 字段，确认桥接构建与 `npm run sync:opencode` 已执行，重新打包。

### 4.5 本地安装演练

用临时 HOME 模拟真实用户，不污染本机环境：

```bash
TESTHOME=$(mktemp -d)

# 安装
HOME=$TESTHOME npm install -g --foreground-scripts ./cli-tools-oh-my-sdd-*.tgz

# 验证 plugin 注册 + baseline 注入
HOME=$TESTHOME claude plugin list 2>&1 | grep oh-my-sdd
HOME=$TESTHOME grep "BEGIN oh-my-sdd" $TESTHOME/.claude/CLAUDE.md
# 期望: 两条都有输出

# 卸载验证（baseline 应被清理）
HOME=$TESTHOME npm uninstall -g @cli-tools/oh-my-sdd
HOME=$TESTHOME grep "BEGIN oh-my-sdd" $TESTHOME/.claude/CLAUDE.md
# 期望: 无输出

rm -rf $TESTHOME
```

---

## 5. 正式发布

### 5.1 推送到内网 git 仓库（镜像分发）

```bash
# 首次需要添加 remote
git remote add origin git@git.enterprise.com:cli-tools/oh-my-sdd.git

git push -u origin main
git push origin v0.1.1

git ls-remote --tags origin | grep v0.1.1   # 期望: 能查到 tag
```

> 说明：这里的 `push main` 是把外部**已通过 PR 审核合并**的 main 镜像到内网仓库，属于分发动作、不引入新变更，与开发流程"禁止直接 push main"的分支保护规则不冲突。若内网仓库单独启用了分支保护，按内网仓库自身的审批要求操作。

### 5.2 发布主包

```bash
# 确认该版本未发布过
npm view @cli-tools/oh-my-sdd@0.1.1 --registry=https://npm.enterprise.com/
# 首次发布返回 E404 是正常的；返回了版本信息说明已发过，需换版本号

# 发布
npm publish --registry=https://npm.enterprise.com/

# 验证
npm view @cli-tools/oh-my-sdd@0.1.1 --registry=https://npm.enterprise.com/
npm view @cli-tools/oh-my-sdd versions --registry=https://npm.enterprise.com/
```

> `npm publish` 会先自动执行 `prepublishOnly` 钩子（baseline lint + 全量测试 + OpenCode 子包构建），**输出很多、耗时较长属正常**。这也是为什么 §4 的手动验证必须做在 publish 之前——把问题拦在包公开之前，而不是依赖 publish 时的最后一道钩子。

### 5.3 发布 OpenCode 子包（仅当本次有变更）

```bash
cd opencode
npm run build
npm pack          # 核对含 dist/、.opencode/commands/、oms-skills/、delegated-skills/、bin/
npm publish --registry=https://npm.enterprise.com/
npm view @cli-tools/oh-my-sdd-opencode@<版本号> --registry=https://npm.enterprise.com/
```

发布前建议再跑 Runbook §⑤-5.4 列出的三条离线验收测试（harness 链路、并发 pack、资源脚本），命令以 Runbook 为准。

### 5.4 测试机验证

选一台**没参与开发**的机器，模拟真实用户：

```bash
npm install -g --foreground-scripts @cli-tools/oh-my-sdd
claude plugin list | grep oh-my-sdd
grep "BEGIN oh-my-sdd" ~/.claude/CLAUDE.md
oms-install --help
```

全部通过 → §6 通知用户。失败 → §7 回滚流程。

---

## 6. 发布后：通知与记录

### 6.1 通知用户

在 IM 群或邮件中发送，包含：包名 + 版本号、安装/升级命令、变更摘要、已知限制、文档链接。模板见 Runbook §⑦。

### 6.2 更新 Changelog

在 `docs/release/CHANGELOG.md` 追加本次记录，格式遵循 Keep a Changelog：

```markdown
## [0.1.1] - YYYY-MM-DD

### Fixed
- <修复内容> (issue #X)

### Changed
- <变更内容>

### Known Issues
- <已知问题>
```

---

## 7. 回滚

npm registry **不允许 republish 同一版本号**。发现严重 bug 时两个选项：

### 方案 1：发补丁版（推荐）

在外部机器修复 bug，按 §3.2 的 Issue → 分支 → PR 流程 bump patch 版本、打新 tag，重新走传输 + 内网发布。

### 方案 2：unpublish（限 24 小时内且无人安装）

```bash
npm unpublish @cli-tools/oh-my-sdd@<版本> --registry=https://npm.enterprise.com/
```

> ⚠️ unpublish 有风险：已安装用户后续 `npm install` 会失败；企业 registry 可能配置更严格的窗口（72 小时或永久禁止）。优先走方案 1。

---

## 8. 常见发布错误

| 错误 | 含义 | 解决方法 |
| --- | --- | --- |
| `E403 Forbidden` | 无写权限或未登录 | `npm login --scope=@cli-tools --registry=https://npm.enterprise.com/` 后重试 |
| `E409 Conflict` | 该版本号已发布过 | 不能 republish，bump 版本后重新发布 |
| `E404 Not Found` | scope 未配 registry | `npm config set @cli-tools:registry https://npm.enterprise.com/` |
| `ENEEDAUTH` | 凭据过期 | 重新 `npm login` |
| publish 中途测试失败 | `prepublishOnly` 钩子没过 | 回 §4.3 排查修复，不要尝试跳过钩子发布 |
| `npm pack` 缺关键文件 | `files` 字段配置有误 | 检查 `package.json` 的 `files` 数组，确认含 `.claude-plugin/`、`install.js` 等 |

---

## 9. FAQ：新人高频问题

**Q1：能不能省掉"搬运"，在外部 Mac 直接 publish？**
不能。内网 registry 在外部网络不可达——这正是流程里存在传输环节的唯一原因。

**Q2：发错了，能重发同一个版本号吗？**
不能，registry 禁止 republish 同版本。走 §7 发补丁版。

**Q3：主包 0.1.x、OpenCode 子包 0.2.x，版本为什么不一致？**
两个是独立的 npm 包，独立 semver、独立发布。只在各自有变更时 bump 自己的版本。

**Q4：git tag 和 npm 版本号是什么关系？**
tag 名（`v0.1.1`）必须与 `package.json` 的 `version`（`0.1.1`）一致。tag 是 git 侧的发布锚点（内网 bundle 靠它定位代码），version 是 registry 侧的包版本，发布时二者必须相同。

**Q5：`npm pack` 的 tgz 能直接当源码传内网吗？**
不能。tgz 只含 `files` 白名单里的运行产物，缺 `__tests__/`、`docs/`，内网无法跑验证。传源码用 git bundle 或 tar。

---

## 10. 完整 Checklist

- [ ] 外部：发布 Issue 已创建，版本 bump 已通过 PR 合并到 main
- [ ] 外部：`npm test` 通过
- [ ] 外部：`npm run lint:baseline` 通过
- [ ] 外部：`npm run build --workspace=@cli-tools/oh-my-sdd-opencode` 通过，且 `npm run sync:opencode` 通过
- [ ] 外部：已在合并后的 main 上打 `v<版本>` tag
- [ ] 代码已通过 git bundle / tar 传输到内网
- [ ] 内网：`git checkout v<版本>` 成功、`git status --short` 干净
- [ ] 内网：`npm test` + `lint:baseline` + `claude plugin validate` 通过
- [ ] 内网：`npm pack` 产物核对过必备目录
- [ ] 内网：本地安装 + 卸载演练通过（临时 HOME）
- [ ] 内网：已 push 到内网 git 仓库（main + tag）
- [ ] 内网：`npm publish` 成功
- [ ] 内网：`npm view @cli-tools/oh-my-sdd@<版本>` 能查到
- [ ] 测试机：`npm install -g` + 验证通过
- [ ] Changelog 已更新
- [ ] 用户通知已发送

**全部勾选 = 发布成功。任一失败 = 停止并排查。**

---

## 11. 相关文档

- [内网发布 Runbook](internal-publish-runbook.md) — 权威操作手册（面向运维/发布工程师）
- [安装指南](../../INSTALL.md) — 用户侧安装与故障排除
- [冒烟测试清单](../smoke-test-checklist.md) — 发布后的功能验证项
