import { spawn } from 'node:child_process';

/**
 * Spawn a hook script with given stdin payload and return stdout/stderr.
 *
 * @param {string} hookPath - Absolute path to the hook script
 * @param {object} stdinPayload - JSON object to send via stdin
 * @param {object} env - Additional environment variables
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 */
export function runHook(hookPath, stdinPayload, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [hookPath], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(JSON.stringify(stdinPayload));
  });
}