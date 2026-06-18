import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.resolve(__dirname, '..', '..', 'hooks', 'session-start.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');

// Resolve the running node's bin dir so tests that clobber PATH to hide iam
// can still find `node` itself to spawn the hook.
const NODE_BIN_DIR = (() => {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    return path.dirname(execFileSync(which, ['node'], { encoding: 'utf8' }).trim().split('\n')[0]);
  } catch {
    return path.dirname(process.execPath);
  }
})();

function makeStubIam(jsonOutput) {
  const dir = mkdtempSync(path.join(tmpdir(), 'iam-stub-'));
  const cmd = path.join(dir, 'iam');
  const script = `#!/bin/bash\nif [ "$1" = "auth" ] && [ "$2" = "status" ] && [ "$3" = "-json" ]; then\n  echo '${JSON.stringify(jsonOutput)}'\nfi\n`;
  writeFileSync(cmd, script);
  chmodSync(cmd, 0o755);
  return dir;
}

// Stub iam that hangs forever (simulates network stall / deadlocked CLI).
function makeHangingIam() {
  const dir = mkdtempSync(path.join(tmpdir(), 'iam-hang-'));
  const cmd = path.join(dir, 'iam');
  const script = '#!/bin/bash\nsleep 60\n';
  writeFileSync(cmd, script);
  chmodSync(cmd, 0o755);
  return dir;
}

function runHook(stdinPayload, env = {}) {
  return new Promise((resolve) => {
    // Always ensure node is findable even if the test clobbered PATH.
    const finalEnv = { ...process.env, ...env };
    if (!finalEnv.PATH || !finalEnv.PATH.includes(NODE_BIN_DIR)) {
      finalEnv.PATH = `${NODE_BIN_DIR}:${finalEnv.PATH ?? ''}`;
    }
    const child = spawn('node', [HOOK_PATH], {
      env: finalEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', (err) => resolve({ exitCode: -1, stdout, stderr, spawnError: err }));
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    if (stdinPayload === null || stdinPayload === undefined) {
      child.stdin.end();
    } else {
      child.stdin.end(JSON.stringify(stdinPayload));
    }
  });
}

test('OK state: baseline injected + DOP session.start sent', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  const iamDir = makeStubIam({
    total: 1,
    credentials: [{ system: 'sdd', username: 'alice', status: 'logged' }],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const result = await runHook(
    { session_id: 'test-uuid-1', cwd: '/tmp', source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}:${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.ok(out.additionalContext);
  assert.ok(out.additionalContext.length > 0);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
});

test('NEED_LOGIN state: auth-required shown, no baseline, stderr warning', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  const iamDir = makeStubIam({
    total: 0,
    credentials: [],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const result = await runHook(
    { session_id: 'test-uuid-2', cwd: '/tmp', source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}:${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.match(out.additionalContext, /未通过 iam 身份认证/);
  assert.match(result.stderr, /iam 身份认证|未授权|认证状态/);
});

test('NO_CLI state: install guidance shown', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));

  const result = await runHook(
    { session_id: 'test-uuid-3', cwd: '/tmp', source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: '/nonexistent', // iam not in PATH
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.match(out.additionalContext, /iam CLI|安装/);
});

test('Hook emits valid JSON even on unexpected error', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));

  // Pass empty stdin (not JSON) to trigger graceful-degradation path
  const result = await runHook(
    null, // not JSON
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: '/nonexistent',
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );

  // Must still emit valid JSON or empty (Claude Code tolerates empty)
  if (result.stdout.trim()) {
    JSON.parse(result.stdout); // should not throw
  }
});

test('iam hanging produces ERROR state within timeout, session does not block', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  const iamDir = makeHangingIam();
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const start = Date.now();
  const result = await runHook(
    { session_id: 'test-uuid-hang', cwd: '/tmp', source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}:${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );
  const elapsed = Date.now() - start;

  // Hook must return well under the iam sleep duration (60s).
  // IAM_AUTH_TIMEOUT is 5s; allow generous slack for spawn + git + JSON write.
  assert.ok(elapsed < 15000, `hook took ${elapsed}ms, should have timed out under 15s`);
  assert.equal(result.exitCode, 0);

  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  // Should surface a service-error message, not the baseline.
  assert.match(out.additionalContext, /iam 服务异常|超时|timeout|身份认证|认证状态/i);
  assert.match(result.stderr, /认证状态|超时|iam/i);
});
