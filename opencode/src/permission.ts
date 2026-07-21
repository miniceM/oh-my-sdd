/**
 * permission.ask handler — STUB for YAGNI.
 * Will be enabled when OpenCode introduces a permission UI.
 * Currently: no-op.
 */
export function isPermissionAskEnabled(): boolean {
  return false;
}

export async function handlePermissionAsk(
  _input: Record<string, unknown>,
  _output: { status: 'ask' | 'deny' | 'allow' },
): Promise<void> {
  // no-op (YAGNI)
}
