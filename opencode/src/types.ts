export interface RunHookOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface OpenCodeSessionInput {
  session_id?: string;
  cwd?: string;
}

export interface OpenCodeToolInput {
  tool: string;
  input?: {
    file_path?: string;
    content?: string;
    new_string?: string;
    edits?: Array<{ new_string?: string }>;
  };
}

// Hook result may have permissionDecision or additionalContext
export type HookResult = Record<string, unknown>;
