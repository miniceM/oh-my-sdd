import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  resourceDigest,
  writeOwnershipManifest,
} from '../../../opencode/scripts/resource-ownership.mjs';

const worktreeRoot = process.cwd();

test('install + uninstall: oms-install/uninstall --tool opencode round-trip', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-install-'));
  const env = { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome };

  // Step 1: install (use CLI wrapper which parses --tool)
  execFileSync('node', ['bin/oms-install.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env,
    stdio: 'pipe',
  });
  const pluginDir = path.join(tmpHome, '.config', 'opencode', 'plugins', 'oh-my-sdd');
  assert.ok(!fs.existsSync(pluginDir), 'production install should not copy a local development plugin');
  const cfgPath = path.join(tmpHome, '.config', 'opencode', 'opencode.json');
  const cfgAfterInstall = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.ok(
    cfgAfterInstall.plugin.includes('@cli-tools/oh-my-sdd-opencode'),
    `opencode.json 应包含 npm 插件，实际: ${JSON.stringify(cfgAfterInstall.plugin)}`
  );

  // Simulate resources created by the npm package's postinstall lifecycle.
  const npmCommand = path.join(tmpHome, '.config', 'opencode', 'command', 'sdd-doc.md');
  fs.mkdirSync(path.dirname(npmCommand), { recursive: true });
  fs.writeFileSync(npmCommand, 'plugin-owned command');
  const manifestPath = path.join(tmpHome, '.oh-my-sdd', 'opencode-npm-resources.json');
  writeOwnershipManifest(manifestPath, [{
    target: npmCommand,
    backup: null,
    created: true,
    installed_digest: resourceDigest(npmCommand),
  }]);

  // 模拟旧 SDK fallback 写入：卸载只能移除 OMS 区块，不能删除用户内容。
  const agentsPath = path.join(tmpHome, '.config', 'opencode', 'AGENTS.md');
  fs.writeFileSync(agentsPath, [
    '# User instructions',
    '<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->',
    'OMS baseline',
    '<!-- OH-MY-SDD:END -->',
    '',
  ].join('\n'));

  // Step 2: uninstall
  execFileSync('node', ['bin/oms-uninstall.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env,
    stdio: 'pipe',
  });
  assert.ok(!fs.existsSync(pluginDir), 'plugin dir should be removed');
  const cfgAfterUninstall = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const plugins = cfgAfterUninstall.plugin ?? [];
  assert.ok(!plugins.includes('@cli-tools/oh-my-sdd-opencode'), 'uninstall 应清掉 npm 插件 entry');
  assert.ok(!plugins.includes('./plugins/oh-my-sdd/index.js'), 'uninstall 应清掉 ./plugins/oh-my-sdd/index.js');
  assert.ok(!plugins.includes('oh-my-sdd'), 'uninstall 应清掉裸字符串 oh-my-sdd');
  assert.ok(!plugins.includes('./plugins/oh-my-sdd/plugin.js'), 'uninstall 应清掉旧 ./plugins/oh-my-sdd/plugin.js');
  assert.equal(fs.readFileSync(agentsPath, 'utf8'), '# User instructions\n');
  assert.equal(fs.existsSync(npmCommand), false, 'npm-owned command should be removed');
  assert.equal(fs.existsSync(manifestPath), false, 'npm ownership manifest should be removed');
});
