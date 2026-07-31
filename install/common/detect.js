// install/common/detect.js — CLI detection helpers shared across adapters.
//
// Provides cross-platform CLI detection (Windows: where, POSIX: which)
// and directory existence checks for hosts that don't register a CLI.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Check if a CLI command is available on PATH.
 * Handles Windows (where) vs POSIX (which) transparently.
 *
 * @param {string} name - CLI name (e.g., 'claude', 'lingma', 'opencode')
 * @returns {boolean} true if CLI is found on PATH
 */
export function isCliInPath(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists (for hosts that don't register a CLI).
 *
 * @param {string} dirPath - Path to check
 * @returns {boolean} true if directory exists
 */
export function isDirPresent(dirPath) {
  return existsSync(dirPath);
}