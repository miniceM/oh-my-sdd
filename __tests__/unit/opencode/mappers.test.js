import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
 TOOL_MAP,
 TRACKED_TOOLS,
 mapPreToolUse,
 mapPostToolUse,
 mapSessionStart,
 mapSessionEnd,
 mapUserPromptSubmit,
} from '../../../opencode/src/mappers.ts';

describe('TOOL_MAP', () => {
 it('maps write → Write', () => {
 assert.equal(TOOL_MAP.write, 'Write');
 });

 it('maps edit → Edit', () => {
 assert.equal(TOOL_MAP.edit, 'Edit');
 });

 it('maps apply_patch → MultiEdit', () => {
 assert.equal(TOOL_MAP.apply_patch, 'MultiEdit');
 });

 it('does not map untracked tools', () => {
 assert.equal(TOOL_MAP.bash, undefined);
 assert.equal(TOOL_MAP.read, undefined);
 assert.equal(TOOL_MAP.glob, undefined);
 });

 // ─── New variant tests ─────────────────────────────────────────────
 it('maps already-capitalized Write → Write', () => {
 assert.equal(TOOL_MAP.Write, 'Write');
 });

 it('maps already-capitalized Edit → Edit', () => {
 assert.equal(TOOL_MAP.Edit, 'Edit');
 });

 it('maps already-capitalized MultiEdit → MultiEdit', () => {
 assert.equal(TOOL_MAP.MultiEdit, 'MultiEdit');
 });

 it('maps multiedit (no underscore) → MultiEdit', () => {
 assert.equal(TOOL_MAP.multiedit, 'MultiEdit');
 });

 it('maps applypatch (no underscore) → MultiEdit', () => {
 assert.equal(TOOL_MAP.applypatch, 'MultiEdit');
 });
});

describe('TRACKED_TOOLS', () => {
 it('contains Write, Edit, MultiEdit', () => {
 assert.ok(TRACKED_TOOLS.has('Write'));
 assert.ok(TRACKED_TOOLS.has('Edit'));
 assert.ok(TRACKED_TOOLS.has('MultiEdit'));
 });

 it('does not contain lowercase or untracked names', () => {
 assert.ok(!TRACKED_TOOLS.has('write'));
 assert.ok(!TRACKED_TOOLS.has('bash'));
 });
});

describe('mapPreToolUse', () => {
 it('returns null for untracked tool ("bash")', () => {
 assert.equal(mapPreToolUse({ tool: 'bash' }), null);
 });

 it('returns null for unknown tool ("glob")', () => {
 assert.equal(mapPreToolUse({ tool: 'glob' }), null);
 });

 it('maps "write" → { tool_name: "Write", tool_input: { file_path, content } }', () => {
 const result = mapPreToolUse({
 tool: 'write',
 input: { file_path: '/tmp/foo.js', content: 'hello' },
 });
 assert.deepEqual(result, {
 tool_name: 'Write',
 tool_input: { file_path: '/tmp/foo.js', content: 'hello' },
 });
 });

 it('maps "edit" → { tool_name: "Edit", tool_input: { file_path, new_string } }', () => {
 const result = mapPreToolUse({
 tool: 'edit',
 input: { file_path: '/tmp/foo.js', new_string: 'world' },
 });
 assert.deepEqual(result, {
 tool_name: 'Edit',
 tool_input: { file_path: '/tmp/foo.js', new_string: 'world' },
 });
 });

 it('maps "apply_patch" → { tool_name: "MultiEdit", tool_input: { edits } }', () => {
 const result = mapPreToolUse({
 tool: 'apply_patch',
 input: { edits: [{ new_string: 'patched' }] },
 });
 assert.deepEqual(result, {
 tool_name: 'MultiEdit',
 tool_input: { edits: [{ newString: 'patched', new_string: 'patched' }] },
 });
 });

 it('handles missing input (defaults to empty object)', () => {
 const result = mapPreToolUse({ tool: 'write' });
 assert.deepEqual(result, {
 tool_name: 'Write',
 tool_input: {},
 });
 });

 // ─── New tests: session_id pass-through ─────────────────────────────
 it('includes session_id when sessionID is provided', () => {
 const result = mapPreToolUse({
 tool: 'write',
 input: { file_path: '/tmp/foo.js' },
 sessionID: 'sess-123',
 });
 assert.deepEqual(result, {
 tool_name: 'Write',
 tool_input: { file_path: '/tmp/foo.js' },
 session_id: 'sess-123',
 });
 });

 it('omits session_id when sessionID is not provided', () => {
 const result = mapPreToolUse({
 tool: 'write',
 input: { file_path: '/tmp/foo.js' },
 });
 assert.equal(result?.session_id, undefined);
 assert.ok(!('session_id' in (result ?? {})));
 });

 // ─── New tests: tool name variants ──────────────────────────────────
 it('maps capitalized "Write" → Write', () => {
 const result = mapPreToolUse({ tool: 'Write', input: { file_path: '/a' } });
 assert.equal(result?.tool_name, 'Write');
 });

 it('maps "multiedit" → MultiEdit', () => {
 const result = mapPreToolUse({ tool: 'multiedit', input: { edits: [] } });
 assert.equal(result?.tool_name, 'MultiEdit');
 });

 // ─── New tests: full toolInput pass-through ─────────────────────────
 it('passes through unknown fields in toolInput', () => {
 const result = mapPreToolUse({
 tool: 'write',
 input: { file_path: '/a', content: 'x', old_string: 'old', create_file: true },
 });
 assert.deepEqual(result?.tool_input, {
 file_path: '/a',
 content: 'x',
 old_string: 'old',
 create_file: true,
 });
 });

 // ─── New tests: edits normalization ─────────────────────────────────
 it('normalizes edits[].new_string → edits[].newString', () => {
 const result = mapPreToolUse({
 tool: 'apply_patch',
 input: { edits: [{ new_string: 'patched', file_path: '/a' }] },
 });
 const edits = result?.tool_input?.edits;
 assert.ok(Array.isArray(edits));
 assert.equal(edits[0].newString, 'patched');
 // Original new_string is preserved via spread
 assert.equal(edits[0].new_string, 'patched');
 });

 it('preserves edits[].newString if already camelCase', () => {
 const result = mapPreToolUse({
 tool: 'apply_patch',
 input: { edits: [{ newString: 'already-camel' }] },
 });
 const edits = result?.tool_input?.edits;
 assert.equal(edits[0].newString, 'already-camel');
 });
});

