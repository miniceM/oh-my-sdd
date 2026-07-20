/** OpenCode plugin composition root. Wires config → mappers → runner. */
import { loadConfig } from './config.js';
import { log } from './logger.js';
import { mapSessionStart, mapSessionEnd, mapPreToolUse, mapPostToolUse, mapUserPromptSubmit } from './mappers.js';
import { runHook } from './runner.js';
export const OhMySddPlugin = async (_ctx) => {
    const config = await loadConfig();
    if (config.disabled) {
        void log('info', 'Plugin disabled');
        return {};
    }
    return {
        'session.created': async (input) => {
            if (!config.hooks.sessionStart)
                return;
            await runHook('session-start.js', mapSessionStart(input), { timeoutMs: config.timeouts.sessionStart });
        },
        // session.deleted toggles with sessionStart (lifecycle paired)
        'session.deleted': async (input) => {
            if (!config.hooks.sessionStart)
                return;
            await runHook('session-end.js', mapSessionEnd(input), { timeoutMs: config.timeouts.preToolUse });
        },
        'tool.execute.before': async (input) => {
            if (!config.hooks.preToolUse)
                return;
            const stdinInput = mapPreToolUse(input);
            if (!stdinInput)
                return;
            const result = await runHook('pre-tool-use.js', stdinInput, { timeoutMs: config.timeouts.preToolUse });
            const out = result.hookSpecificOutput;
            if (out?.permissionDecision === 'deny')
                throw new Error(out?.permissionDecisionReason ?? 'HARD_RULE violated');
            if (result.additionalContext)
                process.stderr.write(`⚠️ oh-my-sdd: ${result.additionalContext}\n`);
        },
        'tool.execute.after': async (input) => {
            if (!config.hooks.postToolUse)
                return;
            const stdinInput = mapPostToolUse(input);
            if (!stdinInput)
                return;
            await runHook('post-tool-use.js', stdinInput, { timeoutMs: config.timeouts.postToolUse });
        },
        'command.execute.before': async (input) => {
            if (!config.hooks.userPrompt)
                return;
            const stdinInput = mapUserPromptSubmit(input);
            if (!stdinInput)
                return;
            await runHook('user-prompt-submit.js', stdinInput, { timeoutMs: config.timeouts.userPrompt }).catch(() => { });
        },
    };
};
export default OhMySddPlugin;
