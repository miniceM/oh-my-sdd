import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import {
  getAuthStatus,
  IamCliError,
  isFullyAuthenticated,
  login,
  pickAnyLoggedUsername,
  runIam,
} from '../../../packages/product/lib/iam-cli.js';

function makeFakeChild(pid = 321) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { end: (input) => { child.stdinInput = input; } };
  child.killCalls = [];
  child.kill = (signal) => child.killCalls.push(signal);
  return child;
}

function makeTimeoutHarness() {
  let handler;
  return {
    setTimeoutFn(fn) {
      handler = fn;
      return { unref() {} };
    },
    clearTimeoutFn() {},
    fire() {
      assert.equal(typeof handler, 'function', 'timeout handler must be registered');
      handler();
    },
  };
}

function makeStubIam(output, exitCode = 0, loginExitCode = 0) {
  const dir = mkdtempSync(path.join(tmpdir(), 'iam-stub-'));
  if (process.platform === 'win32') {
    // Windows: 用 node 脚本 + .cmd shim，避开 CMD echo 的元字符问题。
    const jsPath = path.join(dir, 'iam.js');
    const jsScript = [
      '#!/usr/bin/env node',
      'if (process.argv[2] === "auth" && process.argv[3] === "status") {',
      '  process.stdout.write(' + JSON.stringify(output) + ' + "\\n");',
      '  process.exit(' + exitCode + ');',
      '}',
      'if (process.argv[2] === "auth" && process.argv[3] === "login") {',
      '  if (' + loginExitCode + ' !== 0) process.stderr.write("login failed\\n");',
      '  process.exit(' + loginExitCode + ');',
      '}',
      'process.exit(0);',
    ].join('\n');
    writeFileSync(jsPath, jsScript);
    const cmdPath = path.join(dir, 'iam.cmd');
    const shim = `@echo off\r\nnode "%~dp0iam.js" %*\r\nexit /b %ERRORLEVEL%\r\n`;
    writeFileSync(cmdPath, shim);
  } else {
    const cmd = path.join(dir, 'iam');
    const script = `#!/bin/bash\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then\n  echo '${output}'\n  exit ${exitCode}\nfi\nif [ "$1" = "auth" ] && [ "$2" = "login" ]; then\n  if [ ${loginExitCode} -ne 0 ]; then echo 'login failed' >&2; fi\n  exit ${loginExitCode}\nfi\nexit 0\n`;
    writeFileSync(cmd, script);
    chmodSync(cmd, 0o755);
  }
  return dir;
}

test('getAuthStatus uses --json flag and parses credentials-only payload', async (t) => {
  // 新契约：无 total 字段，credentials 元素有 is_api_key_true，无 system
  const stubDir = makeStubIam(
    '{"credentials":[{"username":"deepus","status":"logged","is_api_key_true":true},{"username":"gituser","status":"logged","is_api_key_true":false}]}'
  );
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}${path.delimiter}${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  const status = await getAuthStatus();
  assert.ok(Array.isArray(status.credentials));
  assert.equal(status.credentials.length, 2);
  assert.equal(status.credentials[0].username, 'deepus');
  assert.equal(status.credentials[0].is_api_key_true, true);
  // 新契约：不再有 total 字段（但解析层不应崩）
  assert.equal(status.total, undefined);
});

test('getAuthStatus throws on command missing', async (t) => {
  const oldPath = process.env.PATH;
  process.env.PATH = '/nonexistent';
  t.after(() => { process.env.PATH = oldPath; });

  await assert.rejects(() => getAuthStatus(), IamCliError);
});

test('getAuthStatus throws on non-zero exit', async (t) => {
  const stubDir = makeStubIam('boom', 1);
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}${path.delimiter}${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  await assert.rejects(() => getAuthStatus(), IamCliError);
});

test('getAuthStatus throws on missing credentials field', async (t) => {
  // 旧契约 stub（有 total 无 credentials）→ 应抛 IAM_SCHEMA_MISMATCH
  const stubDir = makeStubIam('{"total":1}');
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}${path.delimiter}${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  await assert.rejects(() => getAuthStatus(), (err) => {
    assert.ok(err instanceof IamCliError);
    assert.equal(err.code, 'IAM_SCHEMA_MISMATCH');
    return true;
  });
});

test('getAuthStatus wraps invalid JSON output', async (t) => {
  const stubDir = makeStubIam('not-json');
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}${path.delimiter}${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  await assert.rejects(() => getAuthStatus(), { code: 'IAM_INVALID_JSON' });
});

test('runIam uses a Windows shell and taskkill for timeout cleanup', async () => {
  const child = makeFakeChild();
  const timeout = makeTimeoutHarness();
  const spawnCalls = [];
  const execCalls = [];

  const result = runIam(['auth', 'status'], {
    platform: 'win32',
    timeoutMs: 50,
    spawnFn(command, args, options) {
      spawnCalls.push({ command, args, options });
      return child;
    },
    execFileFn(command, args, options) {
      execCalls.push({ command, args, options });
    },
    setTimeoutFn: timeout.setTimeoutFn,
    clearTimeoutFn: timeout.clearTimeoutFn,
  });

  timeout.fire();
  await assert.rejects(result, (error) => {
    assert.ok(error instanceof IamCliError);
    assert.equal(error.code, 'IAM_TIMEOUT');
    return true;
  });
  assert.deepEqual(spawnCalls, [{
    command: 'iam',
    args: ['auth', 'status'],
    options: {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      shell: true,
    },
  }]);
  assert.deepEqual(execCalls, [{
    command: 'taskkill',
    args: ['/PID', 321, '/T', '/F'],
    options: { stdio: 'ignore' },
  }]);
  assert.deepEqual(child.killCalls, []);
});

