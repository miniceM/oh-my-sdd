#!/usr/bin/env node
// prepare-commit-msg hook — 注入 commit 模板提示。
//
// 在 commit 消息编辑器打开前，向消息文件写入 # 注释模板。
// git 提交时自动剥离 # 开头的行，所以模板不影响最终消息内容，
// 只在编辑器里作为格式提示。
//
// 调用：.git/hooks/prepare-commit-msg (shell) $1=msgFile $2=source
//   source 可为: message / template / merge / squash / commit
//   仅 source 为空或 template 时注入（避免干扰 -m、merge、amend 等场景）
//
// 行为：
//   - source 为空/template → 注入模板（幂等，检测 marker 跳过）
//   - 其他 source → 直接放行

import { readFileSync, writeFileSync } from 'node:fs';

const MARKER = '# oh-my-sdd: commit template';

function buildTemplate(existing) {
  return `# oh-my-sdd: commit template
#
# 必选格式: [<change-id>] <type>: <subject>
#
# <type> = feat|fix|docs|refactor|test|chore|spec|plan|task|review
# <change-id> = ^[A-Z]{2,6}\\\\d+$
#
# 示例:
#   [PROJ123] feat: 新增健康检查接口
#   [PROJ456] fix: 修复超时重试 bug
#
# 紧急绕过（在 commit body 中写）:
#   [OVERRIDE] <规则名>: <理由>
#
${existing}`;
}

function main() {
  const msgFile = process.argv[2];
  const source = process.argv[3] || '';

  if (!msgFile) {
    process.exit(0);
  }

  // 仅默认编辑器场景或 template 场景注入
  // source=message: git commit -m "..."，已有消息，不注入
  // source=merge/squash/commit: 自动生成消息，不注入
  if (source !== '' && source !== 'template') {
    process.exit(0);
  }

  let existing = '';
  try {
    existing = readFileSync(msgFile, 'utf8');
  } catch {
    existing = '';
  }

  // 幂等：已注入则跳过
  if (existing.includes(MARKER)) {
    process.exit(0);
  }

  try {
    writeFileSync(msgFile, buildTemplate(existing));
  } catch (err) {
    process.stderr.write(`oh-my-sdd: 模板注入写入失败（提交将正常继续）: ${err.message}\n`);
  }

  process.exit(0);
}

main();