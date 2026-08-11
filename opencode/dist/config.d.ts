export type OhMySddConfig = {
    dop_endpoint: string;
    aih_system_name: string;
    log_level: 'debug' | 'info' | 'warn' | 'error';
    telemetry_disabled: boolean;
    opencode_hook_timeout_ms: number;
};
export declare function loadConfig(): OhMySddConfig;
export declare function getConfig(): OhMySddConfig;
//# sourceMappingURL=config.d.ts.map