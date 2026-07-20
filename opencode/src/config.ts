/**
 * Plugin config loader for oh-my-sdd OpenCode adapter.
 *
 * Reads user overrides from ~/.config/opencode/opencode.json under the
 * "oh-my-sdd" key. Missing file / missing key / corrupt JSON all fall back
 * to DEFAULT_CONFIG silently. Invalid values (bad logLevel, out-of-range
 * timeouts) are reset to defaults with a warning logged.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { log } from './logger.js';

export interface OhMySddConfig {
  timeouts: {
    preToolUse: number;
    postToolUse: number;
    sessionStart: number;
    userPrompt: number;
  };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  hooks: {
    preToolUse: boolean;
    postToolUse: boolean;
    sessionStart: boolean;
    userPrompt: boolean;
  };
  disabled: boolean;
}

const OPENCODE_CONFIG_JSON = join(homedir(), '.config', 'opencode', 'opencode.json');

const DEFAULT_CONFIG: OhMySddConfig = {
  timeouts: {
    preToolUse: 5000,
    postToolUse: 3000,
    sessionStart: 10000,
    userPrompt: 3000,
  },
  logLevel: 'info',
  hooks: {
    preToolUse: true,
    postToolUse: true,
    sessionStart: true,
    userPrompt: true,
  },
  disabled: false,
};

const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

const TIMEOUT_MIN = 100;
const TIMEOUT_MAX = 30000;

function deepMerge(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const defaultVal = result[key];
      if (defaultVal !== null && typeof defaultVal === 'object' && !Array.isArray(defaultVal)) {
        result[key] = deepMerge(
          defaultVal as Record<string, unknown>,
          value as Record<string, unknown>,
        );
      } else {
        result[key] = value;
      }
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function cloneDefaults(): OhMySddConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as OhMySddConfig;
}

function validateConfig(config: OhMySddConfig): void {
  // logLevel
  if (!VALID_LOG_LEVELS.has(config.logLevel)) {
    void log('warn', `Invalid logLevel "${String(config.logLevel)}", falling back to "${DEFAULT_CONFIG.logLevel}"`);
    config.logLevel = DEFAULT_CONFIG.logLevel;
  }

  // timeouts bounds
  const timeoutKeys = Object.keys(DEFAULT_CONFIG.timeouts) as Array<keyof OhMySddConfig['timeouts']>;
  for (const key of timeoutKeys) {
    const val = config.timeouts[key];
    if (typeof val !== 'number' || val < TIMEOUT_MIN || val > TIMEOUT_MAX) {
      void log('warn', `Invalid timeout ${key}=${String(val)}, falling back to ${DEFAULT_CONFIG.timeouts[key]}`);
      config.timeouts[key] = DEFAULT_CONFIG.timeouts[key];
    }
  }
}

export async function loadConfig(): Promise<OhMySddConfig> {
  let raw: string | null = null;
  try {
    if (existsSync(OPENCODE_CONFIG_JSON)) {
      raw = await readFile(OPENCODE_CONFIG_JSON, 'utf8');
    }
  } catch {
    // file read error → defaults
  }

  if (!raw) return cloneDefaults();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    void log('warn', `Corrupt opencode.json at ${OPENCODE_CONFIG_JSON}, using defaults`);
    return cloneDefaults();
  }

  const userConfig = parsed['oh-my-sdd'];
  if (userConfig === undefined || userConfig === null || typeof userConfig !== 'object' || Array.isArray(userConfig)) {
    return cloneDefaults();
  }

  const merged = deepMerge(
    cloneDefaults() as unknown as Record<string, unknown>,
    userConfig as Record<string, unknown>,
  ) as unknown as OhMySddConfig;

  validateConfig(merged);

  return merged;
}
