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

test('Node DOP mock completes a change', () => {
  const script = join(root, 'scripts', 'mock-cli.mjs');
  const result = spawnSync(process.execPath, [script, 'dop', 'change', 'done', 'ARD123456'], {
    env: process.env,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { id: 'ARD123456', status: 'done' });
});

test('Node DOP mock reports a forced change completion failure', () => {
  const script = join(root, 'scripts', 'mock-cli.mjs');
  const result = spawnSync(process.execPath, [script, 'dop', 'change', 'done', 'ARD123456'], {
    env: { ...process.env, OMS_MOCK_DOP_FAIL_DONE: '1' },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /done failed/);
});

test('Node DOP mock rejects missing or invalid completion codes', () => {
  const script = join(root, 'scripts', 'mock-cli.mjs');
  for (const args of [
    ['dop', 'change', 'done'],
    ['dop', 'change', 'done', 'ARD"broken'],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      env: process.env,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, `${args.join(' ')} unexpectedly succeeded`);
    assert.match(result.stderr, /change code/i);
  }
});

test('POSIX DOP mock preserves the change completion contract', {
  skip: process.platform === 'win32' ? 'requires POSIX shell' : false,
}, () => {
  const script = join(root, 'scripts', 'dop');
  const run = (args, env = process.env) => spawnSync('bash', [script, ...args], {
    env,
    encoding: 'utf8',
  });

  const success = run(['change', 'done', 'ARD123456']);
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(JSON.parse(success.stdout), { id: 'ARD123456', status: 'done' });

  const forcedFailure = run(['change', 'done', 'ARD123456'], {
    ...process.env,
    OMS_MOCK_DOP_FAIL_DONE: '1',
  });
  assert.notEqual(forcedFailure.status, 0);
  assert.match(forcedFailure.stderr, /done failed/);

  for (const args of [
    ['change', 'done'],
    ['change', 'done', 'ARD"broken'],
  ]) {
    const result = run(args);
    assert.notEqual(result.status, 0, `${args.join(' ')} unexpectedly succeeded`);
    assert.match(result.stderr, /change code/i);
  }

  const help = run(['change', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /done/);

  const update = run(['change', 'update']);
  assert.notEqual(update.status, 0);
  assert.match(update.stderr, /dop change done <code>/);
});
