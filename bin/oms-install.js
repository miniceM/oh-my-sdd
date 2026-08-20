#!/usr/bin/env node
// Manual installer entry point (mirrors postinstall behavior for re-runs)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { main } from '../install/main.js';
import { renderJson, renderText, renderResultJson, renderResultText } from '../install/control-plane/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPPORTED_TOOLS = ['claude', 'lingma', 'opencode', 'kilocode'];

function getVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')
    );
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function printHelp(stdout = process.stdout) {
  stdout.write(`oms-install — oh-my-sdd 多工具安装器 (v${getVersion()})

用法:
  oms-install                              自动检测工具并安装
  oms-install --tool <name>                指定工具安装
  oms-install --dry-run                    仅展示安装计划，不写入文件
  oms-install --json                       以 JSON 输出安装计划
  oms-install --yes | -y                   跳过确认直接执行安装计划
  oms-install --help | -h                  显示帮助
  oms-install --version | -V               显示版本

工具:
  claude       Claude Code（默认；需 iam CLI）
  lingma       通义灵码 lingma CN
  opencode     OpenCode AI 编程工具
  kilocode     KiloCode AI 编程工具

选项:
  --tool <name>    指定目标 AI 工具。不传时自动检测；检测到多个工具时必须显式选择
  --dry-run        仅构造并展示安装计划，不执行写入
  --json           将安装计划作为 JSON 写入 stdout
  -y, --yes        跳过确认直接执行安装计划
  -h, --help       显示此帮助并退出
  -V, --version    显示版本并退出

示例:
  oms-install --tool lingma                 装通义灵码 lingma CN 路径
  oms-install --tool opencode --dry-run     预览 OpenCode 路径变更
  oms-install --tool kilocode --dry-run --json

更多信息:
  README: https://github.com/cli-tools/oh-my-sdd#快速开始
`);
}

class CliUsageError extends Error {}

function parseArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) return { action: 'help' };
  if (argv.includes('-V') || argv.includes('--version')) return { action: 'version' };

  const toolIdx = argv.indexOf('--tool');
  const tool = toolIdx === -1 ? null : argv[toolIdx + 1];
  if (toolIdx !== -1 && (!tool || tool.startsWith('-'))) {
    throw new CliUsageError('--tool 需要指定工具名');
  }
  if (tool && !SUPPORTED_TOOLS.includes(tool)) {
    throw new CliUsageError(`不支持的工具：${tool}`);
  }
  return {
    action: 'install',
    tool,
    dryRun: argv.includes('--dry-run'),
    json: argv.includes('--json'),
    yes: argv.includes('-y') || argv.includes('--yes'),
  };
}

async function confirmInstall({ input = process.stdin, output = process.stderr } = {}) {
  const readline = createInterface({ input, output });
  try {
    const answer = await readline.question('确认执行此安装计划？[y/N] ');
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}

function writeSelectionRequired(plan, { stderr = process.stderr } = {}) {
  const choices = Array.isArray(plan.selection_options) ? plan.selection_options.join(', ') : '未知';
  stderr.write(`❌ 检测到多个已安装宿主（${choices}）。请使用 --tool <name> 明确选择后重试。\n`);
}

/**
 * Render the installation plan before applying it, with collaborators exposed
 * for tests. Returns a process-compatible exit code instead of exiting.
 */
async function runOmsInstall(argv, {
  mainFn = main,
  renderJsonFn = renderJson,
  renderTextFn = renderText,
  renderResultJsonFn = renderResultJson,
  renderResultTextFn = renderResultText,
  confirmFn = confirmInstall,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error;
    stderr.write(`❌ ${error.message}\n`);
    stderr.write(`  支持: ${SUPPORTED_TOOLS.join(', ')}\n`);
    stderr.write('  查看帮助: oms-install --help\n');
    return 1;
  }

  if (args.action === 'help') {
    printHelp(stdout);
    return 0;
  }
  if (args.action === 'version') {
    stdout.write(`${getVersion()}\n`);
    return 0;
  }

  const plan = await mainFn({ tool: args.tool, dryRun: true });
  if (args.dryRun) {
    if (args.json) stdout.write(renderJsonFn(plan));
    else stderr.write(renderTextFn(plan));
    return 0;
  }

  if (plan?.selection_required) {
    if (args.json) stdout.write(renderJsonFn(plan));
    else writeSelectionRequired(plan, { stderr });
    return 2;
  }

  if (!args.json) {
    stderr.write(renderTextFn(plan));
  }

  let confirmed = args.yes;
  if (!confirmed) {
    confirmed = await confirmFn({ input: process.stdin, output: stderr });
  }
  if (!confirmed) {
    stderr.write('安装已取消，未写入任何文件。\n');
    return 1;
  }

  const result = await mainFn({ tool: args.tool, plan });
  if (args.json) {
    stdout.write((renderResultJsonFn || renderJsonFn)(result));
  } else if (result?.type === "installation-result") {
    stderr.write((renderResultTextFn || renderTextFn)(result));
  }

  if (result?.status === "partial-failure" || result?.status === "failed") {
    return 1;
  }
  return 0;
}

function isDirectExecution(moduleUrl, entryArg) {
  return Boolean(entryArg) && path.resolve(fileURLToPath(moduleUrl)) === path.resolve(entryArg);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  runOmsInstall(process.argv.slice(2)).then(
    (exitCode) => { process.exitCode = exitCode; },
    (error) => {
      process.stderr.write(`❌ 安装失败：${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    },
  );
}

export {
  confirmInstall,
  getVersion,
  isDirectExecution,
  parseArgs,
  printHelp,
  runOmsInstall,
};
