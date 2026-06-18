import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

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
  return os.homedir();
}

export function getPluginInstallDir() {
  return path.join(getHomeDir(), '.claude', 'plugins', 'oh-my-sdd');
}

export function getStateDir() {
  return path.join(getHomeDir(), '.oh-my-sdd');
}

export function isIamInPath() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['iam'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
