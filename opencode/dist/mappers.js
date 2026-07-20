/**
 * Input mappers: translate OpenCode events into Claude Code stdin-protocol
 * payloads consumed by hooks/*.js.
 *
 * OpenCode tool names are lowercase ('write'/'edit') or different
 * ('apply_patch' ≈ MultiEdit). hooks/pre-tool-use.js hardcodes the Claude
 * Code names ('Write'/'Edit'/'MultiEdit'), so every call must be mapped.
 */
// ============================================
// 工具名映射: OpenCode (小写) → Claude Code (大写)
// ============================================
export const TOOL_MAP = {
    write: 'Write',
    edit: 'Edit',
    apply_patch: 'MultiEdit',
};
export const TRACKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
// ============================================
// Session mappers
// ============================================
export function mapSessionStart(input) {
    return {
        session_id: input.session_id ?? `oms-opencode-${Date.now()}`,
        cwd: input.cwd ?? process.cwd(),
    };
}
export function mapSessionEnd(input) {
    return {
        session_id: input.session_id ?? `oms-opencode-${Date.now()}`,
        cwd: input.cwd ?? process.cwd(),
    };
}
// ============================================
// Tool mappers
// ============================================
export function mapPreToolUse(input) {
    const mappedTool = TOOL_MAP[input.tool];
    if (!mappedTool || !TRACKED_TOOLS.has(mappedTool))
        return null;
    const toolInput = input.input ?? {};
    return {
        tool_name: mappedTool,
        tool_input: {
            file_path: toolInput.file_path,
            content: toolInput.content,
            new_string: toolInput.new_string,
            edits: toolInput.edits,
        },
    };
}
export function mapPostToolUse(input) {
    const mappedTool = TOOL_MAP[input.tool];
    if (!mappedTool || !TRACKED_TOOLS.has(mappedTool))
        return null;
    return {
        tool_name: mappedTool,
        tool_input: input.input ?? {},
    };
}
/**
 * Maps OpenCode command.execute.before (slash command) to the
 * user-prompt-submit.js stdin format: { session_id, prompt, cwd } with
 * Claude Code-style <command-name> tags.
 */
export function mapUserPromptSubmit(input) {
    const command = input.command;
    if (!command)
        return null;
    // Accept both sessionID (SDK type) and session_id (runtime convention)
    const session_id = input.session_id ?? input.sessionID ?? `oms-opencode-${Date.now()}`;
    // Reconstruct the Claude Code-style prompt with <command-name> tags
    // that user-prompt-submit.js's parseSlashCommand expects.
    const prompt = `<command-name>${command}</command-name>` +
        (input.arguments ? `<command-args>${input.arguments}</command-args>` : '');
    return {
        session_id,
        prompt,
        cwd: input.cwd ?? process.cwd(),
    };
}
