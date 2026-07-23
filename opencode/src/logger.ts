/**
 * File-only JSON-lines logger.
 *
 * - NEVER writes to stdout (plugin runs inside TUI; stdout pollution = UX bug)
 * - 10MB rotation
 * - Redacts AWS AK patterns + filesystem paths
 * - Lines are valid JSON for downstream parsing
 */
import fs from 'node:fs';
import path from 'node:path';
import { getLogFile } from './paths.js';
import { LOG_ROTATION } from './constants.js';

const AK_PATTERN = /AKIA[A-Z0-9]{16}/g;
const PATH_PATTERN = /\/Users\/[^"'\s]+|\/home\/[^"'\s]+|C:\\Users\\[^"'\s]+/g;

let _currentSize = 0;
let _logPath: string | undefined;

function getLogPath(): string {
  _logPath ??= process.env.OMS_LOG_FILE ?? getLogFile();
  return _logPath;
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(getLogPath()), { recursive: true });
}

function redact(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(AK_PATTERN, 'AKIA[REDACTED]').replace(PATH_PATTERN, '[PATH]');
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'password' || k === 'secret' || k === 'token' || k === 'apiKey') {
        out[k] = '[REDACTED]';
      } else if (k === 'filePath' && typeof v === 'string') {
        // Use _filePathHash prefix to avoid collision with payload's own filePathHash
        out._filePathHash = hashStr(v);
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return obj;
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16)}`;
}

export function log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, payload: Record<string, unknown> = {}): void {
  const sanitizedMsg = String(msg).replace(AK_PATTERN, 'AKIA[REDACTED]').replace(PATH_PATTERN, '[PATH]');
  const entry = JSON.stringify({
    ts: Date.now(),
    level,
    msg: sanitizedMsg,
    ...(redact(payload) as Record<string, unknown>),
  });
  const line = entry + '\n';
  if (_currentSize + line.length > LOG_ROTATION.MAX_BYTES) rotate();
  if (_currentSize === 0) ensureDir();
  fs.appendFileSync(getLogPath(), line);
  _currentSize += line.length;
}

function rotate(): void {
  const p = getLogPath();
  // Close any open fd (appendFileSync opens/closed per call, so no explicit close needed)
  for (let i = LOG_ROTATION.MAX_BACKUP_FILES; i >= 1; i--) {
    const from = i <= 1 ? p : `${p}.${i - 1}.log`;
    const to = `${p}.${i}.log`;
    try {
      if (fs.existsSync(from)) fs.renameSync(from, to);
    } catch (e) {
      // Log rotation failure is non-fatal, but log it for diagnostics
      console.error(`[logger] log rotation rename failed: ${from} → ${to}`, e);
    }
  }
  _currentSize = 0;
}

/** Test-only: reset cached log path and delete the log file */
export function resetForTest(): void {
  _currentSize = 0;
  _logPath = undefined;
  try {
    fs.unlinkSync(getLogPath());
  } catch { /* ok */ }
}

/** @deprecated Use resetForTest() instead */
export const _resetForTest = resetForTest;