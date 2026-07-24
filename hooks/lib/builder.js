/**
 * TypeScript builder for OpenCode plugin.
 *
 * Compiles opencode/src/*.ts → opencode/dist/*.js
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Announce message to stderr.
 * @param {string} msg - Message to announce
 */
function announce(msg) {
  process.stderr.write(msg + '\n');
}

/**
 * Build OpenCode TypeScript plugin.
 * @param {string} packageRoot - Package root directory
 */
export function buildOpencodePlugin(packageRoot) {
  // Check if opencode/dist already exists (pre-compiled)
  const distDir = join(packageRoot, 'opencode', 'dist');
  if (existsSync(distDir)) {
    announce('  ✓ 使用预编译的 opencode/dist（跳过编译）');
    return;
  }

  announce('  编译 opencode TypeScript → JavaScript...');
  try {
    // On Windows, npm is npm.cmd, not npm
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npmCmd, ['run', 'build:opencode'], {
      cwd: packageRoot,
      stdio: 'inherit',  // Show output for debugging
      shell: process.platform === 'win32',  // Use shell on Windows
    });
    announce('  ✓ 编译完成');
  } catch (error) {
    announce(`  ❌ 编译失败: ${error.message}`);
    throw error;
  }
}