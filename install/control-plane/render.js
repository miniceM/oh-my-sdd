/** Render an installation plan as a stable JSON envelope for automation. */
export function renderJson(plan) {
  return `${JSON.stringify({ type: 'installation-plan', plan })}\n`;
}

function formatProtection(capabilities) {
  const prevention = capabilities?.write_prevention;
  if (!prevention || typeof prevention !== 'object') return 'unknown';
  const detail = typeof prevention.evidence === 'string' ? ` (${prevention.evidence})` : '';
  return `${prevention.level ?? (prevention.supported ? 'enforced' : 'unavailable')}${detail}`;
}

function formatResource(resource) {
  if (typeof resource === 'string') return resource;
  if (!resource || typeof resource !== 'object') return String(resource);
  return [resource.kind, resource.path].filter(Boolean).join(': ') || JSON.stringify(resource);
}

function formatRisk(risk) {
  if (typeof risk === 'string') return risk;
  if (!risk || typeof risk !== 'object') return String(risk);
  const label = [risk.level, risk.category].filter(Boolean).join('/') || 'risk';
  return `${label}: ${risk.message ?? ''}`.trim();
}

/** Render the same installation-plan facts as concise human-readable text. */
export function renderText(plan) {
  const lines = [`Installation plan (schema v${plan?.schema_version ?? 'unknown'})`];

  for (const host of plan?.hosts ?? []) {
    lines.push('', `${host.display_name ?? host.id ?? 'Unknown host'} (${host.id ?? 'unknown'})`);
    lines.push(`  Protection: ${formatProtection(host.capabilities)}`);
    lines.push('  Resources:');
    for (const resource of host.resources ?? []) lines.push(`  - ${formatResource(resource)}`);
    lines.push('  Risks:');
    for (const risk of host.risks ?? []) lines.push(`  - ${formatRisk(risk)}`);
    const recommendation = host.recommendation ?? {};
    lines.push(`  Next action: ${recommendation.action ?? 'inspect'}${recommendation.reason ? ` — ${recommendation.reason}` : ''}`);
  }

  return `${lines.join('\n')}\n`;
}
