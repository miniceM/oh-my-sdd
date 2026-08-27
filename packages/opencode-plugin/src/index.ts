/**
 * Entry point for the oh-my-sdd OpenCode plugin.
 *
 * Exports:
 * - OhMySddPlugin: the @opencode-ai/plugin plugin function (default export)
 * - createPlugin: factory that assembles the Hooks object (testable)
 */
import type { Hooks, PluginInput, Plugin } from '@opencode-ai/plugin';
import {
  handleToolExecuteBefore,
  handleToolExecuteAfter,
  handleCommandExecuteBefore,
  handleEvent,
} from './plugin.js';
import { handlePermissionAsk, isPermissionAskEnabled } from './permission.js';
import { log } from './logger.js';
import { activatePlugin } from './activation.js';

export function createPlugin(): Hooks {
  const hooks: Hooks = {
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

export const OhMySddPlugin: Plugin = async (_input: PluginInput): Promise<Hooks> => {
  const hooks = createPlugin();
  const activation = await activatePlugin(Object.keys(hooks));
  if (activation.state === 'failed') {
    throw new Error(`oh-my-sdd resource activation failed: ${activation.failed_resources.join(', ')}`);
  }
  log('info', 'oh-my-sdd opencode plugin loaded', {});
  return hooks;
};

export default OhMySddPlugin;
