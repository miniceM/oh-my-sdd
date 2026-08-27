import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRepairPlan,
  applyRepair,
} from "../../../../packages/product/install/control-plane/repair.js";

test("repair dry run lists only doctor-confirmed OMS-owned repairable findings", () => {
  const doctorReport = {
    type: "doctor-report",
    findings: [
      {
        host: "claude",
        code: "resource-missing",
        message: "Baseline missing",
        repairable: true,
        owned: true,
        path: "/path/to/baseline.md",
      },
      {
        host: "claude",
        code: "dependency-missing",
        message: "iam CLI missing",
        repairable: false,
        owned: false,
      },
    ],
  };

  const plan = buildRepairPlan(doctorReport);
  assert.equal(plan.type, "repair-plan");
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].path, "/path/to/baseline.md");
  assert.equal(plan.steps[0].host, "claude");
});

test("repair refuses a digest-mismatched user-modified resource", async () => {
  const repairPlan = {
    type: "repair-plan",
    steps: [
      {
        host: "lingma",
        path: "/fake/settings.json",
        action: "repair-file",
        owned: true,
        current_digest: "user_modified_hash",
        expected_digest: "oms_clean_hash",
      },
    ],
  };

  const result = await applyRepair(repairPlan, {
    applyStep: async (step) => ({
      status: "warning",
      next_action: "保留用户修改，请手动处理",
    }),
  });

  assert.equal(result.type, "repair-result");
  assert.equal(result.steps[0].status, "warning");
  assert.match(result.steps[0].next_action, /手动/);
});

test("applyRepair executes repair steps and returns result envelope", async () => {
  const repairPlan = {
    type: "repair-plan",
    steps: [
      {
        host: "kilocode",
        path: "/fake/AGENTS.md",
        action: "restore-baseline",
        owned: true,
      },
    ],
  };

  let appliedPath = null;
  const result = await applyRepair(repairPlan, {
    applyStep: async (step) => {
      appliedPath = step.path;
      return { status: "succeeded", message: "Restored baseline" };
    },
  });

  assert.equal(result.type, "repair-result");
  assert.equal(result.status, "succeeded");
  assert.equal(appliedPath, "/fake/AGENTS.md");
});
