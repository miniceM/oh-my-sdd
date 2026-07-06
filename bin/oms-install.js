#!/usr/bin/env node
// Manual installer entry point (mirrors postinstall behavior for re-runs)
//
// CLI flags:
//   --tool <claude|opencode|qoder>   Specify target AI tool (default: auto-detect)
//
// 行为：
//   - 不传 --tool：自动检测（which claude > which opencode > which lingma > 默认 claude）
//   - 传 --tool <name>：指定工具，明确选择
//   - 传未知 name：报错并退出 1
import { main } from '../install.js';

function parseArgs(argv) {
  const toolIdx = argv.indexOf('--tool');
  if (toolIdx === -1) return { tool: null };
  const tool = argv[toolIdx + 1];
  if (!tool || tool.startsWith('-')) {
    process.stderr.write('❌ --tool 需要指定工具名\n');
    process.stderr.write('  支持: claude, opencode, qoder\n');
    process.exit(1);
  }
  return { tool };
}

const { tool } = parseArgs(process.argv.slice(2));

main({ tool }).catch((err) => {
  process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
  process.exit(1);
});
