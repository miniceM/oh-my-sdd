import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export function isWindows() {
  return process.platform === 'win32';
}

export function getNodeVersion() {
  return process.version;
}

export function checkNodeVersion(minVersion) {
  const current = process.versions.node.split('.').map(Number);
  const min = minVersion.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (current[i] > min[i]) return true;
    if (current[i] < min[i]) return false;
  }
  return true;
}

export function getHomeDir() {
  // 统一跨平台 home 目录获取策略
  // 优先级：XDG_HOME_DIR > HOME > USERPROFILE > os.homedir()
  // 遵循 XDG Base Directory Spec，优先使用 XDG_HOME_DIR
  if (process.env.XDG_HOME_DIR) {
    return process.env.XDG_HOME_DIR;
  }
  // macOS/Linux 标准环境变量
  if (process.env.HOME) {
    return process.env.HOME;
  }
  // Windows 标准环境变量
  if (process.env.USERPROFILE) {
    return process.env.USERPROFILE;
  }
  // Node.js 备用方案
  return os.homedir();
}

export function getStateDir() {
  // 状态目录统一使用 ~/.oh-my-sdd（与 AGENTS.md、uninstall.js 保持一致）
  return path.join(getHomeDir(), '.oh-my-sdd');
}

export function getPluginInstallDir() {
  return path.join(getHomeDir(), '.claude', 'plugins', 'oh-my-sdd');
}

// Resolve the on-disk path for a session meta file. session_ids coming from
// Claude Code via stdin are expected to be UUIDs, but stdin is untrusted
// input — a malicious value like `../../etc/cron.d/evil` must not escape the
// sessions dir. We strip every char outside [A-Za-z0-9_-] so any path
// separators (`/`, `..`, `\`, `:`) collapse harmlessly. Returns null for
// empty/missing input so callers can short-circuit to a no-op `{}` response
// rather than touch the filesystem with an empty filename.
export function sessionMetaPath(sessionId) {
  const safe = String(sessionId ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) return null;
  return path.join(getStateDir(), 'sessions', `${safe}.json`);
}

export function isIamInPath() {
  if (isWindows()) {
    // Windows: `where iam` 通常能查 PATHEXT 里的所有扩展名（.exe/.cmd/.bat）。
    // 但如果 PATHEXT 被改或 iam 是非标准扩展，显式多试几种更稳。
    for (const name of ['iam', 'iam.exe', 'iam.cmd', 'iam.bat']) {
      try {
        execFileSync('where', [name], { stdio: 'ignore' });
        return true;
      } catch { /* try next */ }
    }
    return false;
  }
  try {
    execFileSync('which', ['iam'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
