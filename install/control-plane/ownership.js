import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Compute a SHA-256 hex digest of a string or Buffer.
 */
export function computeDigest(content) {
  if (content === null || content === undefined) return null;
  return createHash("sha256").update(Buffer.isBuffer(content) ? content : String(content)).digest("hex");
}

/**
 * Capture ownership metadata and recovery digests for an OMS-managed resource.
 */
export function recordOwnedResource(resource = {}, before = null, after = null) {
  return {
    host: resource.host || "unknown",
    path: resource.path || null,
    type: resource.type || "resource",
    action: resource.action || "update",
    owned: resource.owned !== false,
    before_digest: computeDigest(before),
    after_digest: computeDigest(after),
    backup: before,
    recorded_at: new Date().toISOString(),
  };
}

/**
 * Check if the current on-disk content has drifted from the recorded post-install state.
 */
export function isResourceDrifted(currentContent, record) {
  if (!record || !record.after_digest) return false;
  const currentDigest = computeDigest(currentContent);
  return currentDigest !== record.after_digest;
}

/**
 * Rollback a single OMS-owned resource. If user edits occurred after installation,
 * preserves user modifications and issues a manual recovery warning.
 */
export async function rollbackOwnedResource(record, io = {}) {
  if (!record || record.owned !== true) {
    return {
      status: "warning",
      reason: "Resource is not managed by OMS",
      next_action: "手动处理非 OMS 资源",
    };
  }

  const readFn = io.read || (async (p) => readFile(p, "utf8"));
  const writeFn = io.write || (async (p, c) => writeFile(p, c));
  const removeFn = io.remove || (async (p) => {});

  let currentContent = null;
  try {
    currentContent = await readFn(record.path);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      return {
        status: "warning",
        reason: "Failed to inspect resource for rollback: " + error.message,
        next_action: "检查文件权限并手动恢复",
      };
    }
  }

  if (isResourceDrifted(currentContent, record)) {
    return {
      status: "warning",
      reason: "Resource was modified after installation",
      next_action: "保留用户修改，请手动处理: " + record.path,
    };
  }

  try {
    if (record.backup !== null && record.backup !== undefined) {
      await writeFn(record.path, record.backup);
      return {
        status: "rolled-back",
        message: "Restored previous content for " + record.path,
      };
    } else {
      await removeFn(record.path);
      return {
        status: "rolled-back",
        message: "Removed OMS-created resource " + record.path,
      };
    }
  } catch (error) {
    return {
      status: "failed",
      reason: "Rollback failed: " + error.message,
      next_action: "手动恢复: " + record.path,
    };
  }
}

/**
 * Write ownership manifest with 0600 permissions.
 */
export async function writeOwnershipManifest(manifestPath, records = []) {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(records, null, 2) + "\n", { mode: 0o600 });
}

/**
 * Read ownership manifest. Returns empty array if missing or invalid.
 */
export async function readOwnershipManifest(manifestPath) {
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
