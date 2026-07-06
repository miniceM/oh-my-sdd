---
name: sdd-doc
description: 把 openspec 的 spec + plan 产物（proposal + delta specs + design.md）转成符合企业模版的 Markdown 需求规格说明书。当用户提到"生成需求文档/出需求规格说明书/出文档/归档 spec/出评审材料"等需求时使用。触发时机：/sdd-plan 完成后。
argument-hint: [change-slug，可选；缺省自动推断唯一未归档 change]
allowed-tools: Bash, Read, Write
---

# /sdd-doc —— SDD 需求文档导出（spec + plan → 企业 Markdown 模版）

**前置依赖**：python3（标准库，无第三方依赖）。
**触发时机**：`/sdd-plan` 完成后。本命令是 plan 阶段的收尾，用于将 spec + design 产物整合输出为企业格式 MD 文档。

## 何时使用

- `/sdd-plan` 完成后，需向评审会/需求平台/归档系统提交 Markdown 格式需求规格说明书
- spec 或 design 内容有变更，需重新生成最新版文档
- 跨团队流转、线上平台导入场景需要 .md 格式

## 何时不应使用

- spec 未完成（proposal/specs 未写）—— 生成会得到大量未填充表格
- plan/design 未完成（design.md 未写）—— 接口设计/数据库设计/影响范围分析等章节将输出占位符；若仅需 spec 阶段内容，可用 `--no-design` 跳过
- 需要 Word 格式 —— 请使用其他工具将 .md 转 .docx，本命令不再直接输出 Word

## 工作流

### 步骤 1：确定 slug

- **`$ARGUMENTS` 非空**：用作 slug，校验 `openspec/changes/<slug>/` 存在
- **`$ARGUMENTS` 为空**：扫 `openspec/changes/*/`，唯一目录则自动推断；多个则提示用户指定

### 步骤 2：语义理解（Claude 分析源文件）

使用 Read 工具读取以下文件：
- `openspec/changes/<slug>/.meta.json` — 项目元数据（项目名称、版本、作者、部门等）
- `openspec/changes/<slug>/proposal.md` — 提案背景、范围、验收标准
- `openspec/changes/<slug>/specs/<capability>/spec.md` — 每个 capability 的需求规格（Requirement/Scenario/WHEN-THEN）
- `openspec/changes/<slug>/design.md` — 设计方案（如提供 `--no-design` 则跳过此文件）

**理解内容，识别**：
1. 每个 capability 对应的功能块和变更类型
2. design.md 中的 API 接口设计、数据库设计、影响范围分析、非功能需求分别属于哪个 capability
3. 根据变更类型推断规则确定每个 capability 的 changeTypes 数组

### 步骤 2.5：调用 dop 获取排期信息（sdd-doc 1.1 排期信息章节数据源）

> **重要**：**排期编号 ≠ 变更号**。`change-id` 是 dop 工作流标识（如 `ARD123456`），`release_num` 是排期批次号（如 `R20260620001`），二者**没有派生关系**，必须从 `dop change view` 的 `user_stories[].release_info` 嵌套字段读取。

**2.5.1 调用 dop**

```bash
# slug 通常等于 change-id（约定），若 .meta.json 中有显式 change-id 字段则优先用
dop change view <slug> -j
```

若命令失败（dop 未登录、网络异常、命令不存在），执行**降级策略**：
- 终端 echo 警告：`⚠️ dop change view 失败：<错误摘要>。请手动提供排期信息。`
- 用 `AskUserQuestion` 询问用户：
  - "排期编号（Release Num）" — 选项留空，用户用 Other 输入
  - "排期名称（Release Name）" — 选项留空，用户用 Other 输入
  - "系统标识（Sub System Code）" — 选项留空，用户用 Other 输入
  - "系统名称（Sub System Name）" — 选项留空，用户用 Other 输入
- 用户填的值直接进 step 3 的 metadata；不再做"取首个非空"逻辑

**2.5.2 解析 JSON**

排期信息位于 `user_stories[]` 数组中**每个 story 的 `release_info` 嵌套对象**，而非 change 顶层。**`release_info` 可能为 `null`（story 未挂排期）**。

**取数规则**：遍历 `user_stories`，选**第一个 `release_num` 非空**的 story 的 `release_info`。若所有 story 的 `release_info` 都为空/缺失，降级到 2.5.1 的 AskUserQuestion 流程。

**jq 提取模板**（Claude 在 Bash 里执行）：

