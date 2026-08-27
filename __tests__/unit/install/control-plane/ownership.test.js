import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDigest,
  recordOwnedResource,
  isResourceDrifted,
  rollbackOwnedResource,
} from "../../../../packages/product/install/control-plane/ownership.js";

test("computeDigest returns sha256 hex string", () => {
  const hash = computeDigest("hello world");
  assert.equal(typeof hash, "string");
  assert.equal(hash.length, 64);
});

test("recordOwnedResource captures before and after digests and backup", () => {
  const record = recordOwnedResource(
    { host: "claude", path: "/tmp/baseline.md", type: "baseline" },
    "before content",
    "after content"
  );
  assert.equal(record.host, "claude");
  assert.equal(record.path, "/tmp/baseline.md");
  assert.equal(record.owned, true);
  assert.equal(record.before_digest, computeDigest("before content"));
  assert.equal(record.after_digest, computeDigest("after content"));
  assert.equal(record.backup, "before content");
});

test("isResourceDrifted identifies when current content no longer matches after_digest", () => {
  const record = recordOwnedResource({ host: "claude", path: "/tmp/file" }, "before", "after");
  assert.equal(isResourceDrifted("after", record), false);
  assert.equal(isResourceDrifted("user edited this", record), true);
});

test("rollback restores only a current OMS-owned resource with matching digest", async () => {
  const record = recordOwnedResource({ host: "lingma", path: "/tmp/settings.json" }, "original content", "oms content");
  let restoredPath = null;
  let restoredContent = null;

  const mockIo = {
    read: async (p) => "oms content",
    write: async (p, content) => {
      restoredPath = p;
      restoredContent = content;
    },
    remove: async (p) => {},
  };

  const result = await rollbackOwnedResource(record, mockIo);
  assert.equal(result.status, "rolled-back");
  assert.equal(restoredPath, "/tmp/settings.json");
  assert.equal(restoredContent, "original content");
});

test("rollback preserves a user-modified resource and reports manual recovery", async () => {
  const record = recordOwnedResource({ host: "lingma", path: "/tmp/settings.json" }, "original content", "oms content");

  const mockIo = {
    read: async (p) => "user customized content",
    write: async () => {},
    remove: async () => {},
  };

  const result = await rollbackOwnedResource(record, mockIo);
  assert.equal(result.status, "warning");
  assert.match(result.next_action, /手动/);
});

test("rollback removes a newly created resource when backup is null", async () => {
  const record = recordOwnedResource({ host: "claude", path: "/tmp/new-wrapper" }, null, "wrapper script");
  let removedPath = null;

  const mockIo = {
    read: async (p) => "wrapper script",
    write: async () => {},
    remove: async (p) => { removedPath = p; },
  };

  const result = await rollbackOwnedResource(record, mockIo);
  assert.equal(result.status, "rolled-back");
  assert.equal(removedPath, "/tmp/new-wrapper");
});
