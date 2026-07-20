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

export function toOpenCodeFields(input) {
  if (!input || typeof input !== 'object') return input;
  const out = { ...input };
  if ('filePath' in out && !('file_path' in out)) out.file_path = out.filePath;
  if ('newString' in out && !('new_string' in out)) out.new_string = out.newString;
  if ('oldString' in out && !('old_string' in out)) out.old_string = out.oldString;
  return out;
}

export const TRACKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

export function isTrackedTool(name) {
  const norm = normalizeToolName(name);
  return TRACKED_TOOLS.has(norm);
}