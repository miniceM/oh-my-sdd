export const LEVELS = ["written", "registered", "loaded", "enforced", "advisory"];

function normalizeEvidenceState(stateObj) {
  if (!stateObj || typeof stateObj !== "object") {
    return { state: "unknown", reason: "No evidence provided" };
  }
  return {
    state: stateObj.state || "unknown",
    evidence: stateObj.evidence || null,
    reason: stateObj.reason || null,
  };
}

/**
 * Construct a strict 5-layer health finding without inferring higher tiers from lower tiers.
 */
export function buildHealthFinding(evidence = {}, { isAdvisoryOnly = false, host = "unknown" } = {}) {
  const written = normalizeEvidenceState(evidence.written);
  const registered = normalizeEvidenceState(evidence.registered);
  const loaded = normalizeEvidenceState(evidence.loaded);
  const enforced = normalizeEvidenceState(evidence.enforced);

  if (isAdvisoryOnly) {
    return {
      host,
      written,
      registered,
      loaded,
      enforced,
      level: "advisory",
      reason: "Host has no write-prevention hook mechanism; protection is advisory-only.",
    };
  }

  let level = "unknown";
  if (enforced.state === "verified") {
    level = "enforced";
  } else if (loaded.state === "verified") {
    level = "loaded";
  } else if (registered.state === "verified") {
    level = "registered";
  } else if (written.state === "verified") {
    level = "written";
  }

  return {
    host,
    written,
    registered,
    loaded,
    enforced,
    level,
    reason: evidence.reason || null,
  };
}

/**
 * Inspect host installation status and protection tiers without mutating state.
 */
export async function status({ adapters = [], ctx = {} } = {}) {
  const hostReports = [];

  for (const Adapter of adapters) {
    const isInstalled = typeof Adapter.isInstalled === "function" ? Adapter.isInstalled() : false;
    let description = {};
    if (typeof Adapter.describe === "function") {
      try {
        description = Adapter.describe(ctx) || {};
      } catch (err) {
        description = { id: Adapter.id, display_name: Adapter.displayName, risks: [{ level: "error", message: err.message }] };
      }
    }

    let runtimeEvidence = {};
    if (typeof Adapter.inspectRuntime === "function") {
      try {
        runtimeEvidence = await Adapter.inspectRuntime(ctx);
      } catch {
        runtimeEvidence = {};
      }
    }

    const isAdvisory = Adapter.id === "kilocode" || description.capabilities?.write_prevention?.level === "advisory";
    const protection = buildHealthFinding(runtimeEvidence, { isAdvisoryOnly: isAdvisory, host: Adapter.id });

    hostReports.push({
      id: Adapter.id,
      display_name: Adapter.displayName || Adapter.id,
      detected: isInstalled,
      protection,
      dependencies: description.dependencies || [],
      resources: description.resources || [],
      risks: description.risks || [],
      recommendation: description.recommendation || { action: "inspect" },
    });
  }

  return {
    type: "status-report",
    schema_version: 1,
    hosts: hostReports,
  };
}

/**
 * Inspect host drift, missing resources, and runtime evidence. Produces structured findings.
 */
export async function doctor({ adapters = [], ctx = {} } = {}) {
  const hostReports = [];
  const findings = [];

  for (const Adapter of adapters) {
    const isInstalled = typeof Adapter.isInstalled === "function" ? Adapter.isInstalled() : false;
    let description = {};
    if (typeof Adapter.describe === "function") {
      try {
        description = Adapter.describe(ctx) || {};
      } catch (err) {
        description = { id: Adapter.id, display_name: Adapter.displayName, risks: [{ level: "error", message: err.message }] };
      }
    }

    let runtimeEvidence = {};
    if (typeof Adapter.inspectRuntime === "function") {
      try {
        runtimeEvidence = await Adapter.inspectRuntime(ctx);
      } catch {
        runtimeEvidence = {};
      }
    }

    const isAdvisory = Adapter.id === "kilocode" || description.capabilities?.write_prevention?.level === "advisory";
    const protection = buildHealthFinding(runtimeEvidence, { isAdvisoryOnly: isAdvisory, host: Adapter.id });

    // Check missing dependencies
    for (const dep of description.dependencies || []) {
      if (dep.required && dep.available === false) {
        findings.push({
          host: Adapter.id,
          code: "dependency-missing",
          message: "Required dependency is missing: " + dep.name,
          level: "error",
          repairable: false,
          owned: false,
          next_action: "Install " + dep.name,
        });
      }
    }

    // Check resource drift / missing
    if (runtimeEvidence.written?.state === "missing") {
      findings.push({
        host: Adapter.id,
        code: "resource-missing",
        message: runtimeEvidence.written.reason || "OMS managed resource is missing on disk",
        level: "warning",
        repairable: true,
        owned: true,
        next_action: "Run oms repair to restore OMS resources",
      });
    }

    if (runtimeEvidence.written?.state === "drifted") {
      findings.push({
        host: Adapter.id,
        code: "resource-drifted",
        message: runtimeEvidence.written.reason || "Resource has been modified after installation",
        level: "warning",
        repairable: false,
        owned: true,
        next_action: "Review user changes; repair preserves user modifications",
      });
    }

    hostReports.push({
      id: Adapter.id,
      display_name: Adapter.displayName || Adapter.id,
      detected: isInstalled,
      protection,
      dependencies: description.dependencies || [],
      resources: description.resources || [],
      risks: description.risks || [],
    });
  }

  return {
    type: "doctor-report",
    schema_version: 1,
    hosts: hostReports,
    findings,
  };
}
