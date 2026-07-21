import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_MAP,
  normalizeArgs,
  mapSessionStart,
  mapSessionEnd,
  mapPreToolUse,
  mapPostToolUse,
  mapUserPromptSubmit,
} from '../../../opencode/dist/mappers.js';

// ============================================
// TOOL_MAP
// ============================================

test('mappers: TOOL_MAP lowercase write → PascalCase Write', () => {
  assert.equal(TOOL_MAP.write, 'Write');
});

test('mappers: TOOL_MAP lowercase edit → PascalCase Edit', () => {
  assert.equal(TOOL_MAP.edit, 'Edit');
});

test('mappers: TOOL_MAP apply_patch → MultiEdit', () => {
  assert.equal(TOOL_MAP.apply_patch, 'MultiEdit');
});

test('mappers: TOOL_MAP PascalCase pass-through', () => {
  assert.equal(TOOL_MAP.Write, 'Write');
  assert.equal(TOOL_MAP.Edit, 'Edit');
  assert.equal(TOOL_MAP.MultiEdit, 'MultiEdit');
});

test('mappers: TOOL_MAP common variants', () => {
  assert.equal(TOOL_MAP.multiedit, 'MultiEdit');
  assert.equal(TOOL_MAP.applypatch, 'MultiEdit');
});

// ============================================
// normalizeArgs
// ============================================

test('mappers: normalizeArgs new_string → newString at top level', () => {
  const out = normalizeArgs({ new_string: 'foo' });
  assert.equal(out.newString, 'foo');
  assert.equal(out.new_string, 'foo'); // passthrough
});

test('mappers: normalizeArgs recurses into edits[]', () => {
  const out = normalizeArgs({ edits: [{ new_string: 'bar' }] });
  assert.equal(out.edits[0].newString, 'bar');
});

test('mappers: normalizeArgs handles empty args', () => {
  const out = normalizeArgs({});
  assert.deepEqual(out, {});
});

// ============================================
// mapSessionStart / mapSessionEnd
// ============================================

test('mappers: mapSessionStart full input', () => {
  const out = mapSessionStart({ sessionID: 'abc-123', directory: '/work' });
  assert.deepEqual(out, { session_id: 'abc-123', cwd: '/work' });
});

test('mappers: mapSessionStart missing sessionID → fallback', () => {
  const out = mapSessionStart({ directory: '/work' });
  assert.match(out.session_id, /^oms-opencode-\d+$/);
  assert.equal(out.cwd, '/work');
});

test('mappers: mapSessionStart missing both → cwd fallback', () => {
  const out = mapSessionStart({});
  assert.match(out.session_id, /^oms-opencode-\d+$/);
  assert.equal(out.cwd, process.cwd());
});

test('mappers: mapSessionEnd same contract as mapSessionStart', () => {
  const out = mapSessionEnd({ sessionID: 'xyz', directory: '/x' });
  assert.deepEqual(out, { session_id: 'xyz', cwd: '/x' });
});

// ============================================
// mapPreToolUse / mapPostToolUse
// ============================================

test('mappers: mapPreToolUse tracked tool returns mapped payload', () => {
  const out = mapPreToolUse({
    tool: 'write',
    input: { file_path: '/x', content: 'hi' },
    sessionID: 's1',
  });
  assert.deepEqual(out, {
    tool_name: 'Write',
    tool_input: { file_path: '/x', content: 'hi' },
    session_id: 's1',
  });
});

test('mappers: mapPreToolUse untracked tool returns null', () => {
  const out = mapPreToolUse({ tool: 'bash', input: {}, sessionID: 's1' });
  assert.equal(out, null);
});

test('mappers: mapPreToolUse applies new_string normalization', () => {
  const out = mapPreToolUse({
    tool: 'edit',
    input: { file_path: '/x', new_string: 'new', old_string: 'old' },
    sessionID: 's1',
  });
  assert.equal(out?.tool_input.newString, 'new');
  assert.equal(out?.tool_input.old_string, 'old');
});

test('mappers: mapPreToolUse missing input → empty tool_input', () => {
  const out = mapPreToolUse({ tool: 'write', sessionID: 's1' });
  assert.deepEqual(out?.tool_input, {});
});

test('mappers: mapPostToolUse same contract as mapPreToolUse', () => {
  const out = mapPostToolUse({
    tool: 'edit',
    input: { file_path: '/x', newString: 'a' },
    sessionID: 's1',
  });
  assert.equal(out?.tool_name, 'Edit');
  assert.equal(out?.tool_input.newString, 'a');
});

// ============================================
// mapUserPromptSubmit
// ============================================

test('mappers: mapUserPromptSubmit full input', () => {
  const out = mapUserPromptSubmit({
    command: '/sdd-spec test-1',
    sessionID: 's1',
    arguments: '["test-1"]',
  });
  assert.equal(out?.session_id, 's1');
  assert.equal(out?.prompt, '/sdd-spec test-1 ["test-1"]');
  assert.equal(out?.cwd, process.cwd());
});

test('mappers: mapUserPromptSubmit missing command → null', () => {
  const out = mapUserPromptSubmit({ sessionID: 's1' });
  assert.equal(out, null);
});

test('mappers: mapUserPromptSubmit missing sessionID → fallback', () => {
  const out = mapUserPromptSubmit({ command: '/sdd-spec x' });
  assert.match(out?.session_id ?? '', /^oms-opencode-\d+$/);
});

test('mappers: mapUserPromptSubmit missing arguments → no trailing space', () => {
  const out = mapUserPromptSubmit({ command: '/sdd-spec x' });
  assert.equal(out?.prompt, '/sdd-spec x');
});
