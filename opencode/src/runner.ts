/**
 * Hook runner: spawns Node to execute hooks/*.js with stdin JSON in /
 * stdout JSON out — matching the Claude Code hook protocol.
 *
 * Why spawn instead of import: hooks/*.js are shared between the Claude
 * Code and OpenCode adapters. Keeping them as separate processes ensures
 * a single source of truth and process-level isolation (a misbehaving
 * hook cannot crash the plugin host).
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { HOOKS_DIR, PLUGIN_ROOT } from './paths.js';
import type { RunHookOptions } from './types.js';

export async function runHook(
  hookName: string,
  input: Record<string, unknown>,
  options: RunHookOptions = {},
): Promise<Record<string, unknown>> {
  const { timeoutMs = 5000 } = options;
  const hookPath = join(HOOKS_DIR, hookName);

  return new Promise((resolve) => {
    const proc = spawn('node', [hookPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, // hooks 依赖此 env 定位资源
        ...(options.env ?? {}),
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      // 超时 → 空响应（不阻断 OpenCode session）
      resolve({});
    }, timeoutMs);
    timer.unref?.();

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0 && code !== null) {
        // hook 异常退出：stderr 已写，不阻断
        // (oh-my-sdd 的 hooks 自带 fail-safe deny，但只在 PreToolUse 路径下)
      }
      const raw = stdout.trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        // 不是 JSON：忽略
        resolve({});
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      // spawn 失败（node 不在 PATH 等）→ 静默降级
      resolve({});
    });

    // 写 stdin JSON 并关闭
    try {
      proc.stdin?.end(JSON.stringify(input));
    } catch {
      // stdin 写入失败：忽略
    }
  });
}
