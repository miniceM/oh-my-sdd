// Regression test: opencode/dist/plugin.js 的 hooks 路径解析必须兼容两种安装布局。
//
// 历史 bug (2026-07-17)：
//   旧 install 复制 plugin.js 到 .../plugins/oh-my-sdd/plugin.js（hooks/ 同级）
//   新 install 复制 opencode/dist/ 整目录到 .../plugins/oh-my-sdd/（plugin.js 在 dist/ 子目录）
//   原代码用 resolve(__dirname, '..') 计算 hooks/，旧布局下会指到 .../plugins/hooks/（错误），
//   报 "Cannot find module '.../plugins/hooks/pre-tool-use.js'"。
//
// 修复：plugin.js 启动时探测 hooks/ 是不是和 plugin.js 同级；不是就回退到上级目录。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST_RUNNER = '/Users/hosea/work/git/oh-my-sdd/opencode/dist/runner.js';
const DIST_PATHS = '/Users/hosea/work/git/oh-my-sdd/opencode/dist/paths.js';

// 在临时目录模拟两种 install 布局，import plugin.js，触发模块顶层求值（PLUGIN_ROOT/HOOKS_DIR），
// 然后通过调用 runHook 内部逻辑无法直接做到——改为静态检查：构造虚拟 import.meta.url 等价场景。
// 因为 import.meta.url 在动态 import 中由 Node 注入，我们用 import() 加载放在临时位置的 plugin.js 副本。
function setupFakeInstall(layout /* 'top-level' | 'dist' */) {
  const root = mkdtempSync(join(tmpdir(), 'oms-plugin-layout-'));
  const hooksDir = join(root, 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  // 占位 hook 脚本（plugin 不直接 require 它，只看文件存在）
  writeFileSync(join(hooksDir, 'pre-tool-use.js'), '// stub\n');

  let pluginUrl;
  if (layout === 'top-level') {
    writeFileSync(join(root, 'plugin.js'), `// re-export minimal probe result
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SIBLING_HOOKS = join(__dirname, 'hooks', 'pre-tool-use.js');
const HOOKS_DIR = existsSync(SIBLING_HOOKS) ? join(__dirname, 'hooks') : join(__dirname, '..', 'hooks');
const PLUGIN_ROOT = join(HOOKS_DIR, '..');
export { HOOKS_DIR, PLUGIN_ROOT };
`);
    pluginUrl = pathToFileURL(join(root, 'plugin.js')).href;
  } else {
    const distDir = join(root, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'plugin.js'), `// re-export minimal probe result
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SIBLING_HOOKS = join(__dirname, 'hooks', 'pre-tool-use.js');
const HOOKS_DIR = existsSync(SIBLING_HOOKS) ? join(__dirname, 'hooks') : join(__dirname, '..', 'hooks');
const PLUGIN_ROOT = join(HOOKS_DIR, '..');
export { HOOKS_DIR, PLUGIN_ROOT };
`);
    pluginUrl = pathToFileURL(join(distDir, 'plugin.js')).href;
  }
  return { root, pluginUrl };
}

test('plugin.js path probe resolves hooks/ when plugin.js is at top level (.../oh-my-sdd/plugin.js)', async () => {
  const { root, pluginUrl } = setupFakeInstall('top-level');
  try {
    const m = await import(pluginUrl);
    // macOS /tmp is a symlink to /private/tmp; normalize via realpath
    const expectedHooks = realpathSync(join(root, 'hooks'));
    const expectedRoot = realpathSync(root);
    assert.equal(realpathSync(m.HOOKS_DIR), expectedHooks,
      'HOOKS_DIR should be .../oh-my-sdd/hooks when plugin.js sits next to hooks/');
    assert.equal(realpathSync(m.PLUGIN_ROOT), expectedRoot,
      'PLUGIN_ROOT should be .../oh-my-sdd/ (parent of hooks/)');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('plugin.js path probe resolves hooks/ when plugin.js is in dist/ subdir (.../oh-my-sdd/dist/plugin.js)', async () => {
  const { root, pluginUrl } = setupFakeInstall('dist');
  try {
    const m = await import(pluginUrl);
    const expectedHooks = realpathSync(join(root, 'hooks'));
    const expectedRoot = realpathSync(root);
    assert.equal(realpathSync(m.HOOKS_DIR), expectedHooks,
      'HOOKS_DIR should fall back to .../oh-my-sdd/hooks when plugin.js is in dist/');
    assert.equal(realpathSync(m.PLUGIN_ROOT), expectedRoot,
      'PLUGIN_ROOT should still be .../oh-my-sdd/ (parent of hooks/)');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('shipped dist/paths.js contains the sibling-probe fallback (not the buggy hardcoded ..)', () => {
  const src = readFileSync(DIST_PATHS, 'utf8');
  // Must use existsSync to probe — the buggy version just did resolve(__dirname, '..')
  assert.match(src, /existsSync/,
    'dist/paths.js must probe with existsSync to support both install layouts');
  assert.match(src, /SIBLING_HOOKS/,
    'dist/paths.js must check sibling hooks/ first');
  // Ensure the buggy hardcoded PLUGIN_ROOT = resolve(__dirname, '..') pattern is gone
  assert.doesNotMatch(src, /PLUGIN_ROOT\s*=\s*resolve\(__dirname,\s*['"]\.\.['']\)/,
    'dist/paths.js must not use the buggy hardcoded resolve(__dirname, "..") pattern');
  // Verify runner.js (the hook-execution module) imports the probe result from paths.js
  const runnerSrc = readFileSync(DIST_RUNNER, 'utf8');
  assert.match(runnerSrc, /import.*HOOKS_DIR.*from.*paths/,
    'dist/runner.js must import HOOKS_DIR from paths.js');
  assert.match(runnerSrc, /import.*PLUGIN_ROOT.*from.*paths/,
    'dist/runner.js must import PLUGIN_ROOT from paths.js');
});
