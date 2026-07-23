import { handleSystemTransform, handleToolExecuteBefore, handleToolExecuteAfter, handleCommandExecuteBefore, handleEvent, } from './plugin.js';
import { handlePermissionAsk, isPermissionAskEnabled } from './permission.js';
import { log } from './logger.js';
export function createPlugin() {
    const hooks = {
        'experimental.chat.system.transform': handleSystemTransform,
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
    log('info', 'oh-my-sdd opencode plugin loaded', {});
    return createPlugin();
};
export default OhMySddPlugin;
//# sourceMappingURL=index.js.map