import type { HookResult } from './types.js';
export declare class HookError extends Error {
    readonly category: 'CRASH' | 'TIMEOUT' | 'PROTOCOL' | 'PATH';
    readonly hookScript: string;
    readonly reason: string;
    readonly exitCode?: number | undefined;
    constructor(category: 'CRASH' | 'TIMEOUT' | 'PROTOCOL' | 'PATH', hookScript: string, reason: string, exitCode?: number | undefined);
}
export type RunHookOptions = {
    timeoutMs?: number;
    cwd?: string;
    env?: Record<string, string>;
};
export declare function runHook(scriptName: string, payload: unknown, opts?: RunHookOptions): Promise<HookResult | null>;
//# sourceMappingURL=runner.d.ts.map