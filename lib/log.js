import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { getStateDir } from './platform.js';

const LEVELS = ['debug', 'info', 'warn', 'error'];

async function todayLogFile() {
  const today = new Date().toISOString().slice(0, 10);
  const dir = path.join(getStateDir(), 'logs');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return path.join(dir, `${today}.log`);
}

async function write(level, msg, toStderr = false) {
  const ts = new Date().toISOString();
  const line = `${ts} ${level.toUpperCase()} ${msg}\n`;
  if (toStderr || level === 'error' || level === 'warn') {
    process.stderr.write(line);
  }
  try {
    await appendFile(await todayLogFile(), line);
  } catch {
    // Logging must never throw
  }
}

export const debug = (msg) => write('debug', msg);
export const info = (msg) => write('info', msg);
export const warn = (msg) => write('warn', msg);
export const error = (msg) => write('error', msg);
