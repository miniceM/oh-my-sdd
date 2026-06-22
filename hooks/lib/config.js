import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getStateDir } from './platform.js';

export const DEFAULT_CONFIG = {
  dop_endpoint: 'https://dop.enterprise.com',
  required_systems: 2,  // devops + gitee（Q3 决策：两个都必须登录）
  log_level: 'info',
  telemetry_disabled: false,
};

function configPath() {
  return path.join(getStateDir(), 'config.json');
}

export async function loadConfig() {
  try {
    const raw = await readFile(configPath(), 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULT_CONFIG };
    throw err;
  }
}

export async function saveConfig(partial) {
  const merged = { ...DEFAULT_CONFIG, ...(await loadConfig()), ...partial };
  await mkdir(getStateDir(), { recursive: true, mode: 0o700 });
  await writeFile(configPath(), JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
  return merged;
}
