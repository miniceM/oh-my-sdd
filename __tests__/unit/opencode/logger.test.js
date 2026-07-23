import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 保存原始 env（测试结束时恢复）
const ORIGINAL_LOG_FILE = process.env.OMS_LOG_FILE;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-logger-'));
process.env.OMS_LOG_FILE = path.join(tmpDir, 'test.log');

// Import after env var is set so log() reads it
const { log, _resetForTest } = await import('../../../opencode/dist/logger.js');

test('logger: log() writes one JSON line per call', () => {
  _resetForTest();
  log('info', 'first event', { sessionId: 's1' });
  log('error', 'second event', { sessionId: 's2' });
  const content = fs.readFileSync(process.env.OMS_LOG_FILE, 'utf8');
  const lines = content.trim().split('\n');
  assert.equal(lines.length, 2);
  const e1 = JSON.parse(lines[0]);
  assert.equal(e1.level, 'info');
  assert.equal(e1.msg, 'first event');
  assert.equal(e1.sessionId, 's1');
  assert.ok(e1.ts > 0);
});

test('logger: never writes to stdout', () => {
  _resetForTest();
  const orig = process.stdout.write.bind(process.stdout);
  let written = '';
  process.stdout.write = (chunk) => { written += chunk.toString(); return true; };
  try {
    log('warn', 'should not appear on stdout');
  } finally {
    process.stdout.write = orig;
  }
  assert.equal(written, '', 'logger should not write to stdout');
});

test('logger: redacts sensitive fields in payload', () => {
  _resetForTest();
  log('info', 'test', { password: 'AKIAIOSFODNN7EXAMPLE', safe: 'ok' });
  const content = fs.readFileSync(process.env.OMS_LOG_FILE, 'utf8');
  assert.ok(!content.includes('AKIAIOSFODNN7EXAMPLE'), 'should not log secret');
  assert.ok(content.includes('"safe":"ok"'));
});

test('logger: redacts AK in msg field as well (not just payload)', () => {
  _resetForTest();
  log('info', 'key AKIAIOSFODNN7EXAMPLE in message');
  const content = fs.readFileSync(process.env.OMS_LOG_FILE, 'utf8');
  assert.ok(!content.includes('AKIAIOSFODNN7EXAMPLE'), 'msg field should also be sanitized');
  assert.ok(content.includes('AKIA[REDACTED]'), 'sanitized AK should appear');
});

test('logger: redacts filePath hash (not path) for path payloads', () => {
  _resetForTest();
  log('info', 'tool call', { filePath: '/Users/alice/secrets/aws.env', tool: 'edit' });
  const content = fs.readFileSync(process.env.OMS_LOG_FILE, 'utf8');
  assert.ok(!content.includes('/Users/alice'), 'should not log full path');
  assert.ok(content.includes('"tool":"edit"'));
  assert.ok(/_filePathHash/.test(content), 'should have _filePathHash field');
});

// 测试结束清理：恢复 env + 删 temp 目录
process.on('exit', () => {
  if (ORIGINAL_LOG_FILE === undefined) delete process.env.OMS_LOG_FILE;
  else process.env.OMS_LOG_FILE = ORIGINAL_LOG_FILE;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});