import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.resolve(__dirname, '..', '..', 'hooks', 'pre-tool-use.js');

function runHook(stdinPayload, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK_PATH], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(JSON.stringify(stdinPayload));
  });
}

// ---------- HARD rule denies ----------

test('pre-tool-use denies Write with hardcoded AWS Access Key', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/leak.js',
      content: 'const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";\n',
    },
  });

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput?.permissionDecisionReason, /hardcoded-aws-ak/);
});

test('pre-tool-use denies Edit with hardcoded OpenAI SK', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Edit',
    tool_input: {
      file_path: '/tmp/client.js',
      old_string: '// placeholder',
      new_string: 'const SK = "sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";\n',
    },
  });

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput?.permissionDecisionReason, /hardcoded-sk/);
});

test('pre-tool-use denies MultiEdit with rm -rf / in any edit', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: '/tmp/clean.sh',
      edits: [
        { old_string: '# comment', new_string: '#!/bin/bash' },
        { old_string: 'echo hi', new_string: 'rm -rf /\n' },
      ],
    },
  });

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput?.permissionDecisionReason, /destructive-rm-rf-root/);
});

test('pre-tool-use denies direct .env file edit (filePattern only)', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/.env',
      content: 'SECRET=value\n',
    },
  });

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput?.permissionDecisionReason, /env-file-edit/);
});

test('pre-tool-use allows .env.example (filePattern negative)', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/.env.example',
      content: 'SECRET=\n',
    },
  });

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput?.permissionDecision, undefined);
  assert.deepEqual(out, {});
});

test('pre-tool-use lists multiple HARD rules in deny reason', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/multi.ts',
      content: 'const AK = "AKIAIOSFODNN7EXAMPLE";\nconst SK = "sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";\n',
    },
  });

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput?.permissionDecisionReason, /hardcoded-aws-ak/);
  assert.match(out.hookSpecificOutput?.permissionDecisionReason, /hardcoded-sk/);
});

// ---------- SOFT rule warns ----------

test('pre-tool-use warns on README.md missing Quick Start (Write)', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/README.md',
      content: '# My Project\n\nThis README lacks any setup or getting-started section.\n',
    },
  });

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.permissionDecision, undefined);
  assert.match(out.additionalContext, /readme-missing-quickstart/);
});

test('pre-tool-use does not warn on README.md with Quick Start', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/README.md',
      content: '# My Project\n\n## Quick Start\n\nnpm install\n',
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), '{}');
});

// ---------- Clean paths ----------

test('pre-tool-use clean path: plain .md returns {}', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/notes.md',
      content: '# Notes\n\nThis is a normal doc with no violations.\n',
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), '{}');
});

test('pre-tool-use ignores non-edit tools', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Read',
    tool_input: { file_path: '/tmp/x.ts' },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), '{}');
});

// ---------- Statelessness (no session meta dependency) ----------

test('pre-tool-use works WITHOUT session meta (stateless rules check)', async () => {
  // This is the key fix from spike 2026-06-29: pre-tool-use does NOT depend
  // on session meta existing. Rules are a pure function of (content, filePath).
  const result = await runHook({
    session_id: 'no-meta-session',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/leak.js',
      content: 'const AK = "AKIAIOSFODNN7EXAMPLE";\n',
    },
  });

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  // Should still deny even though no session meta exists
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput?.permissionDecisionReason, /hardcoded-aws-ak/);
});

// ---------- JSON contract ----------

test('pre-tool-use deny JSON keys match Claude Code documented schema', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/leak.js',
      content: 'const AK = "AKIAIOSFODNN7EXAMPLE";\n',
    },
  });

  const out = JSON.parse(result.stdout);
  const topKeys = Object.keys(out).sort();
  assert.deepEqual(
    topKeys,
    ['hookSpecificOutput', 'systemMessage'],
    `deny top-level schema must be {hookSpecificOutput, systemMessage}, got: ${topKeys.join(',')}`
  );
  const hookKeys = Object.keys(out.hookSpecificOutput).sort();
  assert.deepEqual(
    hookKeys,
    ['hookEventName', 'permissionDecision', 'permissionDecisionReason'],
    `hookSpecificOutput keys must be {hookEventName, permissionDecision, permissionDecisionReason}, got: ${hookKeys.join(',')}`
  );
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('pre-tool-use warn JSON keys match expected schema', async () => {
  const result = await runHook({
    session_id: 'test',
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/README.md',
      content: '# My Project\n\nNo setup instructions here.\n',
    },
  });

  const out = JSON.parse(result.stdout);
  const keys = Object.keys(out).sort();
  assert.deepEqual(
    keys,
    ['additionalContext'],
    `warn payload schema must be exactly {additionalContext}, got: ${keys.join(',')}`
  );
});
