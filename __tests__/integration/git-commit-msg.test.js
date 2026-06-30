import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const COMMIT_MSG_CHECK = path.join(PROJECT_ROOT, 'hooks', 'git', 'commit-msg-check.js');

// 调用 commit-msg-check.js 并传入临时消息文件路径作为 $1
function runCommitMsg(message, env = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-msgcheck-'));
  const msgPath = path.join(dir, 'COMMIT_EDITMSG');
  writeFileSync(msgPath, message);
  return new Promise((resolve) => {
    const child = spawn('node', [COMMIT_MSG_CHECK, msgPath], {
      cwd: dir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (exitCode) => {
      rmSync(dir, { recursive: true, force: true });
      resolve({ exitCode, stdout, stderr });
    });
  });
}

test('commit-msg: 正确格式通过', async () => {
  const result = await runCommitMsg('[PROJ123] feat: add health check\n');
  assert.equal(result.exitCode, 0);
});

test('commit-msg: SDD type 通过', async () => {
  const result = await runCommitMsg('[SDD456] spec: ring 1 freeze\n');
  assert.equal(result.exitCode, 0);
});

test('commit-msg: 所有合法 type 通过', async () => {
  const types = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'spec', 'plan', 'task', 'review'];
  for (const type of types) {
    const result = await runCommitMsg(`[AB12] ${type}: subject\n`);
    assert.equal(result.exitCode, 0, `type=${type} 应通过`);
  }
});

test('commit-msg: 无 change-id 阻断', async () => {
  const result = await runCommitMsg('feat: add health check\n');
  assert.equal(result.exitCode, 1);
  assert.ok(result.stderr.includes('commit-msg-format'));
});

test('commit-msg: 无 type 阻断', async () => {
  const result = await runCommitMsg('[PROJ123] add health check\n');
  assert.equal(result.exitCode, 1);
});

test('commit-msg: 非法 type 阻断', async () => {
  const result = await runCommitMsg('[PROJ123] bug: fix something\n');
  assert.equal(result.exitCode, 1);
  assert.ok(result.stderr.includes('commit-msg-format'));
});

test('commit-msg: change-id 格式错误阻断', async () => {
  // change-id 应为 ^[A-Z]{2,6}\d+$，123-PROJ 不符合
  const result = await runCommitMsg('[123-PROJ] feat: test\n');
  assert.equal(result.exitCode, 1);
});

test('commit-msg: 空 commit body 阻断', async () => {
  const result = await runCommitMsg('\n');
  assert.equal(result.exitCode, 1);
});

test('commit-msg: [OVERRIDE] 绕过格式校验', async () => {
  const msg = 'feat: no change id here\n\n[OVERRIDE] commit-msg-format: 紧急 hotfix\n';
  const result = await runCommitMsg(msg);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stderr.includes('OVERRIDE'));
});

test('commit-msg: merge commit 放行', async () => {
  const result = await runCommitMsg('Merge branch "feature" into main\n');
  assert.equal(result.exitCode, 0);
});

test('commit-msg: revert commit 放行', async () => {
  const result = await runCommitMsg('Revert "[PROJ123] feat: add feature"\n\nThis reverts commit abc123.\n');
  assert.equal(result.exitCode, 0);
});

test('commit-msg: 注释行被剥离（带模板的文件）', async () => {
  const msg = `# oh-my-sdd: commit template
# 必选格式: [<change-id>] <type>: <subject>
#
[PROJ123] feat: real message
`;
  const result = await runCommitMsg(msg);
  assert.equal(result.exitCode, 0);
});

test('commit-msg: 无 $1 参数放行', async () => {
  // 模拟无参数调用，应不阻断
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-noarg-'));
  try {
    const result = await new Promise((resolve) => {
      const child = spawn('node', [COMMIT_MSG_CHECK], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('close', (exitCode) => resolve({ exitCode, stderr }));
    });
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});