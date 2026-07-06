import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runHook } from '../helpers/spawn-hook.js';

/**
 * Spike contract tests for PreToolUse hard gate.
 *
 * These tests verify the stdin→stdout JSON contract of pre-tool-use.js.
 * They prove "we say the right thing" — but do NOT prove "Claude Code hears us".
 * The runtime verification (whether Claude Code actually blocks the write) must
 * be done in a real Claude Code session after reloading plugins.
 *
 * Spike 2026-06-29 found PostToolUse's `permissionDecision: "deny"` was silently
 * ignored. PreToolUse is the correct hook event for blocking writes.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.resolve(__dirname, '..', '..', 'hooks', 'pre-tool-use.js');

const FIXTURES = {
  awsAk: { file_path: 'leak.js', content: 'const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";\n' },
  openAiSk: { file_path: 'client.js', content: 'const OPENAI = "sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";\n' },
  rmRfRoot: { file_path: 'clean.sh', content: '#!/bin/bash\nrm -rf /\n' },
  gitForceMain: { file_path: 'push.sh', content: 'git push --force origin main\n' },
  envFile: { file_path: '.env', content: 'AWS_KEY=foo\n' },
  envExample: { file_path: '.env.example', content: 'AWS_KEY=replace-me\n' },
  readmeClean: { file_path: 'README.md', content: '# Foo\n\n## Quick Start\n\nnpm i\n' },
  readmeMissing: { file_path: 'README.md', content: '# Foo\n\nSome text.\n' },
  benign: { file_path: 'foo.txt', content: 'hello world\n' },
};

async function runWithFixture(fixture, toolName = 'Write') {
  const toolInput =
    toolName === 'Write'
      ? { file_path: fixture.file_path, content: fixture.content }
      : toolName === 'Edit'
      ? { file_path: fixture.file_path, new_string: fixture.content }
      : { file_path: fixture.file_path, edits: [{ new_string: fixture.content }] };

  return runHook(HOOK_PATH, {
    session_id: 'spike',
    tool_name: toolName,
    tool_input: toolInput,
  });
}

// ---------- HARD rule contract ----------

test('spike/contract: HARD rule deny — stdout is valid JSON with required fields', async () => {
  const result = await runWithFixture(FIXTURES.awsAk);
  assert.equal(result.exitCode, 0, `hook should not crash; stderr: ${result.stderr}`);
  assert.equal(result.stderr.length, 0, `stderr should be clean: ${result.stderr}`);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.hookSpecificOutput?.permissionDecision, 'deny', 'expected hookSpecificOutput.permissionDecision="deny"');
  assert.equal(typeof payload.hookSpecificOutput?.permissionDecisionReason, 'string');
  assert.ok(payload.hookSpecificOutput.permissionDecisionReason.length > 0);
});

test('spike/contract: deny reason includes [OVERRIDE] escape-hatch hint', async () => {
  const result = await runWithFixture(FIXTURES.awsAk);
  const payload = JSON.parse(result.stdout);
  assert.match(
    payload.hookSpecificOutput.permissionDecisionReason,
    /\[OVERRIDE\]/,
    'deny reason must mention [OVERRIDE] so the agent knows how to bypass'
  );
});

test('spike/contract: deny reason lists which HARD rule(s) fired', async () => {
  const result = await runWithFixture(FIXTURES.awsAk);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.hookSpecificOutput.permissionDecisionReason, /hardcoded-aws-ak/);
});

test('spike/contract: every HARD fixture produces deny (Write tool)', async () => {
  const hardFixtures = ['awsAk', 'openAiSk', 'rmRfRoot', 'gitForceMain', 'envFile'];
  for (const name of hardFixtures) {
    const result = await runWithFixture(FIXTURES[name], 'Write');
    const payload = JSON.parse(result.stdout);
    assert.equal(
      payload.hookSpecificOutput?.permissionDecision,
      'deny',
      `${name}: expected deny, got ${JSON.stringify(payload)}`
    );
  }
});

test('spike/contract: HARD fixtures also work under Edit tool (new_string)', async () => {
  const hardFixtures = ['awsAk', 'envFile'];
  for (const name of hardFixtures) {
    const result = await runWithFixture(FIXTURES[name], 'Edit');
    const payload = JSON.parse(result.stdout);
    assert.equal(
      payload.hookSpecificOutput?.permissionDecision,
      'deny',
      `${name} under Edit: expected deny, got ${JSON.stringify(payload)}`
    );
  }
});

test('spike/contract: HARD fixtures also work under MultiEdit tool (edits[])', async () => {
  const hardFixtures = ['awsAk', 'envFile'];
  for (const name of hardFixtures) {
    const result = await runWithFixture(FIXTURES[name], 'MultiEdit');
    const payload = JSON.parse(result.stdout);
    assert.equal(
      payload.hookSpecificOutput?.permissionDecision,
      'deny',
      `${name} under MultiEdit: expected deny, got ${JSON.stringify(payload)}`
    );
  }
});

test('spike/contract: .env.example is NOT denied (only real .env)', async () => {
  const result = await runWithFixture(FIXTURES.envExample);
  const payload = JSON.parse(result.stdout);
  assert.notEqual(payload.hookSpecificOutput?.permissionDecision, 'deny', '.env.example must not be denied');
});

// ---------- SOFT rule contract ----------

test('spike/contract: SOFT rule Warn — stdout has additionalContext field', async () => {
  const result = await runWithFixture(FIXTURES.readmeMissing);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.hookSpecificOutput?.permissionDecision, undefined, 'SOFT must NOT deny');
  assert.equal(typeof payload.additionalContext, 'string');
  assert.match(payload.additionalContext, /SOFT_RULE/);
});

test('spike/contract: README with Quick Start produces empty {} (no warn)', async () => {
  const result = await runWithFixture(FIXTURES.readmeClean);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload, {});
});

test('spike/contract: benign file produces empty {}', async () => {
  const result = await runWithFixture(FIXTURES.benign);
  assert.equal(result.stdout.trim(), '{}');
});

// ---------- JSON purity & schema ----------

test('spike/contract: hook never writes anything but JSON to stdout', async () => {
  for (const name of Object.keys(FIXTURES)) {
    const result = await runWithFixture(FIXTURES[name]);
    assert.ok(
      result.stdout.startsWith('{') && result.stdout.endsWith('}'),
      `${name}: stdout must be pure JSON object, got: ${JSON.stringify(result.stdout)}`
    );
  }
});

test('spike/contract: non-edit tool (e.g. Read) returns {}', async () => {
  const result = await runHook(HOOK_PATH, {
    session_id: 'spike',
    tool_name: 'Read',
    tool_input: { file_path: '/tmp/foo.txt' },
  });
  assert.equal(result.stdout.trim(), '{}');
});

test('spike/contract: deny JSON keys match Claude Code documented schema', async () => {
  const result = await runWithFixture(FIXTURES.awsAk);
  const payload = JSON.parse(result.stdout);
  const topKeys = Object.keys(payload).sort();
  assert.deepEqual(
    topKeys,
    ['hookSpecificOutput', 'systemMessage'],
    `deny top-level schema must be {hookSpecificOutput, systemMessage}, got: ${topKeys.join(',')}`
  );
  const hookKeys = Object.keys(payload.hookSpecificOutput).sort();
  assert.deepEqual(
    hookKeys,
    ['hookEventName', 'permissionDecision', 'permissionDecisionReason'],
    `hookSpecificOutput keys must be {hookEventName, permissionDecision, permissionDecisionReason}, got: ${hookKeys.join(',')}`
  );
  assert.equal(payload.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(payload.hookSpecificOutput.permissionDecision, 'deny');
});

test('spike/contract: warn JSON keys match expected schema', async () => {
  const result = await runWithFixture(FIXTURES.readmeMissing);
  const payload = JSON.parse(result.stdout);
  const keys = Object.keys(payload).sort();
  assert.deepEqual(
    keys,
    ['additionalContext'],
    `warn payload schema must be exactly {additionalContext}, got: ${keys.join(',')}`
  );
});

// ---------- Statelessness (key fix from 2026-06-29 spike) ----------

test('spike/statelessness: deny works WITHOUT session meta (pure function)', async () => {
  // This is the critical contract: pre-tool-use does NOT depend on session meta.
  // Rules are a pure function of (content, filePath) — no filesystem reads.
  const result = await runWithFixture(FIXTURES.awsAk);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.hookSpecificOutput?.permissionDecision, 'deny');
  // No session meta was created, yet deny still fires.
});
