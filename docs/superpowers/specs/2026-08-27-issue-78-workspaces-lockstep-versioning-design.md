# #78 npm workspaces 锁步版本设计

## 背景与源码事实

当前仓库在根目录发布 `@cli-tools/oh-my-sdd@0.1.0`，并在 `opencode/` 发布
`@cli-tools/oh-my-sdd-opencode@0.2.1`。两个目录各自拥有 `package.json` 和
`package-lock.json`。根包的 Claude 插件清单、市场清单及开发脚本还直接写入
`0.1.0`，而当前发布手册将两个版本明确描述为独立管理。

这会让一次跨包功能发布需要人工修改多处元数据，且 npm 本身的 workspaces 只负责
安装、脚本和目标工作区发布，不会自动将包版本写成相同值。

## 目标

- 将两个可发布包置于一个严格的 npm workspace 根目录下。
- 以 `0.2.1` 作为迁移后的共同版本，并让后续版本由 Changesets 固定版本组计算。
- 用单一根 lockfile、工作区脚本和一致性测试消除版本漂移。
- 保持两个包名、CLI 入口、Claude 插件安装行为和 OpenCode 安装行为不变。

## 非目标

- 不改变任一包的公开包名、安装命令或版本号语义。
- 不重写历史归档、历史发布记录或历史版本示例。
- 不在此变更中实际发布 npm 包、创建 tag 或推送分支。

## 仓库结构与边界

根目录成为仅负责依赖、编排、版本与发布的私有工作区控制器：

```text
package.json                         # private, workspaces, 统一脚本
package-lock.json                    # 唯一 lockfile
packages/
  claude/                            # @cli-tools/oh-my-sdd
  opencode/                          # @cli-tools/oh-my-sdd-opencode
.changeset/                          # 固定版本组与变更记录
scripts/                             # 跨包发布/一致性辅助脚本
docs/                                # 仓库级文档与历史归档
```

Claude 包承载现根包发布的 `.claude-plugin/`、安装器、`bin/`、`wrapper/`、
`skills/`、`content/`、`hooks/`、`lib/` 与其测试资产。OpenCode 包整体由
`opencode/` 迁入 `packages/opencode/`。所有包内相对路径、测试夹具及打包白名单随
其所属包迁移；仓库级 CI、发布文档和跨包校验留在根目录。

## 版本与发布设计

`.changeset/config.json` 把两个公开包置于同一个 `fixed` 组。每个功能或修复在 PR
中提供 Changeset，声明最高的语义化变更级别。`changeset version` 以该级别同时更新
组内两个包；因此任一包变更都会使两者生成相同的新版本。迁移提交直接将 Claude
包及其插件元数据校准到 `0.2.1`，并附带该共同版本的 Changeset。

根脚本提供以下稳定入口：

- `test`、`build`、`typecheck` 与资源同步以工作区为目标运行，并保留各包自身脚本。
- `release:check` 验证版本同值、插件清单同值、单一 lockfile、Changesets 配置及两个
  `npm pack --dry-run` 结果。
- `release:version` 只调用 Changesets 生成版本变更；发布命令在检查成功后显式发布
  两个公开工作区。脚本从工作区 `package.json` 读取版本，不嵌入当前版本字符串。

Changesets 无法替代 npm 的发布认证或 registry 配置。缺少认证、未提交的版本文件或
打包预检失败时，发布必须停止并返回非零状态；不得尝试发布其中一个包。

## 一致性契约

跨包验证读取而非硬编码版本，要求：

1. `@cli-tools/oh-my-sdd` 与 `@cli-tools/oh-my-sdd-opencode` 的 `version` 相等。
2. Claude 包 `.claude-plugin/plugin.json` 与 `marketplace.json` 的版本等于 Claude
   包版本。
3. 只允许根目录 `package-lock.json`，两个包目录不含 lockfile。
4. `.changeset/config.json` 的固定版本组恰好包含两个公开包。

违反任一契约时，`release:check` 失败并指出不一致字段；它不自动覆盖包版本，避免
未经审查的发布元数据改写。

## 测试与验收证据

- 先新增失败测试，覆盖一致性契约、Changesets 固定组与新工作区脚本的路径解析。
- 迁移后运行现有根级测试、两个工作区的适用测试、baseline lint 与 TypeScript
  typecheck。
- 在干净 npm 缓存目录中为两个工作区运行 `npm pack --dry-run --json`，核对包名、
  版本、入口和必要资源仍在 tarball 中。
- 用临时副本执行一次 Changesets 版本计算，证明单个包的 patch/minor 变更将两个包
  同步升级；试验完成后不得保留生成的版本改动。

## 验收映射

Issue #78 的目录、单锁文件、固定版本组、插件元数据、工作区命令、失败校验、打包
预检与文档要求，分别由“仓库结构与边界”“版本与发布设计”“一致性契约”“测试与验收
证据”四节覆盖。历史文档保持不动，当前发布与开发文档只描述迁移后的锁步策略。
