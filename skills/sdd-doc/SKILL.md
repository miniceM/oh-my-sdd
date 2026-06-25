---
name: sdd-doc
description: 本 skill 在用户说"生成 Word"/"导出文档"/"出需求规格说明书"/"转 Word"/"归档 spec"时使用。读取 openspec change 的 spec 产物（proposal + delta specs），按企业模板章节结构映射填充，生成符合企业格式的 .docx（封面/信息表/修订记录表/目录/正文 + 页眉页脚页码）。
argument-hint: [change-slug，可选；缺省自动推断唯一未归档 change]
---

# /sdd-doc —— SDD 规格文档导出（spec → 企业格式 Word）

**前置依赖**：`pandoc`（必需，系统二进制）、`python3` + `python-docx` + `lxml`（必需）、企业 Word 模板（可选，缺省用 plugin 内置）。
**触发时机**：`/sdd-spec` 完成、spec 已 commit 之后。本命令是 spec 阶段的**可选收尾**，不阻断后续 `/sdd-plan`。

## 何时使用

- spec 阶段完成后，需向评审会/项目经理/归档系统提交 Word 格式需求规格说明书
- spec 内容有变更，需重新生成最新版 Word
- 跨团队流转、打印、签批场景需要 .docx 而非 markdown

## 何时不应使用

- spec 未完成（proposal/specs 未写或未 commit）——生成会得到大量"待补充"占位
- 仅内部协作且团队接受 markdown —— 不必导出
- 需要 plan/design/tasks/review 阶段的 Word —— 当前仅支持 spec 阶段

## 工作流

### 步骤 1：确定 slug

- **`$ARGUMENTS` 非空**：用作 slug，校验 `openspec/changes/<slug>/` 存在
- **`$ARGUMENTS` 为空**：扫 `openspec/changes/*/`，唯一目录则自动推断；多个则提示用户指定

### 步骤 2：执行生成

```bash
python3 skills/sdd-doc/sdd_doc.py <slug> [--project "项目标题"] [--capability-names "auth=认证,user=用户管理"]
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
   - 每个 capability 复制模板功能块一份，填功能概述/处理逻辑，其余子章节"（待补充）"
   - 非功能区无内容子章节填"（待补充）"
5. **输出**：`openspec/changes/<slug>/<slug>-需求规格说明书.docx`

### 步骤 3：提示用户

- 打开生成的 .docx 检查格式
- Word/WPS 打开时若提示"更新域"，点击以刷新目录（脚本已设 `updateFields=true`，多数查看器自动更新）
- 修订记录仅含初始行，后续变更手动追加
- "（待补充）"占位处需人工补充（UI模型图/接口设计/数据库设计等 spec 阶段未覆盖的内容）

## 参数

| 参数 | 说明 |
|------|------|
| `slug` | change slug；缺省时自动推断唯一未归档 change |
| `--project` | 封面项目标题，覆盖 .meta.json |
| `--capability-names` | capability 显示名映射，格式 `"auth=认证授权,user=用户管理"`（逗号分隔）；也可写在项目根 `.sdd-doc-names` 文件 |
| `--stage` | 预留扩展（当前仅 `spec`） |

## 章节映射规则

生成文档严格按企业模板章节结构填充：

| spec 产物 | → 模板位置 | 填充方式 |
|-----------|-----------|---------|
| `proposal.md` 背景 | "1 总体说明" → "1.1 项目信息" | proposal 的 `## 背景/目标` 段 |
| `proposal.md` 范围 | "1 总体说明" → "1.2 功能列表" | proposal 的 `## 变更范围` 段 |
| `proposal.md` 验收 | "1 总体说明" → "1.3 验收标准" | proposal 的 `## 验收标准` 段 |
| 每个 `specs/<capability>/` | "2 功能详细分析及设计" → "2.X <capability 显示名>" | 复制模板功能块骨架一份 |
| capability 的 Requirement/Scenario | 功能块内"功能概述"+"处理逻辑" | requirement 名 + 描述 + scenario 的 WHEN-THEN |
| spec 填不上的子章节 | UI模型图/接口设计/数据库设计/账务处理等 | 保留标题 + 填"（待补充）" |
| 非功能需求 | "3 非功能需求分析"子章节 | 无内容子章节填"（待补充）" |

**模板示例功能块会被删除**，替换为按 capability 生成的新功能块。

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
- ✅ 模板始终保持完整（python-docx 对象级操作，禁止 XML 字符串拼接）
- ✅ 内置模板脱敏（不含企业具体标识）
- ✅ 输出文件名固定 `<slug>-需求规格说明书.docx`
- ✅ 章节映射按模板结构填充，不新增无关章节
- ❌ 禁止凭空捏造元数据（缺值留空或用占位符，让用户手填）
- ❌ 禁止覆盖用户已有的 `.meta.json` 修订记录（当前版本仅读不写）

## 技术路线说明

经 demo 验证：pandoc 用于辅助转换，python-docx 以对象模型操作完整模板（demo2 已证伪 XML 拼接路线）。v2 采用**章节映射填充**：解析 spec 为结构化数据，按模板章节复制功能块、填子章节内容、留占位。模板示例功能块删除，由 spec 生成的新功能块取代。

## 故障排查

| 现象 | 原因与处理 |
|------|-----------|
| `未找到 pandoc` | 按 OS 安装：mac `brew install pandoc` / win `winget install JohnMacFarlane.Pandoc` / linux `apt install pandoc` |
| `缺少 python-docx` | `pip install python-docx lxml` |
| `未找到 change 目录` | slug 错误，或先用 `/sdd-spec` 创建 |
| `未找到 Word 模板` | 检查三层查找路径是否放置了模板 |
| `模板功能块无 heading3/4 子章节骨架` | 模板功能块结构与预期不符（需含 heading3 子章节），检查模板或联系维护者 |
| 目录页空白或显示旧文本 | Word/WPS 打开时点"更新域"（脚本已设自动更新，但部分查看器需手动） |
| 章节编号/标题异常 | 模板 heading1 需为"功能详细分析及设计""非功能需求分析"；自定义模板需匹配这些关键词 |

## 输出

> ✓ 文档已生成：`openspec/changes/<slug>/<slug>-需求规格说明书.docx`
> ✓ 套用模板：`<内置/本地/配置>` | capability：`<N>` 个 → 功能块 `<N>` 份
> ✓ 封面、信息表、修订记录表、目录、正文已按模板章节结构填充
>
> 打开文档检查格式；Word/WPS 提示"更新域"时点击刷新目录。
> "（待补充）"占位需人工补充（spec 阶段未覆盖的 UI/接口/数据库设计等）。
> 修订记录仅含初始行，后续变更手动追加。
> 可重新运行 `/sdd-doc` 覆盖更新；运行 `/sdd-plan <slug>` 进入 Ring 2（设计 + 任务）。
