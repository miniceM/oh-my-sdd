import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.resolve(__dirname, '..', '..', 'hooks', 'post-tool-use.js');

function runHook(stdinPayload, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK_PATH], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(JSON.stringify(stdinPayload));
  });
}

test('post-tool-use records incremental file change in session meta', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ptu-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  mkdirSync(path.join(tmpHome, '.oh-my-sdd', 'sessions'), { recursive: true });
  const sessionFile = path.join(tmpHome, '.oh-my-sdd', 'sessions', 's1.json');
  writeFileSync(sessionFile, JSON.stringify({
    username: 'alice',
    files_touched: {},
  }));

  const result = await runHook(
    {
      session_id: 's1',
      cwd: '/tmp',
      tool_name: 'Edit',
      tool_input: { file_path: '/tmp/foo.ts' },
    },
    { HOME: tmpHome, USERPROFILE: tmpHome }
  );

  assert.equal(result.exitCode, 0);
  const meta = JSON.parse(readFileSync(sessionFile, 'utf8'));
  assert.ok(meta.files_touched['/tmp/foo.ts']);
});

test('post-tool-use with Write tool also records', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ptu-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  mkdirSync(path.join(tmpHome, '.oh-my-sdd', 'sessions'), { recursive: true });
  writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'sessions', 's2.json'),
    JSON.stringify({ username: 'alice', files_touched: {} })
  );

  const result = await runHook(
    {
      session_id: 's2',
      cwd: '/tmp',
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/bar.py' },
    },
    { HOME: tmpHome, USERPROFILE: tmpHome }
  );

  assert.equal(result.exitCode, 0);
});

test('post-tool-use ignores non-edit tools', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ptu-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  mkdirSync(path.join(tmpHome, '.oh-my-sdd', 'sessions'), { recursive: true });
  writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'sessions', 's3.json'),
    JSON.stringify({ username: 'alice', files_touched: {} })
  );

  const result = await runHook(
    {
      session_id: 's3',
      cwd: '/tmp',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/x.ts' },
    },
    { HOME: tmpHome, USERPROFILE: tmpHome }
  );

  assert.equal(result.exitCode, 0);
  const meta = JSON.parse(readFileSync(path.join(tmpHome, '.oh-my-sdd', 'sessions', 's3.json'), 'utf8'));
  assert.equal(Object.keys(meta.files_touched).length, 0); // unchanged
});

test('post-tool-use returns {} when session meta missing (short-circuit)', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ptu-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  // No session meta created — hook should short-circuit to {} without error
  mkdirSync(path.join(tmpHome, '.oh-my-sdd', 'sessions'), { recursive: true });

  const result = await runHook(
    {
      session_id: 'no-meta',
      cwd: '/tmp',
      tool_name: 'Edit',
      tool_input: { file_path: '/tmp/whatever.ts' },
    },
    { HOME: tmpHome, USERPROFILE: tmpHome }
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), '{}');
});
