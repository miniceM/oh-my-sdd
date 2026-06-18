import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.resolve(__dirname, '..', '..', 'hooks', 'session-end.js');

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

test('session.end reports code_delta based on saved start_sha', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-se-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));

  // Stub DOP server
  const dopReceived = [];
  const dopServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      dopReceived.push(JSON.parse(body || '{}'));
      res.writeHead(200); res.end('{"ok":true}');
    });
  });
  await new Promise((r) => dopServer.listen(0, r));
  const dopPort = dopServer.address().port;
  t.after(() => new Promise((r) => dopServer.close(r)));

  // Setup git repo with a commit
  const repo = mkdtempSync(path.join(tmpdir(), 'oms-repo-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const { execSync } = await import('node:child_process');
  execSync('git init -b main && git config user.email t@t && git config user.name t', { cwd: repo });
  writeFileSync(path.join(repo, 'a.ts'), 'const a = 1;\n');
  execSync('git add . && git commit -m init', { cwd: repo });
  const startSha = execSync('git rev-parse HEAD', { cwd: repo }).toString().trim();
  writeFileSync(path.join(repo, 'a.ts'), 'const a = 1;\nconst b = 2;\n');
  execSync('git add . && git commit -m add', { cwd: repo });

  // Pre-write session meta (as if session-start had run)
  mkdirSync(path.join(tmpHome, '.oh-my-sdd', 'sessions'), { recursive: true });
  writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'sessions', 'sess-1.json'),
    JSON.stringify({ start_sha: startSha, username: 'alice' })
  );

  // Write config with DOP endpoint
  mkdirSync(path.join(tmpHome, '.oh-my-sdd'), { recursive: true });
  writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'config.json'),
    JSON.stringify({ dop_endpoint: `http://localhost:${dopPort}`, aih_system_name: 'sdd', telemetry_disabled: false })
  );

  const result = await runHook(
    { session_id: 'sess-1', cwd: repo },
    { HOME: tmpHome, USERPROFILE: tmpHome, CLAUDE_PLUGIN_ROOT: path.resolve(__dirname, '..', '..') }
  );

  assert.equal(result.exitCode, 0);
  assert.equal(dopReceived.length, 1);
  assert.equal(dopReceived[0].event, 'session.end');
  assert.equal(dopReceived[0].code_delta.files_changed, 1);
  assert.equal(dopReceived[0].code_delta.by_lang.ts, 1);
});

test('session.end without saved meta still exits 0', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-se-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  const result = await runHook(
    { session_id: 'never-started', cwd: '/tmp' },
    { HOME: tmpHome, USERPROFILE: tmpHome, CLAUDE_PLUGIN_ROOT: path.resolve(__dirname, '..', '..') }
  );
  assert.equal(result.exitCode, 0);
});
