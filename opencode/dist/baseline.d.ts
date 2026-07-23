export declare function loadBaseline(): Promise<string[]>;
/** Test-only: reset cache for test isolation */
export declare function resetForTest(): void;
/** @deprecated Use resetForTest() instead */
export declare const _resetBaselineCache: typeof resetForTest;
export declare function buildSystemPrompt(sections: string[], output: {
    system?: string[];
}): void;
export declare function writeAgentsMdFallback(sections: string[]): void;
export declare function detectExperimentalHook(): boolean;
//# sourceMappingURL=baseline.d.ts.map