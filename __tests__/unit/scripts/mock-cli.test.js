import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('IAM mock accepts OMS_MOCK_USER as the CI identity shorthand', () => {
  const script = join(root, 'scripts', 'iam');
  const output = execFileSync('bash', [script, 'auth', 'status', '--json'], {
    env: { ...process.env, OMS_MOCK_USER: 'ci' },
    encoding: 'utf8',
  });
  assert.match(output, /"username":"ci"/);
});

test('Windows mock shims delegate to the repository Bash implementations', () => {
  for (const name of ['iam', 'dop']) {
    const shim = join(root, 'scripts', `${name}.cmd`);
    assert.ok(existsSync(shim), `${name}.cmd must exist for Windows PATH resolution`);
    const source = readFileSync(shim, 'utf8');
    assert.match(source, /bash/i);
    assert.match(source, new RegExp(`%~dp0${name}`, 'i'));
  }
});
