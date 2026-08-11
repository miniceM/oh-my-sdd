import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const AGENTS_BEGIN = '<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->';
export const AGENTS_END = '<!-- OH-MY-SDD:END -->';

const MANAGED_BLOCK_RE = /<!-- OH-MY-SDD:BEGIN \(do not edit between these markers\) -->\r?\n?[\s\S]*?<!-- OH-MY-SDD:END -->\r?\n?/g;

export function getAgentsPath(home = homedir(), pathImpl = { join }) {
  return pathImpl.join(home, '.config', 'opencode', 'AGENTS.md');
}

function managedBlock(body) {
  return `${AGENTS_BEGIN}\n${body.trim()}\n${AGENTS_END}\n`;
}

export function upsertManagedAgentsBlock(file, body) {
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const cleaned = existing.replace(MANAGED_BLOCK_RE, '');
  const separator = cleaned.length > 0 && !cleaned.endsWith('\n') ? '\n' : '';
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${cleaned}${separator}${managedBlock(body)}`);
  return file;
}

export function removeManagedAgentsBlock(file) {
  if (!existsSync(file)) return false;
  const existing = readFileSync(file, 'utf8');
  const cleaned = existing.replace(MANAGED_BLOCK_RE, '');
  if (cleaned === existing) return false;
  if (cleaned.trim().length === 0) rmSync(file, { force: true });
  else writeFileSync(file, cleaned);
  return true;
}
