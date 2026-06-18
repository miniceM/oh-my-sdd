# oh-my-sdd v0.1 真实环境验证 Checklist

> **目的**：在企业内部真实环境（真实 Claude Code + 真实 iam CLI + 真实 DOP endpoint）中验证 oh-my-sdd v0.1 是否可发布到 `https://npm.enterprise.com/`。
>
> **与 `smoke-test-checklist.md` 的区别**：smoke 是开发机自测（stub iam/DOP），本清单是**生产前最后一道关**，必须用真实外部系统。
>
> **执行频次**：每个目标平台（macOS / Linux / Windows）各跑一遍，全绿才能 tag v0.1.0。

---

## 0. 前置条件

执行本 checklist 前必须具备：

- [ ] **目标平台机器**（macOS / Linux / Windows 至少 1 台，最终三台都要）
- [ ] **Node.js ≥ 18**（推荐 20 LTS 或 22 LTS）
- [ ] **Claude Code** 最新稳定版（用于测试 plugin 加载）
- [ ] **iam CLI** 已安装且可用 `iam --version` 验证（联系企业 IT 获取）
- [ ] **DOP endpoint URL + 鉴权凭据**（联系 DOP 团队获取）
- [ ] **测试用企业账号**（有 sdd system 权限）
- [ ] **测试项目**（一个 git 仓库，最好空仓库避免污染）
- [ ] **npm enterprise registry 凭据**（用于 `npm publish`）

---

## Phase 1: Pre-flight Schema 验证（不依赖运行时）

**目标**：确认 Claude Code 当前版本能识别我们的 `plugin.json` / `hooks.json` / `marketplace.json` 结构。这是 spec § 11 列出的"待实施时核实项"，必须在发布前确认。

### 1.1 plugin.json schema 核对

- [ ] **步骤 1**：读 Claude Code 官方文档（https://docs.claude.com/en/docs/claude-code/plugins 或等价路径），核对插件清单字段。

- [ ] **步骤 2**：与 `plugin.json` 对比：

```bash
cat plugin.json
```

**期望字段**（已实施）：
```json
{
  "name": "oh-my-sdd",
  "version": "0.1.0",
  "description": "...",
  "commands": "./commands",
  "skills": "./skills",
  "metadata": { ... }
}
```

**验证项**：
- [ ] `commands` 字段是字符串路径（不是 glob 数组） — 与 5 个真实 Claude Code 插件对齐
- [ ] `skills` 字段同上
- [ ] `hooks` 字段省略（Claude Code 自动发现 `hooks/hooks.json`）
- [ ] `metadata` 字段非标准但允许（用于企业元信息）

**如果文档说字段名不同**：立即更新 `plugin.json`，重新测试，**不要发布**。

### 1.2 hooks.json schema 核对

- [ ] **步骤 1**：读 Claude Code hooks 文档，确认支持的事件名。

**期望事件名**（已实施）：
- `SessionStart` ✅
- `SessionEnd` ✅（已通过 plugin-dev skill 确认 canonical）
- `UserPromptSubmit` ✅
- `PostToolUse` ✅

**验证项**：
- [ ] 4 个事件名拼写与文档完全一致
- [ ] `${CLAUDE_PLUGIN_ROOT}` 变量在 hook command 字符串中被支持
- [ ] `matcher` 字段在 `PostToolUse` 配置中生效

### 1.3 在真实 Claude Code 中加载验证

- [ ] **步骤 1**：执行 install：

```bash
npm install -g @cli-tools/oh-my-sdd
# 或本地开发版：
node install.js
```

- [ ] **步骤 2**：启动 Claude Code，检查 `/plugin` 命令：

```bash
claude
# 在 Claude Code 内：
/plugin
```

**期望输出**：列表里出现 `oh-my-sdd`，状态为 enabled。

- [ ] **步骤 3**：检查 `/help` 或命令列表，确认 5 个 SDD 命令出现：

```
/sdd-spec
/sdd-plan
/sdd-task
/sdd-apply
/sdd-review
```

