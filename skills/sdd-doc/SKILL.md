---
name: sdd-doc
description: 把 openspec spec 产物（proposal + delta specs）转成符合企业格式的 Word 需求规格说明书（.docx，含封面/信息表/修订记录表/目录/正文 + 页眉页脚页码）。当用户提到"生成 Word/导出文档/出需求规格说明书/转 Word/归档 spec/spec 转 Word/出评审材料/打印需求文档/规格书导出"等需求时使用——即使用户没明确说"Word"，只要意图是把 spec 阶段产出变成可评审/归档/流转的正式文档就应触发。
argument-hint: [change-slug，可选；缺省自动推断唯一未归档 change]
allowed-tools: Bash(python3 *)
---

# /sdd-doc —— SDD 规格文档导出（spec → 企业格式 Word）

**前置依赖**：`pandoc`（必需，系统二进制）、`python3` + `python-docx` + `lxml`（必需）、企业 Word 模板（可选，缺省用 plugin 内置）。
**触发时机**：`/sdd-spec` 完成、spec 已 commit 之后。本命令是 spec 阶段的**可选收尾**，不阻断后续 `/sdd-plan`。

## 何时使用

- spec 阶段完成后，需向评审会/项目经理/归档系统提交 Word 格式需求规格说明书
- spec 内容有变更，需重新生成最新版 Word
- 跨团队流转、打印、签批场景需要 .docx 而非 markdown

## 何时不应使用

- spec 未完成（proposal/specs 未写或未 commit）——生成会得到大量未填充表格
- 仅内部协作且团队接受 markdown —— 不必导出
- 需要 plan/design/tasks/review 阶段的 Word —— 当前仅支持 spec 阶段

## 工作流

### 步骤 1：确定 slug

- **`$ARGUMENTS` 非空**：用作 slug，校验 `openspec/changes/<slug>/` 存在
- **`$ARGUMENTS` 为空**：扫 `openspec/changes/*/`，唯一目录则自动推断；多个则提示用户指定

### 步骤 2：执行生成

```bash
python3 ${CLAUDE_SKILL_DIR}/sdd_doc.py <slug> [--project "项目标题"] [--capability-names "auth=认证,user=用户管理"]
```

脚本自动完成：
1. **前置检查**：pandoc、python-docx（缺失按 OS 给安装命令）
2. **解析 spec 产物**：
   - `proposal.md` 按 `##` 标题分块（背景/范围/验收）
   - `specs/<capability>/spec.md` 解析 openspec delta（Requirement/Scenario/WHEN-THEN）
3. **python-docx 填模板**（对象级，模板保持完整）：
   - 封面：项目标题、版本号
   - 信息表：编写人、发布日期、控制级别、制定部门
   - 修订记录表：初始创建行
4. **章节映射填充**（核心）：
   - 生成"1 总体说明" + 1.1 项目信息 / 1.2 功能列表 / 1.3 验收标准（填 proposal）
   - 每个 capability **deepcopy 完整功能块（含全部 11 类表格）**，填功能概述表（功能名称/说明）+ 处理逻辑表（scenario），**其余表格保留模板示例数据**作填写指引
   - 非功能区无内容子章节填"（待补充）"
5. **输出**：`openspec/changes/<slug>/<slug>-需求规格说明书.docx`

> 映射规则与技术路线细节见 `references/mapping-details.md`（维护者参考，执行无需读取）。

### 步骤 3：提示用户

- 打开生成的 .docx 检查格式
- Word/WPS 打开时若提示"更新域"，点击以刷新目录（脚本已设 `updateFields=true`，多数查看器自动更新）
- 修订记录仅含初始行，后续变更手动追加
- **接口设计/会计核算/影响范围等表格保留的是模板示例数据**，需人工替换为真实数据（spec 阶段产不出这些设计字段）

## 参数

| 参数 | 说明 |
|------|------|
| `slug` | change slug；缺省时自动推断唯一未归档 change |
| `--project` | 封面项目标题，覆盖 .meta.json |
| `--capability-names` | capability 显示名映射，格式 `"auth=认证授权,user=用户管理"`（逗号分隔）；也可写在项目根 `.sdd-doc-names` 文件 |
| `--stage` | 预留扩展（当前仅 `spec`） |

## 模板查找优先级（三层）

1. **change 本地覆盖**：`openspec/changes/<slug>/reference.docx`（单 change 定制）
2. **项目级配置**：`<project-root>/.sdd-doc-template`（单行文件，内容为模板路径，绝对或相对项目根）
3. **plugin 内置默认**：`skills/sdd-doc/templates/reference.docx`（脱敏通用版）

企业真实模板含内部标识，**不应进开源仓库**。推荐做法：各项目用第 1 层或第 2 层放置真实模板。

## capability 显示名

specs 目录名是英文 slug（如 `auth`），模板功能块标题期望可读名称。两种配置方式：

- **命令行**：`--capability-names "auth=认证授权,user=用户管理"`
- **项目配置**：项目根 `.sdd-doc-names` 文件，内容如 `auth=认证授权,user=用户管理`

缺省时用 slug 原文作标题。

## 强制规则

- ✅ pandoc 与 python-docx 前置检查通过后再生成
- ✅ 内置模板脱敏（不含企业具体标识）
- ✅ 输出文件名固定 `<slug>-需求规格说明书.docx`
- ✅ 功能块表格全部保留，不删除（只填 spec 能对上的两处）
- ❌ 禁止凭空捏造元数据（缺值留空或用占位符，让用户手填）
- ❌ 禁止覆盖用户已有的 `.meta.json` 修订记录（当前版本仅读不写）

> 技术实现约束（如"为何不做 XML 字符串拼接"）见 `references/mapping-details.md`，属维护者关注、执行无关。

## 故障排查

| 现象 | 原因与处理 |
|------|-----------|
| `未找到 pandoc` | 按 OS 安装：mac `brew install pandoc` / win `winget install JohnMacFarlane.Pandoc` / linux `apt install pandoc` |
| `缺少 python-docx` | `pip install python-docx lxml` |
| `未找到 change 目录` | slug 错误，或先用 `/sdd-spec` 创建 |
| `未找到 Word 模板` | 检查三层查找路径是否放置了模板 |
| `模板未找到功能块作为模板源` | 模板功能区无 heading2 功能块，检查模板结构（详见 references/mapping-details.md"自定义模板适配要求"） |
| 目录页空白或显示旧文本 | Word/WPS 打开时点"更新域"（脚本已设自动更新，但部分查看器需手动） |
| 章节编号/标题异常 | 模板 heading1 需为"功能详细分析及设计""非功能需求分析"；自定义模板需匹配这些关键词 |

## 输出

> ✓ 文档已生成：`openspec/changes/<slug>/<slug>-需求规格说明书.docx`
> ✓ 套用模板：`<内置/本地/配置>` | capability：`<N>` 个 → 功能块 `<N>` 份
> ✓ 封面、信息表、修订记录表、目录、正文已按模板章节结构填充（表格全保留）
>
> 打开文档检查格式；Word/WPS 提示"更新域"时点击刷新目录。
> 接口/会计/影响范围等表格保留的是模板示例数据，需人工替换为真实数据。
> 修订记录仅含初始行，后续变更手动追加。
> 可重新运行 `/sdd-doc` 覆盖更新；运行 `/sdd-plan <slug>` 进入 Ring 2（设计 + 任务）。
