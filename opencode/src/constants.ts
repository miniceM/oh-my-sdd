/**
 * Centralized constants for OpenCode plugin.
 *
 * Single source of truth for timeouts, file permissions, and magic numbers.
 * Eliminates magic numbers scattered across codebase.
 */

// ============================================
// Timeouts (milliseconds)
// ============================================
export const TIMEOUTS = {
  /** Default hook execution timeout (ms) */
  HOOK_DEFAULT_MS: 5000,
  /** superpowers-zh npx install timeout (ms) - longer for first-time download */
  SUPERPOWERS_INSTALL_MS: 60000,
} as const;

// ============================================
// File Permissions (Unix mode)
// ============================================
export const FILE_PERMISSIONS = {
  /** Default config file permission (rw-r--r--) */
  CONFIG_FILE: 0o644,
  /** Executable script permission (rwxr-xr-x) */
  SCRIPT_FILE: 0o755,
} as const;

// ============================================
// Log Rotation
// ============================================
export const LOG_ROTATION = {
  /** Max log file size before rotation (10MB) */
  MAX_BYTES: 10 * 1024 * 1024,
  /** Number of backup files to keep */
  MAX_BACKUP_FILES: 10,
} as const;

// ============================================
// Paths (relative to home directory)
// ============================================
export const PATHS = {
  /** OpenCode config directory (relative to home) */
  OPENCODE_CONFIG_DIR: ['.config', 'opencode'],
  /** OpenCode plugins directory */
  OPENCODE_PLUGINS_DIR: ['.config', 'opencode', 'plugins'],
  /** Shared state directory (oh-my-sdd) */
  STATE_DIR: ['.oh-my-sdd'],
  /** OpenCode commands directory */
  OPENCODE_COMMANDS_DIR: ['.config', 'opencode', 'commands'],
} as const;

// ============================================
// Other Constants
// ============================================
export const OTHER = {
  /** superpowers-zh package with version pinning (supply chain security) */
  SUPERPOWERS_ZH_PACKAGE: 'superpowers-zh@1.5.0',
} as const;