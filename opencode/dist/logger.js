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
const REDACT_PATTERNS = [
    // AWS AKIA key pattern
    { pattern: /AKIA[A-Z0-9]{16}/g, replacement: 'AKIA****REDACTED****' },
    // OpenAI sk- key pattern (20-64 chars after prefix)
    { pattern: /\bsk-[a-zA-Z0-9]{20,64}\b/g, replacement: 'sk-****REDACTED****' },
];
const LOG_DIR = join(homedir(), '.oh-my-sdd', 'logs');
const LOG_FILE = join(LOG_DIR, 'opencode-plugin.log');
const CURRENT_LEVEL = process.env.OMSD_DEBUG === '1' ? 'debug' : 'info';
const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
function redact(text) {
    let result = text;
    for (const { pattern, replacement } of REDACT_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}
function redactFields(fields) {
    const result = {};
    for (const [key, value] of Object.entries(fields)) {
        if (typeof value === 'string') {
            result[key] = redact(value);
        }
        else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = redactFields(value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
export function shouldLog(level) {
    return LEVEL_RANK[level] >= LEVEL_RANK[CURRENT_LEVEL];
}
export async function log(level, message, fields) {
    if (!shouldLog(level))
        return;
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
    }
    catch {
        // Logging must never crash the plugin — silently drop
    }
}
