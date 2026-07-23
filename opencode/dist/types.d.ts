/**
 * Re-exports @opencode-ai/plugin SDK types + internal helper types.
 *
 * Why re-export: gives consumers a single import path. Internal types
 * (HookResult, SanitizedSessionId) are defined here so other modules
 * don't have to redeclare.
 */
export type { Plugin, PluginInput, PluginModule, Hooks, ToolDefinition, } from '@opencode-ai/plugin';
/**
 * Result returned by hooks/*.js via stdout JSON.
 * Matched by runner.ts and translated to OpenCode action (throw / return).
 */
export type HookResult = {
    hookSpecificOutput?: {
        hookEventName?: string;
        permissionDecision?: 'allow' | 'deny' | 'ask';
        permissionDecisionReason?: string;
        additionalContext?: string;
    };
    continue?: boolean;
    stopReason?: string;
    [key: string]: unknown;
};
/**
 * Sanitized session id (matches hook scripts' expectation: [A-Za-z0-9_-]+ only).
 * Used everywhere a session_id flows through to fs paths or hook stdin.
 */
export type SanitizedSessionId = string;
export declare function sanitizeSessionId(raw: string | undefined): SanitizedSessionId;
//# sourceMappingURL=types.d.ts.map