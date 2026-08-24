import { getPluginRoot } from './paths.js';
/** Run package resource projection before OpenCode receives this plugin's hooks. */
export async function activatePlugin(registeredHooks) {
    // Kept dynamic because the shared bootstrap is an npm-packaged .mjs script.
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const bootstrap = await dynamicImport(new URL('../scripts/resource-bootstrap.mjs', import.meta.url).href);
    return bootstrap.bootstrapOpenCodeResources({ pluginRoot: getPluginRoot(), registeredHooks });
}
//# sourceMappingURL=activation.js.map