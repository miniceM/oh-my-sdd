#!/usr/bin/env node
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { uninstallOwnedResources } from './ownership.js';
import {
  getAgentsPath,
  getOpenCodeConfigDir,
  removeManagedAgentsBlock,
} from './agents.js';

const HOME = homedir();
const MANIFEST_PATH = join(HOME, '.oh-my-sdd', 'opencode-npm-resources.json');
const OPENCODE_AGENTS_MD = getAgentsPath(HOME);

export function getUninstallPaths(home = homedir(), pathImpl = { join }, env = process.env) {
  const activeConfig = getOpenCodeConfigDir(home, pathImpl, env);
  const legacyConfig = pathImpl.join(home, '.config', 'opencode');
  const configRoots = [...new Set([activeConfig, legacyConfig])];
  return {
    agentsPath: pathImpl.join(activeConfig, 'AGENTS.md'),
    configPath: pathImpl.join(activeConfig, 'opencode.json'),
    allowedRoots: [
      ...configRoots.flatMap((root) => [
        pathImpl.join(root, 'skills'),
        pathImpl.join(root, 'commands'),
        pathImpl.join(root, 'command'),
      ]),
      pathImpl.join(home, '.agents', 'skills'),
      pathImpl.join(home, '.agents', 'command'),
    ],
  };
}

const DEFAULT_PATHS = getUninstallPaths(HOME);

const PLUGIN_ENTRIES = new Set([
  '@cli-tools/oh-my-sdd-opencode',
  '@enterprise/oh-my-sdd-opencode',
  'oh-my-sdd',
  './plugins/oh-my-sdd/plugin.js',
  './plugins/oh-my-sdd/index.js',
]);

/**
 * Remove only known oh-my-sdd package entries from an OpenCode configuration.
 * Invalid or unrelated configuration content is preserved.
 *
 * @param {object} [options] - Injectable filesystem operations for testing.
 * @returns {number} Number of plugin entries removed.
 */
export function unregisterOpenCodePlugin({
  configPath = DEFAULT_PATHS.configPath,
  exists = existsSync,
  read = readFileSync,
  write = writeFileSync,
  warn = console.warn,
} = {}) {
  if (!exists(configPath)) return 0;

  let config;
  try {
    config = JSON.parse(read(configPath, 'utf8'));
  } catch (error) {
    warn(`[uninstall] opencode.json is invalid; preserving it: ${error.message}`);
    return 0;
  }
  if (!config || !Array.isArray(config.plugin)) return 0;

  const kept = config.plugin.filter((entry) => !PLUGIN_ENTRIES.has(entry));
  const removed = config.plugin.length - kept.length;
  if (removed === 0) return 0;

  if (kept.length === 0) delete config.plugin;
  else config.plugin = kept;
  write(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return removed;
}

/**
 * Unregister the npm plugin and remove or restore manifest-owned resources.
 *
 * @param {object} [options] - Paths, logging functions, and allowed roots.
 * @returns {{removed: number, restored: number, preserved: number, remaining: number, unregistered: number}}
 * Cleanup summary.
 */
export function main({
  manifestPath = MANIFEST_PATH,
  allowedRoots = DEFAULT_PATHS.allowedRoots,
  agentsPath = OPENCODE_AGENTS_MD,
  configPath = DEFAULT_PATHS.configPath,
  warn = console.warn,
  log = console.log,
} = {}) {
  const unregistered = unregisterOpenCodePlugin({ configPath, warn });
  let agentsRemoved = false;
  try {
    agentsRemoved = removeManagedAgentsBlock(agentsPath);
  } catch (error) {
    warn(`[uninstall] AGENTS.md cleanup failed; preserving it: ${error.message}`);
  }
  const result = uninstallOwnedResources({ manifestPath, allowedRoots, warn });
  log(
    `[uninstall] oh-my-sdd unregistered: ${unregistered}, agents block removed: ${agentsRemoved}, removed: ${result.removed}, restored: ${result.restored}, preserved: ${result.preserved}`,
  );
  return { ...result, unregistered, agentsRemoved };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[uninstall] oh-my-sdd: ${error.message}`);
    process.exitCode = 1;
  }
}
