# OpenCode 原生插件安装、激活与诊断设计

关联 Issue：#72

## 背景

OpenCode 通过 `opencode plugin <module> --global --force` 原生安装 npm 插件并更新全局配置。该安装器会忽略 npm lifecycle scripts，因而当前依赖 `postinstall.mjs` 将技能、命令复制到 OpenCode 发现目录的做法不会在原生安装或更新时可靠执行。

同时，OpenCode 不扫描 npm 包内部的技能和命令目录。插件的运行时 hooks、共享库和 baseline 应直接从已安装 npm 包运行；仅技能和斜杠命令需要由插件本身投影到 OpenCode 的发现目录。

## 目标

1. OMS 通过 OpenCode CLI 进行插件安装与更新，不直接改写 OpenCode 的 plugin 配置。
2. 插件加载时完成自身资源 bootstrap，注册 runtime hooks，并留下可验证的 activation 证据。
3. `oms doctor --tool opencode` 可在 OpenCode 重启并成功加载插件后验证 `loaded` 与 `enforced`。
4. 保持受管资源的用户修改保护；自动更新不得覆盖已漂移资源。

## 非目标

- 不实现对 OpenCode 进程的实时写入探针。
- 不复制 npm 包内的 hooks、lib、content 或 dist 到用户配置目录。
- 不绕过 `opencode plugin` 直接编辑 `opencode.json`。

## 架构与数据流

```text
oms-install --tool opencode
  -> opencode plugin @cli-tools/oh-my-sdd-opencode --global --force
  -> OpenCode 原生安装 npm 包并更新配置

重启 OpenCode
  -> 加载 npm 包的 OhMySddPlugin
  -> bootstrap 包内的发现资源（skills / commands）
  -> 注册 tool.execute.before 等 hooks（直接使用 npm 包内 hooks / lib）
  -> 写入 ~/.oh-my-sdd/opencode-activation.json

oms doctor --tool opencode
  -> 校验原生配置注册
  -> 校验 activation 记录与当前插件资源契约
  -> 输出 loaded / enforced
```

## 组件设计

### OMS 安装适配器

OpenCodeAdapter 的安装/更新资源步骤调用 OpenCode CLI：

```bash
opencode plugin @cli-tools/oh-my-sdd-opencode --global --force
```

OMS 捕获命令退出码和输出，但不调用 config-patcher 修改 OpenCode plugin 配置。命令成功后，安装状态为“registered，等待 host activation”；提示用户重启 OpenCode。

### 插件 bootstrap

`OhMySddPlugin` 在返回 Hooks 前执行 bootstrap：

1. 从 npm 包根目录读取资源清单和包版本。
2. 校验运行时资产 `dist`、`hooks`、`lib`、`content` 存在；这些资产始终在包内执行。
3. 将包内 `oms-skills` 和 `.opencode/commands` 投影到 OpenCode 的全局发现目录。
4. 对每个已拥有目标比较所有权清单的摘要；摘要不同即保留用户版本并报告 drift。
5. 成功或降级完成后写 activation 记录。

bootstrap 复用现有资源所有权格式，但其调用入口从 npm `postinstall` 移到插件加载生命周期。OpenCode 的插件 API 不运行 package scripts；将 bootstrap 放在插件入口可保持安装、hook 注册和资源初始化属于同一个宿主插件生命周期。

### Activation 证据

`~/.oh-my-sdd/opencode-activation.json` 至少包含：

- schema version；
- 插件 npm 版本与资源清单摘要；
- bootstrap 时间；
- 发现资源的结果摘要与漂移项；
- 已注册的 hook 名称；
- activation 状态和可读失败原因。

记录只在插件运行时写入。它是“该插件在 OpenCode 中完成启动并注册预期 hooks”的证据，不声称已经执行过真实写操作。

### Doctor 状态

`written` 和 `registered` 继续来自 OpenCode 配置检查。

`loaded` 在 activation 记录有效、插件资源契约匹配、且 bootstrap 未失败时为 verified；否则为 unknown，并提示重启 OpenCode 或重新执行原生安装命令。

`enforced` 在 `loaded` 通过且 activation 记录包含 `tool.execute.before` 时为 verified；否则为 unknown。输出明确说明这是启动时 hook 注册证据，非实时写入探针。

发生资源漂移时，不覆盖用户内容；activation 与 doctor 显示 drifted/degraded，并提供人工处理路径。

## 错误处理

- `opencode plugin` 非零退出：OMS 安装失败，不伪造注册成功。
- 包内资产缺失：插件 activation 标记 failed，运行时 hook 不报告 verified。
- 单个发现资源漂移：保留该目标，其余未漂移资源继续初始化；activation 标记 degraded。
- 无 activation 记录、版本/清单不匹配或记录过期：doctor 保持 unknown，不将静态配置误报为已加载。

## 验证策略

1. 单元测试：OMS 传递正确的原生 OpenCode CLI 参数，并不调用 config patcher。
2. 单元测试：bootstrap 从插件包资源同步、保留用户修改、写 activation 记录。
3. 单元测试：doctor 对有效、缺失、失配和 degraded activation 的状态判断。
4. 集成测试：模拟 `opencode plugin` 成功/失败和重启后的插件加载。
5. 打包测试：验证 npm tarball 包含全部 runtime 与 bootstrap 所需资产。
