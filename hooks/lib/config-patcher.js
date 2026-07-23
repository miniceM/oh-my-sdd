/**
 * OpenCode config patcher.
 *
 * Modifies opencode.json to register/unregister plugin.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { FILE_PERMISSIONS } from './constants.js';
import { OPENCODE_JSON, OPENCODE_PLUGIN_ENTRY } from './paths.js';

/**
 * Announce message to stderr.
 * @param {string} msg - Message to announce
 */
function announce(msg) {
  process.stderr.write(msg + '\n');
}

/**
 * Patch opencode.json to register plugin.
 */
export function patchOpencodeJson() {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(OPENCODE_JSON, 'utf8'));
  } catch { /* fresh config */ }

  const plugins = Array.isArray(cfg.plugin) ? [...cfg.plugin] : [];

  // Clean up legacy entries
  const cleaned = plugins.filter((p) =>
    p !== 'oh-my-sdd' && p !== './plugins/oh-my-sdd/plugin.js'
  );

  if (!cleaned.includes(OPENCODE_PLUGIN_ENTRY)) {
    cleaned.push(OPENCODE_PLUGIN_ENTRY);
  }

  cfg.plugin = cleaned;
  mkdirSync(dirname(OPENCODE_JSON), { recursive: true });
  writeFileSync(OPENCODE_JSON, JSON.stringify(cfg, null, 2) + '\n', {
    mode: FILE_PERMISSIONS.CONFIG_FILE
  });
  announce(`  ✓ opencode.json 已加 "plugin": ["${OPENCODE_PLUGIN_ENTRY}"]`);
}

/**
 * Unpatch opencode.json to unregister plugin.
 */
export function unpatchOpencodeJson() {
  if (!existsSync(OPENCODE_JSON)) {
    return;
  }

  let cfg;
  try {
    cfg = JSON.parse(readFileSync(OPENCODE_JSON, 'utf8'));
  } catch (parseErr) {
    announce(`  ⚠️  opencode.json JSON 损坏: ${parseErr.message}`);
    announce('  ⚠️  跳过配置清理');
    return;
  }

  if (!cfg || !Array.isArray(cfg.plugin)) {
    return;
  }

  // Remove all oh-my-sdd related entries
  const toRemove = new Set([
    'oh-my-sdd',
    './plugins/oh-my-sdd/plugin.js',
    OPENCODE_PLUGIN_ENTRY
  ]);

  cfg.plugin = cfg.plugin.filter((p) => !toRemove.has(p));

  if (cfg.plugin.length === 0) {
    delete cfg.plugin;
  }

  writeFileSync(OPENCODE_JSON, JSON.stringify(cfg, null, 2) + '\n', {
    mode: FILE_PERMISSIONS.CONFIG_FILE
  });
  announce(`  ✓ 已从 opencode.json 移除 oh-my-sdd 相关条目`);
}