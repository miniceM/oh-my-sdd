import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runOmsInstall, selectHost } from '../../../packages/product/bin/oms-install.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = path.join(ROOT, 'packages', 'product', 'bin', 'oms-install.js');

const PLAN = {
  schema_version: 1,
  hosts: [{
    id: 'kilocode',
    display_name: 'KiloCode',
    capabilities: { write_prevention: { supported: false } },
    resources: [],
    risks: [],
    recommendation: { action: 'install' },
  }],
};

function runProcess(command, args, { env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function runOmsInstallProcess(args, { plan = PLAN, input } = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'oms-install-test-'));
  const recordPath = path.join(tempDir, 'calls.jsonl');
  const loaderPath = path.join(tempDir, 'loader.mjs');
  const mockedMain = [
    "import { appendFileSync } from 'node:fs';",
    'export async function main(options) {',
    "  appendFileSync(process.env.OMS_INSTALL_TEST_RECORD, `${JSON.stringify(options)}\\n`);",
    '  return JSON.parse(process.env.OMS_INSTALL_TEST_PLAN);',
    '}',
  ].join('\n');
  await writeFile(loaderPath, [
    'export async function resolve(specifier, context, nextResolve) {',
    "  if (specifier === '../install/main.js' && context.parentURL && (context.parentURL.endsWith('/bin/oms-install.js') || context.parentURL.endsWith('/bin/oms-install.js/') || context.parentURL.includes('bin/oms-install.js'))) {",
    `    return { url: 'data:text/javascript;base64,${Buffer.from(mockedMain).toString('base64')}', shortCircuit: true };`,
    '  }',
    '  return nextResolve(specifier, context);',
    '}',
  ].join('\n'));

  try {
    const result = await runProcess(process.execPath, ['--experimental-loader', pathToFileURL(loaderPath).href, CLI, ...args], {
      env: {
        OMS_INSTALL_TEST_RECORD: recordPath,
        OMS_INSTALL_TEST_PLAN: JSON.stringify(plan),
      },
      input,
    });
    const calls = await readFile(recordPath, 'utf8')
      .then((contents) => contents.trim().split('\n').filter(Boolean).map(JSON.parse))
      .catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error));
    return { ...result, calls };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('oms-install --dry-run --json prints one JSON plan and never applies', async () => {
  const result = await runOmsInstallProcess(['--tool', 'kilocode', '--dry-run', '--json']);

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), { type: 'installation-plan', plan: PLAN });
  assert.deepEqual(result.calls, [{ tool: 'kilocode', dryRun: true }]);
});

test('multiple detected hosts require an explicit selection before apply', async () => {
  const selectionPlan = { ...PLAN, selection_required: true, selection_options: ['claude', 'kilocode'] };
  const result = await runOmsInstallProcess([], { plan: selectionPlan });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /claude.*kilocode.*--tool/s);
  assert.deepEqual(result.calls, [{ tool: null, dryRun: true }]);
});