describe('mapPostToolUse', () => {
 it('returns null for untracked tool', () => {
 assert.equal(mapPostToolUse({ tool: 'bash' }), null);
 });

 it('returns { tool_name, tool_input } for tracked tool', () => {
 const result = mapPostToolUse({
 tool: 'write',
 input: { file_path: '/tmp/foo.js', content: 'hello' },
 });
 assert.deepEqual(result, {
 tool_name: 'Write',
 tool_input: { file_path: '/tmp/foo.js', content: 'hello' },
 });
 });

 it('defaults tool_input to {} when input is missing', () => {
 const result = mapPostToolUse({ tool: 'edit' });
 assert.deepEqual(result, {
 tool_name: 'Edit',
 tool_input: {},
 });
 });

 // ─── New tests: session_id pass-through ─────────────────────────────
 it('includes session_id when sessionID is provided', () => {
 const result = mapPostToolUse({
 tool: 'write',
 input: { file_path: '/tmp/foo.js' },
 sessionID: 'sess-456',
 });
 assert.deepEqual(result, {
 tool_name: 'Write',
 tool_input: { file_path: '/tmp/foo.js' },
 session_id: 'sess-456',
 });
 });

 it('normalizes edits[].new_string in post-tool-use too', () => {
 const result = mapPostToolUse({
 tool: 'apply_patch',
 input: { edits: [{ new_string: 'done' }] },
 sessionID: 'sess-789',
 });
 const edits = result?.tool_input?.edits;
 assert.equal(edits[0].newString, 'done');
 assert.equal(result?.session_id, 'sess-789');
 });
});

describe('mapSessionStart', () => {
 it('returns { session_id, cwd } from input', () => {
 assert.deepEqual(mapSessionStart({ session_id: 'abc', cwd: '/tmp' }), {
 session_id: 'abc',
 cwd: '/tmp',
 });
 });

 it('generates session_id when missing', () => {
 const result = mapSessionStart({});
 assert.ok(result.session_id.startsWith('oms-opencode-'));
 });

 it('uses process.cwd() when cwd is missing', () => {
 const result = mapSessionStart({});
 assert.equal(result.cwd, process.cwd());
 });
});

describe('mapSessionEnd', () => {
 it('returns { session_id, cwd } from input', () => {
 assert.deepEqual(mapSessionEnd({ session_id: 'xyz', cwd: '/home' }), {
 session_id: 'xyz',
 cwd: '/home',
 });
 });

 it('generates session_id when missing', () => {
 const result = mapSessionEnd({});
 assert.ok(result.session_id.startsWith('oms-opencode-'));
 });
});

describe('mapUserPromptSubmit', () => {
 it('returns null when command is missing', () => {
 assert.equal(mapUserPromptSubmit({}), null);
 });

 it('returns { session_id, prompt, cwd } with command-name tags', () => {
 const result = mapUserPromptSubmit({ command: 'sdd-plan', session_id: 'sess-1' });
 assert.deepEqual(result, {
 session_id: 'sess-1',
 prompt: 'sdd-plan',
 cwd: process.cwd(),
 });
 });

 it('includes command-args when arguments are provided', () => {
 const result = mapUserPromptSubmit({
 command: 'sdd-plan',
 session_id: 'sess-1',
 arguments: '--verbose',
 });
 assert.deepEqual(result, {
 session_id: 'sess-1',
 prompt: 'sdd-plan--verbose',
 cwd: process.cwd(),
 });
 });

 it('accepts sessionID (SDK type) as fallback for session_id', () => {
 const result = mapUserPromptSubmit({ command: 'sdd-plan', sessionID: 'sess-2' });
 assert.equal(result?.session_id, 'sess-2');
 });

 it('generates session_id when both session_id and sessionID are missing', () => {
 const result = mapUserPromptSubmit({ command: 'sdd-plan' });
 assert.ok(typeof result?.session_id === 'string');
 assert.ok(result?.session_id?.startsWith('oms-opencode-'));
 });

 // ─── New tests: array arguments ─────────────────────────────────────
 it('handles arguments as readonly string[] (joins with space)', () => {
 const result = mapUserPromptSubmit({
 command: 'sdd-plan',
 session_id: 'sess-1',
 arguments: ['--verbose', '--dry-run'],
 });
 assert.deepEqual(result, {
 session_id: 'sess-1',
 prompt: 'sdd-plan--verbose --dry-run',
 cwd: process.cwd(),
 });
 });

 it('handles empty array arguments', () => {
 const result = mapUserPromptSubmit({
 command: 'sdd-plan',
 session_id: 'sess-1',
 arguments: [],
 });
 assert.deepEqual(result, {
 session_id: 'sess-1',
 prompt: 'sdd-plan',
 cwd: process.cwd(),
 });
 });
});
