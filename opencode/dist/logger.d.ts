export declare function log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, payload?: Record<string, unknown>): void;
/** Test-only: reset cached log path and delete the log file */
export declare function resetForTest(): void;
/** @deprecated Use resetForTest() instead */
export declare const _resetForTest: typeof resetForTest;
//# sourceMappingURL=logger.d.ts.map