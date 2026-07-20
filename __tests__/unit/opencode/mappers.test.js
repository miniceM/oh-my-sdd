import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_MAP,
  TRACKED_TOOLS,
  mapPreToolUse,
  mapPostToolUse,
  mapSessionStart,
  mapSessionEnd,
  mapUserPromptSubmit,
} from '../../../opencode/dist/mappers.js';

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
    const result = mapPreToolUse({ tool: 'bash' });
    assert.equal(result, null);
  });

  it('returns null for unknown tool ("glob")', () => {
    const result = mapPreToolUse({ tool: 'glob' });
    assert.equal(result, null);
  });

  it('maps "write" → { tool_name: "Write", tool_input: { file_path, content } }', () => {
    const result = mapPreToolUse({
      tool: 'write',
      input: { file_path: '/tmp/foo.js', content: 'hello' },
    });
    assert.deepEqual(result, {
      tool_name: 'Write',
      tool_input: {
        file_path: '/tmp/foo.js',
        content: 'hello',
        new_string: undefined,
        edits: undefined,
      },
    });
  });

  it('maps "edit" → { tool_name: "Edit", tool_input: { file_path, new_string } }', () => {
    const result = mapPreToolUse({
      tool: 'edit',
      input: { file_path: '/tmp/foo.js', new_string: 'world' },
    });
    assert.deepEqual(result, {
      tool_name: 'Edit',
      tool_input: {
        file_path: '/tmp/foo.js',
        content: undefined,
        new_string: 'world',
        edits: undefined,
      },
    });
  });

  it('maps "apply_patch" → { tool_name: "MultiEdit", tool_input: { edits } }', () => {
    const edits = [{ new_string: 'patched' }];
    const result = mapPreToolUse({
      tool: 'apply_patch',
      input: { edits },
    });
    assert.deepEqual(result, {
      tool_name: 'MultiEdit',
      tool_input: {
        file_path: undefined,
        content: undefined,
        new_string: undefined,
        edits: [{ new_string: 'patched' }],
      },
    });
  });

  it('handles missing input (defaults to empty object)', () => {
    const result = mapPreToolUse({ tool: 'write' });
    assert.deepEqual(result, {
      tool_name: 'Write',
      tool_input: {
        file_path: undefined,
        content: undefined,
        new_string: undefined,
        edits: undefined,
      },
    });
  });
});

describe('mapPostToolUse', () => {
  it('returns null for untracked tool', () => {
    assert.equal(mapPostToolUse({ tool: 'bash' }), null);
  });

  it('returns { tool_name, tool_input } for tracked tool', () => {
    const input = { file_path: '/tmp/x.js', content: 'y' };
    const result = mapPostToolUse({ tool: 'write', input });
    assert.deepEqual(result, {
      tool_name: 'Write',
      tool_input: input,
    });
  });

  it('defaults tool_input to {} when input is missing', () => {
    const result = mapPostToolUse({ tool: 'edit' });
    assert.deepEqual(result, {
      tool_name: 'Edit',
      tool_input: {},
    });
  });
});

describe('mapSessionStart', () => {
  it('returns { session_id, cwd } from input', () => {
    const result = mapSessionStart({ session_id: 'ses-123', cwd: '/work' });
    assert.deepEqual(result, { session_id: 'ses-123', cwd: '/work' });
  });

  it('generates session_id when missing', () => {
    const result = mapSessionStart({});
    assert.ok(typeof result.session_id === 'string');
    assert.ok(result.session_id.startsWith('oms-opencode-'));
  });

  it('uses process.cwd() when cwd is missing', () => {
    const result = mapSessionStart({});
    assert.equal(result.cwd, process.cwd());
  });
});

describe('mapSessionEnd', () => {
  it('returns { session_id, cwd } from input', () => {
    const result = mapSessionEnd({ session_id: 'ses-456', cwd: '/home' });
    assert.deepEqual(result, { session_id: 'ses-456', cwd: '/home' });
  });

  it('generates session_id when missing', () => {
    const result = mapSessionEnd({});
    assert.ok(typeof result.session_id === 'string');
    assert.ok(result.session_id.startsWith('oms-opencode-'));
  });
});

describe('mapUserPromptSubmit', () => {
  it('returns null when command is missing', () => {
    assert.equal(mapUserPromptSubmit({}), null);
    assert.equal(mapUserPromptSubmit({ command: '' }), null);
  });

  it('returns { session_id, prompt, cwd } with command-name tags', () => {
    const result = mapUserPromptSubmit({
      command: 'sdd-spec',
      session_id: 'ses-789',
      cwd: '/proj',
    });
    assert.deepEqual(result, {
      session_id: 'ses-789',
      prompt: '<command-name>sdd-spec</command-name>',
      cwd: '/proj',
    });
  });

  it('includes command-args when arguments are provided', () => {
    const result = mapUserPromptSubmit({
      command: 'sdd-plan',
      arguments: '--verbose',
      session_id: 'ses-1',
    });
    assert.deepEqual(result, {
      session_id: 'ses-1',
      prompt: '<command-name>sdd-plan</command-name><command-args>--verbose</command-args>',
      cwd: process.cwd(),
    });
  });

  it('accepts sessionID (SDK type) as fallback for session_id', () => {
    const result = mapUserPromptSubmit({
      command: 'test-cmd',
      sessionID: 'sdk-session-42',
    });
    assert.equal(result.session_id, 'sdk-session-42');
  });

  it('generates session_id when both session_id and sessionID are missing', () => {
    const result = mapUserPromptSubmit({ command: 'foo' });
    assert.ok(typeof result.session_id === 'string');
    assert.ok(result.session_id.startsWith('oms-opencode-'));
  });
});
