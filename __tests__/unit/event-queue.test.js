import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function setupQueue(t) {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-q-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  const mod = await import('../../hooks/lib/event-queue.js?' + Date.now());
  return mod;
}

test('enqueue writes JSONL line and size increments', async (t) => {
  const { enqueue, size } = await setupQueue(t);
  assert.equal(await size(), 0);
  await enqueue({ event: 'session.start', id: 1 });
  await enqueue({ event: 'session.end', id: 1 });
  assert.equal(await size(), 2);
});

test('flush removes successfully uploaded events', async (t) => {
  const { enqueue, flush, size } = await setupQueue(t);
  await enqueue({ event: 'a', id: 1 });
  await enqueue({ event: 'b', id: 2 });
  const ok = async () => true;
  await flush(ok);
  assert.equal(await size(), 0);
});

test('flush keeps failed events in queue', async (t) => {
  const { enqueue, flush, size } = await setupQueue(t);
  await enqueue({ event: 'a', id: 1 });
  await enqueue({ event: 'b', id: 2 });
  const fail = async () => { throw new Error('network'); };
  await flush(fail);
  assert.equal(await size(), 2);
});

test('flush handles partial success (first ok, second fails)', async (t) => {
  const { enqueue, flush, size } = await setupQueue(t);
  await enqueue({ event: 'a', id: 1 });
  await enqueue({ event: 'b', id: 2 });
  let call = 0;
  const uploader = async () => {
    call++;
    if (call === 2) throw new Error('fail');
    return true;
  };
  await flush(uploader);
  assert.equal(await size(), 1);
});

test('corrupted JSONL line does not crash size/enqueue', async (t) => {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-q-corrupt-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  const queueFile = path.join(tmpHome, '.oh-my-sdd', 'queue.jsonl');
  // Pre-seed a queue.jsonl with one valid + one corrupted line.
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(path.dirname(queueFile), { recursive: true });
  await writeFile(queueFile, JSON.stringify({ event: 'x', id: 9 }) + '\nNOT-JSON-AT-ALL\n');
  const { enqueue, size } = await import('../../hooks/lib/event-queue.js?' + Date.now());
  // Corrupted line must be skipped, valid line still counted.
  assert.equal(await size(), 1);
  await enqueue({ event: 'a', id: 1 });
  assert.equal(await size(), 2);
});

test('flush preserves order of failed events (FIFO)', async (t) => {
  const { enqueue, flush, peekAll } = await setupQueue(t);
  await enqueue({ event: 'a', id: 1 });
  await enqueue({ event: 'b', id: 2 });
  await enqueue({ event: 'c', id: 3 });
  const failingIds = new Set([2]);
  const uploader = async (ev) => {
    if (failingIds.has(ev.id)) throw new Error('fail');
    return true;
  };
  await flush(uploader);
  const remaining = await peekAll();
  assert.deepEqual(remaining.map(e => e.event), ['b']);
});
