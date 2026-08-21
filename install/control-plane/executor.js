function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function classifyError(error) {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  return String(error);
}

function generateStepId(host, resource, action) {
  const target = resource?.path || resource?.name || resource?.type || "resource";
  return host + ":" + action + ":" + target;
}

/**
 * Normalizes an install step result to match the enterprise control plane schema.
 */
export function createStepResult({
  id,
  host = "unknown",
  resource = {},
  action = "update",
  status = "pending",
  owned = true,
  message = "",
  reason = null,
  recovery = null,
  next_action = null,
} = {}) {
  return {
    id: id || generateStepId(host, resource, action),
    host,
    resource: objectOrEmpty(resource),
    action,
    status,
    owned: owned === true,
    message: typeof message === "string" ? message : "",
    reason: reason ? String(reason) : null,
    recovery: recovery ? String(recovery) : null,
    next_action: next_action ? String(next_action) : null,
  };
}

/**
 * Async generator executing an installation plan step by step with isolation
 * across independent hosts and structured progress events.
 */
export async function* executePlan(plan, { applyResource, rollbackResource } = {}) {
  const safePlan = objectOrEmpty(plan);
  const hosts = arrayOrEmpty(safePlan.hosts);

  for (const host of hosts) {
    const hostId = host.id || "unknown";
    const resources = arrayOrEmpty(host.resources);

    for (const res of resources) {
      const action = res.action || "update";
      const owned = res.owned !== false;

      yield createStepResult({
        host: hostId,
        resource: res,
        action,
        status: "running",
        owned,
        message: "Applying " + (res.type || "resource") + " for " + (host.display_name || hostId) + "...",
      });

      try {
        if (typeof applyResource !== "function") {
          throw new Error("applyResource callback is not provided to executor");
        }
        const outcome = await applyResource(res, { host: hostId, plan: safePlan });
        const stepOutcome = objectOrEmpty(outcome);

        yield createStepResult({
          host: hostId,
          resource: res,
          action,
          status: stepOutcome.status || "succeeded",
          owned: stepOutcome.owned !== undefined ? stepOutcome.owned : owned,
          message: stepOutcome.message || "Successfully applied " + (res.type || "resource"),
          reason: stepOutcome.reason || null,
          recovery: stepOutcome.recovery || null,
          next_action: stepOutcome.next_action || null,
        });
      } catch (error) {
        const errorReason = classifyError(error);

        yield createStepResult({
          host: hostId,
          resource: res,
          action,
          status: "failed",
          owned,
          message: "Failed to apply " + (res.type || "resource"),
          reason: errorReason,
          recovery: owned ? "safe-rollback" : "manual",
          next_action: "Check permissions and logs for " + hostId,
        });

        // Break on failure for this host to isolate failures from other hosts
        break;
      }
    }
  }
}

/**
 * Produce a final result summary envelope from executed step events.
 */
export function summarizeExecution(plan, events = []) {
  const safePlan = objectOrEmpty(plan);
  const allEvents = arrayOrEmpty(events);
  const terminalEvents = allEvents.filter((e) => e.status !== "running");
  const failedEvents = terminalEvents.filter((e) => e.status === "failed");
  const unsupportedEvents = terminalEvents.filter((e) => e.status === "unsupported");
  const warningEvents = terminalEvents.filter((e) => e.status === "warning");
  const succeededEvents = terminalEvents.filter((e) => e.status === "succeeded");

  let status = "succeeded";
  if ((failedEvents.length > 0 || unsupportedEvents.length > 0) && succeededEvents.length > 0) {
    status = "partial-failure";
  } else if ((failedEvents.length > 0 || unsupportedEvents.length > 0) && succeededEvents.length === 0) {
    status = "failed";
  }

  const nextActions = [];
  for (const event of [...failedEvents, ...unsupportedEvents, ...warningEvents]) {
    if (event.next_action && !nextActions.includes(event.next_action)) {
      nextActions.push(event.next_action);
    }
  }

  const completedKeys = new Set(terminalEvents.map((event) => event.id));
  const notExecuted = [];
  for (const host of arrayOrEmpty(safePlan.hosts)) {
    for (const resource of arrayOrEmpty(host.resources)) {
      const action = resource.action || "update";
      const target = resource.path || resource.name || resource.type || "resource";
      const id = host.id + ":" + action + ":" + target;
      if (!completedKeys.has(id)) notExecuted.push({ host: host.id || "unknown", resource });
    }
  }

  return {
    type: "installation-result",
    schema_version: safePlan.schema_version || 1,
    status,
    plan: safePlan,
    events: allEvents,
    summary: {
      total_steps: terminalEvents.length,
      succeeded: succeededEvents.length,
      failed: failedEvents.length,
      warnings: warningEvents.length,
      unsupported: unsupportedEvents.length,
      not_executed: notExecuted,
      status,
      next_actions: nextActions,
    },
  };
}