**如果命令不出现**：
- 检查 `~/.claude/plugins/oh-my-sdd/commands/` 是否有 5 个 `.md` 文件
- 检查每个 `.md` 文件的 YAML frontmatter 是否完整（`---` 开始和结束）
- 看 Claude Code 的 debug 日志（通常在 `~/.claude/logs/`）

### 1.4 `${CLAUDE_PLUGIN_ROOT}` 跨平台验证

- [ ] **macOS / Linux**：启动 Claude Code，运行任何会触发 hook 的操作（如启动会话），看 hook 是否报错。

```bash
# 启动后查看日志
cat ~/.oh-my-sdd/logs/$(date +%F).log
```

**期望**：无 `CLAUDE_PLUGIN_ROOT is not defined` 或路径解析错误。

- [ ] **Windows**：同样操作。

**Windows 特定检查**：路径里的反斜杠是否正确处理。如果 hook 失败，临时改 `hooks.json` 用绝对路径测试。

---

## Phase 2: 安装与卸载（真实 npm registry）

**目标**：验证 `npm install -g` 和 `npm uninstall -g` 在企业 registry 上行为正确。

### 2.1 全局安装

- [ ] **步骤 1**：配置 npm registry（如果还没配）：

```bash
npm config set @cli-tools:registry https://npm.enterprise.com/
npm login --scope=@cli-tools --registry=https://npm.enterprise.com/
```

- [ ] **步骤 2**：安装：

```bash
npm install -g @cli-tools/oh-my-sdd
```

**期望输出**：
- 无错误
- 看到 `→ 检查 Node 版本与 iam CLI` 等进度行
- 最后看到 `✓ oh-my-sdd 安装完成`

- [ ] **步骤 3**：验证文件落地：

```bash
# Unix
ls -la ~/.claude/plugins/oh-my-sdd/
ls -la ~/.oh-my-sdd/

# Windows (PowerShell)
Get-ChildItem $env:USERPROFILE\.claude\plugins\oh-my-sdd\
Get-ChildItem $env:USERPROFILE\.oh-my-sdd\
```

**期望**：
- `~/.claude/plugins/oh-my-sdd/` 有 `commands/ skills/ content/ hooks/ bin/ plugin.json marketplace.json`
- `~/.oh-my-sdd/config.json` 存在，内容含 `dop_endpoint`、`aih_system_name`、`telemetry_disabled: false`

- [ ] **步骤 4**：验证文件权限（Unix）：

```bash
stat -c "%a %n" ~/.oh-my-sdd ~/.oh-my-sdd/config.json
```

**期望**：`700 /Users/.../.oh-my-sdd` + `600 /Users/.../.oh-my-sdd/config.json`

### 2.2 升级场景

- [ ] **步骤 1**：手动改一个 baseline 字符（模拟本地修改）：

```bash
echo "<!-- local edit -->" >> ~/.claude/plugins/oh-my-sdd/content/enterprise-baseline.md
```

- [ ] **步骤 2**：重新跑 install：

```bash
node $(npm root -g)/@cli-tools/oh-my-sdd/install.js
```

**期望**：
- 看到 `→ 复制插件文件到 ~/.claude/plugins/oh-my-sdd/`
- 本地修改被覆盖（升级语义）
- `~/.oh-my-sdd/` 状态保留

- [ ] **步骤 3**：验证 `config.json` 未被覆盖：

```bash
cat ~/.oh-my-sdd/config.json
```

**期望**：用户原有配置（如改过的 `dop_endpoint`）保留。

### 2.3 卸载（默认保留状态）

- [ ] **步骤 1**：先创建一些状态：

```bash
mkdir -p ~/.oh-my-sdd/sessions
echo '{"start_sha":"abc","username":"test"}' > ~/.oh-my-sdd/sessions/test.json
echo '{"event":"test"}' >> ~/.oh-my-sdd/queue.jsonl
```

- [ ] **步骤 2**：卸载：

```bash
npm uninstall -g @cli-tools/oh-my-sdd
```