```bash
# 取首个非空 release_info
dop change view <slug> -j | jq '
  (.user_stories // [])
  | map(select(.release_info != null and (.release_info.release_num // "") != ""))
  | .[0].release_info
'

# 取首个 sub_system（系统标识/名称）
dop change view <slug> -j | jq '.sub_systems[0] // {}'
```

**2.5.3 字段映射**（写入 step 3 的 `metadata`）

| sdd-doc metadata 字段 | dop 字段路径 | 说明 |
|----------------------|-------------|------|
| `releaseCode` | `user_stories[i].release_info.release_num` | 排期编号（如 `R20260620001`） |
| `releaseName` | `user_stories[i].release_info.release_name` | 排期名称 |
| `systemCode` | `sub_systems[0].code` | 子系统代码（如 `ARD.ard-sdk`） |
| `systemName` | `sub_systems[0].name` | 子系统全名（如 `智能研发平台.AI原生框架套件`） |

如果 dop 解析失败且用户手填，仍按上表把 4 个值放进 metadata。

**2.5.4 派生 `systemFlag`（系统标志，本地计算，不依赖 dop）**

`systemFlag` 从**变更号前 3 位大写字母**派生（如 `ARD373235` → `ARD`），用于在排期信息表标识变更所属的子系统族。

```bash
# 在 Claude 拼装 metadata 时直接计算（无需 dop）
systemFlag=$(echo -n "<change-id>" | tr '[:lower:]' '[:upper:]' | cut -c1-3)
```

> **设计原则**：能从本地数据派生的字段不要走外部依赖。`systemFlag` 是 `change-id` 的纯函数，dop 不可用时仍能正确填充；所以 AskUserQuestion 降级列表**不包含** `systemFlag`。
>
> **与 `systemCode` 的区别**：`systemFlag` 是变更所属"族"（从 change-id 前缀派生），`systemCode` 是当前 change 实际挂接的子系统代码（从 dop 拉取）。两者**没有强对应关系**——例如 `ARD222222` 的 `systemFlag=ARD`，但 `systemCode=CARD.points-mall`。

### 步骤 3：生成结构化 JSON

使用 Write 工具将理解结果写入 `openspec/changes/<slug>/.sdd-doc-data.json`。

JSON 必须符合以下 Schema（完整示例见下文"JSON Schema 参考"）：

```json
{
  "metadata": {
    "projectTitle": "项目名称",
    "systemName": "系统名称（→ 步骤 2.5：sub_systems[0].name）",
    "systemFlag": "系统标志（→ 步骤 2.5.4：change-id 前 3 位大写，本地派生）",
    "releaseCode": "排期编号（→ 步骤 2.5：user_stories[].release_info.release_num，首个非空）",
    "releaseName": "排期名称（→ 步骤 2.5：user_stories[].release_info.release_name）",
    "systemCode": "系统标识（→ 步骤 2.5：sub_systems[0].code）",
    "version": "V0.1",
    "author": "编写人",
    "date": "2026-07-03",
    "department": "制定部门"
  },
  "proposal": {
    "title": "提案标题",
    "background": "背景/目标描述（Markdown 原文或摘要）",
    "scope": "范围描述",
    "acceptance": "验收标准"
  },
  "capabilities": [
    {
      "name": "capability-slug",
      "displayName": "功能块标题",
      "description": "功能一句话描述",
      "changeTypes": ["服务接口新增或变更", "数据库相关新增或变更"],
      "requirements": [
        {
          "name": "Requirement 名称",
          "desc": "Requirement 描述",
          "scenarios": [
            {
              "name": "Scenario 名称",
              "steps": [
                {"type": "WHEN", "text": "前置条件"},
                {"type": "THEN", "text": "预期结果"}
              ]
            }
          ]
        }
      ],
      "interfaceDesign": {
        "changeType": "新增",
        "apiGovernance": "是",
        "table": {
          "headers": ["功能", "接口名称", "接口地址", "接口变更类型", "API治理平台", "是否已完成相关设计"],
          "rows": [["", "接口名称", "/api/v1/endpoint", "新增", "是", ""]]
        }
      },
      "databaseDesign": {
        "tables": [
          {
            "headers": ["列名1", "列名2", "类型", "说明"],
            "rows": [["id", "主键", "bigint", "自增"]]
          }
        ]
      },
      "impactAnalysis": {
        "table": {
          "headers": ["序号", "影响系统分类", "影响系统名称", "影响功能/交易/接口", "具体影响内容分析", "备注"],
          "rows": [["1", "本系统", "其他功能", "XX功能", "简述影响", ""]]
        }
      },
      "errorCodes": {
        "table": {
          "headers": ["序号", "错误码编码", "业务错误提示信息", "备注"],
          "rows": [["1", "XXX.XXX.XXXXXXX", "错误描述", ""]]
        }
      }
    }
  ],
  "nonFunctional": {
    "customerGroup": {
      "type": "全行客户",
      "scale": "百万级"
    },
    "performance": {
      "concurrency": "最高500并发，平均100并发",
      "throughput": "高峰1000TPS，平均200TPS",
      "latency": "TP95=200ms，TP99=5000ms"
    },
    "visitDistribution": "访问集中度描述",
    "hardwareCompatibility": {
      "chipAndOS": "芯片及操作系统支持要求",
      "languageRuntime": "语言运行时要求",
      "database": "数据库软件要求",
      "middleware": "中间件要求",
      "browser": "浏览器兼容性要求",
      "other": "其他需求"
    },
    "security": {
      "userStories": [{"id": "SEC001", "name": "安全用户故事"}]
    },
    "additional": "其他非功能需求描述"
  }
}
```

