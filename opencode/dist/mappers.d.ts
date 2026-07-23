/**
 * Event mappers: OpenCode event payloads → Claude hook stdin protocol.
 *
 * Single source of truth for translating OpenCode's event shape into the
 * JSON that hooks/*.js scripts expect on stdin.
 *
 * Key mappings:
 * - Tool names: OpenCode lowercase ('write'/'edit'/'apply_patch') →
 *   Claude Code PascalCase ('Write'/'Edit'/'MultiEdit')
 * - Args: OpenCode snake_case ('new_string') → Claude camelCase ('newString')
 *   (recurses into edits[].new_string for MultiEdit)
 * - Events: OpenCode event names → Claude hook script paths (handled by plugin.ts)
 */
export declare const TOOL_MAP: Record<string, string>;
export declare const TRACKED_TOOLS: Set<string>;
export declare function normalizeArgs(args: Record<string, unknown>): Record<string, unknown>;
export interface OpenCodeToolInput {
    file_path?: string;
    content?: string;
    new_string?: string;
    newString?: string;
    edits?: Array<{
        new_string?: string;
        newString?: string;
        [k: string]: unknown;
    }>;
    [k: string]: unknown;
}
export declare function mapSessionStart(input: {
    sessionID?: string;
    directory?: string;
}): {
    session_id: string;
    cwd: string;
};
export declare function mapSessionEnd(input: {
    sessionID?: string;
    directory?: string;
}): {
    session_id: string;
    cwd: string;
};
/**
 * Map OpenCode tool.execute.before/after → Claude hook stdin.
 * Returns null if the tool is not tracked (no need to run hook).
 */
export declare function mapPreToolUse(input: {
    tool: string;
    input?: Record<string, unknown>;
    sessionID?: string;
}): {
    tool_name: string;
    tool_input: Record<string, unknown>;
    session_id: string;
} | null;
export declare function mapPostToolUse(input: {
    tool: string;
    input?: Record<string, unknown>;
    sessionID?: string;
}): ReturnType<typeof mapPreToolUse>;
export declare function mapUserPromptSubmit(input: {
    command?: string;
    sessionID?: string;
    arguments?: string;
}): {
    session_id: string;
    prompt: string;
    cwd: string;
} | null;
//# sourceMappingURL=mappers.d.ts.map