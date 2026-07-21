export const TOOL_NAME_MAP = {
  write: 'Write',
  edit: 'Edit',
  apply_patch: 'MultiEdit',
  Write: 'Write',
  Edit: 'Edit',
  MultiEdit: 'MultiEdit',
};

export function normalizeToolName(name) {
  return TOOL_NAME_MAP[name] ?? name;
}

export function normalizeToolInput(input) {
  if (!input || typeof input !== 'object') return input;
  const out = { ...input };
  if ('file_path' in out && !('filePath' in out)) out.filePath = out.file_path;
  if ('new_string' in out && !('newString' in out)) out.newString = out.new_string;
  if ('old_string' in out && !('oldString' in out)) out.oldString = out.old_string;

  // Recursively normalize nested objects (e.g., edits array in MultiEdit)
  if (Array.isArray(out.edits)) {
    out.edits = out.edits.map(edit => normalizeToolInput(edit));
  }

  return out;
}

export const TRACKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

export function isTrackedTool(name) {
  return TRACKED_TOOLS.has(name);
}