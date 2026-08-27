#!/usr/bin/env node
// oms-git-hooks — 目标工程 git hook 管理命令。
//
// 用法:
//   oms-git-hooks install [path]     安装 4 个 git hook 到 .git/hooks/
//   oms-git-hooks uninstall [path]   卸载 oms 管理的 hook（恢复用户备份）
//   oms-git-hooks status [path]      查询安装状态
//
// path 默认为当前工作目录。hook 校验逻辑固化在包装脚本中，
// 运行时通过绝对路径调用全局安装的 oh-my-sdd。

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installAll,
  uninstallAll,
  statusAll,
} from '../hooks/git/lib/hook-installer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

function announce(msg) {
  process.stderr.write(msg + '\n');
}

function usage() {
  announce('用法: oms-git-hooks <command> [path]');
  announce('');
  announce('命令:');
  announce('  install [path]     安装 git hook（pre-commit/pre-push/commit-msg/prepare-commit-msg）');
  announce('  uninstall [path]   卸载 oms 管理的 hook（恢复用户备份）');
  announce('  status [path]      查询安装状态');
  announce('');
  announce('path 默认为当前工作目录，须为 git 仓库');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === '-h' || command === '--help') {
    usage();
    process.exit(command ? 0 : 1);
  }

  const targetPath = rest[0] || process.cwd();

  if (command === 'install') {
    announce('→ 安装 oh-my-sdd git hooks');
    const result = installAll(PACKAGE_ROOT, targetPath, announce);
    if (!result.ok) {
      process.exit(1);
    }
    announce('');
    announce('✓ git hooks 安装完成');
    announce('');
    announce('已启用:');
    announce('  pre-commit         staged 文件安全扫描（密钥/破坏性命令）');
    announce('  pre-push           禁止 force push 到 main/master');
    announce('  commit-msg         commit 消息格式校验 [<change-id>] <type>: <subject>');
    announce('  prepare-commit-msg commit 模板提示');
    announce('');
    announce('紧急绕过: commit body 写 [OVERRIDE] <规则名>: <理由>');
  } else if (command === 'uninstall') {
    announce('→ 卸载 oh-my-sdd git hooks');
    const result = uninstallAll(targetPath, announce);
    if (!result.ok) {
      process.exit(1);
    }
    announce('');
    announce('✓ git hooks 卸载完成');
  } else if (command === 'status') {
    announce(statusAll(targetPath));
  } else {
    announce(`❌ 未知命令: ${command}`);
    announce('');
    usage();
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`❌ oms-git-hooks 失败: ${err.stack ?? err.message}\n`);
  process.exit(1);
});