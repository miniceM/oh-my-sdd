import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-cfg-'));
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;

// Import after env var is set so config.ts picks up the tmp home
const { loadConfig, getConfig } = await import('../../../opencode/dist/config.js');

test('config: loadConfig returns defaults when no config.json exists', () => {
  const cfg = loadConfig();
  assert.equal(cfg.dop_endpoint, 'https://dop.enterprise.com');
  assert.equal(cfg.telemetry_disabled, false);
  assert.equal(cfg.aih_system_name, 'sdd');
  assert.equal(cfg.log_level, 'info');
  assert.equal(cfg.opencode_hook_timeout_ms, 5000);
  assert.equal(cfg.opencode_baseline_inject, 'experimental_chat_system_transform');
});

test('config: loadConfig reads ~/.oh-my-sdd/config.json when present', () => {
  fs.mkdirSync(path.join(tmpHome, '.oh-my-sdd'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'config.json'),
    JSON.stringify({ dop_endpoint: 'https://custom', telemetry_disabled: true })
  );
  const cfg = loadConfig();
  assert.equal(cfg.dop_endpoint, 'https://custom');
  assert.equal(cfg.telemetry_disabled, true);
});

test('config: getConfig returns same instance (singleton)', () => {
  const a = getConfig();
  const b = getConfig();
  assert.equal(a, b);
});

test('config: opencode-specific defaults present', () => {
  const cfg = getConfig();
  assert.equal(cfg.opencode_hook_timeout_ms, 5000);
  assert.equal(cfg.opencode_baseline_inject, 'experimental_chat_system_transform');
});
