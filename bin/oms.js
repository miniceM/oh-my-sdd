#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdapter, listTools } from "../install/host-registry.js";
import { status, doctor } from "../install/control-plane/health.js";
import { buildRepairPlan, applyRepair } from "../install/control-plane/repair.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const SUPPORTED_TOOLS = ["claude", "lingma", "opencode", "kilocode"];

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(PACKAGE_ROOT, "package.json"), "utf8"));
    return pkg.version;
  } catch {
    return "unknown";
  }
}

function printHelp(stdout = process.stdout) {
  stdout.write(`oms — oh-my-sdd 企业交付与控制面 CLI (v${getVersion()})

用法:
  oms status [--tool <id>] [--json]      查看已安装工具的保护状态与能力
  oms doctor [--tool <id>] [--json]      诊断依赖、配置漂移与真实生效状态
  oms repair [--tool <id>] [--apply]     修复 OMS 拥有的资源（默认 dry-run）
  oms --help | -h                        显示帮助
  oms --version | -V                     显示版本

子命令:
  status     检查宿主探测、五层保护状态（written/registered/loaded/enforced/advisory）
  doctor     诊断潜在问题、缺失依赖和配置漂移
  repair     生成或执行 OMS 资源修复计划（仅限 OMS 拥有且未被用户修改的资源）

选项:
  --tool <id>    指定宿主 (claude | lingma | opencode | kilocode)，默认全量检测
  --apply        执行 repair 修复（默认仅预览修复计划）
  --dry-run      仅输出诊断/修复计划，不写入任何修改
  --json         以 JSON 输出结果
  -h, --help     显示此帮助
  -V, --version  显示版本
`);
}

function getSelectedAdapters(toolName) {
  if (toolName) {
    if (!SUPPORTED_TOOLS.includes(toolName)) {
      throw new Error(`不支持的工具: ${toolName}`);
    }
    return [getAdapter(toolName)];
  }
  return listTools().map((id) => getAdapter(id));
}

function renderHealthText(report) {
  const lines = [report.type === "doctor-report" ? "Doctor Report" : "Status Report"];
  for (const host of report.hosts || []) {
    lines.push("", `${host.display_name || host.id} (${host.id})`);
    lines.push(`  Detected: ${host.detected ? "Yes" : "No"}`);
    lines.push(`  Protection Level: ${host.protection?.level || "unknown"}`);
    if (host.protection?.reason) {
      lines.push(`  Reason: ${host.protection.reason}`);
    }
  }

  if (Array.isArray(report.findings) && report.findings.length > 0) {
    lines.push("", "Findings:");
    for (const finding of report.findings) {
      const icon = finding.level === "error" ? "❌" : "⚠️";
      lines.push(`  ${icon} [${finding.host}] ${finding.message}`);
      if (finding.next_action) {
        lines.push(`      Action: ${finding.next_action}`);
      }
    }
  } else if (report.type === "doctor-report") {
    lines.push("", "✓ No issues detected.");
  }

  return lines.join("\n") + "\n";
}

function renderRepairText(result) {
  const isPlan = result.type === "repair-plan";
  const lines = [isPlan ? "Repair Plan (dry-run)" : `Repair Result (status: ${result.status || "succeeded"})`];
  const steps = result.steps || [];

  if (steps.length === 0) {
    lines.push("  No OMS resources require repair.");
  } else {
    for (const step of steps) {
      const icon = isPlan ? "→" : (step.status === "succeeded" ? "✓" : (step.status === "warning" ? "⚠️" : "❌"));
      lines.push(`  ${icon} [${step.host}] ${step.message || step.action || "step"}`);
      if (step.next_action) {
        lines.push(`      Action: ${step.next_action}`);
      }
    }
  }

  if (isPlan && steps.length > 0) {
    lines.push("", "Run oms repair --apply to execute these repairs.");
  }

  return lines.join("\n") + "\n";
}

export async function runOmsCli(argv = process.argv.slice(2), {
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  if (argv.includes("-h") || argv.includes("--help") || argv.length === 0) {
    printHelp(stdout);
    return 0;
  }
  if (argv.includes("-V") || argv.includes("--version")) {
    stdout.write(getVersion() + "\n");
    return 0;
  }

  const subcommand = argv[0];
  const toolIdx = argv.indexOf("--tool");
  const tool = toolIdx >= 0 ? argv[toolIdx + 1] : null;
  const isJson = argv.includes("--json");
  const isApply = argv.includes("--apply");

  let adapters;
  try {
    adapters = getSelectedAdapters(tool);
  } catch (err) {
    stderr.write("❌ " + err.message + "\n");
    return 1;
  }

  const ctx = { PACKAGE_ROOT, announce: (msg) => stderr.write(msg + "\n") };

  try {
    if (subcommand === "status") {
      const report = await status({ adapters, ctx });
      if (isJson) stdout.write(JSON.stringify(report) + "\n");
      else stdout.write(renderHealthText(report));
      return 0;
    }

    if (subcommand === "doctor") {
      const report = await doctor({ adapters, ctx });
      if (isJson) stdout.write(JSON.stringify(report) + "\n");
      else stdout.write(renderHealthText(report));
      return report.findings?.some((f) => f.level === "error") ? 1 : 0;
    }

    if (subcommand === "repair") {
      const doctorReport = await doctor({ adapters, ctx });
      const repairPlan = buildRepairPlan(doctorReport);

      if (!isApply) {
        if (isJson) stdout.write(JSON.stringify(repairPlan) + "\n");
        else stdout.write(renderRepairText(repairPlan));
        return 0;
      }

      const repairResult = await applyRepair(repairPlan, {
        applyStep: async (step) => {
          const Adapter = getAdapter(step.host);
          if (typeof Adapter.applyResource === "function") {
            return Adapter.applyResource(step, ctx);
          }
          return { status: "succeeded" };
        },
      });

      if (isJson) stdout.write(JSON.stringify(repairResult) + "\n");
      else stdout.write(renderRepairText(repairResult));
      return repairResult.status === "succeeded" ? 0 : 1;
    }

    stderr.write("❌ 未知命令: " + subcommand + "\n");
    stderr.write("  查看帮助: oms --help\n");
    return 1;
  } catch (error) {
    stderr.write("❌ 执行失败: " + (error.stack || error.message) + "\n");
    return 1;
  }
}

function isDirectExecution(moduleUrl, entryArg) {
  if (!entryArg) return false;
  const modulePath = path.resolve(fileURLToPath(moduleUrl));
  const entryPath = path.resolve(entryArg);
  return process.platform === "win32"
    ? modulePath.toLowerCase() === entryPath.toLowerCase()
    : modulePath === entryPath;
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  runOmsCli().then((code) => { process.exitCode = code; });
}
