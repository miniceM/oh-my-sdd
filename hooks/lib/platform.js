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
  // 优先用 env override（测试场景需要），fallback 到 os.homedir()
  // Windows 上 os.homedir() 不读 HOME，所以需要显式查 USERPROFILE
  return (
    process.env.HOME ||
    process.env.USERPROFILE ||
    os.homedir()
  );
}

export function getPluginInstallDir() {
  return path.join(getHomeDir(), '.claude', 'plugins', 'oh-my-sdd');
}

export function getStateDir() {
  return path.join(getHomeDir(), '.oh-my-sdd');
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