### 步骤 3.5：输出文件安全检查（覆盖前确认）

> **目的**：防止已评审/已归档的 `<slug>-需求规格说明书.md` 被无声覆盖。`sdd_doc.py generate()` 内部已默认拒绝覆盖已 git 跟踪的文件，本步骤负责在用户侧触发 AskUserQuestion 二次确认。

**3.5.1 计算输出路径**

```
output_path = openspec/changes/<slug>/<slug>-需求规格说明书.md
```

**3.5.2 调用 sdd_doc.py 检测状态**

```bash
python3 ${CLAUDE_SKILL_DIR}/sdd_doc.py --check-overwrite <output_path>
```

> `${CLAUDE_SKILL_DIR}` 是 Claude Code 官方 skill 运行时注入的 env var，指向当前 skill 所在目录——脚本与 SKILL.md 同目录。其他声称"无缝读取 Claude Code skills"的 AI 工具应在其运行时提供等价 env var（或绝对路径解析），不在本 skill 层兜底。

返回 JSON（结构见 sdd_doc.py `_check_overwrite_safety` 函数 docstring）：

```json
{
  "exists": true,
  "tracked": true,
  "modified": false,
  "size_bytes": 12345,
  "last_modified": "2026-07-04T10:30:45"
}
```

**3.5.3 按检测结果分支处理**

| `exists` | `tracked` | 处理 |
|----------|-----------|------|
| `false`  | *         | 直接进入步骤 4（无文件可覆盖） |
| `true`   | `false`   | 终端打印 `⚠ 输出文件未跟踪（<size> 字节），将直接覆盖` 后进入步骤 4 |
| `true`   | `true`    | **触发 AskUserQuestion 二次确认**（见 3.5.4） |

**3.5.4 AskUserQuestion 模板（tracked=true 时必走）**

```
问题：输出文件已存在且被 git 跟踪

  路径：<output_path>
  大小：<size_bytes> 字节
  最后修改：<last_modified>
  本地有未提交修改：<是/否>

请选择处理方式：
```

**3 个选项**（其余通过 Other 让用户自定义，比如"覆盖到不同文件名"）：

1. **覆盖** —— 直接重写文件。已 review 过的版本在 `git log <file>` 中可恢复。
2. **备份后覆盖** —— 先 `cp <output_path> <output_path>.bak-$(date +%Y%m%d-%H%M%S)`，再进入步骤 4。原版本本地有 `.bak` 备份 + git 历史双保险。
3. **取消** —— 终止本次 `/sdd-doc`，不修改任何文件。打印 `✗ 已取消，未修改文件。`，删除步骤 3 生成的 `.sdd-doc-data.json`（同步骤 5）。

**3.5.5 后续动作**

- 选 1 或 2 → 进入步骤 4 正常渲染（无需 `--force`：`tracked=true` 已被本次 AskUserQuestion 授权）
- 选 3 → 删除 `.sdd-doc-data.json` 临时文件并结束

> **设计原则**：sdd_doc.py 的 `tracked=true` 默认拒绝是"硬闸"，SKILL.md 的 AskUserQuestion 是"软闸"。两者串联：人确认后才放行，机器兜底防误操作。
>
> **关于 modified=true**：本地有未提交改动通常意味着用户正在手工调整文档。无论选哪个选项都应先提醒用户"你的本地未提交改动会一并被覆盖/备份"——这需要在 AskUserQuestion 的描述里明确提示，不另设独立选项。

