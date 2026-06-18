import { spawn } from 'node:child_process';
import path from 'node:path';

const LANG_BY_EXT = {
  '.ts': 'ts', '.tsx': 'ts', '.mts': 'ts', '.cts': 'ts',
  '.js': 'js', '.jsx': 'js', '.mjs': 'js', '.cjs': 'js',
  '.py': 'py',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rs',
  '.md': 'md',
  '.json': 'json',
  '.yml': 'yaml', '.yaml': 'yaml',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.sql': 'sql',
  '.html': 'html', '.css': 'css',
};

function langFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return LANG_BY_EXT[ext] ?? 'other';
}

function runGit(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk.toString(); });
    child.on('error', () => resolve({ ok: false, out: '' }));
    child.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

export async function computeCodeDelta(startSha, endRef = 'HEAD', cwd = process.cwd()) {
  // Compare startSha to current working tree (staged + unstaged). Using a single
  // commit arg rather than `startSha..endRef` ensures uncommitted session work is
  // captured — critical for session-end code_delta reporting (Task 9 consumer).
  const { ok, out } = await runGit(
    ['diff', '--numstat', startSha],
    cwd
  );
  if (!ok) {
    return { files_changed: 0, lines_added: 0, lines_deleted: 0, by_lang: {} };
  }
  const by_lang = {};
  let files_changed = 0;
  let lines_added = 0;
  let lines_deleted = 0;
  for (const line of out.split('\n').filter(l => l.trim())) {
    const [addedStr, deletedStr, filePath] = line.split('\t');
    if (!filePath) continue;
    files_changed++;
    if (addedStr !== '-') {
      const n = parseInt(addedStr, 10);
      lines_added += n;
      const lang = langFromPath(filePath);
      by_lang[lang] = (by_lang[lang] ?? 0) + n;
    }
    if (deletedStr !== '-') {
      lines_deleted += parseInt(deletedStr, 10);
    }
  }
  return { files_changed, lines_added, lines_deleted, by_lang };
}

export async function getCurrentHead(cwd = process.cwd()) {
  const { ok, out } = await runGit(['rev-parse', 'HEAD'], cwd);
  if (!ok) return null;
  return out.trim();
}

export async function getBranch(cwd = process.cwd()) {
  const { ok, out } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (!ok) return null;
  return out.trim();
}

export async function getRemote(cwd = process.cwd()) {
  const { ok, out } = await runGit(['config', '--get', 'remote.origin.url'], cwd);
  if (!ok) return null;
  return out.trim();
}
