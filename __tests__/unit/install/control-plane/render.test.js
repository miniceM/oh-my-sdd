import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderJson, renderText, renderResultJson, renderResultText } from "../../../../packages/product/install/control-plane/render.js";

const plan = {
  schema_version: 1,
  hosts: [{
    id: "kilocode",
    display_name: "Kilo Code",
    dependencies: [],
    capabilities: {
      write_prevention: {
        supported: false,
        evidence: "host lacks PreToolUse",
        level: "advisory",
      },
    },
    resources: [{ kind: "instructions", path: "~/.config/kilo/AGENTS.md" }],
    risks: [{ category: "enforcement", level: "advisory", message: "Hook enforcement is unavailable." }],
    recommendation: { action: "install", reason: "Ready to install oh-my-sdd resources." },
  }],
};

const result = {
  type: "installation-result",
  schema_version: 1,
  status: "succeeded",
  plan,
  events: [
    { host: "kilocode", action: "update", status: "succeeded", message: "Injected baseline to AGENTS.md" },
  ],
  summary: {
    total_steps: 1,
    succeeded: 1,
    failed: 0,
    status: "succeeded",
    next_actions: ["Restart Kilo Code"],
  },
};

describe("control-plane renderers", () => {
  it("renders the plan as one JSON envelope", () => {
    assert.equal(renderJson(plan), JSON.stringify({ type: "installation-plan", plan }) + "\n");
  });

  it("renders host, protection level, resources, risks, and next action from the plan", () => {
    const output = renderText(plan);

    assert.match(output, /Kilo Code/);
    assert.match(output, /advisory/);
    assert.match(output, /AGENTS\.md/);
    assert.match(output, /Hook enforcement is unavailable/);
    assert.match(output, /install/);
  });

  it("does not throw for malformed host, resource, or risk collections", () => {
    assert.doesNotThrow(() => renderText({ hosts: {} }));
    assert.doesNotThrow(() => renderText({
      hosts: [null, { resources: {}, risks: {} }],
    }));
  });

  it("renders the execution result as JSON envelope", () => {
    assert.equal(renderResultJson(result), JSON.stringify(result) + "\n");
  });

  it("renders the execution result with steps and summary", () => {
    const output = renderResultText(result);
    assert.match(output, /Installation result/);
    assert.match(output, /Injected baseline to AGENTS\.md/);
    assert.match(output, /Summary: 1 succeeded, 0 failed, 1 total/);
    assert.match(output, /Restart Kilo Code/);
  });

  it("renders deferred steps and postinstall evidence in human-readable output", () => {
    const text = renderResultText({
      status: "succeeded",
      events: [
        { status: "succeeded", host: "opencode", message: "Wrote config" },
        {
          status: "deferred",
          host: "opencode",
          message: "commands pending OpenCode plugin loading",
          resource: {
            path: "/tmp/opencode/commands",
            phase: "postinstall",
            owner: "npm",
          },
          reason: "npm lifecycle has not completed",
          next_action: "Start OpenCode, then run oms doctor --tool opencode.",
        },
      ],
      summary: {
        succeeded: 1,
        failed: 0,
        warnings: 0,
        deferred: 1,
        total_steps: 2,
        layers: {
          postinstall: {
            state: "pending",
            paths: ["/tmp/opencode/skills", "/tmp/opencode/commands"],
            evidence: "npm lifecycle outputs were checked",
            reason: "missing OpenCode managed resources",
            next_action: "Start OpenCode to run the plugin lifecycle, then run oms doctor --tool opencode.",
          },
          loaded: {
            state: "unknown",
            evidence: "No OpenCode host launch event was observed",
            reason: "OpenCode host launch evidence unavailable",
          },
          enforced: {
            state: "unknown",
            evidence: "No active OpenCode runtime write-prevention probe was observed",
            reason: "Write prevention evidence requires active runtime",
          },
        },
        next_actions: ["Restart OpenCode to complete plugin loading."],
      },
    });

    assert.match(text, /Wrote config/);
    assert.match(text, /\[deferred\].*commands pending/);
    assert.doesNotMatch(text, /\[succeeded\].*commands pending/);
    assert.match(text, /\/tmp\/opencode\/commands/);
    assert.match(text, /phase: postinstall|postinstall/);
    assert.match(text, /owner: npm/);
    assert.match(text, /Reason: npm lifecycle has not completed/);
    assert.match(text, /Next action: Start OpenCode, then run oms doctor --tool opencode/);
    assert.match(text, /Summary: 1 succeeded, 0 failed, 1 deferred, 2 total/);
    assert.match(text, /- postinstall: pending/);
    assert.match(text, /\/tmp\/opencode\/skills/);
    assert.match(text, /Evidence: npm lifecycle outputs were checked/);
    assert.match(text, /- loaded: unknown/);
    assert.match(text, /No OpenCode host launch event was observed/);
    assert.match(text, /- enforced: unknown/);
    assert.match(text, /oms doctor --tool opencode/);
    assert.match(text, /Restart OpenCode to complete plugin loading/);
  });
});
