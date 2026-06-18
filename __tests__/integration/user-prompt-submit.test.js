import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.resolve(__dirname, '..', '..', 'hooks', 'user-prompt-submit.js');

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
    child.stdin.end(typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload));
  });
}

test('slash.invoked event emitted when prompt contains <command-name>', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ups-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));

  const dopReceived = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      dopReceived.push(JSON.parse(body || '{}'));
      res.writeHead(200); res.end('{"ok":true}');
    });
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  t.after(() => new Promise((r) => server.close(r)));

  mkdirSync(path.join(tmpHome, '.oh-my-sdd'), { recursive: true });
  writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'config.json'),
    JSON.stringify({ dop_endpoint: `http://localhost:${port}`, aih_system_name: 'sdd', telemetry_disabled: false })
  );
  // Pre-write session meta
  mkdirSync(path.join(tmpHome, '.oh-my-sdd', 'sessions'), { recursive: true });
  writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'sessions', 's1.json'),
    JSON.stringify({ username: 'alice', slash_commands: [] })
  );

  const result = await runHook(
    {
      session_id: 's1',
      cwd: '/tmp',
      prompt: 'do something\n<command-name>sdd-plan</command-name>\n<command-args>feature-x</command-args>'
    },
    { HOME: tmpHome, USERPROFILE: tmpHome }
  );

  assert.equal(result.exitCode, 0);
  assert.equal(dopReceived.length, 1);
  assert.equal(dopReceived[0].event, 'slash.invoked');
  assert.equal(dopReceived[0].command, 'sdd-plan');
  assert.equal(dopReceived[0].args, 'feature-x');

  // Verify session meta updated with slash command
  const updated = JSON.parse(readFileSync(path.join(tmpHome, '.oh-my-sdd', 'sessions', 's1.json'), 'utf8'));
  assert.deepEqual(updated.slash_commands, ['sdd-plan']);
});

test('no event when prompt has no command tag', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ups-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));

  const dopReceived = [];
  const server = createServer((req, res) => {
    dopReceived.push({});
    res.writeHead(200); res.end();
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  t.after(() => new Promise((r) => server.close(r)));

  mkdirSync(path.join(tmpHome, '.oh-my-sdd', 'sessions'), { recursive: true });
  writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'sessions', 's2.json'),
    JSON.stringify({ username: 'alice', slash_commands: [] })
  );
  mkdirSync(path.join(tmpHome, '.oh-my-sdd'), { recursive: true });
  writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'config.json'),
    JSON.stringify({ dop_endpoint: `http://localhost:${port}`, aih_system_name: 'sdd', telemetry_disabled: false })
  );

  const result = await runHook(
    { session_id: 's2', cwd: '/tmp', prompt: 'just a normal question' },
    { HOME: tmpHome, USERPROFILE: tmpHome }
  );

  assert.equal(result.exitCode, 0);
  assert.equal(dopReceived.length, 0);
});

test('no crash when session meta missing', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-ups-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  const result = await runHook(
    { session_id: 'no-such', cwd: '/tmp', prompt: '<command-name>sdd-spec</command-name>' },
    { HOME: tmpHome, USERPROFILE: tmpHome }
  );
  assert.equal(result.exitCode, 0);
});
