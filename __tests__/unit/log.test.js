import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('info writes a line to today log', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-log-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;

  const { info } = await import('../../hooks/lib/log.js?' + Date.now());
  await info('hello world');

  const today = new Date().toISOString().slice(0, 10);
  const logFile = path.join(tmpHome, '.oh-my-sdd', 'logs', `${today}.log`);
  assert.ok(existsSync(logFile));
  const content = readFileSync(logFile, 'utf8');
  assert.match(content, /INFO.*hello world/);
});

test('error writes to stderr and log file', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-log-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;

  const { error } = await import('../../hooks/lib/log.js?' + Date.now());
  // Capture stderr
  const original = process.stderr.write;
  let captured = '';
  process.stderr.write = (s) => { captured += s; return true; };
  try {
    await error('boom');
  } finally {
    process.stderr.write = original;
  }
  assert.match(captured, /boom/);
});
