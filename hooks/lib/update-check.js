import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getStateDir } from './platform.js';
import { loadConfig } from './config.js';
import { debug } from './log.js';

// ============================================
// 常量配置
// ============================================
const UPDATE_CACHE_FILE = 'update-cache.json';
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_CHECK_INTERVAL_DAYS = 1;
const PACKAGE_NAME = '@cli-tools/oh-my-sdd';

// ============================================
// 错误类
// ============================================
export class UpdateCheckError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'UpdateCheckError';
    this.cause = cause;
  }
}

// ============================================
// SemVer 解析（支持 prerelease）
// ============================================
const SEMVER_FULL_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;

export function parseSemVerFull(v) {
  const m = v.match(SEMVER_FULL_RE);
  if (!m) return null;
  return {
    major: +m[1],
    minor: +m[2],
    patch: +m[3],
    prerelease: m[4] || null,
    build: m[5] || null,
    raw: v,
  };
}

// ============================================
// 版本比较
// ============================================
export function compareVersions(current, latest, { includePrerelease = false } = {}) {
  const curr = parseSemVerFull(current);
  const lat = parseSemVerFull(latest);

  if (!curr || !lat) {
    return { isNewer: false, bump: null };
  }

  // 如果 latest 是 prerelease 且不包含 prerelease，跳过
  if (lat.prerelease && !includePrerelease) {
    return { isNewer: false, bump: null };
  }

  // 比较 major
  if (lat.major > curr.major) return { isNewer: true, bump: 'major' };
  if (lat.major < curr.major) return { isNewer: false, bump: null };

  // 比较 minor
  if (lat.minor > curr.minor) return { isNewer: true, bump: 'minor' };
  if (lat.minor < curr.minor) return { isNewer: false, bump: null };

  // 比较 patch
  if (lat.patch > curr.patch) return { isNewer: true, bump: 'patch' };
  if (lat.patch < curr.patch) return { isNewer: false, bump: null };

  // 同 major.minor.patch - 检查 prerelease
  if (lat.prerelease && !curr.prerelease) {
    // latest 是 prerelease，current 是 stable - 不是更新
    return { isNewer: false, bump: null };
  }

  if (!lat.prerelease && curr.prerelease) {
    // latest 是 stable，current 是 prerelease - 这是更新
    return { isNewer: true, bump: 'prerelease' };
  }

  if (lat.prerelease && curr.prerelease) {
    // 都是 prerelease - 词汇比较 (alpha < beta < rc)
    if (lat.prerelease > curr.prerelease) {
      return { isNewer: true, bump: 'prerelease' };
    }
  }

  return { isNewer: false, bump: null };
}

// ============================================
// 缓存读写
// ============================================
function cachePath() {
  return path.join(getStateDir(), UPDATE_CACHE_FILE);
}

