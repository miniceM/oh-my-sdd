# Spike: PostToolUse `permissionDecision: "deny"` 能力验证

> **实验日期**：2026-06-26（契约）与 2026-06-29（运行时）。
>
> **实验结论**：PostToolUse 发生在工具执行后，不能作为“写入未发生”的可靠证明。
> **生产关系（当前）**：生产写入门禁在 `packages/product/hooks/pre-tool-use.js` 的 `PreToolUse`；PostToolUse 仅承担遥测或附加上下文，不承担安全阻断。

## 原始实验事实

该 spike 测试了在 PostToolUse 返回 `permissionDecision: "deny"` 是否能阻止 Edit/Write 落盘。契约层可以构造合法 JSON，但真实运行时观察表明：工具已经执行后，PostToolUse 的 deny 不应被当成可回滚写入的机制。

因此，以下推论仍有效：

- 验证阻断必须检查目标文件是否在工具执行前被拒绝，而不是只检查 hook 输出。
- `additionalContext` 可用于告警、指导或遥测，但不构成安全门禁。
- 任何对 PostToolUse 的 deny 契约测试都只能证明输出格式，不足以证明运行期阻断。

本报告中的历史 plugin 路径、会话配置和回退方案均是实验上下文，不是当前操作说明。

## 当前生产模型

OpenCode 的生产路径是 `packages/opencode-plugin` 中的
`@cli-tools/oh-my-sdd-opencode` 原生 npm 插件；其 `postinstall` 将 package-owned
resources 同步到 OpenCode 全局发现位置。它不使用旧的本地目录或历史生命周期。

```text
写入工具请求
  → PreToolUse（packages/product/hooks/pre-tool-use.js）
  → HARD_RULE 命中：拒绝，工具不执行
  → 未命中：允许工具执行
  → PostToolUse：遥测/上下文反馈，不回滚写入
```

Claude Code 的生产写入门禁为上述 `PreToolUse`；OpenCode 则由其 npm 插件在运行期强制
HARD_RULE。两者的 `PostToolUse` 均只用于遥测或上下文反馈。KiloCode 是 advisory-only，
不能宣称有同等的写前阻断能力。

## 当前复验步骤

1. 在隔离 shell 中用当前 workspace 的产品包执行安装；以下命令不会写入真实用户 HOME 或 npm 全局前缀：

   ```bash
   export OMS_TEST_HOME="$(mktemp -d)"
   export HOME="$OMS_TEST_HOME"
   export npm_config_prefix="$OMS_TEST_HOME/.npm-global"
   export PATH="$npm_config_prefix/bin:$PATH"
   npm install -g --foreground-scripts ./packages/product
   oms-install --tool claude --yes
   ```

   Claude 安装路径需要可用的 iam CLI 与测试身份；缺失时记录为复验前置条件阻断，而不是改用真实用户环境。不要使用历史 hook 文件、旧生命周期或旧目录。
2. 在 Claude Code 中请求写入一个不含真实密钥、但符合测试用 HARD_RULE 模式的临时文件。
3. 确认 `PreToolUse` 返回拒绝，并直接检查该临时文件未创建或未被修改。
4. 检查 PostToolUse 输出只被记录为遥测/上下文；它不应改变第 3 步的判断。
5. 在 OpenCode 中用同一类负例验证 npm 插件的运行期拒绝。

记录复验日期、宿主与版本、输入、hook 结果和文件系统观察。若文件仍落盘，应按生产 P0 安全回归处理，而不是改回 PostToolUse deny。
