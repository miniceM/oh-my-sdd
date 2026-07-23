/**
 * OpenCode hook dispatchers. Each handler maps OpenCode event → hook script.
 *
 * Core translation: OpenCode SDK events → Claude hook stdin → hooks/*.js →
 * parsed stdout → throw (deny) or pass-through (allow).
 *
 * All handlers are async (OpenCode requires Promise<void>). The runner is
 * fail-CLOSED by default, so any hook error propagates as a thrown error
 * that OpenCode catches to block the tool.
 */
import { runHook } from './runner.js';
import { mapSessionStart, mapSessionEnd, mapPreToolUse, mapUserPromptSubmit, } from './mappers.js';
import { loadBaseline, buildSystemPrompt } from './baseline.js';
// 注意：plugin 层不再直接 log —— loadBaseline() 内部处理自己的日志策略
// （首次 info，mtime 变化 debug，cache hit 静默）
const HOOK_TIMEOUT_MS = Number(process.env.OMS_HOOK_TIMEOUT_MS ?? 5000);
export async function handleSystemTransform(_input, output) {
    const sections = await loadBaseline();
    buildSystemPrompt(sections, output);
    // 注意：不再在这里 log "baseline injected"。
    // loadBaseline() 内部已实现日志策略：首次 info，mtime 变化 debug，cache hit 静默。
    // 这里再打 log 会让每条用户消息都产生一条日志（handleSystemTransform 每条消息都触发）。
}
export async function handleToolExecuteBefore(input, output) {
    const payload = mapPreToolUse({
        tool: input.tool,
        input: output.args,
        sessionID: input.sessionID,
    });
    if (!payload)
        return;
    await runHook('pre-tool-use.js', payload, { timeoutMs: HOOK_TIMEOUT_MS });
}
export async function handleToolExecuteAfter(input, _output) {
    const payload = mapPreToolUse({
        tool: input.tool,
        input: input.args ?? {},
        sessionID: input.sessionID,
    });
    if (!payload)
        return;
    await runHook('post-tool-use.js', payload, { timeoutMs: HOOK_TIMEOUT_MS });
}
export async function handleCommandExecuteBefore(input, _output) {
    const payload = mapUserPromptSubmit(input);
    if (!payload)
        return;
    await runHook('user-prompt-submit.js', payload, { timeoutMs: HOOK_TIMEOUT_MS });
}
export async function handleEvent(input) {
    const ev = input.event;
    const t = ev.type;
    if (t === 'session.created' || t === 'session.deleted') {
        // Extract info from various Event variant shapes (properties.info or properties directly)
        const props = (ev.properties ?? {});
        const info = (props.info ?? props);
        const mapper = t === 'session.created' ? mapSessionStart : mapSessionEnd;
        const payload = mapper({ sessionID: info.id, directory: info.directory });
        const script = t === 'session.created' ? 'session-start.js' : 'session-end.js';
        await runHook(script, payload, { timeoutMs: HOOK_TIMEOUT_MS });
    }
}
//# sourceMappingURL=plugin.js.map