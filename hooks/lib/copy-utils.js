/**
 * File copy utilities for install scripts.
 *
 * Eliminates repetitive copy patterns across install-opencode.js.
 */

import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Copy directory contents recursively.
 *
 * @param {string} srcDir - Source directory path
 * @param {string} targetDir - Target directory path
 * @param {object} [options] - Copy options
 * @param {function} [options.filter] - Filter function for entries (return true to copy)
 * @param {boolean} [options.recursive] - Copy subdirectories recursively (default: false)
 * @returns {number} Number of files copied
 */
export function copyDir(srcDir, targetDir, options = {}) {
  if (!existsSync(srcDir)) {
    return 0;
  }

  mkdirSync(targetDir, { recursive: true });

  const entries = readdirSync(srcDir);
  let copied = 0;

  for (const entry of entries) {
    if (options.filter && !options.filter(entry)) {
      continue;
    }

    const srcPath = join(srcDir, entry);
    const targetPath = join(targetDir, entry);

    if (options.recursive && statSync(srcPath).isDirectory()) {
      copied += copyDir(srcPath, targetPath, options);
    } else {
      try {
        copyFileSync(srcPath, targetPath);
        copied++;
      } catch (e) {
        // Log error but continue copying other files
        console.error(`[copyDir] Failed to copy ${srcPath} → ${targetPath}: ${e.message}`);
      }
    }
  }

  return copied;
}

/**
 * Copy specific files from source to target directory.
 *
 * @param {string} srcDir - Source directory path
 * @param {string} targetDir - Target directory path
 * @param {string[]} files - Array of filenames to copy
 * @returns {number} Number of files copied
 */
export function copyFiles(srcDir, targetDir, files) {
  if (!existsSync(srcDir)) {
    return 0;
  }

  mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  for (const file of files) {
    const srcPath = join(srcDir, file);
    if (existsSync(srcPath)) {
      try {
        copyFileSync(srcPath, join(targetDir, file));
        copied++;
      } catch (e) {
        console.error(`[copyFiles] Failed to copy ${file}: ${e.message}`);
      }
    }
  }

  return copied;
}