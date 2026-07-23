export declare function handleSystemTransform(_input: {
    sessionID?: string;
    model: unknown;
}, output: {
    system?: string[];
}): Promise<void>;
export declare function handleToolExecuteBefore(input: {
    tool: string;
    sessionID?: string;
    callID?: string;
}, output: {
    args: Record<string, unknown>;
}): Promise<void>;
export declare function handleToolExecuteAfter(input: {
    tool: string;
    sessionID?: string;
    callID?: string;
    args?: Record<string, unknown>;
}, _output: unknown): Promise<void>;
export declare function handleCommandExecuteBefore(input: {
    command?: string;
    sessionID?: string;
    arguments?: string;
}, _output: {
    parts: unknown[];
}): Promise<void>;
export declare function handleEvent(input: {
    event: {
        type: string;
        [k: string]: unknown;
    };
}): Promise<void>;
//# sourceMappingURL=plugin.d.ts.map