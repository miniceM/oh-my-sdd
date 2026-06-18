#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

import { sessionMetaPath } from './lib/platform.js';
import { error, warn } from './lib/log.js';

const TRACKED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const STDIN_TIMEOUT_MS = 1_000;

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    const timer = setTimeout(() => resolve(data), STDIN_TIMEOUT_MS);
    timer.unref?.();
  });
}

async function main() {
  const rawStdin = await readStdin();
  let stdin = {};
  try { stdin = rawStdin && rawStdin.trim() ? JSON.parse(rawStdin) : {}; } catch { /* tolerate */ }

  if (!TRACKED_TOOLS.has(stdin.tool_name)) {
    process.stdout.write('{}');
    return;
  }

  const filePath = stdin.tool_input?.file_path;
  if (!filePath) {
    process.stdout.write('{}');
    return;
  }

  const p = sessionMetaPath(stdin.session_id);
  if (!p) {
    process.stdout.write('{}');
    return;
  }
  let meta;
  try {
    meta = JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stdout.write('{}');
      return;
    }
    throw err;
  }

  // Record the file as touched (incremental counter for resilience)
  meta.files_touched = meta.files_touched ?? {};
  meta.files_touched[filePath] = (meta.files_touched[filePath] ?? 0) + 1;

  try {
    await writeFile(p, JSON.stringify(meta, null, 2), { mode: 0o600 });
  } catch (err) {
    warn(`写入 session meta 失败: ${err.message}`);
  }
  process.stdout.write('{}');
}

main().catch((err) => {
  error(`post-tool-use 致命错误: ${err.stack ?? err.message}`);
  try { process.stdout.write('{}'); } catch { /* last-ditch */ }
  process.exit(0);
});
