import { getPluginRoot } from './paths.js';

export type ActivationState = 'verified' | 'degraded' | 'failed';

export interface ActivationResult {
  state: ActivationState;
  resource_digest: string;
  drifted_resources: string[];
  failed_resources: string[];
}

/** Run package resource projection before OpenCode receives this plugin's hooks. */
export async function activatePlugin(registeredHooks: string[]): Promise<ActivationResult> {
  // Kept dynamic because the shared bootstrap is an npm-packaged .mjs script.
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{
    bootstrapOpenCodeResources(options: { pluginRoot: string; registeredHooks: string[] }): ActivationResult;
  }>;
  const bootstrap = await dynamicImport(new URL('../scripts/resource-bootstrap.mjs', import.meta.url).href);
  return bootstrap.bootstrapOpenCodeResources({ pluginRoot: getPluginRoot(), registeredHooks });
}
