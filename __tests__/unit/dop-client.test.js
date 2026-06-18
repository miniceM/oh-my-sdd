import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function startStubDop() {
  const received = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ method: req.method, path: req.url, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => server.listen(0, r));
  return {
    port: server.address().port,
    received,
    close: () => new Promise((r) => server.close(r)),
  };
}

async function setupConfig(t, overrides = {}) {
  const tmpHome = mkdtempSync(path.join(tmpdir(), 'oms-dop-'));
  t.after(() => rmSync(tmpHome, { recursive: true, force: true }));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  const { saveConfig } = await import('../../hooks/lib/config.js?' + Date.now());
  await saveConfig(overrides);
}

test('report POSTs event as JSON', async (t) => {
  const stub = await startStubDop();
  t.after(() => stub.close());
  await setupConfig(t, { dop_endpoint: `http://localhost:${stub.port}` });

  const { report } = await import('../../hooks/lib/dop-client.js?' + Date.now());
  await report({ event: 'session.start', id: 'x' });

  assert.equal(stub.received.length, 1);
  assert.equal(stub.received[0].method, 'POST');
  assert.equal(stub.received[0].body.event, 'session.start');
});

test('report throws on 500', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(500); res.end('boom');
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  t.after(() => new Promise((r) => server.close(r)));
  await setupConfig(t, { dop_endpoint: `http://localhost:${port}` });

  const { report } = await import('../../hooks/lib/dop-client.js?' + Date.now());
  await assert.rejects(() => report({ event: 'x' }));
});

test('report throws on network error (port closed)', async (t) => {
  await setupConfig(t, { dop_endpoint: 'http://localhost:1' }); // port 1 is reserved/closed
  const { report } = await import('../../hooks/lib/dop-client.js?' + Date.now());
  await assert.rejects(() => report({ event: 'x' }));
});

test('reportOrEnqueue retries on transient failure then succeeds', async (t) => {
  // Stub server that fails the first request with 500, succeeds after.
  let requestCount = 0;
  const server = createServer((req, res) => {
    requestCount++;
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (requestCount === 1) {
        res.writeHead(500); res.end('transient');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      }
    });
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  t.after(() => new Promise((r) => server.close(r)));
  await setupConfig(t, { dop_endpoint: `http://localhost:${port}` });

  const { reportOrEnqueue } = await import('../../hooks/lib/dop-client.js?' + Date.now());
  await reportOrEnqueue({ event: 'x.retry' });

  // First attempt failed (500), second succeeded — exactly 2 attempts total.
  assert.equal(requestCount, 2);
});

test('reportOrEnqueue enqueues after all retries exhausted', async (t) => {
  // Stub server that always fails.
  let requestCount = 0;
  const server = createServer((req, res) => {
    requestCount++;
    res.writeHead(500); res.end('always fail');
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  t.after(() => new Promise((r) => server.close(r)));
  await setupConfig(t, { dop_endpoint: `http://localhost:${port}` });

  const { reportOrEnqueue } = await import('../../hooks/lib/dop-client.js?' + Date.now());
  await reportOrEnqueue({ event: 'x.exhaust' });

  // MAX_REPORT_RETRIES = 2 → 1 initial + 2 retries = 3 attempts total.
  assert.equal(requestCount, 3);

  // Event should have been enqueued to disk for later flush.
  const { readAll } = await import('../../hooks/lib/event-queue.js?' + Date.now());
  const queued = await readAll();
  const found = queued.find((e) => e.event === 'x.exhaust');
  assert.ok(found, 'event should be enqueued after retries exhausted');
});

test('shouldSkipTelemetry returns true when telemetry_disabled', async (t) => {
  await setupConfig(t, { telemetry_disabled: true });
  const { shouldSkipTelemetry } = await import('../../hooks/lib/dop-client.js?' + Date.now());
  assert.equal(await shouldSkipTelemetry({ cwd: '/tmp' }), true);
});

test('shouldSkipTelemetry returns true when .sdd-no-telemetry exists in cwd', async (t) => {
  const projectDir = mkdtempSync(path.join(tmpdir(), 'oms-proj-'));
  t.after(() => rmSync(projectDir, { recursive: true, force: true }));
  writeFileSync(path.join(projectDir, '.sdd-no-telemetry'), '');
  await setupConfig(t);
  const { shouldSkipTelemetry } = await import('../../hooks/lib/dop-client.js?' + Date.now());
  assert.equal(await shouldSkipTelemetry({ cwd: projectDir }), true);
});

test('shouldSkipTelemetry returns false otherwise', async (t) => {
  await setupConfig(t);
  const { shouldSkipTelemetry } = await import('../../hooks/lib/dop-client.js?' + Date.now());
  assert.equal(await shouldSkipTelemetry({ cwd: '/tmp' }), false);
});
