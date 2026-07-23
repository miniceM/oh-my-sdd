import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 保存原始 env（测试结束时恢复，避免污染同进程其他测试）
const ORIGINAL_HOOKS_DIR = process.env.OMS_HOOKS_DIR;
const ORIGINAL_LOG_FILE = process.env.OMS_LOG_FILE;

// Set up a tmp hooks dir with a pre-tool-use.js stub that denies AK patterns
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-fullflow-'));
const HOOKS_DIR = path.join(tmpDir, 'hooks');
fs.mkdirSync(HOOKS_DIR);

// 把测试日志重定向到测试专属文件，避免污染生产日志
process.env.OMS_LOG_FILE = path.join(tmpDir, 'test.log');

// pre-tool-use.js: deny if tool_input.content contains AKIA
fs.writeFileSync(path.join(HOOKS_DIR, 'pre-tool-use.js'), `
  let data = ''; process.stdin.on('data', c => data += c);
  process.stdin.on('end', () => {
    const payload = JSON.parse(data);
    const content = payload.tool_input?.content || payload.tool_input?.newString || '';
    if (/AKIA[A-Z0-9]{16}/.test(content)) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'HARD_RULE: AK hardcoded' } }));
    } else {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'allow' } }));
    }
  });
`);

// post-tool-use.js: silent allow
fs.writeFileSync(path.join(HOOKS_DIR, 'post-tool-use.js'), `
  process.stdin.resume();
  process.stdin.on('end', () => { process.stdout.write('{}'); });
`);

// session-start.js: silent allow
fs.writeFileSync(path.join(HOOKS_DIR, 'session-start.js'), `
  process.stdin.resume();
  process.stdin.on('end', () => { process.stdout.write('{}'); });
`);

// user-prompt-submit.js: silent allow
fs.writeFileSync(path.join(HOOKS_DIR, 'user-prompt-submit.js'), `
  process.stdin.resume();
  process.stdin.on('end', () => { process.stdout.write('{}'); });
`);

process.env.OMS_HOOKS_DIR = HOOKS_DIR;

// Import plugin handlers
const {
  handleToolExecuteBefore,
  handleToolExecuteAfter,
  handleCommandExecuteBefore,
  handleEvent,
  handleSystemTransform,
} = await import('../../../opencode/dist/plugin.js');

test('full-flow: safe file write passes through PreToolUse', async () => {
  // Safe content — should NOT throw
  await handleToolExecuteBefore(
    { tool: 'write', sessionID: 's1', callID: 'c1' },
    { args: { file_path: '/tmp/safe.txt', content: 'hello world' } },
  );
});

test('full-flow: AK hardcoded in Write content → PreToolUse throws', async () => {
  await assert.rejects(
    () => handleToolExecuteBefore(
      { tool: 'write', sessionID: 's1', callID: 'c1' },
      { args: { file_path: '/tmp/creds.ts', content: 'const AK = "AKIAIOSFODNN7EXAMPLE";' } },
    ),
    /HARD_RULE|AK hardcoded/
  );
});

test('full-flow: PostToolUse is a no-op (allow)', async () => {
  await handleToolExecuteAfter(
    { tool: 'write', sessionID: 's1', callID: 'c1', args: { file_path: '/tmp/x', content: 'y' } },
    {},
  );
});

test('full-flow: command.execute.before /sdd-spec passes through', async () => {
  await handleCommandExecuteBefore(
    { command: '/sdd-spec test-1', sessionID: 's1', arguments: '["test-1"]' },
    { parts: [] },
  );
});

test('full-flow: session.created triggers session-start hook', async () => {
  await handleEvent({
    event: {
      type: 'session.created',
      properties: { info: { id: 's1', directory: '/work' } },
    },
  });
});

test('full-flow: baseline injection via system.transform', async () => {
  const output = { system: ['You are an agent.'] };
  await handleSystemTransform({ sessionID: 's1', model: {} }, output);
  // Baseline was loaded — output.system should have more entries (or be empty if file missing)
  // Either way: no throw, output.system is still an array
  assert.ok(Array.isArray(output.system));
});

test('full-flow: untracked tool (bash) bypasses PreToolUse', async () => {
  // bash is not in TOOL_MAP → mapper returns null → hook skipped → no throw
  await handleToolExecuteBefore(
    { tool: 'bash', sessionID: 's1', callID: 'c1' },
    { args: { command: 'ls -la' } },
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
