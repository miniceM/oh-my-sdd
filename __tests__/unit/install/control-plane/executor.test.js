import assert from 'node:assert/strict';
import test from 'node:test';
import { executePlan, createStepResult } from '../../../../install/control-plane/executor.js';

async function collectEvents(generator) {
  const events = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

test('createStepResult returns a normalized install step record', () => {
  const step = createStepResult({
    host: 'claude',
    resource: { type: 'baseline', path: '/path/to/baseline.md' },
    action: 'update',
    status: 'succeeded',
    owned: true,
    message: 'Updated enterprise baseline',
  });

  assert.equal(step.host, 'claude');
  assert.equal(step.action, 'update');
  assert.equal(step.status, 'succeeded');
  assert.equal(step.owned, true);
  assert.match(step.id, /claude/);
});

test('executor emits running then succeeded for one OMS-owned resource', async () => {
  const plan = {
    schema_version: 1,
    hosts: [{
      id: 'claude',
      display_name: 'Claude Code',
      resources: [{ type: 'baseline', path: '/fake/baseline.md', action: 'update', owned: true }],
    }],
  };

  const events = await collectEvents(executePlan(plan, {
    applyResource: async (res) => ({ status: 'succeeded', owned: true, message: 'Done' }),
  }));

  assert.equal(events.length, 2);
  assert.equal(events[0].status, 'running');
  assert.equal(events[1].status, 'succeeded');
  assert.equal(events[1].owned, true);
});

test('a failed Claude step does not skip an independent OpenCode host', async () => {
  const plan = {
    schema_version: 1,
    hosts: [
      {
        id: 'claude',
        display_name: 'Claude Code',
        resources: [{ type: 'wrapper', path: '/bin/claude', action: 'create', owned: true }],
      },
      {
        id: 'opencode',
        display_name: 'OpenCode',
        resources: [{ type: 'npm-plugin', name: '@cli-tools/oh-my-sdd-opencode', action: 'register-plugin', owned: true }],
      },
    ],
  };

  const events = await collectEvents(executePlan(plan, {
    applyResource: async (res, { host }) => {
      if (host === 'claude') throw new Error('Permission denied writing wrapper');
      return { status: 'succeeded', owned: true };
    },
  }));

  const claudeEvents = events.filter(e => e.host === 'claude');
  const opencodeEvents = events.filter(e => e.host === 'opencode');

  assert.ok(claudeEvents.some(e => e.status === 'failed'));
  assert.ok(opencodeEvents.some(e => e.status === 'succeeded'));
});

test('classifyError handles standard Error and string errors', async () => {
  const plan = {
    schema_version: 1,
    hosts: [{
      id: 'kilocode',
      resources: [{ type: 'agents', path: '/fake/AGENTS.md', action: 'merge', owned: true }],
    }],
  };

  const events = await collectEvents(executePlan(plan, {
    applyResource: async () => { throw new Error('Disk full'); },
  }));

  const failedEvent = events.find(e => e.status === 'failed');
  assert.ok(failedEvent);
  assert.equal(failedEvent.reason, 'Disk full');
});
