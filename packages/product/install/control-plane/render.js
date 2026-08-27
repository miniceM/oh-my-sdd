/** Render an installation plan as a stable JSON envelope for automation. */
export function renderJson(plan) {
  return JSON.stringify({ type: "installation-plan", plan }) + "\n";
}

/** Render an execution result as a stable JSON envelope for automation. */
export function renderResultJson(result) {
  if (result?.type) {
    return JSON.stringify(result) + "\n";
  }
  return JSON.stringify({ type: "installation-result", result }) + "\n";
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function formatProtection(capabilities) {
  const prevention = capabilities?.write_prevention;
  if (!prevention || typeof prevention !== "object") return "unknown";
  const detail = typeof prevention.evidence === "string" ? " (" + prevention.evidence + ")" : "";
  return (prevention.level ?? (prevention.supported ? "enforced" : "unavailable")) + detail;
}

function formatResource(resource) {
  if (typeof resource === "string") return resource;
  if (!resource || typeof resource !== "object") return String(resource);
  const target = [resource.kind || resource.type, resource.path || resource.id].filter(Boolean).join(": ") || JSON.stringify(resource);
  const details = [
    resource.phase ? `phase: ${resource.phase}` : null,
    resource.action ? `action: ${resource.action}` : null,
    resource.owner ? `owner: ${resource.owner}` : null,
    resource.scope ? `scope: ${resource.scope}` : null,
  ].filter(Boolean);
  return details.length > 0 ? `${target} (${details.join(', ')})` : target;
}

function formatRisk(risk) {
  if (typeof risk === "string") return risk;
  if (!risk || typeof risk !== "object") return String(risk);
  const label = [risk.level, risk.category].filter(Boolean).join("/") || "risk";
  return (label + ": " + (risk.message ?? "")).trim();
}

/** Render the same installation-plan facts as concise human-readable text. */
export function renderText(plan) {
  const safePlan = objectOrEmpty(plan);
  const lines = ["Installation plan (schema v" + (safePlan.schema_version ?? "unknown") + ")"];

  for (const candidate of arrayOrEmpty(safePlan.hosts)) {
    const host = objectOrEmpty(candidate);
    lines.push("", (host.display_name ?? host.id ?? "Unknown host") + " (" + (host.id ?? "unknown") + ")");
    lines.push("  Detected: " + (host.detected === true ? "yes" : host.detected === false ? "no" : "unknown"));
    const scope = objectOrEmpty(host.scope);
    if (scope.kind || scope.path) {
      lines.push("  Scope: " + (scope.kind ?? "unknown") + (scope.path ? " — " + scope.path : ""));
      if (scope.project_supported === false) lines.push("  Project scope: unsupported — " + (scope.reason ?? "global scope only"));
    }
    lines.push("  Protection: " + formatProtection(host.capabilities));
    lines.push("  Dependencies:");
    for (const dependency of arrayOrEmpty(host.dependencies)) {
      const item = objectOrEmpty(dependency);
      const classification = item.classification || (item.required ? "required" : "optional");
      const state = item.state || (item.available === true ? "available" : item.available === false ? "missing" : "unknown");
      const version = item.version?.value || item.version?.state;
      lines.push("  - " + (item.name ?? "unknown") + ` (${classification}, ${state}${version ? `, version: ${version}` : ""})` + (item.reason ? ` — ${item.reason}` : ""));
    }
    lines.push("  Resources:");
    for (const resource of arrayOrEmpty(host.resources)) lines.push("  - " + formatResource(resource));
    lines.push("  Risks:");
    for (const risk of arrayOrEmpty(host.risks)) lines.push("  - " + formatRisk(risk));
    const recommendation = objectOrEmpty(host.recommendation);
    lines.push("  Next action: " + (recommendation.action ?? "inspect") + (recommendation.reason ? " — " + recommendation.reason : ""));
  }

  return lines.join("\n") + "\n";
}

/** Render an execution result as human-readable text. */
export function renderResultText(result) {
  const safeResult = objectOrEmpty(result);
  const events = arrayOrEmpty(safeResult.events);
  const summary = objectOrEmpty(safeResult.summary);
  const lines = ["Installation result (status: " + (safeResult.status || "succeeded") + ")"];

  const terminalEvents = events.filter((e) => e.status !== "running");
  if (terminalEvents.length > 0) {
    lines.push("  Steps:");
    for (const event of terminalEvents) {
      const icon = event.status === "succeeded"
        ? "✓"
        : (event.status === "deferred" ? "↪" : (event.status === "warning" ? "⚠️" : "❌"));
      const hostLabel = event.host ? "[" + event.host + "] " : "";
      const resource = objectOrEmpty(event.resource);
      const target = resource.path || resource.id || null;
      const phase = resource.phase ? ` (${resource.phase}${resource.owner ? `, owner: ${resource.owner}` : ""})` : "";
      const status = event.status ? `[${event.status}] ` : "";
      lines.push("  " + icon + " " + hostLabel + status + (event.message || event.action || "step") + (target ? ` — ${target}${phase}` : phase));
      if (event.reason) {
        lines.push("      Reason: " + event.reason);
      }
      if (event.next_action) {
        lines.push("      Next action: " + event.next_action);
      }
    }
  }

  if (summary.total_steps !== undefined) {
    const detail = [];
    if ((summary.deferred || 0) > 0) detail.push(`${summary.deferred} deferred`);
    if ((summary.warnings || 0) > 0) detail.push(`${summary.warnings} warnings`);
    if ((summary.unsupported || 0) > 0) detail.push(`${summary.unsupported} unsupported`);
    const detailText = detail.length > 0 ? `, ${detail.join(", ")}` : "";
    lines.push("", "Summary: " + (summary.succeeded || 0) + " succeeded, " + (summary.failed || 0) + " failed" + detailText + ", " + (summary.total_steps || 0) + " total");
  }

  if (summary.not_executed?.length > 0) {
    lines.push("Not executed:");
    for (const item of summary.not_executed) lines.push("  - " + (item.resource?.path || item.resource?.type || "resource") + " on " + (item.host || "unknown"));
  }

  if (summary.layers) {
    lines.push("Evidence:");
    for (const layer of ["written", "registered", "postinstall", "loaded", "enforced"]) {
      const evidence = objectOrEmpty(summary.layers[layer]);
      lines.push(`  - ${layer}: ${evidence.state || "unknown"}${evidence.reason ? ` — ${evidence.reason}` : ""}`);
      if (evidence.path) lines.push("      Path: " + evidence.path);
      if (Array.isArray(evidence.paths) && evidence.paths.length > 0) {
        lines.push("      Paths: " + evidence.paths.join(", "));
      }
      if (evidence.evidence) lines.push("      Evidence: " + evidence.evidence);
      if (evidence.next_action) lines.push("      Next action: " + evidence.next_action);
    }
  }

  const nextActions = arrayOrEmpty(summary.next_actions);
  if (nextActions.length > 0) {
    lines.push("Next actions:");
    for (const action of nextActions) {
      lines.push("  - " + action);
    }
  }

  return lines.join("\n") + "\n";
}
