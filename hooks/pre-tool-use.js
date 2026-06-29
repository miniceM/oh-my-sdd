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
import { error, warn } from './lib/log.js';

const TRACKED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const STDIN_TIMEOUT_MS = 1_000;

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    const timer = setTimeout(() => resolve(data), STDIN_TIMEOUT_MS);
    timer.unref?.();
  });
}

function extractContentAndPath(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const filePath = toolInput.file_path;
  if (!filePath || typeof filePath !== 'string') return null;

  if (toolName === 'Write') {
    return { content: typeof toolInput.content === 'string' ? toolInput.content : '', filePath };
  }
  if (toolName === 'Edit') {
    return { content: typeof toolInput.new_string === 'string' ? toolInput.new_string : '', filePath };
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
    const content = edits
      .map((e) => (e && typeof e.new_string === 'string' ? e.new_string : ''))
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

  if (!TRACKED_TOOLS.has(stdin.tool_name)) {
    process.stdout.write('{}');
    return;
  }

  const extracted = extractContentAndPath(stdin.tool_name, stdin.tool_input);
  if (!extracted) {
    process.stdout.write('{}');
    return;
  }

  const { content, filePath } = extracted;

  let ruleResult;
  try {
    ruleResult = matchRules(content, filePath);
  } catch (err) {
    warn(`pre-tool-use 规则匹配异常: ${err.message}`);
    process.stdout.write('{}');
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
  error(`pre-tool-use 致命错误: ${err.stack ?? err.message}`);
  try { process.stdout.write('{}'); } catch { /* last-ditch */ }
  process.exit(0);
});
