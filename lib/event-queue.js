import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getStateDir } from './platform.js';

function queuePath() {
  return path.join(getStateDir(), 'queue.jsonl');
}

async function ensureStateDir() {
  await mkdir(getStateDir(), { recursive: true, mode: 0o700 });
}

export async function enqueue(event) {
  await ensureStateDir();
  const line = JSON.stringify(event) + '\n';
  await appendFile(queuePath(), line, { mode: 0o600 });
}

export async function readAll() {
  try {
    const raw = await readFile(queuePath(), 'utf8');
    return raw
      .split('\n')
      .filter(l => l.trim())
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(e => e !== null);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function size() {
  return (await readAll()).length;
}

export async function peekAll() {
  return readAll();
}

export async function flush(uploader) {
  const events = await readAll();
  const remaining = [];
  for (const ev of events) {
    try {
      await uploader(ev);
    } catch {
      remaining.push(ev);
    }
  }
  await writeFile(
    queuePath(),
    remaining.map(e => JSON.stringify(e)).join('\n') + (remaining.length ? '\n' : ''),
    { mode: 0o600 }
  );
  return { uploaded: events.length - remaining.length, remaining: remaining.length };
}
