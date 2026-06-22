import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('DEFAULT_CONFIG has required keys', async () => {
  const { DEFAULT_CONFIG } = await import('../../hooks/lib/config.js');
  assert.ok(DEFAULT_CONFIG.dop_endpoint);
  // 2026-06-22 改造：aih_system_name 替换为 required_systems（devops+gitee 都必须登）
  assert.ok('required_systems' in DEFAULT_CONFIG);
  assert.equal(DEFAULT_CONFIG.required_systems, 2);
  assert.equal(DEFAULT_CONFIG.telemetry_disabled, false);
});

test('loadConfig returns defaults when file missing', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-cfg-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;

  const { loadConfig, DEFAULT_CONFIG } = await import('../../hooks/lib/config.js?' + Date.now());
  const cfg = await loadConfig();
  assert.deepEqual(cfg, DEFAULT_CONFIG);
});

test('saveConfig writes file and loadConfig reads it back', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-cfg-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;

  const mod = await import('../../hooks/lib/config.js?' + Date.now());
  await mod.saveConfig({ telemetry_disabled: true });
  const cfg = await mod.loadConfig();
  assert.equal(cfg.telemetry_disabled, true);
});
