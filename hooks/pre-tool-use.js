#!/usr/bin/env node
// PreToolUse hard/soft gate — runs BEFORE the tool executes, so
// `permissionDecision: "deny"` actually blocks the Edit/Write from landing.
//
// Why PreToolUse, not PostToolUse: PostToolUse fires *after* the file is on
// disk, so its `permissionDecision` field is silently ignored by Claude Code
// (the write already happened). Spike 2026-06-29 confirmed this. PreToolUse
// fires before the tool call, so deny truly prevents the write.
//
// Content extraction per tool:
//   - Write:    tool_input.content            (full new file body)
//   - Edit:     tool_input.new_string         (replacement fragment)
//   - MultiEdit: tool_input.edits[].new_string (concatenated)
//
// SOFT rules that scan whole-file structure (readme-missing-quickstart,
// public-api-missing-docstring) are best-effort under Edit/MultiEdit — they
// only see the new fragment, not the surrounding file. HARD pattern rules
// (AK/SK, rm -rf /, git push --force) work uniformly across all three tools.
//
// Statelessness: this hook does NOT read or write session meta. Rules are a
// pure function of (content, filePath) — the spike showed that coupling
// rules to session meta caused hard-gate short-circuit when auth failed.

import { matchRules } from './lib/rules.js';
import { error } from './lib/log.js';
import { normalizeToolName, normalizeToolInput, isTrackedTool } from './lib/tool-normalizer.js';
const STDIN_TIMEOUT_MS = 5_000; // 增大超时,避免大型 payload 竞争

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    let resolved = false;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => {
      resolved = true;
      resolve(data);
    });
    // Fallback timeout only if stdin never closes (防止挂起)
    const timer = setTimeout(() => {
      if (!resolved) resolve(data);
    }, STDIN_TIMEOUT_MS);
    timer.unref?.();
  });
}

function extractContentAndPath(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const filePath = toolInput.filePath;
  if (!filePath || typeof filePath !== 'string') return null;

  if (toolName === 'Write') {
    return { content: typeof toolInput.content === 'string' ? toolInput.content : '', filePath };
  }
  if (toolName === 'Edit') {
    return { content: typeof toolInput.newString === 'string' ? toolInput.newString : '', filePath };
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
    const content = edits
      .map((e) => (e && typeof e.newString === 'string' ? e.newString : ''))
      .join('\n');
    return { content, filePath };
  }
  return null;
}

async function main() {
  const rawStdin = await readStdin();
  let stdin = {};
  try {
    stdin = rawStdin && rawStdin.trim() ? JSON.parse(rawStdin) : {};
  } catch {
    /* tolerate malformed stdin */
  }

  const toolName = normalizeToolName(stdin.tool_name);
  if (!isTrackedTool(toolName)) {
    process.stdout.write('{}');
    return;
  }

  const toolInput = normalizeToolInput(stdin.tool_input);
  const extracted = extractContentAndPath(toolName, toolInput);
  if (!extracted) {
    process.stdout.write('{}');
    return;
  }

  const { content, filePath } = extracted;

  let ruleResult;
  try {
    ruleResult = matchRules(content, filePath);
  } catch (err) {
    // Fail-safe: 规则引擎异常时阻断写入,避免绕过 HARD gate
    // 记录到 stderr 供 DOP 或日志收集
    error(`pre-tool-use 规则匹配异常, fail-safe deny: ${err.message}`);
    const reason = `HARD gate 内部错误(规则引擎异常),fail-safe deny。\n错误: ${err.message}\n紧急绕过需在 PR 描述写 [OVERRIDE] <规则名>: <理由>。`;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
      systemMessage: reason,
    }));
    return;
  }

  const { hard, soft } = ruleResult;
  if (hard.length > 0) {
    const ids = hard.map((r) => r.rule_id).join(', ');
    const sample = hard
      .slice(0, 3)
      .map((r) => `- ${r.rule_id}: ${r.message}`)
      .join('\n');
    const reason =
      `HARD_RULE violated: ${ids}\n紧急绕过需在 PR 描述写 [OVERRIDE] <规则名>: <理由>。\n${sample}`;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
      systemMessage: reason,
    }));
    return;
  }

  if (soft.length > 0) {
    const ids = soft.map((r) => r.rule_id).join(', ');
    const msgs = soft.map((r) => r.message).join('; ');
    const warn = `⚠️ SOFT_RULE warning (${ids}): ${msgs}`;
    process.stdout.write(JSON.stringify({
      additionalContext: warn,
    }));
    return;
  }

  process.stdout.write('{}');
}

main().catch((err) => {
  // Fail-safe: 未捕获异常时阻断写入,避免绕过 HARD gate
  error(`pre-tool-use 致命错误, fail-safe deny: ${err.stack ?? err.message}`);
  const reason = `HARD gate 内部错误(致命异常),fail-safe deny。\n错误: ${err.message}\n紧急绕过需在 PR 描述写 [OVERRIDE] <规则名>: <理由>。`;
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
      systemMessage: reason,
    }));
  } catch { /* last-ditch */ }
  process.exit(0);
});
