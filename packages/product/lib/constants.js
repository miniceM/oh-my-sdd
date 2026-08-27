/**
 * Constants for install scripts (pure JS).
 *
 * Mirrors opencode/src/constants.ts for use in non-TypeScript files.
 */

// ============================================
// Timeouts (milliseconds)
// ============================================
export const TIMEOUTS = {
  /** Default hook execution timeout (ms) */
  HOOK_DEFAULT_MS: 5000,
  /** superpowers-zh npx install timeout (ms) */
  SUPERPOWERS_INSTALL_MS: 60000,
};

// ============================================
// File Permissions (Unix mode)
// ============================================
export const FILE_PERMISSIONS = {
  /** Default config file permission (rw-r--r--) */
  CONFIG_FILE: 0o644,
  /** Executable script permission (rwxr-xr-x) */
  SCRIPT_FILE: 0o755,
};

// ============================================
// Log Rotation
// ============================================
export const LOG_ROTATION = {
  /** Max log file size before rotation (10MB) */
  MAX_BYTES: 10 * 1024 * 1024,
  /** Number of backup files to keep */
  MAX_BACKUP_FILES: 10,
};

// ============================================
// Other Constants
// ============================================
export const OTHER = {
  /** superpowers-zh package with version pinning */
  SUPERPOWERS_ZH_PACKAGE: 'superpowers-zh@1.5.0',
};