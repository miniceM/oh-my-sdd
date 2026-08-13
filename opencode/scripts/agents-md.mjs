import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
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

const DEFAULT_FS = {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
};

function replaceFileAtomically(file, content, fsOverrides = {}) {
  const fs = { ...DEFAULT_FS, ...fsOverrides };
  const directory = dirname(file);
  const temporary = join(directory, `.${basename(file)}.oh-my-sdd-tmp-${process.pid}-${randomUUID()}`);
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : undefined;
  let replaced = false;
  try {
    fs.writeFileSync(temporary, content, {
      encoding: 'utf8',
      ...(mode === undefined ? {} : { mode }),
    });
    fs.renameSync(temporary, file);
    replaced = true;
  } finally {
    if (!replaced) fs.rmSync(temporary, { force: true });
  }
}

export function upsertManagedAgentsBlock(file, body, options = {}) {
  const fs = { ...DEFAULT_FS, ...options.fs };
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const cleaned = existing.replace(MANAGED_BLOCK_RE, '');
  const separator = cleaned.length > 0 && !cleaned.endsWith('\n') ? '\n' : '';
  fs.mkdirSync(dirname(file), { recursive: true });
  replaceFileAtomically(file, `${cleaned}${separator}${managedBlock(body)}`, options.fs);
  return file;
}

export function removeManagedAgentsBlock(file, options = {}) {
  const fs = { ...DEFAULT_FS, ...options.fs };
  if (!fs.existsSync(file)) return false;
  const existing = fs.readFileSync(file, 'utf8');
  const cleaned = existing.replace(MANAGED_BLOCK_RE, '');
  if (cleaned === existing) return false;
  if (cleaned.length === 0) fs.rmSync(file, { force: true });
  else replaceFileAtomically(file, cleaned, options.fs);
  return true;
}
