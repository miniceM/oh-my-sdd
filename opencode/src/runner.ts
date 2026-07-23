/**
 * Spawn hooks/*.js as child process. Translates Claude hook protocol
 * (permissionDecision in stdout JSON) to OpenCode action (throw / return).
 *
 * Fail-CLOSED invariant: any hook error → throws HookError → OpenCode host
 * catches and blocks the tool. This is the security guarantee (spec G6).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { log } from './logger.js';
import { getHooksDir } from './paths.js';
import { TIMEOUTS } from './constants.js';
import type { HookResult } from './types.js';

export class HookError extends Error {
  constructor(
    public readonly category: 'CRASH' | 'TIMEOUT' | 'PROTOCOL' | 'PATH',
    public readonly hookScript: string,
    public readonly reason: string,
    public readonly exitCode?: number,
  ) {
    super(`[${category}] ${hookScript}: ${reason}`);
    this.name = 'HookError';
  }
}

export type RunHookOptions = {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
};

export function runHook(
  scriptName: string,
  payload: unknown,
  opts: RunHookOptions = {},
): Promise<HookResult | null> {
  const hooksDir = process.env.OMS_HOOKS_DIR ?? getHooksDir();
  const scriptPath = path.join(hooksDir, scriptName);
  const timeoutMs = opts.timeoutMs ?? TIMEOUTS.HOOK_DEFAULT_MS;

  return new Promise((resolve, reject) => {
    let proc: ChildProcess;
    try {
      proc = spawn('node', [scriptPath], {
        cwd: opts.cwd ?? process.cwd(),
        env: { ...process.env, ...opts.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      return reject(new HookError('PATH', scriptName, `spawn failed: ${(e as Error).message}`));
    }

    let stdout = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      action();
    };

    proc.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c: Buffer) => {
      log('debug', 'hook stderr', { script: scriptName, stderr: c.toString().slice(0, 500) });
    });
    proc.on('error', (err) => {
      finish(() => reject(new HookError('CRASH', scriptName, err.message)));
    });
    proc.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        return finish(() => reject(new HookError('CRASH', scriptName, `exit code ${code}`, code ?? undefined)));
      }
      let parsed: HookResult;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        return finish(() => reject(new HookError('PROTOCOL', scriptName, `stdout not valid JSON: ${(e as Error).message}`)));
      }
      const decision = parsed.hookSpecificOutput?.permissionDecision;
      if (decision === 'deny') {
        const reason = parsed.hookSpecificOutput?.permissionDecisionReason ?? 'blocked by hook';
        return finish(() => reject(new HookError('PROTOCOL', scriptName, reason)));
      }
      return finish(() => resolve(parsed));
    });

    timer = setTimeout(() => {
      finish(() => reject(new HookError('TIMEOUT', scriptName, `exceeded ${timeoutMs}ms`)));
    }, timeoutMs);

    try {
      proc.stdin?.write(JSON.stringify(payload));
      proc.stdin?.end();
    } catch (e) {
      finish(() => reject(new HookError('CRASH', scriptName, `stdin write failed: ${(e as Error).message}`)));
    }
  });
}
