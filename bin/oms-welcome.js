#!/usr/bin/env node
// bin/oms-welcome.js — oh-my-sdd 欢迎页渲染器
//
// 可被任何 CLI 调用显示欢迎页（当前由 oh-my-sdd-login 成功后调用）。
// 风格：openspec 极简直白——ASCII art Logo + 等宽字体 + 命令清单。
//
// Usage:
//   node bin/oms-welcome.js           # 输出欢迎页
//   import { printWelcome } from './bin/oms-welcome.js'  # 编程式调用

const LOGO = [
  ' ____  _  _  ___  ____   ____  ',
  '(_   )( \\/ )/ __)(  _ \\ (  _ \\ ',
  ' / /_  \\  / \\__ \\ )(_) ) )(_) )',
  '(____) (__) (___/(____/ (____/  ',
];

// ANSI 颜色码（终端原生，零依赖）
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

function welcome({ version = 'v0.2.1-alpha', username = null } = {}) {
  const out = [];
  out.push('');

  // Logo
  for (const line of LOGO) {
    out.push(`${CYAN}${BOLD}${line}${RESET}`);
  }
  out.push('');

  // 标题
  const subtitle = username
    ? `${GREEN}✓${RESET} 欢迎，${BOLD}${username}${RESET}（${version}）`
    : `${BOLD}oh-my-sdd${RESET} ${DIM}${version}${RESET}`;
  out.push(`  ${subtitle}`);
  out.push(`  ${BOLD}zy 企业级 SDD 工作流${RESET}`);
  out.push('');

  // 已就绪特性
  out.push(`  ${DIM}✓ 已就绪${RESET}`);
  out.push(`    • iam 身份校验 + DOP 埋点集成`);
  out.push(`    • baseline 注入 ~/.claude/CLAUDE.md`);
  out.push(`    • openspec delta + archive 保鲜`);
  out.push(`    • 委托 superpowers: TDD + subagent + code review`);
  out.push('');

  // Quick start 命令清单
  out.push(`  ${DIM}Quick start${RESET}`);
  out.push(`    ${BOLD}/sdd-spec${RESET} <change>     Ring 1 创建规格`);
  out.push(`    ${BOLD}/sdd-plan${RESET} <change>     Ring 2 技术计划`);
  out.push(`    ${BOLD}/sdd-task${RESET} <change>     Ring 3 (可选) 任务细化`);
  out.push(`    ${BOLD}/sdd-apply${RESET} <change>    Ring 4 执行实现`);
  out.push(`    ${BOLD}/sdd-review${RESET} <change>   Ring 5 验证 + PR + 归档`);
  out.push('');

  // 每项目初始化提示
  out.push(`  ${DIM}首次在新项目使用${RESET} ${GREEN}(必须在项目目录下执行)${RESET}`);
  out.push(`    ${BOLD}cd your-project${RESET}`);
  out.push(`    ${BOLD}openspec init --tools claude${RESET}`);
  out.push('');

  // CTA
  out.push(`  ${GREEN}→${RESET} 重启 Claude Code，运行 ${BOLD}/sdd-spec <change-name>${RESET} 开始`);
  out.push('');

  return out.join('\n');
}

function printWelcome(opts) {
  process.stdout.write(welcome(opts) + '\n');
}

// CLI 模式
if (import.meta.url === `file://${process.argv[1]}`) {
  printWelcome();
}

export { welcome, printWelcome, LOGO };
