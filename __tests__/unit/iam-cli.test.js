import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function makeStubIam(output, exitCode = 0) {
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
      'process.exit(0);',
    ].join('\n');
    writeFileSync(jsPath, jsScript);
    const cmdPath = path.join(dir, 'iam.cmd');
    const shim = `@echo off\r\nnode "%~dp0iam.js" %*\r\nexit /b %ERRORLEVEL%\r\n`;
    writeFileSync(cmdPath, shim);
  } else {
    const cmd = path.join(dir, 'iam');
    const script = `#!/bin/bash\nif [ "$1" = "auth" ] && [ "$2" = "status" ]; then\n  echo '${output}'\n  exit ${exitCode}\nfi\nexit 0\n`;
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

  const { getAuthStatus } = await import('../../hooks/lib/iam-cli.js?' + Date.now());
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

  const { getAuthStatus, IamCliError } = await import('../../hooks/lib/iam-cli.js?' + Date.now());
  await assert.rejects(() => getAuthStatus(), IamCliError);
});

test('getAuthStatus throws on non-zero exit', async (t) => {
  const stubDir = makeStubIam('boom', 1);
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}${path.delimiter}${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  const { getAuthStatus, IamCliError } = await import('../../hooks/lib/iam-cli.js?' + Date.now());
  await assert.rejects(() => getAuthStatus(), IamCliError);
});

test('getAuthStatus throws on missing credentials field', async (t) => {
  // 旧契约 stub（有 total 无 credentials）→ 应抛 IAM_SCHEMA_MISMATCH
  const stubDir = makeStubIam('{"total":1}');
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}${path.delimiter}${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  const { getAuthStatus, IamCliError } = await import('../../hooks/lib/iam-cli.js?' + Date.now());
  await assert.rejects(() => getAuthStatus(), (err) => {
    assert.ok(err instanceof IamCliError);
    assert.equal(err.code, 'IAM_SCHEMA_MISMATCH');
    return true;
  });
});

test('isFullyAuthenticated returns true when all required systems logged', async () => {
  const { isFullyAuthenticated } = await import('../../hooks/lib/iam-cli.js');
  const status = {
    credentials: [
      { username: 'deepus',  status: 'logged', is_api_key_true: true  },
      { username: 'gituser', status: 'logged', is_api_key_true: false },
    ],
  };
  assert.equal(isFullyAuthenticated(status, 2), true);
});

test('isFullyAuthenticated returns false when fewer than required', async () => {
  const { isFullyAuthenticated } = await import('../../hooks/lib/iam-cli.js');
  const status = {
    credentials: [
      { username: 'deepus', status: 'logged', is_api_key_true: true },
    ],
  };
  // 需 2 个系统，只有 1 个 → false
  assert.equal(isFullyAuthenticated(status, 2), false);
});

test('isFullyAuthenticated returns false when any credential not logged', async () => {
  const { isFullyAuthenticated } = await import('../../hooks/lib/iam-cli.js');
  const status = {
    credentials: [
      { username: 'deepus',  status: 'logged',    is_api_key_true: true  },
      { username: 'gituser', status: 'expired',   is_api_key_true: false },
    ],
  };
  assert.equal(isFullyAuthenticated(status, 2), false);
});

test('isFullyAuthenticated handles empty credentials', async () => {
  const { isFullyAuthenticated } = await import('../../hooks/lib/iam-cli.js');
  assert.equal(isFullyAuthenticated({ credentials: [] }, 2), false);
  assert.equal(isFullyAuthenticated({}, 2), false);
  assert.equal(isFullyAuthenticated(null, 2), false);
});

test('pickAnyLoggedUsername returns first logged username', async () => {
  const { pickAnyLoggedUsername } = await import('../../hooks/lib/iam-cli.js');
  const status = {
    credentials: [
      { username: 'deepus',  status: 'logged' },
      { username: 'gituser', status: 'logged' },
    ],
  };
  assert.equal(pickAnyLoggedUsername(status), 'deepus');
});

test('pickAnyLoggedUsername returns null when none logged', async () => {
  const { pickAnyLoggedUsername } = await import('../../hooks/lib/iam-cli.js');
  assert.equal(pickAnyLoggedUsername({ credentials: [] }), null);
  assert.equal(pickAnyLoggedUsername({
    credentials: [{ username: 'x', status: 'expired' }],
  }), null);
});