### 步骤 4：执行渲染

```bash
python3 ${CLAUDE_SKILL_DIR}/sdd_doc.py <slug> --data-json <.sdd-doc-data.json路径> [--capability-names "auth=认证,user=用户管理"]
```

> 与 3.5.2 同一约定：`${CLAUDE_SKILL_DIR}` 由 Claude Code 官方 skill 运行时注入。脚本与 SKILL.md 同目录，故 `${CLAUDE_SKILL_DIR}/sdd_doc.py` 即定位准确。

脚本完成：
1. 加载 JSON 数据
2. 按企业模版输出：
   - 文档信息、修订记录、目录
   - §1 总体说明（排期信息表格 + 功能列表表格）
   - §2 功能详细分析及设计（每个 capability 9 个固定子章节）
   - §3 非功能需求分析（客户群体/性能/访问集中度/软硬件兼容性/安全/可扩展）
3. 内部调用 `_check_overwrite_safety` 做覆盖前安全门（见步骤 3.5），**默认拒绝覆盖已 git 跟踪的文件**
4. 输出：`openspec/changes/<slug>/<slug>-需求规格说明书.md`

### 步骤 5：清理临时文件

```bash
rm openspec/changes/<slug>/.sdd-doc-data.json
```

## 参数

| 参数 | 说明 |
|------|------|
| `slug` | change slug；缺省时自动推断唯一未归档 change |
| `--data-json` | Claude 生成的结构化 JSON 文件路径（C 方案核心输入） |
| `--no-design` | 跳过设计相关章节（接口/数据库/影响范围/非功能），输出纯占位符 |
| `--capability-names` | capability 显示名映射，格式 `"auth=认证授权,user=用户管理"`（逗号分隔）；也可写在项目根 `.sdd-doc-names` 文件 |

## capability 显示名

specs 目录名是英文 slug（如 `auth`），模版功能块标题期望可读名称。两种配置方式：

- **命令行**：`--capability-names "auth=认证授权,user=用户管理"`
- **项目配置**：项目根 `.sdd-doc-names` 文件，内容如 `auth=认证授权,user=用户管理`

缺省时用 slug 原文作标题。

## 变更类型推断规则

写入 JSON 时，根据以下规则推断每个 capability 的 `changeTypes` 数组：

| 条件 | 勾选 |
|------|------|
| design.md 中有接口/API 设计内容 | `[x] 服务接口新增或变更` |
| design.md 中有数据库表/DDL/Schema 变更 | `[x] 数据库相关新增或变更` |
| spec 中提到 UI/页面/前端/界面变更 | `[x] 用户界面新增或变更` |
| design.md/spec 涉及批处理/定时任务/Cron/Job | `[x] 批处理任务新增或变更` |
| design.md/spec 涉及网络/防火墙/端口/域名 | `[x] 网络变更` |
| design.md/spec 涉及基础设施/部署/容器/配置中心 | `[x] 其他基础设施变更` |
| design.md/spec 涉及报表/BI/统计报表 | `[x] 报表新增或变更` |
| design.md/spec 涉及模型/AI/算法/特征工程 | `[x] 模型新增或变更` |
| 无任何匹配时 | 全部 `[ ]`（不强行猜测） |

## 强制规则

- ✅ 严格按企业模版固定结构输出，不可删减任何章节
- ✅ 文档信息/修订记录从 JSON 元数据自动填充
- ✅ 变更类型复选框根据 `changeTypes` 数组渲染（`[x]` 表示勾选）
- ✅ 所有模版固定格式（引用块指引、表格结构、章节编号）必须保留
- ❌ 禁止凭空捏造元数据（缺值用占位符）
- ❌ 禁止省略模版中的任何必选章节
- ❌ 禁止修改 JSON Schema 结构（字段可省略但不可改名）

## 输出

> ✓ 文档已生成：`openspec/changes/<slug>/<slug>-需求规格说明书.md`
> ✓ capability：`<N>` 个 → 功能小节 `<N>` 份
> ✓ 变更类型：`[x]` 已根据设计内容自动勾选
> ✓ 排期信息：已从 `dop change view <slug>` 拉取（source: user_stories[].release_info）
>
> 设计阶段未产出的章节以占位符输出，需人工补充。
> 可重新运行 `/sdd-doc` 覆盖更新。
