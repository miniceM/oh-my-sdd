import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();

test('Node IAM mock accepts OMS_MOCK_USER as the CI identity shorthand', () => {
  const script = join(root, 'scripts', 'mock-cli.mjs');
  const output = execFileSync(process.execPath, [script, 'iam', 'auth', 'status', '--json'], {
    env: { ...process.env, OMS_MOCK_USER: 'ci' },
    encoding: 'utf8',
  });
  assert.match(output, /"username":"ci"/);
});

test('Windows mock shims invoke Node without Bash or WSL', () => {
  for (const name of ['iam', 'dop']) {
    const shim = join(root, 'scripts', `${name}.cmd`);
    assert.ok(existsSync(shim), `${name}.cmd must exist for Windows PATH resolution`);
    const source = readFileSync(shim, 'utf8');
    assert.doesNotMatch(source, /bash|wsl|git/i);
    assert.match(source, /node\s+"%~dp0mock-cli\.mjs"/i);
    assert.ok(source.toLowerCase().includes(` ${name} %*`), `${name}.cmd must forward arguments`);
  }
});

test('Windows mock shims execute through cmd.exe without Bash', {
  skip: process.platform !== 'win32' ? 'requires Windows cmd.exe' : false,
}, () => {
  const commandProcessor = process.env.ComSpec ?? 'cmd.exe';
  const environment = {
    ...process.env,
    OMS_MOCK_USER: 'ci',
    PATH: dirname(process.execPath),
  };
  const cases = [
    { name: 'iam', args: ['auth', 'status', '--json'], expected: /"username":"ci"/ },
    { name: 'dop', args: ['change', 'list', '--json'], expected: /"changes":\s*\[/ },
  ];

  for (const { name, args, expected } of cases) {
    const shim = join(root, 'scripts', `${name}.cmd`);
    const result = spawnSync(shim, args, {
      env: environment,
      encoding: 'utf8',
      shell: commandProcessor,
    });
    assert.equal(result.status, 0, `${name}.cmd failed: ${result.stderr}`);
    assert.match(result.stdout, expected);
  }
});

test('Node mock remains runnable with a PATH that has no Bash', () => {
  const script = join(root, 'scripts', 'mock-cli.mjs');
  const result = spawnSync(process.execPath, [script, 'iam', 'auth', 'status', '--json'], {
    env: { ...process.env, PATH: join(root, 'does-not-contain-bash') },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).credentials.map(({ username }) => username), ['deepus', 'gituser']);
});
