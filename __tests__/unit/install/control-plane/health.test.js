import assert from "node:assert/strict";
import test from "node:test";
import {
  LEVELS,
  buildHealthFinding,
  status,
  doctor,
} from "../../../../install/control-plane/health.js";

test("LEVELS contains five defined protection levels", () => {
  assert.deepEqual(LEVELS, ["written", "registered", "loaded", "enforced", "advisory"]);
});

test("health does not infer enforced or loaded from written and registered evidence", () => {
  const finding = buildHealthFinding({
    written: { state: "verified", evidence: "File exists on disk" },
    registered: { state: "verified", evidence: "Entry in opencode.json" },
    loaded: { state: "unknown", reason: "Host not launched" },
    enforced: { state: "unknown", reason: "Cannot prove runtime hook execution" },
  });

  assert.equal(finding.level, "registered");
  assert.equal(finding.written.state, "verified");
  assert.equal(finding.registered.state, "verified");
  assert.equal(finding.loaded.state, "unknown");
  assert.equal(finding.enforced.state, "unknown");
});

test("KiloCode is always advisory even with verified written resources", () => {
  const finding = buildHealthFinding(
    {
      written: { state: "verified", evidence: "AGENTS.md has OMS baseline" },
      registered: { state: "unsupported", reason: "No registration mechanism" },
      loaded: { state: "unknown" },
      enforced: { state: "unsupported" },
    },
    { isAdvisoryOnly: true, host: "kilocode" }
  );

  assert.equal(finding.level, "advisory");
  assert.match(finding.reason, /advisory/i);
});

test("doctor reports findings with evidence, code, and repairable flag", async () => {
  const mockAdapter = {
    id: "claude",
    displayName: "Claude Code",
    isInstalled: () => true,
    describe: () => ({
      id: "claude",
      display_name: "Claude Code",
      resources: [{ type: "baseline", path: "/nonexistent/baseline.md", owned: true }],
      dependencies: [],
    }),
    inspectRuntime: async () => ({
      written: { state: "missing", reason: "File not found" },
      registered: { state: "verified", evidence: "Marketplace registered" },
      loaded: { state: "unknown" },
      enforced: { state: "unknown" },
    }),
  };

  const report = await doctor({ adapters: [mockAdapter], ctx: {} });
  assert.equal(report.type, "doctor-report");
  assert.ok(report.hosts.length > 0);
  assert.ok(Array.isArray(report.findings));
  const missingFinding = report.findings.find((f) => f.code === "resource-missing");
  assert.ok(missingFinding);
  assert.equal(missingFinding.repairable, true);
});

import { ClaudeAdapter } from "../../../../install/hosts/claude-adapter.js";
import { OpenCodeAdapter } from "../../../../install/hosts/opencode-adapter.js";
import { LingmaAdapter } from "../../../../install/hosts/lingma-adapter.js";
import { KiloCodeAdapter } from "../../../../install/hosts/kilocode-adapter.js";

test("status produces status report for all four adapters", async () => {
  const result = await status({
    adapters: [ClaudeAdapter, OpenCodeAdapter, LingmaAdapter, KiloCodeAdapter],
    ctx: {},
  });

  assert.equal(result.type, "status-report");
  assert.equal(result.hosts.length, 4);
  const kilocodeReport = result.hosts.find(h => h.id === "kilocode");
  assert.equal(kilocodeReport.protection.level, "advisory");
});

test("doctor produces doctor report with findings for all four adapters", async () => {
  const result = await doctor({
    adapters: [ClaudeAdapter, OpenCodeAdapter, LingmaAdapter, KiloCodeAdapter],
    ctx: {},
  });

  assert.equal(result.type, "doctor-report");
  assert.equal(result.hosts.length, 4);
  assert.ok(Array.isArray(result.findings));
});
