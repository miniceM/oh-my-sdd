import { handleToolExecuteBefore, handleToolExecuteAfter, handleCommandExecuteBefore, handleEvent, } from './plugin.js';
import { handlePermissionAsk, isPermissionAskEnabled } from './permission.js';
import { log } from './logger.js';
import { activatePlugin } from './activation.js';
export function createPlugin() {
    const hooks = {
        'tool.execute.before': handleToolExecuteBefore,
        'tool.execute.after': handleToolExecuteAfter,
        'command.execute.before': handleCommandExecuteBefore,
        event: handleEvent,
    };
    if (isPermissionAskEnabled()) {
        hooks['permission.ask'] = handlePermissionAsk;
    }
    return hooks;
}
export const OhMySddPlugin = async (_input) => {
    const hooks = createPlugin();
    const activation = await activatePlugin(Object.keys(hooks));
    if (activation.state === 'failed') {
        throw new Error(`oh-my-sdd resource activation failed: ${activation.failed_resources.join(', ')}`);
    }
    log('info', 'oh-my-sdd opencode plugin loaded', {});
    return hooks;
};
export default OhMySddPlugin;
//# sourceMappingURL=index.js.map