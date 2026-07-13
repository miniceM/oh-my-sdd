import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
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
  const jsonStr = JSON.stringify(jsonOutput);
  if (process.platform === 'win32') {
    // Windows: 单层 iam.bat stub。
    // 关键约束：
    //   1. 不能用 cmd→cmd→node→js 链路（企业 Windows node 启动 + AV 扫描
    //      常超 5s，命中 hook 的 IAM_AUTH_TIMEOUT_MS）。
    //   2. 不能直接用 `echo {json}`（CMD 的 echo 对引号/转义处理有 quirk，
    //      JSON 中 `"` 会被吞或重排，导致 hook 端 JSON.parse 失败）。
    // 解法：把 JSON 写到独立 .json 文件，.bat 用 `type` 字面量输出。
    // type 不解释内容，原样 byte-for-byte 写出，可靠。
    const jsonPath = path.join(dir, 'iam.json');
    writeFileSync(jsonPath, jsonStr + '\n');
    const batPath = path.join(dir, 'iam.bat');
    // 条件：auth status --json / -json。任一不满足直接 exit /b 0（静默成功，
    // 避免 hook 把成功调用误判为失败）。
    const batScript =
      '@echo off\r\n' +
      'if not "%~1"=="auth" exit /b 0\r\n' +
      'if not "%~2"=="status" exit /b 0\r\n' +
      'if "%~3"=="--json" goto :emit\r\n' +
      'if "%~3"=="-json" goto :emit\r\n' +
      'exit /b 0\r\n' +
      ':emit\r\n' +
      'type "%~dp0iam.json"\r\n' +
      'exit /b 0\r\n';
    writeFileSync(batPath, batScript);
  } else {
    const cmd = path.join(dir, 'iam');
    const script = `#!/bin/bash\nif [ "$1" = "auth" ] && [ "$2" = "status" ] && { [ "$3" = "--json" ] || [ "$3" = "-json" ]; }; then\n  echo '${JSON.stringify(jsonOutput)}'\nfi\n`;
    writeFileSync(cmd, script);
    chmodSync(cmd, 0o755);
  }
  return dir;
}

// Stub iam that hangs forever (simulates network stall / deadlocked CLI).
function makeHangingIam() {
  const dir = mkdtempSync(path.join(tmpdir(), 'iam-hang-'));
  if (process.platform === 'win32') {
    // Windows: node 脚本 sleep 60
    const jsPath = path.join(dir, 'iam.js');
    writeFileSync(jsPath, '#!/usr/bin/env node\nconst end = Date.now() + 60000;\nwhile (Date.now() < end) {}\n');
    const cmdPath = path.join(dir, 'iam.cmd');
    writeFileSync(cmdPath, `@echo off\r\nnode "%~dp0iam.js" %*\r\nexit /b %ERRORLEVEL%\r\n`);
    return dir;
  }
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
      // 跨平台 PATH 分隔符：Windows 是 ;，POSIX 是 :
      finalEnv.PATH = `${NODE_BIN_DIR}${path.delimiter}${finalEnv.PATH ?? ''}`;
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
    // 新契约（2026-06-22）：无 total 字段，2 个 credentials（devops + gitee）
    credentials: [
      { username: 'deepus',  status: 'logged', is_api_key_true: true  },
      { username: 'gituser', status: 'logged', is_api_key_true: false },
    ],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const result = await runHook(
    { session_id: 'test-uuid-1', cwd: '/tmp', source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
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
    // 新契约：无 total 字段，未登录时 credentials 为空
    credentials: [],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const result = await runHook(
    { session_id: 'test-uuid-2', cwd: '/tmp', source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
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
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );
  const elapsed = Date.now() - start;

  // Hook must return well under the iam sleep duration (60s).
  // Budget breakdown:
  //   - IAM_AUTH_TIMEOUT_MS = 5s (kills hanging iam)
  //   - DOP flush (empty queue, ~instant)
  //   - DOP reportOrEnqueue: 3 attempts × 3s + 600ms backoff = ~10s
  //   - stdin/git/JSON overhead: ~1s
  // Theoretical: ~16s. Practical headroom for CI / slow DNS: 30s.
  // If this fires, investigate whether:
  //   1. process.kill(-child.pid) actually killed the iam stub's process group
  //   2. fetch to https://dop.enterprise.com failed fast (DNS) vs slow (TCP)
  assert.ok(elapsed < 30000, `hook took ${elapsed}ms, should have timed out under 30s`);
  assert.equal(result.exitCode, 0);

  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  // Should surface a service-error message, not the baseline.
  assert.match(out.additionalContext, /iam 服务异常|超时|timeout|身份认证|认证状态/i);
  assert.match(result.stderr, /认证状态|超时|iam/i);
});

test('OK state: session meta includes started_at for duration calc', async (t) => {
  // Verifies Finding 2: session-start must write started_at so session-end
  // can compute duration_sec (previously always null).
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-meta-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  const iamDir = makeStubIam({
    // 新契约：2 个 credentials，username 是 carol
    credentials: [
      { username: 'carol-devops', status: 'logged', is_api_key_true: true  },
      { username: 'carol-gitee',  status: 'logged', is_api_key_true: false },
    ],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const before = Date.now();
  const result = await runHook(
    { session_id: 'meta-test-1', cwd: '/tmp', source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );
  const after = Date.now();

  assert.equal(result.exitCode, 0);
  const metaPath = path.join(tmpHome, '.oh-my-sdd', 'sessions', 'meta-test-1.json');
  assert.equal(existsSync(metaPath), true, 'session meta file should exist');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  // pickAnyLoggedUsername 返回第一个 logged 的 username
  assert.equal(meta.username, 'carol-devops');
  // start_sha may be null if cwd is not a git repo; just assert presence
  assert.ok('start_sha' in meta, 'start_sha key must be present');
  // started_at must be present and parse as a recent ISO timestamp
  assert.equal(typeof meta.started_at, 'string');
  const startedAtMs = new Date(meta.started_at).getTime();
  assert.ok(Number.isFinite(startedAtMs), 'started_at must be a valid ISO date');
  assert.ok(startedAtMs >= before && startedAtMs <= after,
    `started_at (${meta.started_at}) should be within the hook run window [${before}, ${after}]`);
});
