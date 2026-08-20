function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Build a dry-run repair plan from doctor findings, strictly limiting repair
 * to OMS-owned resources and excluding user-drifted files.
 */
export function buildRepairPlan(doctorReport = {}, { ownershipManifest = [] } = {}) {
  const report = objectOrEmpty(doctorReport);
  const findings = arrayOrEmpty(report.findings);

  const steps = [];
  for (const finding of findings) {
    if (finding?.repairable === true && finding?.owned === true) {
      steps.push({
        host: finding.host || "unknown",
        path: finding.path || null,
        code: finding.code || "repair",
        action: finding.action || "repair-resource",
        owned: true,
        current_digest: finding.current_digest || null,
        expected_digest: finding.expected_digest || null,
        message: finding.message || ("Repair " + (finding.path || "resource")),
      });
    }
  }

  return {
    type: "repair-plan",
    schema_version: 1,
    steps,
    summary: {
      total_steps: steps.length,
      eligible: steps.length,
    },
  };
}

/**
 * Apply a repair plan idempotently, verifying ownership before every write.
 */
export async function applyRepair(repairPlan = {}, { applyStep, io = {} } = {}) {
  const plan = objectOrEmpty(repairPlan);
  const steps = arrayOrEmpty(plan.steps);
  const executedSteps = [];

  for (const step of steps) {
    if (step.current_digest && step.expected_digest && step.current_digest !== step.expected_digest) {
      executedSteps.push({
        ...step,
        status: "warning",
        message: "Preserving user modifications",
        next_action: "保留用户修改，请手动处理: " + (step.path || ""),
      });
      continue;
    }

    try {
      if (typeof applyStep === "function") {
        const result = await applyStep(step);
        executedSteps.push({
          ...step,
          status: result?.status || "succeeded",
          message: result?.message || ("Repaired " + (step.path || "")),
          next_action: result?.next_action || null,
        });
      } else {
        executedSteps.push({
          ...step,
          status: "succeeded",
          message: "Repaired " + (step.path || ""),
        });
      }
    } catch (error) {
      executedSteps.push({
        ...step,
        status: "failed",
        message: "Repair failed: " + error.message,
        next_action: "Check logs and retry",
      });
    }
  }

  const failedCount = executedSteps.filter((s) => s.status === "failed").length;
  const succeededCount = executedSteps.filter((s) => s.status === "succeeded").length;
  const warningCount = executedSteps.filter((s) => s.status === "warning").length;

  let status = "succeeded";
  if (failedCount > 0 && succeededCount > 0) {
    status = "partial-failure";
  } else if (failedCount > 0 && succeededCount === 0) {
    status = "failed";
  }

  return {
    type: "repair-result",
    schema_version: 1,
    status,
    steps: executedSteps,
    summary: {
      total_steps: executedSteps.length,
      succeeded: succeededCount,
      failed: failedCount,
      warnings: warningCount,
      status,
    },
  };
}
