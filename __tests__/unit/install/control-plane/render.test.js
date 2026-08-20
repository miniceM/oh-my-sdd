import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderJson, renderText } from '../../../../install/control-plane/render.js';

const plan = {
  schema_version: 1,
  hosts: [{
    id: 'kilocode',
    display_name: 'Kilo Code',
    dependencies: [],
    capabilities: {
      write_prevention: {
        supported: false,
        evidence: 'host lacks PreToolUse',
        level: 'advisory',
      },
    },
    resources: [{ kind: 'instructions', path: '~/.config/kilo/AGENTS.md' }],
    risks: [{ category: 'enforcement', level: 'advisory', message: 'Hook enforcement is unavailable.' }],
    recommendation: { action: 'install', reason: 'Ready to install oh-my-sdd resources.' },
  }],
};

describe('control-plane renderers', () => {
  it('renders the plan as one JSON envelope', () => {
    assert.equal(renderJson(plan), `${JSON.stringify({ type: 'installation-plan', plan })}\n`);
  });

  it('renders host, protection level, resources, risks, and next action from the plan', () => {
    const output = renderText(plan);

    assert.match(output, /Kilo Code/);
    assert.match(output, /advisory/);
    assert.match(output, /AGENTS\.md/);
    assert.match(output, /Hook enforcement is unavailable/);
    assert.match(output, /install/);
  });
});
