#!/usr/bin/env node
// pre-push hook — git push 执行前拦截破坏性推送。
//
// 复用 destructive-git-force-main 规则的语义：禁止 force push 到
// main/master。与 PreToolUse hook 的规则一致，但作用在不同环节——
// PreToolUse 拦截 AI 写 force push 命令到文件，pre-push 拦截开发者
// 实际执行 force push。
//
// 调用：.git/hooks/pre-push (shell) → node pre-push-check.js
//   git 通过 stdin 传入 ref 行：<localRef> <localSha> <remoteRef> <remoteSha>
//   force push 时 localRef 前缀有 + 号
//
// 行为：
//   - force push 到 main/master 且无 override → exit 1
//   - 正常 push / push 到其他分支 → exit 0
//   - override 从 HEAD commit 消息读取

import { parseOverrides, isOverrideActive } from './lib/override-check.js';
import { parsePushStdin, isForcePush, isProtectedBranch, getHeadCommitMessage } from './lib/hook-utils.js';
import { readFileSync } from 'node:fs';

const FORCE_MAIN_RULE_ID = 'destructive-git-force-main';

function readStdinSync() {
  // pre-push 的 stdin 是 git 同步写入的，fd 0 可直接读取
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const stdin = readStdinSync();
  const refs = parsePushStdin(stdin);

  if (refs.length === 0) {
    process.exit(0);
  }

  const headMsg = getHeadCommitMessage(process.cwd()) || '';
  const overrides = parseOverrides(headMsg);

  for (const ref of refs) {
    if (isForcePush(ref.localRef) && isProtectedBranch(ref.remoteRef)) {
      if (isOverrideActive(overrides, [FORCE_MAIN_RULE_ID])) {
        process.stderr.write(`⚠️  force push 到 ${ref.remoteRef} 被 [OVERRIDE] 绕过: ${overrides.get(FORCE_MAIN_RULE_ID)}\n`);
        continue;
      }
      process.stderr.write(`❌ pre-push: 禁止 force push 到受保护分支 ${ref.remoteRef}\n`);
      process.stderr.write(`   规则: ${FORCE_MAIN_RULE_ID}\n`);
      process.stderr.write('   紧急绕过需在 commit body 写 [OVERRIDE] destructive-git-force-main: <理由>\n');
      process.exit(1);
    }
  }

  process.exit(0);
}

main();