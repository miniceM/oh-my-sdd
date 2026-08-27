/**
 * Centralized constants for OpenCode plugin.
 *
 * Single source of truth for timeouts, file permissions, and magic numbers.
 * Eliminates magic numbers scattered across codebase.
 */
export declare const TIMEOUTS: {
    /** Default hook execution timeout (ms) */
    readonly HOOK_DEFAULT_MS: 5000;
    /** superpowers-zh npx install timeout (ms) - longer for first-time download */
    readonly SUPERPOWERS_INSTALL_MS: 60000;
};
export declare const FILE_PERMISSIONS: {
    /** Default config file permission (rw-r--r--) */
    readonly CONFIG_FILE: 420;
    /** Executable script permission (rwxr-xr-x) */
    readonly SCRIPT_FILE: 493;
};
export declare const LOG_ROTATION: {
    /** Max log file size before rotation (10MB) */
    readonly MAX_BYTES: number;
    /** Number of backup files to keep */
    readonly MAX_BACKUP_FILES: 10;
};
export declare const PATHS: {
    /** OpenCode config directory (relative to home) */
    readonly OPENCODE_CONFIG_DIR: readonly [".config", "opencode"];
    /** OpenCode plugins directory */
    readonly OPENCODE_PLUGINS_DIR: readonly [".config", "opencode", "plugins"];
    /** Shared state directory (oh-my-sdd) */
    readonly STATE_DIR: readonly [".oh-my-sdd"];
    /** OpenCode commands directory */
    readonly OPENCODE_COMMANDS_DIR: readonly [".config", "opencode", "commands"];
};
export declare const OTHER: {
    /** superpowers-zh package with version pinning (supply chain security) */
    readonly SUPERPOWERS_ZH_PACKAGE: "superpowers-zh@1.5.0";
};
//# sourceMappingURL=constants.d.ts.map