#!/usr/bin/env node
// Manual uninstaller entry point
//
// CLI flags:
//   --tool <claude|lingma>   Uninstall only the specified tool (default: all)
//   --purge                  Also remove ~/.oh-my-sdd/ state directory
//   -h, --help               Show this help and exit
//   -V, --version            Print version and exit

import { main } from '../uninstall.js';
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
  process.stdout.write(`oms-uninstall — oh-my-sdd 卸载器 (v${getVersion()})

用法:
  oms-uninstall                            卸载所有已安装工具
  oms-uninstall --tool <name>              仅卸载指定工具
  oms-uninstall --purge                    同时删除 ~/.oh-my-sdd/ 状态目录
  oms-uninstall --help | -h                显示帮助
  oms-uninstall --version | -V             显示版本

工具:
  claude       Claude Code
  lingma       通义灵码 lingma

选项:
  --tool <name>    仅卸载指定工具。默认卸载所有工具（Claude + lingma）
  --purge          同时删除 ~/.oh-my-sdd/ 状态目录
  -h, --help       显示此帮助并退出
  -V, --version    显示版本并退出

示例:
  oms-uninstall --tool claude         仅卸载 Claude 路径
  oms-uninstall --tool lingma         仅卸载 lingma 路径
  oms-uninstall --purge               卸载所有工具 + 删 state 目录
  oms-uninstall                       卸载所有工具（state 目录保留供重装复用）

更多信息:
  README: https://github.com/cli-tools/oh-my-sdd#卸载
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

  const toolIdx = argv.indexOf('--tool');
  let tool = null;
  if (toolIdx !== -1) {
    tool = argv[toolIdx + 1];
    if (!tool || tool.startsWith('-')) {
      process.stderr.write('❌ --tool 需要指定工具名\n');
      process.stderr.write('  支持: claude, lingma\n');
      process.stderr.write('  查看帮助: oms-uninstall --help\n');
      process.exit(1);
    }
  }

  const purge = argv.includes('--purge');
  return { tool, purge };
}

const { tool, purge } = parseArgs(process.argv.slice(2));

main({ tool, purge }).catch((err) => {
  process.stderr.write(`❌ 卸载失败：${err.stack ?? err.message}\n`);
  process.exit(1);
});
