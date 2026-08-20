import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runOmsInstall } from '../../../bin/oms-install.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = path.join(ROOT, 'bin', 'oms-install.js');

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
    "  if (specifier === '../install/main.js' && context.parentURL.endsWith('/bin/oms-install.js')) {",
    `    return { url: 'data:text/javascript;base64,${Buffer.from(mockedMain).toString('base64')}', shortCircuit: true };`,
    '  }',
    '  return nextResolve(specifier, context);',
    '}',
  ].join('\n'));

  try {
    const result = await runProcess(process.execPath, ['--experimental-loader', loaderPath, CLI, ...args], {
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