**期望**：
- 看到 `→ 移除 ~/.claude/plugins/oh-my-sdd/`
- 看到 `→ 从 settings.json 注销 marketplace`
- 看到 `状态文件保留在 ~/.oh-my-sdd/`

- [ ] **步骤 3**：验证：

```bash
# 插件目录已删
ls ~/.claude/plugins/oh-my-sdd/ 2>&1 | grep -q "No such" && echo "PASS" || echo "FAIL"

# settings.json 不再含 oh-my-sdd
grep -q "oh-my-sdd" ~/.claude/settings.json && echo "FAIL" || echo "PASS"

# 状态保留
ls ~/.oh-my-sdd/ && echo "PASS"
```

### 2.4 卸载（--purge）

- [ ] **步骤 1**：重装后执行：

```bash
npm install -g @cli-tools/oh-my-sdd
oms-uninstall --purge
```

- [ ] **步骤 2**：验证 `~/.oh-my-sdd/` 也被删除：

```bash
ls ~/.oh-my-sdd/ 2>&1 | grep -q "No such" && echo "PASS" || echo "FAIL"
```

---

## Phase 3: 身份认证（真实 iam CLI）

**目标**：验证 oms-login + iam 集成在真实环境工作。

### 3.1 iam CLI 独立验证

- [ ] **步骤 1**：直接测试 iam CLI：

```bash
iam --version
iam login -u <你的用户名>
# 提示密码时输入
iam auth status
iam auth status -json
```

**期望**：
- `--version` 输出版本号
- `login` 成功（无错误）
- `auth status` 显示已登录的 system 列表
- `auth status -json` 输出合法 JSON：`{"total": N, "credentials": [{"system": "...", "username": "...", "status": "logged"}]}`

- [ ] **步骤 2**：找出 sdd system 的实际名称：

```bash
iam auth status -json | jq '.credentials[].system'
```

**期望**：列表里有一个对应 SDD/Claude Code 的 system 名（可能是 `sdd`、`claude-code` 或别的）。

**记录这个名称**：如果与 `config.json` 默认值 `sdd` 不同，需修改：

```bash
# 修改用户配置
cat > ~/.oh-my-sdd/config.json << EOF
{
  "dop_endpoint": "<DOP 真实 URL>",
  "aih_system_name": "<真实 system 名>",
  "log_level": "info",
  "telemetry_disabled": false
}
EOF
```

### 3.2 oms-login 端到端

- [ ] **步骤 1**：先 logout 清空状态：

```bash
iam logout
iam auth status -json
# 期望 credentials 为空数组
```

- [ ] **步骤 2**：用 oms-login 重新登录：

```bash
oms-login
# 提示用户名 → 输入
# 提示密码 → 输入（应该看到 * 而非明文）
```

**期望**：
- 看到 `✓ 登录成功。请重启 Claude Code 让 baseline 生效。`
- 退出码 0

- [ ] **步骤 3**：验证 iam 状态：

```bash
iam auth status -json
```

**期望**：credentials 含我们关心的 system，status 为 `logged`。

### 3.3 失败场景验证

- [ ] **错误密码**：

```bash
iam logout
echo "wrongpass" | oms-login --username <你的用户名> 2>&1
# 或者直接交互式输入错误密码
```

**期望**：看到 `❌ 登录失败：<iam 返回的错误>`，退出码 1。

- [ ] **Ctrl+C 中断密码输入**：

```bash
iam logout
oms-login
# 用户名输入后，密码提示时按 Ctrl+C
```

**期望**：立即退出，退出码 130，不留残余进程。

- [ ] **iam CLI 未安装**：临时改名让 iam 不可发现：

```bash
mv $(which iam) $(which iam).bak
oms-login
# 看到 "❌ 未检测到 iam CLI" 提示
mv $(which iam).bak $(dirname $(which iam).bak)/iam  # 恢复
```

---

## Phase 4: Baseline 注入（真实 Claude Code 会话）

**目标**：验证 SessionStart hook 在真实会话里注入 baseline。

### 4.1 已认证状态

