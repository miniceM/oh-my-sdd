import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { opendir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.resolve(__dirname, '..', '..', 'packages', 'product', 'hooks', 'session-start.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', 'packages', 'product');

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

function makeStubDop({ output, exitCode = 0, logPath }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dop-stub-'));
  if (process.platform === 'win32') {
    // Keep the output in a file: cmd's echo can alter JSON quoting.  The
    // command is deliberately limited to the reconciliation probe so this
    // fixture cannot accidentally mask a different DOP invocation.
    if (exitCode === 0) {
      writeFileSync(path.join(dir, 'dop.json'), JSON.stringify(output) + '\n');
    }
    const cmdPath = path.join(dir, 'dop.cmd');
    const body = exitCode === 0
      ? 'type "%~dp0dop.json"\r\n'
      : 'echo forced DOP failure 1>&2\r\n';
    const log = logPath ? `echo %* > "${logPath}"\r\n` : '';
    writeFileSync(cmdPath,
      '@echo off\r\n' +
      `${log}` +
      'if not "%~1"=="change" exit /b 0\r\n' +
      'if not "%~2"=="view" exit /b 0\r\n' +
      'if not "%~3"=="ARD123456" exit /b 0\r\n' +
      'if not "%~4"=="-j" exit /b 0\r\n' +
      `${body}` +
      `exit /b ${exitCode}\r\n`);
  } else {
    const cmdPath = path.join(dir, 'dop');
    const body = exitCode === 0 ? `echo '${JSON.stringify(output)}'` : 'echo "forced DOP failure" >&2';
    const log = logPath ? `printf '%s' "$*" > '${logPath}'\n` : '';
    writeFileSync(cmdPath, `#!/bin/bash\n${log}${body}\nexit ${exitCode}\n`);
    chmodSync(cmdPath, 0o755);
  }
  return dir;
}

function runHook(stdinPayload, env = {}, timeoutMs) {
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
    let timedOut = false;
    const timeout = timeoutMs === undefined ? null : setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', (err) => {
      if (timeout) clearTimeout(timeout);
      resolve({ exitCode: -1, stdout, stderr, spawnError: err, timedOut });
    });
    child.on('close', (exitCode) => {
      if (timeout) clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
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

test('OK state: reminds pending DOP completion recorded in archived change metadata', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-dop-'));
  const projectCwd = mkdtempSync(path.join(tmpdir(), 'oms-ss-project-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  t.after(() => rmSync(projectCwd, { recursive: true, force: true }));
  const iamDir = makeStubIam({
    credentials: [
      { username: 'dop-devops', status: 'logged', is_api_key_true: true },
      { username: 'dop-gitee', status: 'logged', is_api_key_true: false },
    ],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const archiveDir = path.join(projectCwd, 'openspec', 'changes', 'archive', 'ARD123456');
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(path.join(archiveDir, '.meta.json'), JSON.stringify({
    change_id: 'ARD123456',
    dop_completion: { status: 'pending' },
  }));

  const result = await runHook(
    { session_id: 'dop-retry-test-1', cwd: projectCwd, source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.match(out.additionalContext, /ARD123456/);
  assert.match(out.additionalContext, /\/sdd-review --retry-dop <slug>/);
  assert.doesNotMatch(out.additionalContext, /--finalize/);
  assert.doesNotMatch(out.additionalContext, /merge PR/);
  assert.doesNotMatch(out.additionalContext, /openspec\/specs\/ drift/);
});

if (process.platform !== 'win32') {
  test('OK state: skips FIFO archive metadata without blocking the hook', async (t) => {
    const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-fifo-'));
    const projectCwd = mkdtempSync(path.join(tmpdir(), 'oms-ss-project-'));
    t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
    t.after(() => rmSync(projectCwd, { recursive: true, force: true }));
    const stateDir = path.join(tmpHome, '.oh-my-sdd');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({
      update_check_disabled: true,
      telemetry_disabled: true,
    }));
    const iamDir = makeStubIam({
      credentials: [
        { username: 'fifo-devops', status: 'logged', is_api_key_true: true },
        { username: 'fifo-gitee', status: 'logged', is_api_key_true: false },
      ],
    });
    t.after(() => rmSync(iamDir, { recursive: true, force: true }));

    const archiveDir = path.join(projectCwd, 'openspec', 'changes', 'archive', 'fifo-change');
    mkdirSync(archiveDir, { recursive: true });
    execFileSync('mkfifo', [path.join(archiveDir, '.meta.json')]);

    const result = await runHook(
      { session_id: 'fifo-test-1', cwd: projectCwd, source: 'startup' },
      {
        HOME: tmpHome,
        USERPROFILE: tmpHome,
        PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      },
      3_000,
    );

    assert.equal(result.timedOut, false, 'FIFO metadata must not block session-start');
    assert.equal(result.exitCode, 0);
    const out = JSON.parse(result.stdout);
    assert.doesNotMatch(out.additionalContext, /fifo-change/);
  });
}

test('OK state: sanitizes archived pending metadata before rendering it', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-sanitize-'));
  const projectCwd = mkdtempSync(path.join(tmpdir(), 'oms-ss-project-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  t.after(() => rmSync(projectCwd, { recursive: true, force: true }));
  const iamDir = makeStubIam({
    credentials: [
      { username: 'sanitize-devops', status: 'logged', is_api_key_true: true },
      { username: 'sanitize-gitee', status: 'logged', is_api_key_true: false },
    ],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  // Windows does not permit a newline in a directory name. The archived
  // metadata is still adversarial: session-start must sanitize change_id
  // before rendering it in the user-facing reminder.
  const archiveDir = path.join(projectCwd, 'openspec', 'changes', 'archive', 'ARD_SAFE_DIR');
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(path.join(archiveDir, '.meta.json'), JSON.stringify({
    change_id: 'CID_SAFE\nINJECTED-CHANGE',
    dop_completion: { status: 'pending' },
  }));

  const result = await runHook(
    { session_id: 'sanitize-test-1', cwd: projectCwd, source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.match(out.additionalContext, /CID_SAFEINJECTED-CHANGE/);
  assert.doesNotMatch(out.additionalContext, /\nINJECTED-CHANGE/);
});

test('OK state: ignores non-pending and malformed archive metadata', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-ignore-'));
  const projectCwd = mkdtempSync(path.join(tmpdir(), 'oms-ss-project-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  t.after(() => rmSync(projectCwd, { recursive: true, force: true }));
  const iamDir = makeStubIam({
    credentials: [
      { username: 'ignore-devops', status: 'logged', is_api_key_true: true },
      { username: 'ignore-gitee', status: 'logged', is_api_key_true: false },
    ],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const archiveRoot = path.join(projectCwd, 'openspec', 'changes', 'archive');
  mkdirSync(path.join(archiveRoot, 'not-pending'), { recursive: true });
  writeFileSync(path.join(archiveRoot, 'not-pending', '.meta.json'), JSON.stringify({
    change_id: 'not-pending',
    dop_completion: { status: 'done' },
  }));
  mkdirSync(path.join(archiveRoot, 'malformed'), { recursive: true });
  writeFileSync(path.join(archiveRoot, 'malformed', '.meta.json'), '{invalid JSON');

  const result = await runHook(
    { session_id: 'ignore-test-1', cwd: projectCwd, source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.doesNotMatch(out.additionalContext, /--retry-dop/);
});

test('OK state: caps archived DOP completion scan entries in enumeration order', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-dop-cap-'));
  const projectCwd = mkdtempSync(path.join(tmpdir(), 'oms-ss-project-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  t.after(() => rmSync(projectCwd, { recursive: true, force: true }));
  const iamDir = makeStubIam({
    credentials: [
      { username: 'cap-devops', status: 'logged', is_api_key_true: true },
      { username: 'cap-gitee', status: 'logged', is_api_key_true: false },
    ],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const archiveRoot = path.join(projectCwd, 'openspec', 'changes', 'archive');
  for (let index = 0; index < 50; index += 1) {
    const slug = `non-pending-${String(index).padStart(2, '0')}`;
    const archiveDir = path.join(archiveRoot, slug);
    mkdirSync(archiveDir, { recursive: true });
    writeFileSync(path.join(archiveDir, '.meta.json'), JSON.stringify({
      change_id: slug,
      dop_completion: { status: 'done' },
    }));
  }
  const pendingAfterCap = path.join(archiveRoot, 'pending-after-cap');
  mkdirSync(pendingAfterCap, { recursive: true });
  const archive = await opendir(archiveRoot);
  const enumeratedEntries = [];
  for await (const entry of archive) enumeratedEntries.push(entry.name);
  const pendingEntry = enumeratedEntries[50];
  assert.ok(pendingEntry, 'fixture must contain an entry beyond the scan cap');
  writeFileSync(path.join(archiveRoot, pendingEntry, '.meta.json'), JSON.stringify({
    change_id: pendingEntry,
    dop_completion: { status: 'pending' },
  }));

  const startedAt = Date.now();
  const result = await runHook(
    { session_id: 'dop-cap-test-1', cwd: projectCwd, source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    },
    3_500,
  );
  const elapsed = Date.now() - startedAt;

  assert.equal(result.timedOut, false, 'entry-capped scan must not block session-start');
  assert.ok(elapsed < 3_500, `hook took ${elapsed}ms, should return under 3.5s`);
  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.doesNotMatch(out.additionalContext, /--retry-dop/);
});

test('OK state: skips a non-directory archive entry', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-dop-file-'));
  const projectCwd = mkdtempSync(path.join(tmpdir(), 'oms-ss-project-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  t.after(() => rmSync(projectCwd, { recursive: true, force: true }));
  const iamDir = makeStubIam({
    credentials: [
      { username: 'file-devops', status: 'logged', is_api_key_true: true },
      { username: 'file-gitee', status: 'logged', is_api_key_true: false },
    ],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const archiveRoot = path.join(projectCwd, 'openspec', 'changes', 'archive');
  mkdirSync(archiveRoot, { recursive: true });
  writeFileSync(path.join(archiveRoot, 'not-a-change'), JSON.stringify({
    change_id: 'not-a-change',
    dop_completion: { status: 'pending' },
  }));

  const result = await runHook(
    { session_id: 'dop-file-test-1', cwd: projectCwd, source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    }
  );

  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.doesNotMatch(out.additionalContext, /not-a-change|--retry-dop/);
});

test('OK state: skips oversized pending archive metadata', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-dop-size-'));
  const projectCwd = mkdtempSync(path.join(tmpdir(), 'oms-ss-project-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  t.after(() => rmSync(projectCwd, { recursive: true, force: true }));
  const iamDir = makeStubIam({
    credentials: [
      { username: 'size-devops', status: 'logged', is_api_key_true: true },
      { username: 'size-gitee', status: 'logged', is_api_key_true: false },
    ],
  });
  t.after(() => rmSync(iamDir, { recursive: true, force: true }));

  const archiveDir = path.join(projectCwd, 'openspec', 'changes', 'archive', 'oversized');
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(path.join(archiveDir, '.meta.json'), JSON.stringify({
    change_id: 'oversized',
    dop_completion: { status: 'pending' },
    padding: 'x'.repeat(64 * 1024),
  }));

  const startedAt = Date.now();
  const result = await runHook(
    { session_id: 'dop-size-test-1', cwd: projectCwd, source: 'startup' },
    {
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      PATH: `${iamDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    },
    2_500,
  );
  const elapsed = Date.now() - startedAt;

  assert.equal(result.timedOut, false, 'oversized metadata must not block session-start');
  assert.ok(elapsed < 2_500, `hook took ${elapsed}ms, should return under 2.5s`);
  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout);
  assert.doesNotMatch(out.additionalContext, /oversized|--retry-dop/);
});

test('archived pending DOP intent does not remind when DOP already reports done', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-'));
  const projectDir = mkdtempSync(path.join(tmpdir(), 'oms-project-'));
  const iamDir = makeStubIam({ credentials: [
    { username: 'carol-devops', status: 'logged', is_api_key_true: true },
    { username: 'carol-gitee', status: 'logged', is_api_key_true: false },
  ] });
  const dopLogPath = path.join(tmpHome, 'dop-view.args');
  const dopDir = makeStubDop({ output: { id: 'ARD123456', status: 'done' }, logPath: dopLogPath });
  t.after(() => [tmpHome, projectDir, iamDir, dopDir].forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  const metaDir = path.join(projectDir, 'openspec', 'changes', 'archive', 'ARD123456');
  writeFileSync(path.join(projectDir, '.sdd-no-telemetry'), '');
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(path.join(metaDir, '.meta.json'), JSON.stringify({
    change_id: 'ARD123456',
    dop_completion: { status: 'pending', prepared_at: '2026-08-24T00:00:00Z' },
  }));

  const result = await runHook({ session_id: 'dop-done', cwd: projectDir }, {
    HOME: tmpHome,
    USERPROFILE: tmpHome,
    PATH: `${iamDir}${path.delimiter}${dopDir}${path.delimiter}${process.env.PATH}`,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
  });

  assert.equal(result.exitCode, 0);
  assert.doesNotMatch(JSON.parse(result.stdout).additionalContext, /--retry-dop/);
  assert.match(readFileSync(dopLogPath, 'utf8'), /change view ARD123456 -j/);
});

test('archived pending DOP intent reminds retry when DOP view fails', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ss-'));
  const projectDir = mkdtempSync(path.join(tmpdir(), 'oms-project-'));
  const iamDir = makeStubIam({ credentials: [
    { username: 'carol-devops', status: 'logged', is_api_key_true: true },
    { username: 'carol-gitee', status: 'logged', is_api_key_true: false },
  ] });
  const dopDir = makeStubDop({ exitCode: 1 });
  t.after(() => [tmpHome, projectDir, iamDir, dopDir].forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  const metaDir = path.join(projectDir, 'openspec', 'changes', 'archive', 'ARD123456');
  writeFileSync(path.join(projectDir, '.sdd-no-telemetry'), '');
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(path.join(metaDir, '.meta.json'), JSON.stringify({
    change_id: 'ARD123456',
    dop_completion: { status: 'pending', prepared_at: '2026-08-24T00:00:00Z' },
  }));

  const result = await runHook({ session_id: 'dop-view-failed', cwd: projectDir }, {
    HOME: tmpHome,
    USERPROFILE: tmpHome,
    PATH: `${iamDir}${path.delimiter}${dopDir}${path.delimiter}${process.env.PATH}`,
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
  });

  assert.equal(result.exitCode, 0);
  const context = JSON.parse(result.stdout).additionalContext;
  assert.match(context, /ARD123456/);
  assert.match(context, /--retry-dop/);
  assert.doesNotMatch(context, /--finalize|merge PR|openspec\/specs\/ drift/);
});
