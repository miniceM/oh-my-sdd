# 非归档 Markdown 保鲜设计

> 状态：已确认 · 日期：2026-09-02

## 目标

在不修改 `docs/archive/**` 与 `docs/superpowers/{plans,specs,research}/**` 既有历史记录的前提下，使仓库其余 Markdown 与 npm workspaces 重构后的源码、安装流程和发布流程一致。

## 范围

- 纳入所有非归档 Markdown，包括隐藏目录中的 `.opencode/**`、`.agents/**` 与 `.changeset/**`。
- 不修改既有归档、计划、规格或研究文档；本设计文件是本轮变更的过程记录。
- `packages/opencode-plugin/delegated-skills/**` 为固定版本的上游委派技能：核验其来源与项目引用，不把项目架构说明写入其上游语义。

## 事实源与同步边界

`packages/product/{skills,content}` 是可发布资源的唯一事实源。`packages/opencode-plugin/scripts/copy-resources.mjs` 会将其同步到 OpenCode 包的 `skills/`、`oms-skills/`、`.opencode/skills/`、`.agents/skills/` 和 `content/`。因此文档只在产品包源目录修改，并通过 `npm run sync:opencode` 生成镜像，禁止手工维护镜像副本。

OpenCode 的 `.opencode/commands/` 是该包自有命令源，`.agents/command/` 是其生成镜像。两个 package 的 `package.json`、CLI 源码与测试是命令、工作区、版本和验收描述的事实依据。

## 文档改造

1. 重写根 README、安装与贡献文档，说明工作区布局、双包、主机适配范围、安装与诊断入口。
2. 重写路线图、冒烟检查与 Spike 文档，删除重构前的目录、生命周期和验证假设。
3. 将三份发布 Runbook 统一为当前 npm workspaces、Changesets 锁步版本、双包构建/打包、发布前校验与回滚流程。
4. 更新产品包 README、内容模板与受本次架构调整影响的自有技能说明；重新生成 OpenCode 资源镜像。
5. 核验变更日志片段与所有内部 Markdown 链接，消除错误版本号、过期测试计数和失效命令。

## 验收标准

- 每项命令、目录、包名和宿主行为可回溯至当前源码或 package 元数据。
- 产品包资源与全部 OpenCode 镜像的内容一致。
- 非归档文档不含已废弃工作区结构、历史版本流程或固定测试数量等会误导执行的信息。
- 本地 Markdown 链接有效，且 `git diff --check` 无格式错误。
- `npm run sync:opencode`、`npm run lint:baseline`、`npm run release:check` 和 `npm test` 均通过。

## 非目标

- 不改动运行时代码、测试逻辑、包版本或发布状态。
- 不编辑现有归档、计划、规格和研究记录。
- 不改变上游委派技能的工作流语义。
