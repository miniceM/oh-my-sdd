/**
 * OpenCode path constants.
 *
 * Centralized path resolution for OpenCode directories.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();

// ============================================
// OpenCode 路径常量
// ============================================
export const OPENCODE_CONFIG_DIR = join(HOME, '.config', 'opencode');
export const OPENCODE_PLUGINS_DIR = join(OPENCODE_CONFIG_DIR, 'plugins');
export const OPENCODE_PLUGIN_DIR = join(OPENCODE_PLUGINS_DIR, 'oh-my-sdd');
export const OPENCODE_JSON = join(OPENCODE_CONFIG_DIR, 'opencode.json');
export const OPENCODE_COMMANDS_DIR = join(OPENCODE_CONFIG_DIR, 'commands');
export const OPENCODE_PLUGIN_ENTRY = './plugins/oh-my-sdd/index.js';

// Staging directory for superpowers-zh installation
export const SUPERPOWERS_STAGING_DIR = join(OPENCODE_PLUGIN_DIR, '.superpowers-staging');