export async function loadCache() {
  try {
    const raw = await readFile(cachePath(), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    // 缓存损坏 - 返回 null
    debug(`update-cache.json 损坏: ${err.message}`);
    return null;
  }
}

export async function saveCache(cache) {
  const dir = getStateDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(cachePath(), JSON.stringify(cache, null, 2) + '\n', { mode: 0o600 });
}

// ============================================
// 判断是否需要检测
// ============================================
export function shouldCheck(cache, intervalDays) {
  if (!cache?.last_check_at) return true;

  const lastCheck = new Date(cache.last_check_at).getTime();
  const now = Date.now();
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

  return (now - lastCheck) >= intervalMs;
}

// ============================================
// 从 npm registry 获取最新版本
// ============================================
export async function fetchLatestVersion(packageName, registryUrl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  // 编码 scoped package 名: @cli-tools/oh-my-sdd -> @cli-tools%2Foh-my-sdd
  const encodedName = encodeURIComponent(packageName);
  const url = `${registryUrl.replace(/\/$/, '')}/${encodedName}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new UpdateCheckError(`Registry 返回 HTTP ${res.status}`);
    }

    const data = await res.json();

    // 处理标准 npm 和企业 registry 格式
    const latest = data['dist-tags']?.latest;
    if (!latest) {
      throw new UpdateCheckError('Registry 未返回 latest dist-tag');
    }

    return latest;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new UpdateCheckError(`Registry 查询超时 (${timeoutMs}ms)`);
    }
    // 网络错误细分处理
    if (err.code === 'ENOTFOUND') {
      throw new UpdateCheckError(`Registry 地址无法解析: ${registryUrl}`, { cause: err });
    }
    if (err.code === 'ECONNREFUSED') {
      throw new UpdateCheckError(`Registry 连接被拒绝: ${registryUrl}`, { cause: err });
    }
    if (err.code === 'ETIMEDOUT') {
      throw new UpdateCheckError(`Registry 连接超时: ${registryUrl}`, { cause: err });
    }
    throw new UpdateCheckError(`Registry 请求失败: ${err.message}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

// ============================================
// 主入口 - 检查更新
// ============================================
export async function checkForUpdates({
  currentVersion,
  registryUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  checkIntervalDays,
} = {}) {
  // 加载配置（只加载一次）
  const cfg = await loadConfig();

  // 检查是否禁用更新检测
  if (cfg.update_check_disabled) {
    debug('更新检测已禁用');
    return { hasUpdate: false, currentVersion, disabled: true };
  }

  // 使用配置或参数中的 registry URL
  if (!registryUrl) {
    registryUrl = cfg.npm_registry || 'https://npm.enterprise.com';
  }

  // 使用配置或参数中的检测间隔
  if (!checkIntervalDays) {
    checkIntervalDays = cfg.update_check_interval_days || DEFAULT_CHECK_INTERVAL_DAYS;
  }

  // 加载缓存
  const cache = await loadCache();

  // 判断是否需要检测
  if (!shouldCheck(cache, checkIntervalDays)) {
    debug(`更新检测跳过: 间隔未过 (上次检测: ${cache?.last_check_at})`);
    return {
      hasUpdate: false,
      currentVersion,
      cachedLatest: cache?.latest_version,
      skipped: true,
    };
  }

  // 获取最新版本
  let latestVersion;
  try {
    latestVersion = await fetchLatestVersion(PACKAGE_NAME, registryUrl, timeoutMs);
  } catch (err) {
    debug(`更新检测失败: ${err.message}`);

    // 即使失败也更新 last_check_at，避免频繁请求
    await saveCache({
      last_check_at: new Date().toISOString(),
      latest_version: cache?.latest_version || null,
      last_notified_version: cache?.last_notified_version || null,
      check_interval_days: checkIntervalDays,
    });

    return {
      hasUpdate: false,
      currentVersion,
      error: err,
    };
  }

  // 判断当前是否是 prerelease
  const currParsed = parseSemVerFull(currentVersion);
  const includePrerelease = currParsed?.prerelease != null;

  // 比较版本
  const comparison = compareVersions(currentVersion, latestVersion, { includePrerelease });

  // 更新缓存
  await saveCache({
    last_check_at: new Date().toISOString(),
    latest_version: latestVersion,
    last_notified_version: cache?.last_notified_version || null,
    check_interval_days: checkIntervalDays,
  });

  return {
    hasUpdate: comparison.isNewer,
    latestVersion: comparison.isNewer ? latestVersion : undefined,
    currentVersion,
    bump: comparison.bump,
    cachedLatest: latestVersion,
  };
}

// ============================================
// 构建通知消息
// ============================================
export function buildUpdateNotification({ currentVersion, latestVersion, bump }) {
  const bumpEmoji = {
    major: '🔴',
    minor: '🟡',
    patch: '🟢',
    prerelease: '🔵',
  };

  const bumpLabel = {
    major: '主版本',
    minor: '次版本',
    patch: '补丁版本',
    prerelease: '预发布版',
  };

  const emoji = bumpEmoji[bump] || '📦';
  const label = bumpLabel[bump] || '';

  const stderr = `${emoji} oh-my-sdd: 有新版本可用 (${latestVersion}，当前 ${currentVersion})\n` +
                 `   运行 oms-update 自动更新\n`;

  const additionalContext = `\n---\n**${emoji} oh-my-sdd 更新提醒**\n\n` +
    `当前版本: \`${currentVersion}\`\n` +
    `最新版本: \`${latestVersion}\` (${label})\n\n` +
    `更新后请 **reload Claude Code 或重启终端** 以激活新功能。\n\n` +
    `运行 \`oms-update\` 或执行：\n` +
    `\`\`\`bash\noms-update\n\`\`\`\n`;

  return { stderr, additionalContext };
}
