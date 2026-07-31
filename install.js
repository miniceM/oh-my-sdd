#!/usr/bin/env node
// Package API and npm postinstall entry point. Importing this module must stay
// side-effect free because package.json exposes it as the public `main` file.
import {
  main,
  preflightFor,
  detectDefaultTool,
  isClaudeInstalled,
  isLingmaInstalled,
  isOpenCodeInstalled,
  isDirectExecution,
} from './install/main.js';

if (isDirectExecution(import.meta.url, process.argv[1])) {
  const args = process.argv.slice(2);
  const toolIdx = args.indexOf('--tool');
  const tool = toolIdx >= 0 ? args[toolIdx + 1] : undefined;
  main({ tool }).catch((err) => {
    process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export {
  main,
  preflightFor,
  detectDefaultTool,
  isClaudeInstalled,
  isLingmaInstalled,
  isOpenCodeInstalled,
};
