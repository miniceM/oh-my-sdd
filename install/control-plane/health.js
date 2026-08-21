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
      scope: description.scope || null,
      risks: description.risks || [],
      recommendation: description.recommendation || { action: "inspect" },
      evidence: runtimeEvidence,
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

    // Check dependency state without treating unknown as available.
    for (const dep of description.dependencies || []) {
      if (dep.required && dep.available === false) {
        findings.push({
          host: Adapter.id,
          code: "dependency-missing",
          message: "Required dependency is missing: " + dep.name,
          level: "error",
          repairable: false,
          owned: false,
          evidence: dep.source || dep.reason || null,
          next_action: "Install " + dep.name,
        });
      }
      if (dep.state === "unknown") {
        findings.push({
          host: Adapter.id,
          code: "dependency-unknown",
          message: "Dependency state is unknown: " + dep.name,
          level: "warning",
          repairable: false,
          owned: false,
          evidence: dep.reason || dep.source || null,
          next_action: "Verify " + dep.name + " manually, then rerun oms doctor --tool " + Adapter.id,
        });
      }
    }

    if (runtimeEvidence.written?.state === "unknown") {
      findings.push({
        host: Adapter.id,
        code: "configuration-invalid",
        path: runtimeEvidence.written.path || null,
        message: runtimeEvidence.written.reason || "Managed configuration could not be read",
        level: "error",
        repairable: false,
        owned: true,
        evidence: runtimeEvidence.written.evidence || null,
        next_action: "Fix the configuration JSON manually; oms repair will not overwrite user files",
      });
    }

    // Check resource drift / missing.
    if (runtimeEvidence.written?.state === "missing") {
      findings.push({
        host: Adapter.id,
        code: "resource-missing",
        message: runtimeEvidence.written.reason || "OMS managed resource is missing on disk",
        level: "warning",
        repairable: true,
        owned: true,
        path: runtimeEvidence.written.path || null,
        action: Adapter.id === "opencode" ? "patch-config" : "repair-resource",
        evidence: runtimeEvidence.written.evidence || null,
        next_action: "Run oms repair --tool " + Adapter.id + " --apply to restore OMS resources",
      });
    }

    if (runtimeEvidence.registered?.state === "missing") {
      findings.push({
        host: Adapter.id,
        code: "registration-missing",
        message: runtimeEvidence.registered.reason || "Plugin registration is missing",
        level: "error",
        repairable: Adapter.id === "opencode",
        owned: Adapter.id === "opencode",
        path: runtimeEvidence.registered.path || null,
        action: Adapter.id === "opencode" ? "patch-config" : "repair-resource",
        evidence: runtimeEvidence.registered.evidence || null,
        next_action: "Run oms repair --tool " + Adapter.id + " --apply to restore registration",
      });
    }

    if (runtimeEvidence.postinstall?.state === "pending") {
      findings.push({
        host: Adapter.id,
        code: "postinstall-pending",
        message: runtimeEvidence.postinstall.reason || "npm postinstall resources are pending",
        level: "warning",
        repairable: false,
        owned: false,
        evidence: runtimeEvidence.postinstall.evidence || null,
        next_action: runtimeEvidence.postinstall.next_action || "Run the plugin lifecycle, then rerun doctor",
      });
    }

    if (runtimeEvidence.postinstall?.state === "drifted") {
      findings.push({
        host: Adapter.id,
        code: "resource-drifted",
        path: runtimeEvidence.postinstall.path || null,
        message: runtimeEvidence.postinstall.reason || "A managed postinstall resource was modified",
        level: "warning",
        repairable: false,
        owned: true,
        current_digest: runtimeEvidence.postinstall.current_digest || null,
        expected_digest: runtimeEvidence.postinstall.expected_digest || null,
        evidence: runtimeEvidence.postinstall.evidence || null,
        next_action: runtimeEvidence.postinstall.next_action || "Review user changes; repair will preserve them",
      });
    }

    for (const layer of ["loaded", "enforced"]) {
      if (runtimeEvidence[layer]?.state === "unknown") {
        findings.push({
          host: Adapter.id,
          code: `runtime-${layer}-unknown`,
          message: `${layer} status is not verified`,
          level: "warning",
          repairable: false,
          owned: false,
          evidence: runtimeEvidence[layer].evidence || null,
          next_action: runtimeEvidence[layer].reason || "Start the host runtime and rerun doctor",
        });
      }
    }

    if (runtimeEvidence.written?.state === "drifted") {
      findings.push({
        host: Adapter.id,
        code: "resource-drifted",
        message: runtimeEvidence.written.reason || "Resource has been modified after installation",
        level: "warning",
        repairable: false,
        owned: true,
        path: runtimeEvidence.written.path || null,
        evidence: runtimeEvidence.written.evidence || null,
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
      scope: description.scope || null,
      risks: description.risks || [],
      evidence: runtimeEvidence,
    });
  }

  return {
    type: "doctor-report",
    schema_version: 1,
    hosts: hostReports,
    findings,
  };
}
