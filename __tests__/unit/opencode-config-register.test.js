// Tests for opencode.json plugin registration (install-opencode.js).
//
// Background: opencode.json 的 plugin 数组是 OpenCode 唯一加载插件的地方。
// 仅复制 plugin.js 到 plugins/ 目录不生效。install / uninstall 必须维护这个数组。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const INSTALL_MODULE = '/Users/hosea/work/git/oh-my-sdd/hooks/lib/install-opencode.js';

// 在临时目录模拟用户 HOME；用 ?import 强制每次重载（清掉模块级常量缓存）
async function loadModuleWithHome(homeDir) {
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir; // Windows fallback
  // 清掉之前缓存，否则常量已固化
  const cacheBust = `?t=${Date.now()}-${Math.random()}`;
  return import(pathToFileURL(INSTALL_MODULE).href + cacheBust);
}

function announce(msg) { /* swallow */ }

function setupFakeHome() {
  const home = mkdtempSync(join(tmpdir(), 'oms-opencode-cfg-'));
  const configDir = join(home, '.config', 'opencode');
  mkdirSync(configDir, { recursive: true });
  const pluginDest = join(configDir, 'plugins', 'oh-my-sdd');
  mkdirSync(pluginDest, { recursive: true });
  return { home, configDir, pluginDest };
}