- [ ] **前置**：`iam auth status -json` 显示 logged。

- [ ] **步骤 1**：启动 Claude Code 会话：

```bash
cd <测试项目目录>
claude
```

- [ ] **步骤 2**：在会话里输入：`你是谁？` 或类似的身份问题。

**期望**：Claude 的回答里包含企业 baseline 里的身份声明（如"我是企业 SDD Agent"）。

- [ ] **步骤 3**：检查 DOP 是否收到 session.start（见 Phase 6）。

- [ ] **步骤 4**：退出会话后检查 session meta：

```bash
ls ~/.oh-my-sdd/sessions/
# 应该看不到 .json（session-end 应已清理）
```

- [ ] **步骤 5**：检查日志：

```bash
cat ~/.oh-my-sdd/logs/$(date +%F).log | grep -i session
```

**期望**：日志里有 `session.start` 上报记录，无错误。

### 4.2 未认证状态（NEED_LOGIN）

- [ ] **前置**：`iam logout` 清空状态。

- [ ] **步骤 1**：启动 Claude Code 会话。

**期望**：
- 终端 stderr 显示红色：`⚠️ oh-my-sdd: 认证状态 NEED_LOGIN`
- 会话内 Claude 的回答**不**包含企业 baseline 身份
- Claude 可能会引用 `auth-required.md` 的内容（因为 additionalContext 里有）

- [ ] **步骤 2**：检查 DOP **未**收到 session.start（看 DOP 后台或 `~/.oh-my-sdd/queue.jsonl` 应为空）。

### 4.3 NO_CLI 状态

- [ ] **前置**：临时让 iam 不可发现：

```bash
PATH=/usr/bin:/bin claude
# Claude Code 进程的 PATH 里没有 iam
```

- [ ] **步骤 1**：观察启动输出。

**期望**：stderr 显示 `⚠️ oh-my-sdd: 认证状态 NO_CLI`，提示安装 iam。

### 4.4 iam 挂起（timeout 验证）

⚠️ **此测试较难真实复现**，跳过或标记为 "code review only"。

- [ ] 如果有方法模拟 iam 挂起（如写一个会 sleep 的 iam stub 放 PATH 最前），验证：
  - 5 秒内 hook 退出（非 60 秒）
  - 状态为 ERROR
  - 会话仍可启动（无 baseline 注入）

---

## Phase 5: SDD 命令与 Skills

**目标**：验证 5 个斜杠命令 + 3 个 skills 在真实会话可用。

### 5.1 SDD 命令逐个验证

- [ ] **前置**：已通过 oms-login 认证，进入 Claude Code 会话。

- [ ] **`/sdd-spec`**：

```
/sdd-spec test-change-001
```

**期望**：
- Claude 收到命令，按 command body 指示开始 Ring 1 工作流
- 询问需求细节、生成 proposal.md 等
- **禁止**直接跳到代码实现

- [ ] **`/sdd-plan`**（在 spec 完成后）：

```
/sdd-plan test-change-001
```

**期望**：读 proposal，生成 design.md。

- [ ] **`/sdd-task`**：

```
/sdd-task test-change-001
```

**期望**：生成 tasks.md，列出 TDD 任务。

- [ ] **`/sdd-apply`**：

```
/sdd-apply test-change-001
```

**期望**：按 tasks.md 顺序执行，每个任务 commit。

- [ ] **`/sdd-review`**：

```
/sdd-review test-change-001
```

**期望**：运行 validate，生成 review 文档，归档。

### 5.2 Skills 自动加载验证

- [ ] **api-design**：在会话里说"设计一个用户登录 API"。

**期望**：Claude 主动调用 `skills/api-design/SKILL.md` 的规则（可观察其回答里出现的具体规则）。

- [ ] **security-check**：在会话里说"写一段处理用户密码的代码"。

**期望**：Claude 主动引用安全规范（密钥管理、加密等）。

- [ ] **doc-writer**：在会话里说"为这个项目写 README"。

**期望**：使用企业 README 模板（9 章节结构）。

