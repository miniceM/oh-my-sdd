/**
 * permission.ask handler — STUB for YAGNI.
 * Will be enabled when OpenCode introduces a permission UI.
 * Currently: no-op.
 */
export declare function isPermissionAskEnabled(): boolean;
export declare function handlePermissionAsk(_input: Record<string, unknown>, _output: {
    status: 'ask' | 'deny' | 'allow';
}): Promise<void>;
//# sourceMappingURL=permission.d.ts.map