test('registerOpenCodePlugin creates opencode.json with plugin entry when none exists', async () => {
  const { home, configDir } = setupFakeHome();
  try {
    const mod = await loadModuleWithHome(home);
    const changed = await mod.registerOpenCodePlugin(announce);
    assert.equal(changed, true);
    const cfgPath = join(configDir, 'opencode.json');
    assert.ok(existsSync(cfgPath), 'opencode.json should be created');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    assert.ok(Array.isArray(cfg.plugin), 'plugin field should be an array');
    assert.ok(cfg.plugin.some((p) => p.includes('oh-my-sdd') && p.endsWith('plugin.js')),
      'plugin array should contain oh-my-sdd entry');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('registerOpenCodePlugin is idempotent — second call returns false and does not duplicate', async () => {
  const { home, configDir } = setupFakeHome();
  try {
    const mod = await loadModuleWithHome(home);
    await mod.registerOpenCodePlugin(announce);
    const cfgPath = join(configDir, 'opencode.json');
    const before = JSON.parse(readFileSync(cfgPath, 'utf8')).plugin.length;
    const second = await mod.registerOpenCodePlugin(announce);
    assert.equal(second, false, 'second call should report no change');
    const after = JSON.parse(readFileSync(cfgPath, 'utf8')).plugin.length;
    assert.equal(after, before, 'plugin array length should be unchanged');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('registerOpenCodePlugin preserves existing user plugins', async () => {
  const { home, configDir } = setupFakeHome();
  try {
    const cfgPath = join(configDir, 'opencode.json');
    writeFileSync(cfgPath, JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      mcp: { 'some-mcp': { type: 'local', command: ['x'] } },
      plugin: ['@warp-dot-dev/opencode-warp@0.1.5', 'oh-my-openagent@latest'],
    }, null, 2) + '\n');
    const mod = await loadModuleWithHome(home);
    const changed = await mod.registerOpenCodePlugin(announce);
    assert.equal(changed, true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    assert.ok(cfg.plugin.includes('@warp-dot-dev/opencode-warp@0.1.5'),
      'existing user plugin must be preserved');
    assert.ok(cfg.plugin.includes('oh-my-openagent@latest'),
      'existing user plugin must be preserved');
    const omsEntries = cfg.plugin.filter((p) => p.includes('oh-my-sdd'));
    assert.equal(omsEntries.length, 1, 'exactly one oh-my-sdd entry should be added');
    // MCP and other config preserved
    assert.deepEqual(cfg.mcp, { 'some-mcp': { type: 'local', command: ['x'] } });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('registerOpenCodePlugin picks dist/ entry when both layouts exist (newer install wins)', async () => {
  const { home, configDir, pluginDest } = setupFakeHome();
  try {
    // Simulate both layouts present (e.g. after a legacy install then new install)
    mkdirSync(join(pluginDest, 'dist'), { recursive: true });
    writeFileSync(join(pluginDest, 'plugin.js'), '// legacy top-level');
    writeFileSync(join(pluginDest, 'dist', 'plugin.js'), '// new dist layout');
    const mod = await loadModuleWithHome(home);
    await mod.registerOpenCodePlugin(announce);
    const cfg = JSON.parse(readFileSync(join(configDir, 'opencode.json'), 'utf8'));
    const oms = cfg.plugin.filter((p) => p.includes('oh-my-sdd'));
    assert.equal(oms.length, 1);
    assert.ok(oms[0].endsWith('/dist/plugin.js'),
      'when dist/ exists, register dist/ entry (current install behavior)');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('registerOpenCodePlugin falls back to top-level entry when only legacy layout present', async () => {
  const { home, configDir, pluginDest } = setupFakeHome();
  try {
    // Only top-level (legacy install), no dist/ subdir
    writeFileSync(join(pluginDest, 'plugin.js'), '// legacy');
    const mod = await loadModuleWithHome(home);
    await mod.registerOpenCodePlugin(announce);
    const cfg = JSON.parse(readFileSync(join(configDir, 'opencode.json'), 'utf8'));
    const oms = cfg.plugin.filter((p) => p.includes('oh-my-sdd'));
    assert.equal(oms.length, 1);
    assert.equal(oms[0], './plugins/oh-my-sdd/plugin.js',
      'with no dist/, register legacy top-level entry');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('registerOpenCodePlugin backs up corrupt JSON and creates fresh config', async () => {
  const { home, configDir } = setupFakeHome();
  try {
    const cfgPath = join(configDir, 'opencode.json');
    writeFileSync(cfgPath, '{ this is not json');
    const mod = await loadModuleWithHome(home);
    await mod.registerOpenCodePlugin(announce);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    assert.ok(Array.isArray(cfg.plugin), 'should rebuild as array');
    // .bak-* backup should exist
    const { readdirSync } = await import('node:fs');
    const bak = readdirSync(configDir).filter((f) => f.startsWith('opencode.json.bak-'));
    assert.ok(bak.length >= 1, 'corrupt JSON should be backed up with .bak- prefix');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('registerOpenCodePlugin leaves non-array plugin field untouched (preserves user config)', async () => {
  const { home, configDir } = setupFakeHome();
  try {
    const cfgPath = join(configDir, 'opencode.json');
    const weird = { plugin: { 'custom-key': 'custom-value' } };
    writeFileSync(cfgPath, JSON.stringify(weird, null, 2) + '\n');
    const mod = await loadModuleWithHome(home);
    const changed = await mod.registerOpenCodePlugin(announce);
    assert.equal(changed, false, 'should refuse to clobber non-array plugin field');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    assert.deepEqual(cfg.plugin, weird.plugin, 'plugin field should be unchanged');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('unregisterOpenCodePlugin removes oh-my-sdd entries and preserves others', async () => {
  const { home, configDir } = setupFakeHome();
  try {
    const cfgPath = join(configDir, 'opencode.json');
    writeFileSync(cfgPath, JSON.stringify({
      plugin: [
        '@warp-dot-dev/opencode-warp@0.1.5',
        './plugins/oh-my-sdd/dist/plugin.js',
        './plugins/oh-my-sdd/plugin.js',  // legacy entry from old install
        'oh-my-openagent@latest',
      ],
    }, null, 2) + '\n');
    const mod = await loadModuleWithHome(home);
    const changed = await mod.unregisterOpenCodePlugin(announce);
    assert.equal(changed, true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    assert.equal(cfg.plugin.length, 2);
    assert.ok(cfg.plugin.includes('@warp-dot-dev/opencode-warp@0.1.5'));
    assert.ok(cfg.plugin.includes('oh-my-openagent@latest'));
    assert.ok(!cfg.plugin.some((p) => p.includes('oh-my-sdd')),
      'no oh-my-sdd entries should remain');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('unregisterOpenCodePlugin deletes empty plugin array (keeps JSON clean)', async () => {
  const { home, configDir } = setupFakeHome();
  try {
    const cfgPath = join(configDir, 'opencode.json');
    writeFileSync(cfgPath, JSON.stringify({
      mcp: { x: { type: 'local', command: ['y'] } },
      plugin: ['./plugins/oh-my-sdd/dist/plugin.js'],
    }, null, 2) + '\n');
    const mod = await loadModuleWithHome(home);
    await mod.unregisterOpenCodePlugin(announce);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    assert.equal(cfg.plugin, undefined, 'plugin key should be removed when array becomes empty');
    assert.deepEqual(cfg.mcp, { x: { type: 'local', command: ['y'] } },
      'other config should be preserved');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('unregisterOpenCodePlugin is no-op when no oh-my-sdd entry exists', async () => {
  const { home, configDir } = setupFakeHome();
  try {
    const cfgPath = join(configDir, 'opencode.json');
    writeFileSync(cfgPath, JSON.stringify({
      plugin: ['oh-my-openagent@latest'],
    }, null, 2) + '\n');
    const mod = await loadModuleWithHome(home);
    const changed = await mod.unregisterOpenCodePlugin(announce);
    assert.equal(changed, false, 'should report no change');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    assert.deepEqual(cfg.plugin, ['oh-my-openagent@latest'],
      'user plugin array should be untouched');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('installForOpenCode wires registerOpenCodePlugin into main flow', async () => {
  const { home, configDir } = setupFakeHome();
  try {
    const mod = await loadModuleWithHome(home);
    // We can't run full installForOpenCode (needs real skills + dist/) — instead
    // verify the function source contains the call, to guard against future refactors
    // that drop the registration.
    const { readFileSync: rfs } = await import('node:fs');
    const src = rfs(INSTALL_MODULE, 'utf8');
    assert.match(src, /installOpenCodePluginToHome[\s\S]*?registerOpenCodePlugin/,
      'installForOpenCode must call registerOpenCodePlugin after installOpenCodePluginToHome');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
