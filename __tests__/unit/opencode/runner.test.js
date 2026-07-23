import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runHook, HookError } from '../../../opencode/dist/runner.js';

// 保存原始 env（测试结束时恢复，避免污染同进程其他测试）
const ORIGINAL_HOOKS_DIR = process.env.OMS_HOOKS_DIR;
const ORIGINAL_LOG_FILE = process.env.OMS_LOG_FILE;

// Create stub hooks in temp dir
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-runner-'));
const HOOKS_DIR = path.join(tmpDir, 'hooks');
fs.mkdirSync(HOOKS_DIR);

// 把测试日志重定向到测试专属文件，避免污染生产日志（~/.oh-my-sdd/logs/opencode.log）
// 这是 Issue #8 调查时发现的：测试时 "does-not-exist.js" 等负面用例的 stderr
// 被写入生产日志，用户误以为是运行时崩溃。
process.env.OMS_LOG_FILE = path.join(tmpDir, 'test.log');

fs.writeFileSync(path.join(HOOKS_DIR, 'ok.js'), `
  let data = ''; process.stdin.on('data', c => data += c);
  process.stdin.on('end', () => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }));
  });
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'deny.js'), `
  let data = ''; process.stdin.on('data', c => data += c);
  process.stdin.on('end', () => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'AK hardcoded' } }));
  });
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'crash.js'), `
  process.stdin.resume(); process.exit(1);
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'bad-json.js'), `
  process.stdin.resume(); process.stdout.write('not json{');
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'silent.js'), `
  process.stdin.resume();
  process.stdin.on('end', () => {
    // Hook ran successfully but has no opinion → emit empty result (no permissionDecision)
    process.stdout.write('{}');
  });
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'slow.js'), `
  setTimeout(() => { process.stdout.write('done'); }, 10000);
`);

process.env.OMS_HOOKS_DIR = HOOKS_DIR;

test('runner: success path with permissionDecision=allow → returns HookResult', async () => {
  const result = await runHook('ok.js', { tool_name: 'Write' });
  assert.equal(result?.hookSpecificOutput?.permissionDecision, 'allow');
});

test('runner: permissionDecision=deny → throws HookError', async () => {
  await assert.rejects(
    () => runHook('deny.js', { tool_name: 'Write' }),
    (err) => err instanceof HookError && /AK hardcoded/.test(err.message)
  );
});

test('runner: hook crash (exit 1) → throws HookError', async () => {
  await assert.rejects(
    () => runHook('crash.js', {}),
    (err) => err instanceof HookError && /exit code/.test(err.message)
  );
});

test('runner: stdout non-JSON → throws HookError', async () => {
  await assert.rejects(
    () => runHook('bad-json.js', {}),
    (err) => err instanceof HookError && /JSON/.test(err.message)
  );
});

test('runner: stdout missing permissionDecision → returns parsed result (no-op)', async () => {
  const result = await runHook('silent.js', {});
  assert.deepEqual(result, {});
});

test('runner: timeout → throws HookError', async () => {
  await assert.rejects(
    () => runHook('slow.js', {}, { timeoutMs: 500 }),
    (err) => err instanceof HookError && /timeout/i.test(err.message)
  );
}, { timeout: 3000 });

test('runner: hook file not found → throws HookError', async () => {
  await assert.rejects(
    () => runHook('does-not-exist.js', {}),
    (err) => err instanceof HookError
  );
});

// 测试结束清理：恢复 env + 删 temp 目录
process.on('exit', () => {
  if (ORIGINAL_HOOKS_DIR === undefined) delete process.env.OMS_HOOKS_DIR;
  else process.env.OMS_HOOKS_DIR = ORIGINAL_HOOKS_DIR;
  if (ORIGINAL_LOG_FILE === undefined) delete process.env.OMS_LOG_FILE;
  else process.env.OMS_LOG_FILE = ORIGINAL_LOG_FILE;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});
