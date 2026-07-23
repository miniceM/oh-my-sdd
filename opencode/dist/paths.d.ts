import { sanitizeSessionId as _sanitize } from './types.js';
export declare function getPluginRoot(): string;
/**
 * hooks/*.js are copied to <plugin-root>/hooks/ during install.
 * Source layout: <repo>/hooks/ (but not used when installed)
 * Installed layout: ~/.config/opencode/plugins/oh-my-sdd/hooks/
 */
export declare function getHooksDir(): string;
/**
 * content/enterprise-baseline.md is copied to <plugin-root>/content/ during install.
 * Source layout: <repo>/content/ (but not used when installed)
 * Installed layout: ~/.config/opencode/plugins/oh-my-sdd/content/
 */
export declare function getBaselinePath(): string;
/** Shared with claude/lingma. NEVER diverge — this is the invariant. */
export declare function getStateDir(): string;
export declare function getLogFile(): string;
export { _sanitize as sanitizeSessionId };
//# sourceMappingURL=paths.d.ts.map