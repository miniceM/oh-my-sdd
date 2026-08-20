/**
 * SDD Ring-aware write policy — workflow gate for pre-tool-use.
 *
 * This is NOT a security rule (those live in lib/rules.js as HARD_RULE).
 * This is a workflow policy that prevents accidental writes to protected
 * artifacts when an SDD change is active and the current Ring forbids it.
 *
 * Execution order in pre-tool-use.js:
 *   1. HARD_RULE scan (lib/rules.js) — always first, always blocking.
 *   2. SDD workflow policy (this module) — only if HARD_RULE passes.
 *   3. SOFT_RULE scan (lib/rules.js) — warnings.
 *
 * Design principles (from Issue #37):
 *   - Only block writes that are clearly forbidden by current Ring.
 *   - Unbound changes (no active SDD) are never blocked.
 *   - Unknown/unresolvable state → fail-open (don't block normal dev).
 *   - The policy is a pure function of (filePath, ring, changeDir).
 */
import path from 'node:path';
import { RING_ORDINAL } from './sdd-context.js';

// ============================================
// Protected path patterns per Ring phase
// ============================================

/**
 * Evaluate whether a write to `filePath` is allowed under the current
 * SDD Ring context.
 *
 * @param {object} params
 * @param {string} params.filePath   - Absolute or cwd-relative path being written.
 * @param {string} params.ring       - Current SDD ring (from sdd context).
 * @param {string} params.changeDir  - Absolute path to the active change directory.
 * @param {string} params.cwd        - Project root (for resolving relative paths).
 * @param {string} [params.toolName] - Tool name ('Write'|'Edit'|'MultiEdit'|'Bash').
 *
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function evaluateWritePolicy(params) {
  const { filePath, ring, changeDir, cwd, toolName } = params;
  if (!filePath || !ring || !changeDir || !cwd) {
    return { allowed: true }; // Insufficient context → fail-open.
  }

  const ringOrd = RING_ORDINAL[ring];
  if (ringOrd === undefined) {
    return { allowed: true }; // Unknown ring → fail-open.
  }

  // Resolve absolute path for comparison.
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const openspecDir = path.join(cwd, 'openspec');

  // Normalize for comparison.
  const relToProject = path.relative(cwd, absPath);
  const relToChange = path.relative(changeDir, absPath);

  // --- Rule 1: apply/review must not modify main specs ---
  // During apply (ring=3) or review (ring=4), writing to openspec/specs/
  // (the frozen main spec directory) is forbidden.
  if (ringOrd >= RING_ORDINAL.apply && ringOrd <= RING_ORDINAL.review) {
    const specsDir = path.join(openspecDir, 'specs');
    if (absPath.startsWith(specsDir + path.sep) || absPath === specsDir) {
      return {
        allowed: false,
        reason: `Ring '${ring}' forbids direct edits to openspec/specs/. ` +
          `Go back to /sdd-spec to modify specifications.`,
      };
    }
  }

  // --- Rule 2: apply must not modify frozen inputs ---
  // During apply, proposal.md, design.md, and delta specs are frozen inputs.
  if (ring === 'apply') {
    const frozenInputs = ['proposal.md', 'design.md'];
    const relNorm = relToChange.split(path.sep).join('/');
    if (frozenInputs.includes(relNorm)) {
      return {
        allowed: false,
        reason: `Ring 'apply' forbids editing '${relNorm}' (frozen input). ` +
          `Go back to /sdd-spec or /sdd-plan to change it.`,
      };
    }
    // Delta specs inside the change dir (specs/*/spec.md).
    if (relNorm.startsWith('specs/') && relNorm.endsWith('/spec.md')) {
      return {
        allowed: false,
        reason: `Ring 'apply' forbids editing delta specs (${relNorm}). ` +
          `Go back to /sdd-spec to change it.`,
      };
    }
  }

  // --- Rule 3: plan handoff not complete → no implementation source code ---
  // If ring is still 'spec' (plan not done), writing source code files
  // outside openspec/ is blocked.
  if (ring === 'spec') {
    const isInsideOpenspec = absPath.startsWith(openspecDir + path.sep) || absPath === openspecDir;
    const isInsideChangeDir = absPath.startsWith(changeDir + path.sep) || absPath === changeDir;
    // Allow writing to openspec/ and change dir, block source code.
    if (!isInsideOpenspec && !isInsideChangeDir) {
      // Only block recognized source files, not configs/docs.
      if (isSourceCodeFile(absPath)) {
        return {
          allowed: false,
          reason: `Ring 'spec' (plan not complete) forbids writing source code. ` +
            `Run /sdd-plan first to create design and tasks.`,
        };
      }
    }
  }

  // --- Rule 4: after review/finalize, source code writes need re-apply ---
  if (ring === 'review' || ring === 'finalized') {
    const isInsideOpenspec = absPath.startsWith(openspecDir + path.sep) || absPath === openspecDir;
    const isInsideChangeDir = absPath.startsWith(changeDir + path.sep) || absPath === changeDir;
    if (!isInsideOpenspec && !isInsideChangeDir && isSourceCodeFile(absPath)) {
      return {
        allowed: false,
        reason: `Ring '${ring}' forbids source code writes. ` +
          `Go back to /sdd-apply to refresh the apply context.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Simple heuristic: is this path a source code file (vs config/docs)?
 * We only block source code writes, not documentation or configuration.
 */
const SOURCE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.mts', '.cts', '.tsx',
  '.py', '.pyw',
  '.java', '.kt', '.kts',
  '.go',
  '.rs',
  '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.scala',
  '.vue', '.svelte',
]);

function isSourceCodeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}