test('runIam uses a detached POSIX process group and kills its negative pid on timeout', async () => {
  const child = makeFakeChild(654);
  const timeout = makeTimeoutHarness();
  const spawnCalls = [];
  const killCalls = [];

  const result = runIam(['auth', 'status'], {
    platform: 'linux',
    timeoutMs: 50,
    spawnFn(command, args, options) {
      spawnCalls.push({ command, args, options });
      return child;
    },
    killFn(pid, signal) {
      killCalls.push({ pid, signal });
    },
    setTimeoutFn: timeout.setTimeoutFn,
    clearTimeoutFn: timeout.clearTimeoutFn,
  });

  timeout.fire();
  await assert.rejects(result, { code: 'IAM_TIMEOUT' });
  assert.deepEqual(spawnCalls[0].options, {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    shell: false,
  });
  assert.deepEqual(killCalls, [{ pid: -654, signal: 'SIGKILL' }]);
  assert.deepEqual(child.killCalls, []);
});

test('runIam falls back to killing the POSIX child when process-group cleanup fails', async () => {
  const child = makeFakeChild(987);
  const timeout = makeTimeoutHarness();

  const result = runIam(['auth', 'status'], {
    platform: 'darwin',
    timeoutMs: 50,
    spawnFn: () => child,
    killFn: () => { throw new Error('process group missing'); },
    setTimeoutFn: timeout.setTimeoutFn,
    clearTimeoutFn: timeout.clearTimeoutFn,
  });

  timeout.fire();
  await assert.rejects(result, { code: 'IAM_TIMEOUT' });
  assert.deepEqual(child.killCalls, ['SIGKILL']);
});

test('runIam collects output, forwards stdin, and clears its timer on close', async () => {
  const child = makeFakeChild(246);
  const timeout = makeTimeoutHarness();
  const clearedTimers = [];

  const result = runIam(['auth', 'login'], {
    input: 'secret',
    timeoutMs: 50,
    platform: 'linux',
    spawnFn: () => child,
    setTimeoutFn: timeout.setTimeoutFn,
    clearTimeoutFn: (timer) => clearedTimers.push(timer),
  });
  child.stdout.write('logged ');
  child.stdout.write('in');
  child.stderr.write('warning');
  child.emit('close', 0);

  assert.deepEqual(await result, { exitCode: 0, stdout: 'logged in', stderr: 'warning' });
  assert.equal(child.stdinInput, 'secret');
  assert.equal(clearedTimers.length, 1);
  timeout.fire();
  assert.deepEqual(child.killCalls, []);
});

test('runIam wraps spawn errors and clears its timer', async () => {
  const child = makeFakeChild();
  const timeout = makeTimeoutHarness();
  const clearedTimers = [];
  const cause = new Error('spawn failed');

  const result = runIam(['auth', 'status'], {
    timeoutMs: 50,
    spawnFn: () => child,
    setTimeoutFn: timeout.setTimeoutFn,
    clearTimeoutFn: (timer) => clearedTimers.push(timer),
  });
  child.emit('error', cause);

  await assert.rejects(result, (error) => {
    assert.ok(error instanceof IamCliError);
    assert.equal(error.code, 'IAM_SPAWN_FAILED');
    assert.equal(error.cause, cause);
    return true;
  });
  assert.equal(clearedTimers.length, 1);
});

test('login returns ok for successful authentication', async (t) => {
  const stubDir = makeStubIam('{}');
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}${path.delimiter}${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  assert.deepEqual(await login('alice', 'secret'), { ok: true });
});

test('login returns stderr for failed authentication', async (t) => {
  const stubDir = makeStubIam('{}', 0, 7);
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}${path.delimiter}${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  assert.deepEqual(await login('alice', 'wrong'), { ok: false, error: 'login failed' });
});

test('isFullyAuthenticated returns true when all required systems logged', async () => {
  const status = {
    credentials: [
      { username: 'deepus',  status: 'logged', is_api_key_true: true  },
      { username: 'gituser', status: 'logged', is_api_key_true: false },
    ],
  };
  assert.equal(isFullyAuthenticated(status, 2), true);
});

test('isFullyAuthenticated returns false when fewer than required', async () => {
  const status = {
    credentials: [
      { username: 'deepus', status: 'logged', is_api_key_true: true },
    ],
  };
  // 需 2 个系统，只有 1 个 → false
  assert.equal(isFullyAuthenticated(status, 2), false);
});

test('isFullyAuthenticated returns false when any credential not logged', async () => {
  const status = {
    credentials: [
      { username: 'deepus',  status: 'logged',    is_api_key_true: true  },
      { username: 'gituser', status: 'expired',   is_api_key_true: false },
    ],
  };
  assert.equal(isFullyAuthenticated(status, 2), false);
});

test('isFullyAuthenticated handles empty credentials', async () => {
  assert.equal(isFullyAuthenticated({ credentials: [] }, 2), false);
  assert.equal(isFullyAuthenticated({}, 2), false);
  assert.equal(isFullyAuthenticated(null, 2), false);
});

test('pickAnyLoggedUsername returns first logged username', async () => {
  const status = {
    credentials: [
      { username: 'deepus',  status: 'logged' },
      { username: 'gituser', status: 'logged' },
    ],
  };
  assert.equal(pickAnyLoggedUsername(status), 'deepus');
});

test('pickAnyLoggedUsername returns null when none logged', async () => {
  assert.equal(pickAnyLoggedUsername({ credentials: [] }), null);
  assert.equal(pickAnyLoggedUsername({
    credentials: [{ username: 'x', status: 'expired' }],
  }), null);
});
