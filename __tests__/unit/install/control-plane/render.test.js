import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderJson, renderText, renderResultJson, renderResultText } from "../../../../install/control-plane/render.js";

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

  it("omits deferred installation steps from human-readable output", () => {
    const text = renderResultText({
      status: "succeeded",
      events: [
        { status: "succeeded", host: "opencode", message: "Wrote config" },
        { status: "deferred", host: "opencode", message: "commands pending OpenCode plugin loading" },
      ],
      summary: {
        succeeded: 1,
        failed: 0,
        warnings: 0,
        deferred: 1,
        total_steps: 2,
        next_actions: ["Restart OpenCode to complete plugin loading."],
      },
    });

    assert.match(text, /Wrote config/);
    assert.doesNotMatch(text, /commands pending/);
    assert.doesNotMatch(text, /⚠️|❌/);
    assert.doesNotMatch(text, /warnings/);
    assert.match(text, /Restart OpenCode to complete plugin loading/);
  });
});
