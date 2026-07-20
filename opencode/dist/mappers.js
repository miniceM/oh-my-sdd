/**
 * Event mappers: OpenCode plugin events → Claude Code hook stdin protocol.
 *
 * Single source of truth for translating OpenCode's event shape into the
 * JSON that hooks/*.js scripts expect on stdin.
 *
 * OpenCode tool names are lowercase ('write'/'edit') or different
 * ('apply_patch' ≈ MultiEdit). hooks/pre-tool-use.js hardcodes the Claude
 * Code names ('Write'/'Edit'/'MultiEdit'), so every call must be mapped.
 */
// ============================================
// 工具名映射: OpenCode (小写) → Claude Code (大写)
// Includes common name variants so events are never silently dropped.
// ============================================
export const TOOL_MAP = {
    // Primary names (OpenCode SDK)
    write: 'Write',
    edit: 'Edit',
    apply_patch: 'MultiEdit',
    // Already-capitalized pass-through (Claude Code native names)
    Write: 'Write',
    Edit: 'Edit',
    MultiEdit: 'MultiEdit',
    // Common variants (no underscore, lowercase)
    multiedit: 'MultiEdit',
    applypatch: 'MultiEdit',
};
export const TRACKED_TOOLS = new Set(Object.values(TOOL_MAP));
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
/**
 * Normalize edits[].new_string (snake_case from OpenCode) →
 * edits[].newString (camelCase expected by hooks/lib/tool-normalizer.js
 * and hooks/pre-tool-use.js extractContentAndPath).
 *
 * The top-level new_string → newString conversion is handled by the hook's
 * normalizeToolInput, but it does NOT recurse into nested arrays.
 */
function normalizeEdits(edits) {
    if (!edits)
        return undefined;
    return edits.map((e) => ({
        ...e,
        newString: e.new_string ?? e.newString,
    }));
}
export function mapPreToolUse(input) {
    const toolName = TOOL_MAP[input.tool];
    if (!toolName || !TRACKED_TOOLS.has(toolName))
        return null;
    const toolInput = input.input ?? {};
    // Pass through full toolInput so hooks receive all fields (e.g. old_string,
    // create_file, etc.), then overlay normalized edits on top.
    const normalizedInput = { ...toolInput };
    if (toolInput.edits) {
        normalizedInput.edits = normalizeEdits(toolInput.edits);
    }
    const result = {
        tool_name: toolName,
        tool_input: normalizedInput,
    };
    // session_id is required by post-tool-use.js for session meta lookup.
    // Include it when available so telemetry is not silently skipped.
    if (input.sessionID) {
        result.session_id = input.sessionID;
    }
    return result;
}
export function mapPostToolUse(input) {
    const toolName = TOOL_MAP[input.tool];
    if (!toolName || !TRACKED_TOOLS.has(toolName))
        return null;
    const toolInput = input.input ?? {};
    const normalizedInput = { ...toolInput };
    if (toolInput.edits) {
        normalizedInput.edits = normalizeEdits(toolInput.edits);
    }
    const result = {
        tool_name: toolName,
        tool_input: normalizedInput,
    };
    if (input.sessionID) {
        result.session_id = input.sessionID;
    }
    return result;
}
/**
 * Maps OpenCode command.execute.before (slash command) to the
 * user-prompt-submit.js stdin format: { session_id, prompt, cwd } with
 * Claude Code-style tags.
 */
export function mapUserPromptSubmit(input) {
    const command = input.command;
    if (!command)
        return null;
    // Accept both sessionID (SDK type) and session_id (runtime convention)
    const session_id = input.session_id ?? input.sessionID ?? `oms-opencode-${Date.now()}`;
    // OpenCode SDK Arguments type is readonly string[]; also accept plain string
    const args = Array.isArray(input.arguments)
        ? input.arguments.join(' ')
        : (input.arguments ?? '');
    // Reconstruct the Claude Code-style prompt with tags
    // that user-prompt-submit.js's parseSlashCommand expects.
    const prompt = `${command}` +
        (args ? `${args}` : '');
    return {
        session_id,
        prompt,
        cwd: input.cwd ?? process.cwd(),
    };
}
