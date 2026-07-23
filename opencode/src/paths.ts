/**
 * Centralized path resolution for the OpenCode plugin.
 * All fs paths flow through here — single point of change for cross-platform support.
 *
 * Shared with claude/lingma: state dir, baseline, hooks dir come from the SAME
 * files. This is the "shared state" invariant (spec §3.2 G5).
 */
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { sanitizeSessionId as _sanitize } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Source layout: opencode/dist/paths.js → plugin root = opencode/ (go up from dist/)
// Installed layout: ~/.config/opencode/plugins/oh-my-sdd/paths.js → plugin root = oh-my-sdd/ (same dir)
// Heuristic: if we're in a "dist" directory, go up one level
const DEFAULT_PLUGIN_ROOT = path.basename(__dirname) === 'dist'
  ? path.resolve(__dirname, '..')
  : __dirname;

export function getPluginRoot(): string {
  return process.env.OMS_PLUGIN_ROOT ?? DEFAULT_PLUGIN_ROOT;
}

/**
 * hooks/*.js are copied to <plugin-root>/hooks/ during install.
 * Source layout: <repo>/hooks/ (but not used when installed)
 * Installed layout: ~/.config/opencode/plugins/oh-my-sdd/hooks/
 */
export function getHooksDir(): string {
  return path.resolve(getPluginRoot(), 'hooks');
}

/**
 * content/enterprise-baseline.md is copied to <plugin-root>/content/ during install.
 * Source layout: <repo>/content/ (but not used when installed)
 * Installed layout: ~/.config/opencode/plugins/oh-my-sdd/content/
 */
export function getBaselinePath(): string {
  return path.resolve(getPluginRoot(), 'content', 'enterprise-baseline.md');
}

/** Shared with claude/lingma. NEVER diverge — this is the invariant. */
export function getStateDir(): string {
  return path.join(os.homedir(), '.oh-my-sdd');
}

export function getLogFile(): string {
  return path.join(getStateDir(), 'logs', 'opencode.log');
}

export { _sanitize as sanitizeSessionId };
