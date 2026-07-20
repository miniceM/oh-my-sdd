/**
 * Structured logger with secret redaction for the OpenCode plugin.
 *
 * Logs JSON-lines to ~/.oh-my-sdd/logs/opencode-plugin.log (mode 0600).
 * AWS AKIA and OpenAI sk- patterns are redacted before writing — matches
 * hooks/lib/rules.js HARD_RULE patterns (HARDCODED_AWS_AK, HARDCODED_SK).
 *
 * Set OMSD_DEBUG=1 env var to enable debug-level output.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Redaction patterns matching hooks/lib/rules.js HARD_RULE patterns
const REDACT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // AWS AKIA key pattern
  { pattern: /AKIA[A-Z0-9]{16}/g, replacement: 'AKIA****REDACTED****' },
  // OpenAI sk- key pattern (20-64 chars after prefix)
  { pattern: /\bsk-[a-zA-Z0-9]{20,64}\b/g, replacement: 'sk-****REDACTED****' },
];

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_DIR = join(homedir(), '.oh-my-sdd', 'logs');
const LOG_FILE = join(LOG_DIR, 'opencode-plugin.log');

const CURRENT_LEVEL: LogLevel = process.env.OMSD_DEBUG === '1' ? 'debug' : 'info';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function redact(text: string): string {
  let result = text;
  for (const { pattern, replacement } of REDACT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      result[key] = redact(value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactFields(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[CURRENT_LEVEL];
}

export async function log(
  level: LogLevel,
  message: string,
  fields?: Record<string, unknown>
): Promise<void> {
  if (!shouldLog(level)) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: redact(message),
    ...(fields ? redactFields(fields) : undefined),
  };

  const line = JSON.stringify(entry) + '\n';

  try {
    if (!existsSync(LOG_DIR)) {
      await mkdir(LOG_DIR, { recursive: true, mode: 0o700 });
    }
    await appendFile(LOG_FILE, line, { mode: 0o600 });
  } catch {
    // Logging must never crash the plugin — silently drop
  }
}
