/**
 * TypeScript builder for OpenCode plugin.
 *
 * Compiles opencode/src/*.ts → opencode/dist/*.js
 */

import { execFileSync } from 'node:child_process';

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
  announce('  编译 opencode TypeScript → JavaScript...');
  try {
    execFileSync('npm', ['run', 'build:opencode'], {
      cwd: packageRoot,
      stdio: 'inherit',  // Show output for debugging
    });
    announce('  ✓ 编译完成');
  } catch (error) {
    announce(`  ❌ 编译失败: ${error.message}`);
    throw error;
  }
}