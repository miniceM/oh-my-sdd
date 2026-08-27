export type ActivationState = 'verified' | 'degraded' | 'failed';
export interface ActivationResult {
    state: ActivationState;
    resource_digest: string;
    drifted_resources: string[];
    failed_resources: string[];
}
/** Run package resource projection before OpenCode receives this plugin's hooks. */
export declare function activatePlugin(registeredHooks: string[]): Promise<ActivationResult>;
//# sourceMappingURL=activation.d.ts.map