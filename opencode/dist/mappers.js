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
import { sanitizeSessionId } from './types.js';
// ============================================
// Tool name mapping: OpenCode → Claude Code
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
    // Common variants
    multiedit: 'MultiEdit',
    applypatch: 'MultiEdit',
};
export const TRACKED_TOOLS = new Set(Object.values(TOOL_MAP));
// ============================================
// Args normalization (snake_case → camelCase)
// ============================================
/**
 * Recursively normalize edits[].new_string → edits[].newString.
 * Claude Code hooks (pre-tool-use.js, tool-normalizer.js) expect camelCase.
 */
function normalizeEdits(edits) {
    if (!Array.isArray(edits))
        return edits;
    return edits.map((e) => {
        if (e && typeof e === 'object') {
            const obj = e;
            const result = { ...obj };
            if ('new_string' in result && !('newString' in result)) {
                result.newString = result.new_string;
            }
            return result;
        }
        return e;
    });
}
export function normalizeArgs(args) {
    const out = { ...args };
    if ('new_string' in out && !('newString' in out)) {
        out.newString = out.new_string;
    }
    if ('edits' in out) {
        out.edits = normalizeEdits(out.edits);
    }
    return out;
}
// ============================================
// Session mappers (SessionStart / SessionEnd)
// ============================================
export function mapSessionStart(input) {
    return {
        session_id: sanitizeSessionId(input.sessionID),
        cwd: input.directory ?? process.cwd(),
    };
}
export function mapSessionEnd(input) {
    return mapSessionStart(input);
}
// ============================================
// Tool mappers (PreToolUse / PostToolUse)
// ============================================
/**
 * Map OpenCode tool.execute.before/after → Claude hook stdin.
 * Returns null if the tool is not tracked (no need to run hook).
 */
export function mapPreToolUse(input) {
    const toolName = TOOL_MAP[input.tool];
    if (!toolName || !TRACKED_TOOLS.has(toolName))
        return null;
    const toolInput = normalizeArgs(input.input ?? {});
    return {
        tool_name: toolName,
        tool_input: toolInput,
        session_id: sanitizeSessionId(input.sessionID),
    };
}
export function mapPostToolUse(input) {
    return mapPreToolUse(input);
}
// ============================================
// Command mapper (UserPromptSubmit)
// ============================================
export function mapUserPromptSubmit(input) {
    if (!input.command)
        return null;
    const argsPart = input.arguments ? ` ${input.arguments}` : '';
    return {
        session_id: sanitizeSessionId(input.sessionID),
        prompt: `${input.command}${argsPart}`,
        cwd: process.cwd(),
    };
}
//# sourceMappingURL=mappers.js.map