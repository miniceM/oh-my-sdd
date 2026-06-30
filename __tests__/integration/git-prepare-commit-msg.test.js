import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PREPARE_MSG_CHECK = path.join(PROJECT_ROOT, 'hooks', 'git', 'prepare-commit-msg-check.js');

const MARKER = '# oh-my-sdd: commit template';

// 调用 prepare-commit-msg-check.js，参数 $1=msgFile $2=source
function runPrepareMsg(initialContent, source = '', env = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-prepmsg-'));
  const msgPath = path.join(dir, 'COMMIT_EDITMSG');
  if (initialContent !== null) {
    writeFileSync(msgPath, initialContent);
  }
  return new Promise((resolve) => {
    const args = source ? [PREPARE_MSG_CHECK, msgPath, source] : [PREPARE_MSG_CHECK, msgPath];
    const child = spawn('node', args, {
      cwd: dir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (exitCode) => {
      let content = '';
      try {
        content = readFileSync(msgPath, 'utf8');
      } catch {
        content = '';
      }
      rmSync(dir, { recursive: true, force: true });
      resolve({ exitCode, stdout, stderr, content });
    });
  });
}

test('prepare-commit-msg: 空 source 注入模板', async () => {
  const result = await runPrepareMsg('');
  assert.equal(result.exitCode, 0);
  assert.ok(result.content.includes(MARKER), 'must inject template marker');
  assert.ok(result.content.includes('[<change-id>] <type>: <subject>'));
});

test('prepare-commit-msg: source=template 注入模板', async () => {
  const result = await runPrepareMsg('', 'template');
  assert.equal(result.exitCode, 0);
  assert.ok(result.content.includes(MARKER));
});

test('prepare-commit-msg: source=message 跳过（git commit -m）', async () => {
  const initial = 'existing message\n';
  const result = await runPrepareMsg(initial, 'message');
  assert.equal(result.exitCode, 0);
  assert.equal(result.content, initial, 'must not modify on -m');
});

test('prepare-commit-msg: source=merge 跳过', async () => {
  const initial = 'Merge branch feature\n';
  const result = await runPrepareMsg(initial, 'merge');
  assert.equal(result.exitCode, 0);
  assert.equal(result.content, initial);
});

test('prepare-commit-msg: source=squash 跳过', async () => {
  const initial = 'squash message\n';
  const result = await runPrepareMsg(initial, 'squash');
  assert.equal(result.exitCode, 0);
  assert.equal(result.content, initial);
});

test('prepare-commit-msg: source=commit 跳过（amend）', async () => {
  const initial = 'amend message\n';
  const result = await runPrepareMsg(initial, 'commit');
  assert.equal(result.exitCode, 0);
  assert.equal(result.content, initial);
});

test('prepare-commit-msg: 幂等，已注入 marker 跳过', async () => {
  const initial = `${MARKER}\n# 已有模板\n[PROJ123] feat: existing\n`;
  const result = await runPrepareMsg(initial);
  assert.equal(result.exitCode, 0);
  assert.equal(result.content, initial, 'must not re-inject');
});

test('prepare-commit-msg: 保留现有消息内容', async () => {
  const initial = '[PROJ123] feat: existing\n';
  const result = await runPrepareMsg(initial);
  assert.equal(result.exitCode, 0);
  assert.ok(result.content.includes('[PROJ123] feat: existing'), 'must preserve existing content');
});

test('prepare-commit-msg: 无 $1 参数放行', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-prepmsg-noarg-'));
  try {
    const result = await new Promise((resolve) => {
      const child = spawn('node', [PREPARE_MSG_CHECK], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('close', (exitCode) => resolve({ exitCode, stderr }));
    });
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prepare-commit-msg: 模板含 [OVERRIDE] 语法说明', async () => {
  const result = await runPrepareMsg('');
  assert.ok(result.content.includes('[OVERRIDE]'), 'template must mention override syntax');
});

test('prepare-commit-msg: 模板含所有合法 type', async () => {
  const result = await runPrepareMsg('');
  assert.ok(result.content.includes('feat|fix|docs|refactor|test|chore|spec|plan|task|review'));
});