---

## Phase 6: DOP 埋点（真实 endpoint）

**目标**：验证 3 类事件真实到达 DOP 后端。

### 6.1 配置真实 endpoint

- [ ] **步骤 1**：写入真实 endpoint：

```bash
cat > ~/.oh-my-sdd/config.json << EOF
{
  "dop_endpoint": "https://<真实 DOP 域名>",
  "aih_system_name": "<Phase 3 找到的真实 system 名>",
  "log_level": "info",
  "telemetry_disabled": false
}
EOF
chmod 600 ~/.oh-my-sdd/config.json
```

### 6.2 session.start 上报

- [ ] **步骤 1**：启动新 Claude Code 会话，做点小操作，退出。

- [ ] **步骤 2**：在 DOP 后台查 event。

**期望 DOP 收到**：
```json
{
  "event": "session.start",
  "session_id": "<uuid>",
  "user": "<你的 username>",
  "cwd": "<项目路径>",
  "git_branch": "<当前分支>",
  "git_remote": "<remote URL>",
  "plugin_version": "0.1.0",
  "start_sha": "<git HEAD sha>",
  "timestamp": "..."
}
```

**验证项**：
- [ ] `user` 字段正确（不是 null 或 stub）
- [ ] `git_branch` / `git_remote` 与项目实际一致
- [ ] 时间戳合理

### 6.3 slash.invoked 上报

- [ ] **步骤 1**：在会话里运行 `/sdd-spec foo`。

- [ ] **步骤 2**：DOP 后台查 event。

**期望**：
```json
{
  "event": "slash.invoked",
  "session_id": "...",
  "user": "...",
  "command": "sdd-spec",
  "args": "foo",
  "timestamp": "..."
}
```

### 6.4 session.end 上报（含 code_delta）

- [ ] **步骤 1**：在会话里改一个文件（让 Claude 编辑代码），然后**正常退出** Claude Code（输入 exit 或 Ctrl+D）。

- [ ] **步骤 2**：DOP 后台查 event。

**期望**：
```json
{
  "event": "session.end",
  "session_id": "...",
  "user": "...",
  "duration_sec": <正整数>,
  "code_delta": {
    "files_changed": <≥1>,
    "lines_added": <≥1>,
    "lines_deleted": <数>,
    "by_lang": { "<语言>": <行数> }
  },
  "slash_commands_used": ["sdd-spec", ...],
  "timestamp": "..."
}
```

**验证项**：
- [ ] `duration_sec` 是合理正整数（不是 null）
- [ ] `code_delta.files_changed` 与实际改动文件数一致
- [ ] `by_lang` 正确分组（如 `.ts` 文件归 `ts`）
- [ ] `slash_commands_used` 含本会话用过的所有命令

### 6.5 SessionEnd 不可靠场景

- [ ] **步骤 1**：启动会话，改文件，**直接关闭终端**（不输入 exit）。

- [ ] **步骤 2**：启动新会话。

**期望**：
- 新会话的 SessionStart 触发 `flush()`，把上次会话遗留的事件（如果有）补传
- 上次会话的 `session.end` 可能延迟到达 DOP（依赖 PostToolUse 增量记录 + 下次 session-start 补传机制）

- [ ] **步骤 3**：DOP 后台查一段时间后，看 session.end 是否补传。

> ⚠️ 此场景可能丢数据（PostToolUse 记录的 files_touched 没在 session.end schema 里上报）。如果 DOP 后台发现 session.end 缺失，记录到"已知限制"。

### 6.6 离线重连

- [ ] **步骤 1**：断网（关 Wi-Fi 或拔网线）。

- [ ] **步骤 2**：启动会话，运行 `/sdd-spec foo`，改文件，退出。

- [ ] **步骤 3**：检查队列：

```bash
cat ~/.oh-my-sdd/queue.jsonl
```

**期望**：含若干行 JSON 事件（session.start、slash.invoked、session.end 都因网络失败入队）。

- [ ] **步骤 4**：恢复网络，启动新会话。

