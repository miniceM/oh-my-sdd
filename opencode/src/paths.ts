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
// dist/paths.js → plugin root is .. (one level up from dist/ reaches opencode/)
const DEFAULT_PLUGIN_ROOT = path.resolve(path.dirname(__filename), '..');

export function getPluginRoot(): string {
  return process.env.OMS_PLUGIN_ROOT ?? DEFAULT_PLUGIN_ROOT;
}

/** hooks/*.js live at the repo root in `hooks/`. From opencode/dist → ../../hooks. */
export function getHooksDir(): string {
  return path.resolve(getPluginRoot(), '..', '..', 'hooks');
}

/** content/enterprise-baseline.md is the SoT for enterprise rules (shared). */
export function getBaselinePath(): string {
  return path.resolve(getPluginRoot(), '..', '..', 'content', 'enterprise-baseline.md');
}

/** Shared with claude/lingma. NEVER diverge — this is the invariant. */
export function getStateDir(): string {
  return path.join(os.homedir(), '.oh-my-sdd');
}

export function getLogFile(): string {
  return path.join(getStateDir(), 'logs', 'opencode.log');
}

export { _sanitize as sanitizeSessionId };
