/**
 * TypeScript builder for OpenCode plugin.
 *
 * Compiles this bridge package's src/*.ts → dist/*.js.
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
  // Check if dist already exists (pre-compiled)
  const distDir = join(packageRoot, 'dist');
  if (existsSync(distDir)) {
    announce('  ✓ 使用预编译的 dist（跳过编译）');
    return;
  }

  announce('  编译 OpenCode 原生桥接 TypeScript → JavaScript...');
  try {
    // On Windows, npm is npm.cmd, not npm
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npmCmd, ['run', 'build'], {
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
