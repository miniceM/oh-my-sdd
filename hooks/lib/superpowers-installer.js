/**
 * Superpowers-zh installer.
 *
 * Integrates third-party superpowers-zh tool for delegated skills.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { OTHER } from './constants.js';
import { SUPERPOWERS_STAGING_DIR } from './paths.js';

/**
 * Announce message to stderr.
 * @param {string} msg - Message to announce
 */
function announce(msg) {
  process.stderr.write(msg + '\n');
}

/**
 * Install superpowers-zh package.
 * Creates staging directory and runs npx to install 20 superpowers skills.
 */
export function installSuperpowersZh() {
  // Clean up old staging if exists
  if (existsSync(SUPERPOWERS_STAGING_DIR)) {
    try {
      rmSync(SUPERPOWERS_STAGING_DIR, { recursive: true, force: true });
    } catch (e) {
      announce(`  ⚠️  清理旧 staging 失败: ${SUPERPOWERS_STAGING_DIR} (${e.message})`);
    }
  }
  mkdirSync(SUPERPOWERS_STAGING_DIR, { recursive: true });

  announce(`  通过 superpowers-zh 安装委托子技能（20 个 superpowers 汉化 + 中国原创 skills）...`);
  try {
    execFileSync('npx', ['-y', OTHER.SUPERPOWERS_ZH_PACKAGE, '--tool', 'opencode', '--force'], {
      cwd: SUPERPOWERS_STAGING_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
    const installedDir = join(SUPERPOWERS_STAGING_DIR, '.opencode', 'skills');
    if (existsSync(installedDir)) {
      const count = readdirSync(installedDir).filter(e =>
        existsSync(join(installedDir, e, 'SKILL.md'))
      ).length;
      announce(`  ✓ superpowers-zh 安装完成：${count} 个 skills 进入 staging 区`);
      return;
    }
    throw new Error('superpowers-zh 运行成功但 .opencode/skills/ 目录未生成');
  } catch (e) {
    const errMsg = e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
    announce(`  ⚠️  superpowers-zh 失败：${errMsg}`);
    announce(`      委托子技能将尝试从 .claude/skills/ 复制；若仍失败，agent 走 fallback chain 的 inline 执行`);
    announce(`      手动安装委托子技能：npx -y ${OTHER.SUPERPOWERS_ZH_PACKAGE} --tool opencode`);
    // Clean up failed staging
    try {
      rmSync(SUPERPOWERS_STAGING_DIR, { recursive: true, force: true });
    } catch (cleanupErr) {
      announce(`  ⚠️  清理失败 staging 失败: ${cleanupErr.message}`);
    }
  }
}

/**
 * Find delegated skills source directory.
 * Tries three sources in priority order:
 * 1. superpowers-zh staging
 * 2. packageRoot .claude/skills
 * 3. worktree fallback (main repo .claude/skills)
 *
 * @param {string} packageRoot - Package root directory
 * @returns {{path: string, source: string} | null} - Source info or null
 */
export function findDelegatedSkillsSource(packageRoot) {
  // Priority 1: superpowers-zh staging
  const stagingSkills = join(SUPERPOWERS_STAGING_DIR, '.opencode', 'skills');
  if (existsSync(stagingSkills)) {
    return { path: stagingSkills, source: 'superpowers-zh' };
  }

  // Priority 2: packageRoot .claude/skills
  const packageSkills = join(packageRoot, '.claude', 'skills');
  if (existsSync(packageSkills)) {
    return { path: packageSkills, source: 'packageRoot .claude/skills' };
  }

  // Priority 3: worktree fallback
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: packageRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const commonDirAbs = isAbsolute(commonDir) ? commonDir : join(packageRoot, commonDir);
    const mainRepoSkills = join(dirname(commonDirAbs), '.claude', 'skills');
    if (existsSync(mainRepoSkills)) {
      return { path: mainRepoSkills, source: 'main repo .claude/skills (worktree fallback)' };
    }
  } catch { /* not in a git repo or git not installed */ }

  return null;
}