test('selectHost changes the active option with the down arrow and restores the terminal', async () => {
  const input = new PassThrough();
  const output = { value: '', write(chunk) { this.value += chunk; } };
  const rawModes = [];
  input.isTTY = true;
  input.setRawMode = (enabled) => rawModes.push(enabled);

  const selected = selectHost([
    { id: 'claude', display_name: 'Claude Code' },
    { id: 'kilocode', display_name: 'KiloCode' },
  ], { input, output });
  input.write('\x1b[B');
  input.write('\r');

  assert.equal(await selected, 'kilocode');
  assert.deepEqual(rawModes, [true, false]);
  assert.match(output.value, /Claude Code/);
  assert.match(output.value, /KiloCode/);
  assert.match(output.value, /\x1b\[\?25h/);
});

test('selectHost cancels on Ctrl-C and restores the terminal', async () => {
  const input = new PassThrough();
  const output = { write() {} };
  const rawModes = [];
  input.isTTY = true;
  input.setRawMode = (enabled) => rawModes.push(enabled);

  const selected = selectHost([{ id: 'claude', display_name: 'Claude Code' }], { input, output });
  input.write('\u0003');

  assert.equal(await selected, null);
  assert.deepEqual(rawModes, [true, false]);
});

test('TTY selection rebuilds a single-host plan before confirmation', async () => {
  const calls = [];
  const stderr = { value: '', write(chunk) { this.value += chunk; } };
  const initialPlan = {
    ...PLAN,
    selection_required: true,
    selection_options: ['claude', 'kilocode'],
    selection_candidates: [
      { id: 'claude', display_name: 'Claude Code' },
      { id: 'kilocode', display_name: 'KiloCode' },
    ],
  };
  const selectedPlan = { ...PLAN, hosts: [{ ...PLAN.hosts[0], id: 'kilocode' }] };

  const exitCode = await runOmsInstall([], {
    mainFn: async (options) => {
      calls.push(options);
      return calls.length === 1 ? initialPlan : selectedPlan;
    },
    isInteractiveFn: () => true,
    selectHostFn: async () => 'kilocode',
    confirmFn: async () => true,
    stderr,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    { tool: null, dryRun: true },
    { tool: 'kilocode', dryRun: true },
    { tool: 'kilocode', plan: selectedPlan },
  ]);
});

test('non-TTY multi-host selection remains non-interactive', async () => {
  const calls = [];
  const stderr = { write() {} };
  const selectionPlan = { ...PLAN, selection_required: true, selection_options: ['claude', 'kilocode'] };

  const exitCode = await runOmsInstall([], {
    mainFn: async (options) => {
      calls.push(options);
      return selectionPlan;
    },
    isInteractiveFn: () => false,
    stderr,
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(calls, [{ tool: null, dryRun: true }]);
});

test('--yes multi-host selection remains non-interactive in a TTY', async () => {
  const calls = [];
  const stderr = { write() {} };
  const selectionPlan = { ...PLAN, selection_required: true, selection_options: ['claude', 'kilocode'] };

  const exitCode = await runOmsInstall(['-y'], {
    mainFn: async (options) => {
      calls.push(options);
      return selectionPlan;
    },
    isInteractiveFn: () => true,
    selectHostFn: async () => assert.fail('the host menu must not run with --yes'),
    stderr,
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(calls, [{ tool: null, dryRun: true }]);
});

test('normal install writes the installer banner to stderr', async () => {
  const stderr = { value: '', write(chunk) { this.value += chunk; } };

  await runOmsInstall(['--tool', 'kilocode', '-y'], {
    mainFn: async () => PLAN,
    stderr,
  });

  assert.match(stderr.value, /oh-my-sdd/);
  assert.match(stderr.value, /Installation plan/);
});

test('JSON install keeps stdout parseable and writes its banner to stderr', async () => {
  const stdout = { value: '', write(chunk) { this.value += chunk; } };
  const stderr = { value: '', write(chunk) { this.value += chunk; } };

  await runOmsInstall(['--tool', 'kilocode', '--dry-run', '--json'], {
    mainFn: async () => PLAN,
    stdout,
    stderr,
  });

  assert.deepEqual(JSON.parse(stdout.value), { type: 'installation-plan', plan: PLAN });
  assert.doesNotMatch(stdout.value, /____/);
  assert.match(stderr.value, /oh-my-sdd/);
});

test('interactive install renders its plan and stops when confirmation is rejected', async () => {
  const result = await runOmsInstallProcess(['--tool', 'kilocode'], { input: 'n\n' });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Installation plan/);
  assert.match(result.stderr, /取消/);
  assert.deepEqual(result.calls, [{ tool: 'kilocode', dryRun: true }]);
});

test('interactive install applies the exact plan that was confirmed', async () => {
  const calls = [];
  const stderr = { write() {} };
  const plan = { ...PLAN, hosts: [...PLAN.hosts] };

  const exitCode = await runOmsInstall(['--tool', 'kilocode'], {
    mainFn: async (options) => {
      calls.push(options);
      return plan;
    },
    confirmFn: async () => true,
    stderr,
  });

  assert.equal(exitCode, 0);
  assert.equal(calls[0].dryRun, true);
  assert.strictEqual(calls[1].plan, plan);
});

test('install with -y flag applies the plan without interactive confirmation', async () => {
  const calls = [];
  const stderr = { write() {} };
  const plan = { ...PLAN, hosts: [...PLAN.hosts] };

  const exitCode = await runOmsInstall(['--tool', 'kilocode', '-y'], {
    mainFn: async (options) => {
      calls.push(options);
      return plan;
    },
    confirmFn: async () => {
      throw new Error('confirmFn should not be called when -y is provided');
    },
    stderr,
  });

  assert.equal(exitCode, 0);
  assert.equal(calls[0].dryRun, true);
  assert.strictEqual(calls[1].plan, plan);
});

test('npm bin symlink invokes oms-install help', { skip: process.platform === 'win32' }, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'oms-install-symlink-'));
  const symlinkPath = path.join(tempDir, 'oms-install');

  try {
    await symlink(CLI, symlinkPath);
    const result = await runProcess(symlinkPath, ['--help']);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /oms-install/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
