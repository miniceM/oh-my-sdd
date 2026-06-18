import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function makeStubIam(output, exitCode = 0) {
  const dir = mkdtempSync(path.join(tmpdir(), 'iam-stub-'));
  const cmdPath = path.join(dir, 'iam');
  const cmdPathWin = path.join(dir, 'iam.cmd');
  const script = process.platform === 'win32'
    ? `@echo off\r\necho ${output.replace(/"/g, '""')}\r\nexit /b ${exitCode}\r\n`
    : `#!/bin/bash\necho '${output}'\nexit ${exitCode}\n`;
  writeFileSync(cmdPath, script);
  chmodSync(cmdPath, 0o755);
  if (process.platform === 'win32') {
    writeFileSync(cmdPathWin, script);
  }
  return dir;
}

test('getAuthStatus parses valid JSON', async (t) => {
  const stubDir = makeStubIam('{"total":1,"credentials":[{"system":"sdd","username":"alice","status":"logged"}]}');
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}:${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  const { getAuthStatus } = await import('../../hooks/lib/iam-cli.js?' + Date.now());
  const status = await getAuthStatus();
  assert.equal(status.total, 1);
  assert.equal(status.credentials[0].system, 'sdd');
});

test('getAuthStatus throws on command missing', async (t) => {
  // Set PATH to empty so iam isn't found
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
  process.env.PATH = `${stubDir}:${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  const { getAuthStatus, IamCliError } = await import('../../hooks/lib/iam-cli.js?' + Date.now());
  await assert.rejects(() => getAuthStatus(), IamCliError);
});

test('getAuthStatus throws on invalid JSON output', async (t) => {
  const stubDir = makeStubIam('not json');
  t.after(() => rmSync(stubDir, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  process.env.PATH = `${stubDir}:${process.env.PATH}`;
  t.after(() => { process.env.PATH = oldPath; });

  const { getAuthStatus, IamCliError } = await import('../../hooks/lib/iam-cli.js?' + Date.now());
  await assert.rejects(() => getAuthStatus(), IamCliError);
});

test('findUsernameForSystem returns matching username', async () => {
  const { findUsernameForSystem } = await import('../../hooks/lib/iam-cli.js');
  const status = {
    total: 2,
    credentials: [
      { system: 'gitlab', username: 'alice', status: 'logged' },
      { system: 'sdd',    username: 'alice', status: 'logged' },
    ],
  };
  assert.equal(findUsernameForSystem(status, 'sdd'), 'alice');
});

test('findUsernameForSystem falls back to first credential', async () => {
  const { findUsernameForSystem } = await import('../../hooks/lib/iam-cli.js');
  const status = {
    total: 1,
    credentials: [{ system: 'gitlab', username: 'bob', status: 'logged' }],
  };
  assert.equal(findUsernameForSystem(status, 'sdd'), 'bob');
});

test('findUsernameForSystem returns null on empty credentials', async () => {
  const { findUsernameForSystem } = await import('../../hooks/lib/iam-cli.js');
  assert.equal(findUsernameForSystem({ total: 0, credentials: [] }, 'sdd'), null);
});
