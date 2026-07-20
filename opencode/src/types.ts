export interface RunHookOptions {
 timeoutMs?: number;
 env?: { [key: string]: string };
 cwd?: string;
}

export interface OpenCodeSessionInput {
 session_id?: string;
 cwd?: string;
}

/**
 * Inner tool input shape — the data payload passed to hooks via stdin.
 * Covers Write, Edit, MultiEdit tool shapes from OpenCode SDK.
 * The [key: string] index allows pass-through of unknown fields.
 */
export interface OpenCodeToolInput {
 file_path?: string;
 content?: string;
 new_string?: string;
 edits?: Array<{ new_string?: string; newString?: string }>;
 [key: string]: unknown;
}

// Hook result may have permissionDecision or additionalContext
export type HookResult = { [key: string]: unknown };
