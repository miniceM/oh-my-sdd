#!/usr/bin/env node
// pre-commit hook — git commit 执行前扫描 staged 文件。
//
// 复用 hooks/lib/rules.js 的 matchRules 规则引擎，与 Claude Code
// PreToolUse hook 共享同一套 HARD/SOFT 规则，确保 AI 写入和开发者
// 提交的约束一致。
//
// 调用：.git/hooks/pre-commit (shell) → node pre-commit-check.js
//   pre-commit 无参数，从 .git/COMMIT_EDITMSG 读取 [OVERRIDE] 标记
//
// 行为：
//   - HARD 违规且无 override → exit 1（阻断提交）
//   - SOFT 违规 → stderr 警告，不阻断
//   - 规则引擎异常 → fail-safe exit 1
//   - 空 staged / binary / 非 git → exit 0
//
// Override 入口（pre-commit 触发时 commit 消息尚未生成，无法从消息读取）：
//   环境变量 OMS_OVERRIDE_RULES=rule1,rule2 可绕过指定规则
//   同时仍尝试读 .git/COMMIT_EDITMSG（可能含上次的 override 标记）

import { matchRules } from '../lib/rules.js';
import { parseOverrides, filterOverridden } from './lib/override-check.js';
import {
  getStagedFiles,
  getStagedContent,
  getGitDir,
} from './lib/hook-utils.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function printViolations(violations, severity) {
  for (const v of violations) {
    process.stderr.write(`  ${severity}: ${v.rule_id} — ${v.message}\n`);
  }
}

// 构建 override 集合：环境变量 + .git/COMMIT_EDITMSG（尽力而为）
function collectOverrides(cwd) {
  const overrides = new Map();

  // 1. 环境变量 OMS_OVERRIDE_RULES=rule1,rule2（值即为理由占位）
  const envRules = process.env.OMS_OVERRIDE_RULES;
  if (envRules) {
    for (const ruleId of envRules.split(',').map((r) => r.trim()).filter(Boolean)) {
      overrides.set(ruleId, 'via OMS_OVERRIDE_RULES env');
    }
  }

  // 2. .git/COMMIT_EDITMSG（可能是上次 commit 的残留 override 标记）
  const gitDir = getGitDir(cwd);
  if (gitDir) {
    const editMsgPath = path.isAbsolute(gitDir) ? path.join(gitDir, 'COMMIT_EDITMSG') : path.join(cwd, gitDir, 'COMMIT_EDITMSG');
    try {
      const content = readFileSync(editMsgPath, 'utf8');
      for (const [ruleId, reason] of parseOverrides(content)) {
        overrides.set(ruleId, reason);
      }
    } catch {
      // 文件不存在，忽略
    }
  }

  return overrides;
}

function main() {
  const cwd = process.cwd();

  const stagedFiles = getStagedFiles(cwd);
  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  const overrides = collectOverrides(cwd);

  const allHard = [];
  const allSoft = [];

  for (const file of stagedFiles) {
    const content = getStagedContent(file, cwd);
    if (content === null) continue; // binary 或读取失败，跳过

    let result;
    try {
      result = matchRules(content, file);
    } catch (err) {
      // fail-safe：规则引擎异常时阻断，避免绕过 HARD gate
      process.stderr.write(`❌ pre-commit 规则引擎异常（fail-safe deny）: ${err.message}\n`);
      process.stderr.write('紧急绕过: OMS_OVERRIDE_RULES=<rule_id> git commit ...\n');
      process.exit(1);
    }

    allHard.push(...result.hard);
    allSoft.push(...result.soft);
  }

  // 过滤被 override 的 HARD 违规
  const remainingHard = filterOverridden(allHard, overrides);
  const overriddenHard = allHard.filter((h) => overrides.has(h.rule_id));

  if (overriddenHard.length > 0) {
    process.stderr.write('⚠️  以下 HARD 规则被 [OVERRIDE] 绕过:\n');
    for (const h of overriddenHard) {
      process.stderr.write(`  - ${h.rule_id}: ${overrides.get(h.rule_id)}\n`);
    }
  }

  if (remainingHard.length > 0) {
    process.stderr.write(`❌ pre-commit: ${remainingHard.length} 个 HARD 规则违规，提交被阻断\n`);
    printViolations(remainingHard, 'HARD');
    process.stderr.write('\n紧急绕过（pre-commit 阶段 commit 消息尚未生成，仅环境变量生效）:\n');
    process.stderr.write('  OMS_OVERRIDE_RULES=hardcoded-aws-ak[,rule2] git commit ...\n');
    process.exit(1);
  }

  if (allSoft.length > 0) {
    process.stderr.write(`⚠️  pre-commit: ${allSoft.length} 个 SOFT 规则警告（不阻断提交）\n`);
    printViolations(allSoft, 'SOFT');
  }

  process.exit(0);
}

main();