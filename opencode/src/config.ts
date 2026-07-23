/**
 * Config wrapper. Reads ~/.oh-my-sdd/config.json (shared with claude/lingma)
 * and merges OpenCode-specific defaults.
 *
 * Singleton via getConfig() — re-read only on file change (out of scope for MVP).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getStateDir } from './paths.js';
import { log } from './logger.js';

export type OhMySddConfig = {
  dop_endpoint: string;
  aih_system_name: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
  telemetry_disabled: boolean;
  // OpenCode-specific
  opencode_hook_timeout_ms: number;
  opencode_baseline_inject: 'experimental_chat_system_transform' | 'fallback_agents_md';
};

const DEFAULTS: OhMySddConfig = {
  dop_endpoint: 'https://dop.enterprise.com',
  aih_system_name: 'sdd',
  log_level: 'info',
  telemetry_disabled: false,
  opencode_hook_timeout_ms: 5000,
  opencode_baseline_inject: 'experimental_chat_system_transform',
};

let _cached: OhMySddConfig | null = null;

export function loadConfig(): OhMySddConfig {
  const p = path.join(getStateDir(), 'config.json');
  let user: Partial<OhMySddConfig> = {};
  try {
    const raw = fs.readFileSync(p, 'utf8');
    user = JSON.parse(raw);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      log('warn', 'config.json parse failed, using defaults', { err: String(e) });
    }
  }
  return { ...DEFAULTS, ...user };
}

export function getConfig(): OhMySddConfig {
  if (!_cached) _cached = loadConfig();
  return _cached;
}
