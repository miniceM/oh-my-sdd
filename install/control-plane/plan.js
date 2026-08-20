const EMPTY_ARRAY = Object.freeze([]);

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function defaultRecommendation(risks) {
  if (risks.some((risk) => risk?.level === 'error')) {
    return {
      action: 'inspect',
      reason: 'Resolve the host inspection error before installing.',
    };
  }

  return {
    action: 'install',
    reason: 'Ready to install oh-my-sdd resources.',
  };
}

function normalizeRecommendation(value, risks) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultRecommendation(risks);
  }

  const fallback = defaultRecommendation(risks);
  return {
    action: typeof value.action === 'string' && value.action ? value.action : fallback.action,
    reason: typeof value.reason === 'string' && value.reason ? value.reason : fallback.reason,
  };
}

/**
 * Convert an adapter's host facts into the stable installation-plan schema.
 * This function is deliberately read-only: adapters are only asked to describe
 * their host and are never asked to preflight, install, or patch resources.
 */
export function normalizeHost(host = {}, Adapter = {}) {
  const facts = objectOrEmpty(host);
  const risks = arrayOrEmpty(facts.risks);

  return {
    id: typeof facts.id === 'string' && facts.id ? facts.id : (Adapter.id ?? 'unknown'),
    display_name: typeof facts.display_name === 'string' && facts.display_name
      ? facts.display_name
      : (Adapter.displayName ?? Adapter.id ?? 'Unknown host'),
    dependencies: arrayOrEmpty(facts.dependencies),
    capabilities: objectOrEmpty(facts.capabilities),
    resources: arrayOrEmpty(facts.resources),
    risks,
    recommendation: normalizeRecommendation(facts.recommendation, risks),
  };
}

function describeAdapter(Adapter, ctx) {
  try {
    if (typeof Adapter?.describe !== 'function') {
      throw new Error('Adapter does not provide describe().');
    }
    return normalizeHost(Adapter.describe(ctx), Adapter);
  } catch (error) {
    return normalizeHost({
      id: Adapter?.id,
      display_name: Adapter?.displayName,
      risks: [{
        category: 'inspection',
        level: 'error',
        message: error instanceof Error ? error.message : String(error),
      }],
    }, Adapter);
  }
}

/** Build a versioned, side-effect-free plan from host adapter descriptions. */
export function buildInstallationPlan({ adapters = EMPTY_ARRAY, ctx = {} } = {}) {
  return {
    schema_version: 1,
    hosts: arrayOrEmpty(adapters).map((Adapter) => describeAdapter(Adapter, ctx)),
  };
}
