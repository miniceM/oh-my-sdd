import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadBaseline,
  buildSystemPrompt,
  writeAgentsMdFallback,
  detectExperimentalHook,
} from '../../../opencode/dist/baseline.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-baseline-'));
process.env.OMS_BASELINE_PATH = path.join(tmpDir, 'baseline.md');

const SAMPLE = `---
oms_version: 0.2.0
ratified: 2026-07-21
last_amended: 2026-07-21
---

<!-- Sync Impact Report -->
v0.2.0 — initial baseline
<!-- END Sync Impact Report -->

## Section A: Safety
HARD_RULE: no AK
HARD_RULE: no sk-

## Section B: Compliance
[OMSxxxx] commit format

## Section C: Operations
Use OVERRIDE sparingly
`;

test('baseline: loadBaseline reads file and removes frontmatter', async () => {
  fs.writeFileSync(process.env.OMS_BASELINE_PATH, SAMPLE);
  const sections = await loadBaseline();
  const joined = sections.join('\n');
  assert.ok(!joined.includes('oms_version:'), 'should strip frontmatter');
  assert.ok(joined.includes('## Section A'));
  assert.ok(joined.includes('## Section B'));
  assert.ok(joined.includes('## Section C'));
});

test('baseline: loadBaseline removes Sync Impact Report', async () => {
  fs.writeFileSync(process.env.OMS_BASELINE_PATH, SAMPLE);
  const sections = await loadBaseline();
  const joined = sections.join('\n');
  assert.ok(!joined.includes('Sync Impact Report'), 'should strip Sync Report');
  assert.ok(!joined.includes('v0.2.0 — initial'), 'should strip version line');
});

test('baseline: loadBaseline splits by ## headers', async () => {
  fs.writeFileSync(process.env.OMS_BASELINE_PATH, SAMPLE);
  const sections = await loadBaseline();
  assert.equal(sections.length, 3);
  assert.match(sections[0], /Section A/);
  assert.match(sections[1], /Section B/);
  assert.match(sections[2], /Section C/);
});

test('baseline: loadBaseline returns [] when file missing (fail-open)', async () => {
  fs.unlinkSync(process.env.OMS_BASELINE_PATH);
  const sections = await loadBaseline();
  assert.deepEqual(sections, []);
});

test('baseline: buildSystemPrompt appends to output.system', () => {
  const out = { system: ['You are an agent.'] };
  buildSystemPrompt(['Rule 1', 'Rule 2'], out);
  assert.deepEqual(out.system, ['You are an agent.', 'Rule 1', 'Rule 2']);
});

test('baseline: buildSystemPrompt creates system array if missing', () => {
  const out = {};
  buildSystemPrompt(['Rule 1'], out);
  assert.deepEqual(out.system, ['Rule 1']);
});

test('baseline: writeAgentsMdFallback writes to ~/.config/opencode/AGENTS.md', () => {
  // skip on Windows
  if (process.platform === 'win32') return;
  writeAgentsMdFallback(['Rule 1', 'Rule 2']);
  const home = os.homedir();
  const p = path.join(home, '.config', 'opencode', 'AGENTS.md');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('Rule 1'));
  assert.ok(content.includes('Rule 2'));
  fs.unlinkSync(p);
});

test('baseline: detectExperimentalHook returns true for current SDK', () => {
  const supported = detectExperimentalHook();
  assert.equal(typeof supported, 'boolean');
  assert.equal(supported, true);
});
