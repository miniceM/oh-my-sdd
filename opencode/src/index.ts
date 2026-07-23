/**
 * Entry point for the oh-my-sdd OpenCode plugin.
 *
 * Exports:
 * - OhMySddPlugin: the @opencode-ai/plugin plugin function (default export)
 * - createPlugin: factory that assembles the Hooks object (testable)
 */
import type { Hooks, PluginInput, Plugin } from '@opencode-ai/plugin';
import {
  handleSystemTransform,
  handleToolExecuteBefore,
  handleToolExecuteAfter,
  handleCommandExecuteBefore,
  handleEvent,
} from './plugin.js';
import { handlePermissionAsk, isPermissionAskEnabled } from './permission.js';
import { log } from './logger.js';

export function createPlugin(): Hooks {
  const hooks: Hooks = {
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

export const OhMySddPlugin: Plugin = async (_input: PluginInput): Promise<Hooks> => {
  log('info', 'oh-my-sdd opencode plugin loaded', {});
  return createPlugin();
};

export default OhMySddPlugin;
