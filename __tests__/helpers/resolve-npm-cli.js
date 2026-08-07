import { existsSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

/**
 * Resolve the npm CLI entry point without shelling out to `npm`.
 *
 * Prefers `process.env.npm_execpath` (set when tests run inside an npm script,
 * including Windows CI), then falls back to npm-cli.js next to the running
 * Node binary or on PATH. Never spawns `npm`/`npm.cmd` directly, which avoids
 * the Windows `.cmd`-without-shell failure mode of `execFileSync`.
 *
 * @returns {string} absolute path to npm-cli.js
 */
export function resolveNpmCli() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return process.env.npm_execpath;
  }
  const candidates = [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    candidates.push(join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    const launcher = join(directory, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    if (process.platform !== 'win32' && existsSync(launcher)) {
      try { candidates.push(realpathSync(launcher)); } catch { /* try the next candidate */ }
    }
  }
  const npmCli = candidates.find((candidate) => existsSync(candidate));
  if (!npmCli) {
    throw new Error('could not resolve npm-cli.js for shell-free package test');
  }
  return npmCli;
}
