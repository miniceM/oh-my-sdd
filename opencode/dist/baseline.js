/**
 * Load enterprise-baseline.md and prepare for system prompt injection.
 * Strips YAML frontmatter + Sync Impact Report (internal-only).
 *
 * Fail-OPEN: if file missing → return []. Baseline is guidance; HARD_RULE
 * enforcement still works via PreToolUse hook (fail-CLOSED) regardless.
 *
 * 性能：内存缓存 + mtime 校验。baseline 文件极少变化，避免每次 handleSystemTransform
 * 都读盘 + 解析（用户每条消息都触发一次 system.transform，否则日志会迅速膨胀，
 * 且 disk I/O 浪费）。首次加载打一条 info 日志，后续 cache hit 完全静默。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getBaselinePath } from './paths.js';
import { log } from './logger.js';
// 缓存：sections + 文件 mtime。mtime 变化才重新加载。
let _cachedSections = null;
let _cachedMtimeMs = null;
let _loggedInitialLoad = false;
export async function loadBaseline() {
    const p = process.env.OMS_BASELINE_PATH ?? getBaselinePath();
    // 1. 检查 mtime —— 文件未变则直接返回缓存
    let stat = null;
    try {
        stat = fs.statSync(p);
    }
    catch (e) {
        if (e.code === 'ENOENT') {
            // 文件不存在：如果有缓存，保留缓存（容忍瞬态文件缺失，如原子写期间）
            // 如果完全没缓存，按 fail-open 返回 []
            if (_cachedSections !== null) {
                log('warn', 'baseline file temporarily missing, using cached sections', { path: p });
                return _cachedSections;
            }
            log('warn', 'baseline file missing, skipping injection', { path: p });
            return [];
        }
        throw e;
    }
    const mtimeMs = stat.mtimeMs;
    if (_cachedSections !== null && _cachedMtimeMs === mtimeMs) {
        return _cachedSections;
    }
    // 2. mtime 变化或首次：读盘 + 解析
    let raw;
    try {
        raw = fs.readFileSync(p, 'utf8');
    }
    catch (e) {
        if (e.code === 'ENOENT') {
            log('warn', 'baseline file missing, skipping injection', { path: p });
            return [];
        }
        throw e;
    }
    // Strip YAML frontmatter
    const noFrontmatter = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
    // Strip Sync Impact Report block
    const noSync = noFrontmatter.replace(/<!--\s*Sync Impact Report\s*-->[\s\S]*?<!--\s*END Sync Impact Report\s*-->\n*/, '');
    // Split by ## headers — the split removes the "## " prefix, re-add it
    const sections = noSync
        .split(/^## /m)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => `## ${s}`);
    // 3. 更新缓存
    _cachedSections = sections;
    _cachedMtimeMs = mtimeMs;
    // 4. 日志策略：首次加载打 info（带 count），后续 mtime 变化打 debug（管理员能诊断），
    //    cache hit 完全静默。避免每条用户消息都产生一条日志。
    if (!_loggedInitialLoad) {
        log('info', 'baseline loaded', { count: sections.length, path: p });
        _loggedInitialLoad = true;
    }
    else {
        log('debug', 'baseline reloaded (mtime changed)', { count: sections.length, path: p });
    }
    return sections;
}
/** Test-only: reset cache for test isolation */
export function resetForTest() {
    _cachedSections = null;
    _cachedMtimeMs = null;
    _loggedInitialLoad = false;
}
/** @deprecated Use resetForTest() instead */
export const _resetBaselineCache = resetForTest;
export function buildSystemPrompt(sections, output) {
    if (!output.system)
        output.system = [];
    output.system.push(...sections);
}
export function writeAgentsMdFallback(sections) {
    if (process.platform === 'win32') {
        log('warn', 'AGENTS.md fallback not implemented on Windows', {});
        return;
    }
    const home = os.homedir();
    const p = path.join(home, '.config', 'opencode', 'AGENTS.md');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, sections.join('\n\n') + '\n');
    log('info', 'wrote AGENTS.md fallback', { path: p });
}
export function detectExperimentalHook() {
    const sdkVersion = process.env.OMS_OPENCODE_SDK_VERSION ?? '1.15.13';
    const parts = sdkVersion.split('.').map(Number);
    const major = parts[0] ?? 0;
    const minor = parts[1] ?? 0;
    return major > 1 || (major === 1 && minor >= 15);
}
//# sourceMappingURL=baseline.js.map