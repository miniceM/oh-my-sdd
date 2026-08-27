#!/usr/bin/env node
// commit-msg hook — 校验 commit 消息格式。
//
// 企业 HARD_RULE：commit 必须符合 [<change-id>] <type>: <subject>
//   - change-id: ^[A-Z]{2,6}\d+$（仅格式校验，不做 openspec 交叉验证）
//   - type: Conventional Commits (feat/fix/docs/refactor/test/chore)
//           + SDD 环 (spec/plan/task/review)
//
// 调用：.git/hooks/commit-msg (shell) $1=msgFile → node commit-msg-check.js $1
//   git 传入 commit 消息文件路径作为 $1
//
// 行为：
//   - 格式正确 → exit 0
//   - 格式错误且无 override → exit 1
//   - 含 [OVERRIDE] commit-msg-format → 降级为警告
//   - merge commit（默认消息）→ 放行，避免阻断 git merge 流程

import { parseOverrides, filterOverridden } from './lib/override-check.js';
import { readCommitMsgFile } from './lib/hook-utils.js';

const COMMIT_RE = /^\[([A-Z]{2,6}\d+)\]\s+(feat|fix|docs|refactor|test|chore|spec|plan|task|review):\s+(.+)$/m;
const MERGE_RE = /^Merge (branch|remote-tracking branch|tag)/m;
const REVERT_RE = /^Revert "/m;
const CHANGE_ID_RE = /^[A-Z]{2,6}\d+$/;
const RULE_FORMAT = 'commit-msg-format';
const RULE_CHANGE_ID = 'commit-msg-change-id';

function stripComments(msg) {
  // git commit 消息文件中 # 开头的行是注释，提交时自动剥离
  return msg
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
}

function main() {
  const msgFile = process.argv[2];
  if (!msgFile) {
    // 无参数（非正常调用），放行
    process.exit(0);
  }

  const rawMsg = readCommitMsgFile(msgFile);
  const body = stripComments(rawMsg);

  if (!body) {
    process.stderr.write('❌ commit-msg: 消息为空\n');
    process.stderr.write('   必选格式: [<change-id>] <type>: <subject>\n');
    process.exit(1);
  }

  // merge / revert commit 放行（git 自动生成，开发者无法控制格式）
  if (MERGE_RE.test(body) || REVERT_RE.test(body)) {
    process.exit(0);
  }

  const overrides = parseOverrides(rawMsg);
  const violations = [];

  const match = body.match(COMMIT_RE);
  if (!match) {
    violations.push({
      rule_id: RULE_FORMAT,
      message: '格式不符合 [<change-id>] <type>: <subject>',
    });
  } else {
    const changeId = match[1];
    if (!CHANGE_ID_RE.test(changeId)) {
      violations.push({
        rule_id: RULE_CHANGE_ID,
        message: `change-id "${changeId}" 格式无效，应为 ^[A-Z]{2,6}\\d+$`,
      });
    }
  }

  // override 过滤：只放过被显式 override 的违规，其余继续阻断
  const overridden = violations.filter((v) => overrides.has(v.rule_id));
  if (overridden.length > 0) {
    process.stderr.write('⚠️  commit-msg 格式校验被 [OVERRIDE] 绕过:\n');
    for (const v of overridden) {
      process.stderr.write(`  - ${v.rule_id}: ${overrides.get(v.rule_id)}\n`);
    }
  }
  const remainingViolations = filterOverridden(violations, overrides);

  if (remainingViolations.length > 0) {
    process.stderr.write('❌ commit-msg: 消息格式不符合企业规范\n');
    for (const v of remainingViolations) {
      process.stderr.write(`  - ${v.rule_id}: ${v.message}\n`);
    }
    process.stderr.write('\n必选格式: [<change-id>] <type>: <subject>\n');
    process.stderr.write('  <type> = feat|fix|docs|refactor|test|chore|spec|plan|task|review\n');
    process.stderr.write('  <change-id> = ^[A-Z]{2,6}\\d+$\n');
    process.stderr.write('  示例: [PROJ123] feat: 新增健康检查接口\n');
    process.stderr.write('\n紧急绕过需在 commit body 写 [OVERRIDE] commit-msg-format: <理由>\n');
    process.exit(1);
  }

  process.exit(0);
}

main();