**期望**：
- 新会话 SessionStart 触发 `flush()`
- DOP 后台收到一波积压事件（按 FIFO 顺序）

### 6.7 Telemetry 退出机制

#### 用户全局退出

- [ ] **步骤 1**：设全局退出：

```bash
cat > ~/.oh-my-sdd/config.json << EOF
{
  ...原配置...
  "telemetry_disabled": true
}
EOF
```

- [ ] **步骤 2**：启动会话，做操作，退出。

**期望**：
- DOP 后台**不**收到任何事件
- `~/.oh-my-sdd/queue.jsonl` 保持空

#### 项目级退出

- [ ] **步骤 1**：恢复 `telemetry_disabled: false`。

- [ ] **步骤 2**：在测试项目根目录创建标记文件：

```bash
cd <测试项目>
touch .sdd-no-telemetry
```

- [ ] **步骤 3**：在此项目启动 Claude Code，做操作，退出。

**期望**：
- DOP **不**收到该会话的事件
- 删除 `.sdd-no-telemetry` 后，下次会话恢复正常上报

---

## Phase 7: 跨平台验证

**目标**：在三平台上重复 Phase 1-6 的关键步骤。

### 7.1 macOS（Apple Silicon 或 Intel）

- [ ] Phase 2.1 全局安装成功
- [ ] Phase 3.2 oms-login 工作
- [ ] Phase 4.1 baseline 注入工作
- [ ] Phase 6.4 session.end 上报正确

**macOS 特定检查**：
- [ ] `~/.oh-my-sdd/` 权限 700
- [ ] `~/.oh-my-sdd/config.json` 权限 600
- [ ] iam CLI 在 `/usr/local/bin/iam` 或 `/opt/homebrew/bin/iam`

### 7.2 Linux（Ubuntu/Debian/RHEL）

- [ ] Phase 2.1 全局安装成功
- [ ] Phase 3.2 oms-login 工作
- [ ] Phase 4.1 baseline 注入工作
- [ ] Phase 6.4 session.end 上报正确

**Linux 特定检查**：
- [ ] 文件权限同 macOS
- [ ] 在容器（Docker）里跑 Claude Code 时 hook 仍工作（如果有这种用法）

### 7.3 Windows（10/11，原生 cmd 或 PowerShell）

⚠️ **重点验证平台**——大部分跨平台 bug 都在 Windows 上。

