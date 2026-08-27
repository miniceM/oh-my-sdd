#!/usr/bin/env python3
"""
sdd_doc.py —— /sdd-doc 命令核心脚本

读取 Claude 结构化 JSON（--data-json）按企业软件需求规格说明书模版输出
Markdown 文件。无外部依赖，仅需 Python 3 标准库。

用法：
  python3 sdd_doc.py <slug> --data-json <.json路径> [--capability-names "auth=认证,..."]
  python3 sdd_doc.py <slug> --no-design            [--capability-names "auth=认证,..."]
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ============================================================
# 错误
# ============================================================

class SddDocError(Exception):
    """用户可见错误。"""

# ============================================================
# 输入读取
# ============================================================

def resolve_change_dir(slug: str, project_root: Path) -> Path:
    d = project_root / "openspec" / "changes" / slug
    if not d.is_dir():
        candidates = []
        changes_dir = project_root / "openspec" / "changes"
        if changes_dir.is_dir():
            candidates = [x.name for x in changes_dir.iterdir() if x.is_dir()]
        if len(candidates) == 1:
            d = changes_dir / candidates[0]
        elif len(candidates) > 1:
            raise SddDocError(f"存在多个 change，请指定 slug：{candidates}")
        else:
            raise SddDocError(f"未找到 change 目录：{d}\n请先运行 /sdd-spec 创建规格。")
    return d


def read_meta(change_dir: Path) -> dict:
    p = change_dir / ".meta.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}


def load_capability_names(project_root: Path, arg: str | None) -> dict[str, str]:
    names: dict[str, str] = {}
    for src, is_cfg in [(project_root / ".sdd-doc-names", True), (arg, False)]:
        if not src:
            continue
        text = src.read_text(encoding="utf-8") if (is_cfg and Path(str(src)).is_file()) else (src if isinstance(src, str) else "")
        for pair in text.split(","):
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                names[k.strip()] = v.strip()
    return names


# ============================================================
# JSON 数据加载
# ============================================================

_ALL_CHANGE_TYPES = [
    "用户界面新增或变更",
    "服务接口新增或变更",
    "数据库相关新增或变更",
    "批处理任务新增或变更",
    "网络变更",
    "其他基础设施变更",
    "报表新增或变更",
    "模型新增或变更",
]


def _get(d, *keys, default=None):
    """安全链式取 dict 值。"""
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
        if cur is None:
            return default
    return cur


def _s(v, default=""):
    """none-safe 字符串。"""
    return default if v is None else str(v)


def validate_sddoc_data(data: dict):
    """校验 data JSON 结构必备字段。非阻塞——仅 warn。"""
    warnings = []
    if "metadata" not in data:
        warnings.append("缺少顶层字段: metadata")
    if "capabilities" not in data:
        warnings.append("缺少顶层字段: capabilities")
    else:
        for i, cap in enumerate(data.get("capabilities", [])):
            if "name" not in cap:
                warnings.append(f"capabilities[{i}] 缺少 name")
    return warnings


def _render_change_types_checkboxes(active: list[str]) -> str:
    """根据 active 列表渲染复选框。active 中的项显示 [x]，其余显示 [ ]。"""
    active_set = set(active) if active else set()
    lines = []
    for t in _ALL_CHANGE_TYPES:
        mark = "x" if t in active_set else " "
        lines.append(f"[{mark}] {t}")
    return " <br>".join(lines)


# ============================================================
# MD 渲染辅助
# ============================================================

_SEP = " :--- "


def _lalign(n: int) -> str:
    return "|" + _SEP.join([" :--- "] * n)[1:] + "|"


def _h(level: int, text: str) -> str:
    return f"{'#' * level} {text}"


def _br(lines: list[str]):
    lines.append("")


def _tbl(lines: list[str], header: list[str], rows: list[list[str]]):
    lines.append("| " + " | ".join(header) + " |")
    lines.append("|" + "|".join([":---"] * len(header)) + "|")
    for row in rows:
        lines.append("| " + " | ".join(str(c) for c in row) + " |")
    _br(lines)


def _quote(lines: list[str], text: str):
    for ln in text.strip().splitlines():
        lines.append(f"> {ln.strip()}")
    _br(lines)


# ============================================================
# 元数据
# ============================================================

def extract_metadata(change_dir: Path, meta: dict, data: dict | None) -> dict:
    """从 .meta.json 和 data JSON 提取文档元数据。data JSON 的 metadata 优先级更高。"""
    created = meta.get("created_at", "")
    try:
        ds = datetime.fromisoformat(created.replace("Z", "+00:00")).strftime("%Y-%m-%d")
    except Exception:
        ds = datetime.now().strftime("%Y-%m-%d")

    dm = data.get("metadata", {}) if data else {}

    return {
        "project_title": dm.get("projectTitle") or meta.get("project_title", "{{projectName}}"),
        "system_name": dm.get("systemName") or "{{systemName}}",
        "version": dm.get("version") or meta.get("version", "V0.1"),
        "author": dm.get("author") or meta.get("author", ""),
        "date": dm.get("date") or ds,
        "department": dm.get("department") or meta.get("department", ""),
        "release_code": dm.get("releaseCode") or "{{releaseCode}}",
        "release_name": dm.get("releaseName") or "{{releaseName}}",
        "system_code": dm.get("systemCode") or "{{systemCode}}",
        "system_flag": dm.get("systemFlag") or "{{systemFlag}}",
    }


# ============================================================
# 主构建
# ============================================================

def build(
    meta: dict,
    capabilities: list[dict],
    cap_names: dict,
    data: dict | None,
    no_design: bool = False,
) -> str:
    L: list[str] = []
    pt = meta.get("project_title", "{{projectName}}")
    sn = meta.get("system_name", "{{systemName}}")
    ver = meta.get("version", "V0.1")
    dt = meta.get("date", "")
    au = meta.get("author", "")
    dp = meta.get("department", "")
    rc = meta.get("release_code", "{{releaseCode}}")
    rn = meta.get("release_name", "{{releaseName}}")
    sc = meta.get("system_code", "{{systemCode}}")
    sf = meta.get("system_flag", "{{systemFlag}}")

    # ═══════ 标题 ═══════
    L.append(f"# XX公司_{pt}项目_{sn}系统 软件需求规格说明书")
    _br(L)

    # ═══════ 文档信息 ═══════
    L.append(_h(2, "文档信息"))
    _br(L)
    _tbl(L, ["项目", "内容"], [
        ["项目名称", pt], ["版本号", ver], ["编写人", au],
        ["发布日期", dt], ["制定部门", dp], ["控制级别", "内部资料"],
    ])

    # ═══════ 文档修订记录 ═══════
    L.append(_h(2, "文档修订记录"))
    _br(L)
    _tbl(L, ["版本", "时间", "变更概要", "修改章节", "作者", "审核"], [
        [ver, dt, "初始创建", "全文", au, ""],
        ["", "", "", "", "", ""],
        ["", "", "", "", "", ""],
    ])

    # ═══════ 目录 ═══════
    L.append(_h(2, "目录"))
    _br(L)
    L.append("（Markdown 渲染后自动生成目录）")
    _br(L)
    L.append("---")
    _br(L)

    # ═══════ 1 总体说明 ═══════
    L.append(_h(2, "1 总体说明"))
    _br(L)

    # 1.1 排期信息
    L.append(_h(3, "1.1 排期信息"))
    _br(L)
    _quote(L, "填写排期及系统基本信息")
    _tbl(L, ["属性", "内容"], [
        ["**排期编号**", rc],
        ["**排期名称**", rn],
        ["**系统标识**", sc],
        ["**系统名称**", sn],
        ["**系统标志**", sf],
    ])

    # 1.2 功能列表
    L.append(_h(3, "1.2 功能列表"))
    _br(L)
    _quote(L, "根据项目范围，描述本次涉及新增/改造的功能范围，并明确每个功能的变更类型。"
               '功能列表中所列举功能点应与后文第2节"功能详细分析及设计"中各功能小节信息保持一一对应关系。')
    scope_rows = []
    for cap in capabilities:
        ct = cap.get("changeTypes", [])
        scope_rows.append(["", _render_change_types_checkboxes(ct),
                           cap_names.get(cap["name"], cap["name"])])
    if not scope_rows:
        scope_rows.append(["", _render_change_types_checkboxes([]), ""])
    _tbl(L, ["功能编号", "变更类型", "功能名称"], scope_rows)
    L.append("---")
    _br(L)

    # ═══════ 2 功能详细分析及设计 ═══════
    L.append(_h(2, "2 功能详细分析及设计"))
    _br(L)
    _quote(L, "根据项目需求，明确功能范围，依次按照2.1、2.2、2.3……章节分别各新增/改造功能的详细分析及设计。")

    for idx, cap in enumerate(capabilities, 1):
        dn = cap_names.get(cap["name"], cap["name"])
        reqs = cap.get("requirements", [])
        num = f"2.{idx}"
        ct = cap.get("changeTypes", [])
        has_design = data is not None and not no_design

        L.append(_h(3, f"{num} {dn}功能"))
        _br(L)

        # --- 2.X.1 功能概述 ---
        L.append(_h(4, f"{num}.1 功能概述（此小节不可裁剪)"))
        _br(L)
        first_desc = reqs[0]["desc"] if reqs and reqs[0].get("desc") else "*请简要描述该功能实现的内容*"
        _tbl(L, ["项目", "说明"], [
            ["**功能编号**", "*功能编号无具体规则要求，主要是做为区分不同功能的唯一标识*"],
            ["**功能名称**", f"*{dn}*"],
            ["**变更类型**", "请勾选此功能所涉及的一个或多个变更类型：<br>"
                          + _render_change_types_checkboxes(ct)],
            ["**功能触发入口**", "*描述此功能如何才能触发*"],
            ["**功能说明**", first_desc],
        ])

        # --- 2.X.2 逻辑流程图 ---
        L.append(_h(4, f"{num}.2 逻辑流程图"))
        _br(L)
        _quote(L, "根据项目需求，应从系统设计及实现角度描述新增/改造功能的逻辑流程图。"
                   '逻辑流程图应与"处理逻辑"章节互补，可以是UML中的时序图、活动图或协作图等。')
        L.append("*(注：此处可插入流程图图片或使用 Mermaid 语法绘制)*")
        _br(L)

        # --- 2.X.3 UI模型图 ---
        L.append(_h(4, f"{num}.3 UI模型图"))
        _br(L)
        _quote(L, "根据项目需求，如涉及UI界面新增或修改，请附上新增/改造功能的UI设计图"
                   "（如线框图、低保真原型等）。数据信息部可在此处添加报表表样。")
        _br(L)

        # --- 2.X.4 处理逻辑 ---
        L.append(_h(4, f"{num}.4 处理逻辑（此小节必选)"))
        _br(L)
        _quote(L, "需描述新增/改造功能具体的操作逻辑、算法逻辑、约束检查等相关设计。"
                   "处理逻辑部分支持再扩充其他细分维度做分析编写；也可以考虑做处理逻辑的整体性编写，"
                   "但同样必须满足内容完整，思路清晰，有迹可循。")
        L.append("* **操作逻辑：** 侧重从系统操作层面描述此功能逻辑性。")
        L.append("* **算法逻辑：** 属于解决问题的思路、方法或步骤（不依赖特定的编程语言），可以是通过自然语言对逻辑流程图的阐述。")
        L.append("* **约束检查：** 可以是字段长度约束、字段类型约束、状态类型约束等等，便于开发人员和测试人员进行边界值设计与验证。")
        _br(L)
        for req in reqs:
            L.append(f"**{req['name']}**")
            if req.get("desc"):
                _br(L); L.append(req["desc"]); _br(L)
            for scn in req.get("scenarios", []):
                L.append(f"- **场景：{scn['name']}**")
                for step in scn.get("steps", []):
                    L.append(f"  - {step['type']} {step['text']}")
                _br(L)

        # --- 2.X.5 账务处理 ---
        L.append(_h(4, f"{num}.5 账务处理"))
        _br(L)
        _quote(L, "根据项目需求，如涉及账务类交易，则需按照以下各小节开展分析及设计。"
                   "如果不涉及，本项及子项可移除。")

        L.append(_h(5, "1. 账务处理设计"))
        _br(L)
        _quote(L, "涉及账务类交易，请重点描述 **流水号、自增序列、接口健壮性、防重发、异常处理** "
                   "等方面设计，详情请参考《总体架构原则》及《账务类信息系统设计指引》。")
        for item in ["整体账务处理流程", "全局流水号机制设计", "自增序列设计",
                     "防重发机制", "异常处理机制", "接口健壮性设计"]:
            L.append(f"* **{item}：** *")
        _br(L)

        L.append(_h(5, "2. 会计核算"))
        _br(L)
        _quote(L, "描述涉及的会计核算科目及金额类型等信息。")
        _tbl(L, ["借贷方向", "科目号", "科目名称", "金额类型", "机构", "利润中心"], [
            ["", "", "", "本金", "账户行", ""],
            ["", "", "", "利息", "交易行", ""],
        ])

        L.append(_h(5, "3. 凭证打印"))
        _br(L)
        _quote(L, "粘贴具体的凭证设计图。")
        _br(L)

        # --- 2.X.6 接口设计 ---
        L.append(_h(4, f"{num}.6 接口设计（此小节必选)"))
        _br(L)
        _quote(L, "新增接口或存量接口变更均必须通过API治理平台开展接口设计工作，"
                   "并将设计完毕的接口信息列在该小节。如果本次改造不涉及接口变动，"
                   '请在"接口变更类型"列填写"不涉及"即可。')
        if has_design and cap.get("interfaceDesign"):
            iface = cap["interfaceDesign"]
            tbl = iface.get("table", {})
            h = tbl.get("headers", [])
            rows = tbl.get("rows", [])
            if h and rows:
                _tbl(L, h, rows)
            else:
                _tbl(L, ["功能", "接口名称", "接口地址", "接口变更类型", "API治理平台", "是否已完成相关设计"],
                     [["", "", "", _s(iface.get("changeType"), "新增 / 修改 / 不涉及"),
                       _s(iface.get("apiGovernance"), "是"), ""]])
        else:
            _tbl(L, ["功能", "接口名称", "接口地址", "接口变更类型", "API治理平台", "是否已完成相关设计"],
                 [["", "", "", "新增 / 修改 / 不涉及", "是", ""]])

        # --- 2.X.7 数据库设计 ---
        L.append(_h(4, f"{num}.7 数据库设计"))
        _br(L)
        _quote(L, "请基于《XXX系统-数据库详细设计书》模板开展数据库设计，并将涉及到相关对象列在该小节。")
        if has_design and cap.get("databaseDesign"):
            db = cap["databaseDesign"]
            for t in db.get("tables", []):
                h = t.get("headers", [])
                rows = t.get("rows", [])
                if h:
                    _tbl(L, h, rows)
            if not db.get("tables"):
                _br(L)
        else:
            _br(L)

        # --- 2.X.8 错误码设计 ---
        L.append(_h(4, f"{num}.8 错误码设计"))
        _br(L)
        _quote(L, "对具体功能点里面涉及到错误码、业务错误提示信息进行描述。"
                   "（未试点错误码规范的系统按原规范填写；试点新规范的系统按新规范填写）")
        if has_design and cap.get("errorCodes"):
            ec = cap["errorCodes"]
            tbl = ec.get("table", {})
            h = tbl.get("headers", [])
            rows = tbl.get("rows", [])
            if h and rows:
                _tbl(L, h, rows)
            else:
                _tbl(L, ["序号", "错误码编码", "业务错误提示信息", "备注"],
                     [["1", "XXX.XXX.XXXXXXX", "按照错误码规范要求填写具体的业务错误提示信息", ""],
                      ["2", "", "", ""]])
        else:
            _tbl(L, ["序号", "错误码编码", "业务错误提示信息", "备注"],
                 [["1", "XXX.XXX.XXXXXXX", "按照错误码规范要求填写具体的业务错误提示信息", ""],
                  ["2", "", "", ""]])

        # --- 2.X.9 影响范围分析 ---
        L.append(_h(4, f"{num}.9 影响范围分析（此小节必选)"))
        _br(L)
        _quote(L, "影响范围分析一是为系统设计与开发提供依据；二是为测试提供输入。"
                   "包括但不限于本次新增功能、改造功能、代码扫描发现问题、测试缺陷修改等情况。")
        _quote(L, "**重要提醒：** 影响范围分析应贯穿研发全生命周期，开发完成后发现新增影响应及时补充本节、"
                   "周知相关方并在必要时再次组织评审。")
        L.append('*注：若评估对本系统及其他系统均无影响，"影响系统分类"请填写"无"，其他内容可不再填写。*')
        _br(L)
        if has_design and cap.get("impactAnalysis"):
            ia = cap["impactAnalysis"]
            tbl = ia.get("table", {})
            h = tbl.get("headers", [])
            rows = tbl.get("rows", [])
            if h and rows:
                _tbl(L, h, rows)
            else:
                _tbl(L, ["序号", "影响系统分类", "影响系统名称", "影响功能/交易/接口",
                         "具体影响内容分析", "备注"], [
                    ["1", "本系统", "其他功能", "XX功能 / XX交易", "简述功能点1；简述功能点2；……", ""],
                    ["2", "其他系统 *(接口提供方需说明对其他系统影响)*", "XX系统",
                     "1. XX接口 (URL: ) <br>2. XX接口 (URL: )", "详细说明影响其他系统的接口逻辑变动", ""],
                ])
        else:
            _tbl(L, ["序号", "影响系统分类", "影响系统名称", "影响功能/交易/接口",
                     "具体影响内容分析", "备注"], [
                ["1", "本系统", "其他功能", "XX功能 / XX交易", "简述功能点1；简述功能点2；……", ""],
                ["2", "其他系统 *(接口提供方需说明对其他系统影响)*", "XX系统",
                 "1. XX接口 (URL: ) <br>2. XX接口 (URL: )", "详细说明影响其他系统的接口逻辑变动", ""],
            ])

    # ═══════ 3 非功能需求分析 ═══════
    L.append(_h(2, "3 非功能需求分析"))
    _br(L)
    _quote(L, "根据项目需求，如涉及相关非功能需求，可在如下小节进行描述。")

    nf = data.get("nonFunctional", {}) if (data is not None and not no_design) else {}

    # 3.1 客户群体调研
    L.append(_h(3, "3.1 客户群体调研"))
    _br(L)
    cg = nf.get("customerGroup", {})
    _tbl(L, ["矩阵项", "说明"], [
        ["**客群类型**", _s(cg.get("type"), "*如：全行客户、企业客户、全行员工、高净值用户等*")],
        ["**客群规模**", _s(cg.get("scale"), "*客群的数量规模，填写万、十万、百万、千万等*")],
    ])

    # 3.2 性能需求调研
    L.append(_h(3, "3.2 性能需求调研"))
    _br(L)
    perf = nf.get("performance", {})
    _tbl(L, ["指标维度", "需求指标值"], [
        ["**并发需求**", _s(perf.get("concurrency"), "最高500并发，平均100并发")],
        ["**吞吐需求**", _s(perf.get("throughput"), "高峰1000TPS，平均200TPS")],
        ["**响应时间需求**", _s(perf.get("latency"), "TP95=200ms，TP99=5000ms")],
    ])

    # 3.3 用户访问集中度量化分布调研
    L.append(_h(3, "3.3 用户访问集中度量化分布调研"))
    _br(L)
    visit = nf.get("visitDistribution")
    if visit:
        L.append(visit)
    else:
        L.append("*(根据实际调研情况在此补充)*")
    _br(L)

    # 3.4 软硬件及兼容性需求
    L.append(_h(3, "3.4 软硬件及兼容性需求"))
    _br(L)
    hw = nf.get("hardwareCompatibility", {})
    _tbl(L, ["需求类别", "兼容及支持性要求"], [
        ["**芯片及操作系统**", _s(hw.get("chipAndOS"),
            "支持Intel X86_64架构、华为鲲鹏ARM架构/海光x86/兆芯等芯片。<br>支持中标麒麟/银河麒麟等国产操作系统；支持RHEL、CentOS、Ubuntu等操作系统。")],
        ["**语言运行时**", _s(hw.get("languageRuntime"), "1. 支持Java6及以上版本。<br>2. 选用OpenJDK1.8。")],
        ["**数据库软件**", _s(hw.get("database"), "1. 支持Oracle、DB2、MySQL、Oceanbase、达梦等数据库。<br>2. 选用Oracle19C，RAC部署。")],
        ["**中间件**", _s(hw.get("middleware"), "支持Weblogic、Tomcat、金蝶、东方通、宝蓝德等国产中间件。")],
        ["**浏览器兼容性**", _s(hw.get("browser"), "2026年主流环境要求：兼容 Chrome、Edge、Firefox、IE 等主流浏览器。")],
        ["**其他需求**", _s(hw.get("other"), "")],
    ])

    # 3.5 安全需求
    L.append(_h(3, "3.5 安全需求"))
    _br(L)
    _quote(L, "请基于原效平台及安全技术服务平台（SDL）完成安全自评及安全需求识别工作。"
               "本项目涉及安全需求且已完成需求识别工作的用户故事如下：")
    L.append("*(SDL平台地址： http://10.64.2.60/sdl/index.html)*")
    _br(L)
    sec = nf.get("security", {})
    sec_stories = sec.get("userStories", [])
    if sec_stories:
        sec_rows = [[s.get("id", str(i+1)), s.get("name", "")] for i, s in enumerate(sec_stories)]
        _tbl(L, ["用户故事编号", "用户故事名称"], sec_rows)
    else:
        _tbl(L, ["用户故事编号", "用户故事名称"], [["", ""], ["", ""]])

    # 3.6 XXX非功能需求
    L.append(_h(3, "3.6 XXX非功能需求"))
    _br(L)
    extra = nf.get("additional")
    if extra:
        L.append(extra)
    else:
        L.append("*(根据实际项目需要在此扩充)*")
    _br(L)

    return "\n".join(L)


# ============================================================
# 覆盖前安全检查
# ============================================================

def _check_overwrite_safety(out_path: Path) -> dict:
    """
    检查输出路径的覆盖安全状态，供 /sdd-doc 工作流在渲染前做安全门。

    返回字段（全部必填，缺值用空串/False/0）：
      exists       (bool)  文件是否已存在
      tracked      (bool)  是否被 git 跟踪（git ls-files 返回非空）
      modified     (bool)  是否有未提交的本地改动
      size_bytes   (int)   文件大小（不存在则为 0）
      last_modified (str)  ISO 8601 时间戳（不存在则空字符串）

    边界情况（必须以"未跟踪"处理，不能抛异常）：
      - out_path 不在 git 仓库中（git 命令非零退出）
      - git 命令缺失 / 超时
      - 文件不存在

    用途：SKILL.md 步骤 3.5 用此函数的结果驱动 AskUserQuestion；
         sdd_doc.py generate() 用 tracked 字段决定是否拒绝覆盖。
    """
    exists = out_path.exists()
    if exists:
        st = out_path.stat()
        size_bytes = st.st_size
        last_modified = datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")
    else:
        size_bytes = 0
        last_modified = ""

    def _git_truthy(args: list[str]) -> bool:
        try:
            r = subprocess.run(
                ["git", *args, "--", str(out_path)],
                capture_output=True, text=True, check=False, timeout=5,
            )
            return r.returncode == 0 and bool(r.stdout.strip())
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            return False

    tracked = _git_truthy(["ls-files"])
    return {
        "exists": exists,
        "tracked": tracked,
        "modified": _git_truthy(["status", "--porcelain"]) and tracked,
        "size_bytes": size_bytes,
        "last_modified": last_modified,
    }


# ============================================================
# 主流程
# ============================================================

def generate(
    slug: str | None,
    cap_names_arg: str | None,
    data_json_path: str | None = None,
    no_design: bool = False,
    force: bool = False,
) -> Path:
    root = Path.cwd()
    change_dir = resolve_change_dir(slug or "", root)
    meta = read_meta(change_dir)
    cap_names = load_capability_names(root, cap_names_arg)

    # ═══════ 覆盖前安全检查（最便宜的检查先做，避免渲染后才发现被拒）═══════
    out_slug = slug or change_dir.name
    out_path = change_dir / f"{out_slug}-需求规格说明书.md"
    safety = _check_overwrite_safety(out_path)
    if safety["exists"] and safety["tracked"]:
        if not force:
            raise SddDocError(
                f"输出文件已被 git 跟踪，拒绝覆盖：\n"
                f"  路径：{out_path}\n"
                f"  大小：{safety['size_bytes']} 字节\n"
                f"  最后修改：{safety['last_modified'] or '(未知)'}\n"
                f"  本地有未提交修改：{'是' if safety['modified'] else '否'}\n"
                f"如确认要覆盖，请使用 --force，或先在 /sdd-doc 工作流中通过 AskUserQuestion 确认。"
            )
        print(f"⚠ --force 模式：覆盖已跟踪文件 {out_path}", file=sys.stderr)
    elif safety["exists"] and not safety["tracked"]:
        print(f"⚠ 输出文件未跟踪（{safety['size_bytes']} 字节），将直接覆盖", file=sys.stderr)

    # 加载结构化数据
    data = None
    if data_json_path and not no_design:
        p = Path(data_json_path)
        if not p.is_file():
            raise SddDocError(f"JSON 数据文件不存在：{data_json_path}")
        raw = p.read_text(encoding="utf-8")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise SddDocError(f"JSON 解析失败：{e}")
        warnings = validate_sddoc_data(data)
        if warnings:
            for w in warnings:
                print(f"⚠ {w}", file=sys.stderr)
        requirements_from_data = sum(
            len(cap.get("requirements", []))
            for cap in data.get("capabilities", [])
        )
        print(f"[1/2] JSON 数据加载完成")
        print(f"      项目：{_get(data, 'metadata', 'projectTitle', default='(未指定)')} | "
              f"capability：{len(data.get('capabilities', []))} | "
              f"requirements：{requirements_from_data}")

    else:
        # 向后兼容：无 --data-json 时，从 specs 目录读取 capability 列表
        print(f"[1/2] 未提供 --data-json，从 specs 目录读取 capability 列表")
        specs_dir = change_dir / "specs"
        capabilities = []
        if specs_dir.is_dir():
            for cd in sorted(specs_dir.iterdir()):
                if cd.is_dir():
                    capabilities.append({"name": cd.name, "requirements": []})
        if capabilities:
            data = {"metadata": {}, "capabilities": capabilities}
        else:
            raise SddDocError(f"在 {change_dir} 下未找到 specs 目录，且未提供 --data-json。")

    capabilities = data.get("capabilities", [])
    if no_design:
        print("      --no-design：设计相关章节以占位符输出")

    print(f"[2/2] 抽取元数据 + 生成 MD 文档")
    md_meta = extract_metadata(change_dir, meta, data)
    print(f"      项目：{md_meta['project_title']} | 版本：{md_meta['version']} | "
          f"capability：{len(capabilities)}")

    md = build(md_meta, capabilities, cap_names, data, no_design=no_design)
    out_path.write_text(md, encoding="utf-8")
    print(f"      完成：{out_path}")
    return out_path


# ============================================================
# CLI 入口
# ============================================================

def check_overwrite_cli(path: str) -> int:
    """--check-overwrite 模式：仅返回 JSON 状态，不渲染文档。供 SKILL.md 步骤 3.5 调用。"""
    safety = _check_overwrite_safety(Path(path))
    print(json.dumps(safety, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    import argparse
    p = argparse.ArgumentParser(description="从 openspec 产物 + Claude 结构化 JSON 生成企业 MD 需求规格说明书")
    p.add_argument("slug", nargs="?", default=None,
                   help="change slug；缺省时取唯一未归档 change")
    p.add_argument("--data-json", default=None,
                   help="Claude 生成的结构化 JSON 文件路径（C 方案核心输入）")
    p.add_argument("--no-design", action="store_true",
                   help="跳过所有设计相关章节，输出纯占位符")
    p.add_argument("--capability-names", default=None,
                   help='capability 显示名映射，格式 "auth=认证,user=用户管理"（逗号分隔）')
    p.add_argument("--force", action="store_true",
                   help="强制覆盖已 git 跟踪的输出文件（默认拒绝，触发 SddDocError）")
    p.add_argument("--check-overwrite", metavar="PATH", default=None,
                   help="仅检查指定路径的覆盖安全状态（输出 JSON），不渲染文档。供 /sdd-doc 工作流步骤 3.5 调用。")
    args = p.parse_args()

    if args.check_overwrite:
        return check_overwrite_cli(args.check_overwrite)

    try:
        out = generate(args.slug, args.capability_names, args.data_json, args.no_design, args.force)
    except SddDocError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    print(f"\n✓ 已生成：{out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
