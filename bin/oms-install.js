#!/usr/bin/env node
// Manual installer entry point (mirrors postinstall behavior for re-runs)
//
// CLI flags:
//   --tool <claude|opencode|lingma>   Specify target AI tool (default: auto-detect)
//   -h, --help                       Show this help and exit
//   -V, --version                    Print version and exit
//
// 行为：
//   - 不传 --tool：自动检测（which claude > which opencode > which lingma > 默认 claude）
//   - 传 --tool <name>：指定工具，明确选择
//   - 传未知 name：报错并退出 1

import { main } from '../install.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function printHelp() {
  process.stdout.write(`oms-install — oh-my-sdd 多工具安装器 (v${getVersion()})

用法:
  oms-install                              自动检测工具并安装
  oms-install --tool <name>                指定工具安装
  oms-install --tool opencode --disable    禁用 OpenCode plugin（保留文件）
  oms-install --tool opencode --enable     重新启用 OpenCode plugin
  oms-install --help | -h                  显示帮助
  oms-install --version | -V               显示版本

工具:
  claude       Claude Code（默认；需 iam CLI）
  opencode     OpenCode
  lingma        通义灵码 lingma CN

选项:
  --tool <name>    指定目标 AI 工具。不传时按 which claude > which opencode > which lingma 顺序自动检测
  --disable        禁用 OpenCode plugin（仅移除 opencode.json 入口，保留磁盘文件）
  --enable         重新启用 OpenCode plugin（恢复 opencode.json 入口）
  -h, --help       显示此帮助并退出
  -V, --version    显示版本并退出

示例:
  oms-install --tool opencode              装 OpenCode 路径
  oms-install --tool opencode --disable    禁用 OpenCode（下次重启不加载 plugin）
  oms-install --tool opencode --enable     重新启用 OpenCode
  oms-install --tool lingma                装通义灵码 lingma CN 路径
  oms-install                             装 Claude Code 路径（自动检测）

更多信息:
  README: https://github.com/cli-tools/oh-my-sdd#快速开始
`);
}

function parseArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  if (argv.includes('-V') || argv.includes('--version')) {
    process.stdout.write(`${getVersion()}\n`);
    process.exit(0);
  }

  const disable = argv.includes('--disable');
  const enable = argv.includes('--enable');
  if (disable && enable) {
    process.stderr.write('❌ --disable 和 --enable 不能同时使用\n');
    process.exit(1);
  }

  const toolIdx = argv.indexOf('--tool');
  if (toolIdx === -1) return { tool: null, disable, enable };
  const tool = argv[toolIdx + 1];
  if (!tool || tool.startsWith('-')) {
    process.stderr.write('❌ --tool 需要指定工具名\n');
    process.stderr.write('  支持: claude, opencode, lingma\n');
    process.stderr.write('  查看帮助: oms-install --help\n');
    process.exit(1);
  }
  return { tool, disable, enable };
}

const { tool, disable, enable } = parseArgs(process.argv.slice(2));

main({ tool, disable, enable }).catch((err) => {
  process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
  process.exit(1);
});