- [ ] Phase 2.1 全局安装成功（注意路径用 `%APPDATA%\npm\` 还是 `%USERPROFILE%\AppData\Roaming\npm\`）

- [ ] **关键检查：hook 命令字符串执行**

启动 Claude Code，观察 SessionStart hook 是否触发。如果失败：
- 检查 `~/.claude/plugins/oh-my-sdd/hooks/hooks.json` 里的命令字符串
- Windows cmd 的引号转义可能与 Unix 不同
- 必要时改为 `node %CLAUDE_PLUGIN_ROOT%\hooks\session-start.js`（反斜杠 + Windows 变量语法）

- [ ] Phase 3.2 oms-login 工作（密码输入隐藏是否生效？Ctrl+C 是否中断？）

- [ ] Phase 4.1 baseline 注入工作

- [ ] Phase 6.4 session.end 上报正确（`git diff` 在 Windows 上是否需要特殊配置？）

**Windows 特定检查**：
- [ ] `C:\Users\<user>\.oh-my-sdd\` 目录权限（默认继承用户 profile ACL，应该 OK）
- [ ] 路径里的空格（如 `C:\Program Files\...`）不会让 spawn 失败
- [ ] 行结束符（CRLF vs LF）不影响 JSONL 队列解析

---

## Phase 8: 失败注入与降级

**目标**：验证系统在各种异常下的降级行为。

### 8.1 DOP 服务挂了

- [ ] **步骤 1**：临时改 endpoint 到一个不存在的地址：

```bash
sed -i 's|dop.enterprise.com|dop.invalid.example|' ~/.oh-my-sdd/config.json
```

- [ ] **步骤 2**：启动会话。

**期望**：
- baseline 仍正常注入（因为 OK 状态取决于 iam，不是 DOP）
- `~/.oh-my-sdd/queue.jsonl` 开始累积事件
- 日志里有 `DOP 上报失败 (3 次尝试)，入队重试` 警告
- 会话不卡顿（hook 在 3 秒超时后继续）

- [ ] **步骤 3**：恢复 endpoint，启动新会话。

**期望**：积压事件被 flush。

### 8.2 配置文件损坏

- [ ] **步骤 1**：写一个无效 JSON：

```bash
echo '{ broken json' > ~/.oh-my-sdd/config.json
```

- [ ] **步骤 2**：启动会话。

**期望**：
- hook 不崩溃
- 可能用默认配置继续，或显示错误
- 日志记录解析失败

### 8.3 磁盘满

⚠️ 难以安全测试。可跳过或在隔离环境（容器）测试。

- [ ] **预期**：所有 hook 的 try/catch 兜底，会话仍可启动，但状态写入失败被 warn 而非 throw。

---

## Phase 9: 安全审计

**目标**：确认实施过程中的安全决策在真实环境仍然有效。

### 9.1 路径遍历防护

- [ ] **步骤 1**：理论上已经过单元测试覆盖。在真实环境无需重复。

- [ ] **步骤 2**：检查日志，确认没有可疑 session_id 出现。

### 9.2 密码不明文记录

- [ ] **步骤 1**：grep 日志和文件，确认无密码出现：

```bash
grep -r "<你的密码>" ~/.oh-my-sdd/ ~/.claude/plugins/oh-my-sdd/ 2>/dev/null
```

**期望**：无匹配。

- [ ] **步骤 2**：检查进程列表（在 oms-login 运行时）：

```bash
# 另一个终端
ps aux | grep iam
```

**期望**：iam 进程的 argv 里**不**含密码（应通过 stdin 传递）。

### 9.3 DOP 数据脱敏

- [ ] **步骤 1**：检查队列文件，看是否有敏感数据：

```bash
cat ~/.oh-my-sdd/queue.jsonl | jq .
```

**期望**：只有 session_id / username / 路径 / 命令名 / 代码行数统计。**不**应包含：
- 完整代码内容
- 密钥、token
- 用户输入的 prompt 文本（除了斜杠命令本身）

### 9.4 文件权限审计

- [ ] **Unix**：

```bash
find ~/.oh-my-sdd -type d -exec stat -c "%a %n" {} \;
find ~/.oh-my-sdd -type f -exec stat -c "%a %n" {} \;
```

**期望**：目录 700，文件 600。

- [ ] **Windows**：检查 ACL：

```powershell
Get-Acl $env:USERPROFILE\.oh-my-sdd | Format-List
```

**期望**：仅当前用户和 SYSTEM 有权限。

---

## Phase 10: 性能与体验

### 10.1 启动耗时

- [ ] **步骤 1**：测量启动耗时：

```bash
# 测量从 `claude` 到出现提示符的时间
time claude -e "exit"
# 或手动用秒表
```

**期望**：比未装 oh-my-sdd 时增加 ≤ 1 秒（hook + 注入 baseline 的开销）。

**如果超过 3 秒**：iam 或 DOP 可能慢，检查 timeout 是否生效。

### 10.2 单次工具调用开销

- [ ] **步骤 1**：在会话里连续触发 10 次 Edit。

**期望**：PostToolUse hook 每次开销 ≤ 100ms（用户感知不到延迟）。

**如果明显**：检查日志，看是否每次都 spawn 新 Node 进程（这是设计内开销，但应可控）。

### 10.3 长会话内存

- [ ] **步骤 1**：开 1 小时以上的会话，期间持续操作。

- [ ] **步骤 2**：检查 Claude Code 进程内存。

**期望**：oh-my-sdd 不应显著增加 Claude Code 内存（hook 是子进程，用完即退）。

---

## 签字确认

完成上述所有 phase 后，由验证人签字：

| Phase | 验证人 | 日期 | 平台 | 备注 |
|-------|-------|------|------|------|
| 1. Schema 验证 | | | | |
| 2. 安装/卸载 | | | | |
| 3. 身份认证 | | | | |
| 4. Baseline 注入 | | | | |
| 5. SDD 命令+Skills | | | | |
| 6. DOP 埋点 | | | | |
| 7. 跨平台（mac） | | | | |
| 7. 跨平台（linux） | | | | |
| 7. 跨平台（win） | | | | |
| 8. 失败注入 | | | | |
| 9. 安全审计 | | | | |
| 10. 性能体验 | | | | |

**全部签字 + 全绿 → 可 tag v0.1.0 + npm publish**

---

## 附录 A：常见问题排查

### A.1 `/sdd-spec` 命令在 Claude Code 里不出现

1. 检查 `~/.claude/plugins/oh-my-sdd/commands/sdd-spec.md` 是否存在
2. 检查文件 frontmatter：
   ```bash
   head -5 ~/.claude/plugins/oh-my-sdd/commands/sdd-spec.md
   ```
   第一行必须是 `---`
3. 重启 Claude Code（插件缓存）
4. 检查 `/plugin` 命令里 oh-my-sdd 是否 enabled

### A.2 SessionStart hook 没触发

1. 检查 `~/.claude/plugins/oh-my-sdd/hooks/hooks.json` 是否存在且 JSON 合法
2. 手动跑 hook 测试：
   ```bash
   echo '{"session_id":"manual","cwd":"/tmp","source":"startup"}' | \
     CLAUDE_PLUGIN_ROOT=~/.claude/plugins/oh-my-sdd \
     node ~/.claude/plugins/oh-my-sdd/hooks/session-start.js
   ```
   期望输出含 additionalContext 的 JSON
3. 看 Claude Code debug 日志

### A.3 iam auth status -json 输出 schema 不对

1. 与 iam 团队确认 schema 是否变更
2. 如果变了，更新 `hooks/lib/iam-cli.js` 的 schema 校验逻辑
3. 重新发版

### A.4 DOP 收不到事件

1. 检查 `~/.oh-my-sdd/queue.jsonl` 是否在累积（说明本地 hook 工作，只是网络问题）
2. 用 curl 手动测试 DOP endpoint：
   ```bash
   curl -v -X POST https://<dop>/api/v1/events \
     -H "Content-Type: application/json" \
     -d '{"event":"test"}'
   ```
3. 检查 DOP 后台日志
4. 确认 endpoint URL + 鉴权方式（DOP 团队提供）

### A.5 baseline 注入但 Claude 不遵守

baseline 是**软规则**（spec § 5.5）。用户/项目的 CLAUDE.md 优先级更高。如果硬性要求，需要 PreToolUse hook 拦截（v0.2 功能）。

### A.6 Windows 上 hook 命令字符串失败

Windows cmd 的引号转义与 Unix 不同。可能需要改 `hooks.json` 为：

```json
{
  "SessionStart": [
    { "type": "command", "command": "node %CLAUDE_PLUGIN_ROOT%\\hooks\\session-start.js" }
  ]
}
```

或者用 PowerShell 兼容写法。如果 `${CLAUDE_PLUGIN_ROOT}` 在 Windows 不展开，install.js 需要在 Windows 上写入绝对路径。

---

## 附录 B：验证报告模板

完成后填写：

```markdown
# oh-my-sdd v0.1 真实环境验证报告

**验证人**: <name>
**日期**: <YYYY-MM-DD>
**平台**: <macOS 14 / Ubuntu 22 / Windows 11>
**Claude Code 版本**: <版本号>
**iam CLI 版本**: <版本号>
**Node 版本**: <版本号>

## 通过项
- [Phase X.Y] 描述...

## 失败项
- [Phase X.Y] 描述... → 已建 follow-up issue / 已修复 / 已知限制

## 已知限制（不阻塞 v0.1 发布）
- ...

## 建议
- ...

## 签字
✅ 可发布 / ❌ 不可发布
```
