import test from 'node:test';
import assert from 'node:assert/strict';
import { gatesForFiles } from '../qa/support/domain-risk-catalog.mjs';

function domainFor(file) {
  return gatesForFiles([file]).find((domain) => domain.id === 'hipico-platform');
}

test('Hípico backend, frontend API, PWA, Android, QA and SQL changes route through the critical Hípico domain', () => {
  const files = [
    'backend/src/modules/hipico/agent.routes.ts',
    'backend/src/modules/hipico-bot/hipico-bridge.routes.ts',
    'frontend/api/hipico/command-center.js',
    'frontend/public/hipico-control/assets/js/command-center.js',
    'android/hipico-control-v1130/scripts/sync-web.mjs',
    'qa/fixtures/hipico-agent-golden-v1.json',
    'supabase/sql/hipico_v16_agent_shadow.sql'
  ];

  for (const file of files) {
    const domain = domainFor(file);
    assert.ok(domain, `missing hipico-platform routing for ${file}`);
    assert.equal(domain.severity, 'critical');
    assert.ok(domain.skills.includes('contagest-release-evidence'));
    assert.ok(domain.skills.includes('contagest-secure-verification'));
    assert.ok(domain.gates.includes('hipico-tests'));
    assert.ok(domain.gates.includes('exact-sha'));
  }
});

test('Hípico routing always requires source-read-only and responsive browser evidence', () => {
  const domain = domainFor('frontend/public/hipico-control/index.html');
  assert.ok(domain);
  assert.ok(domain.gates.includes('source-read-only'));
  assert.ok(domain.gates.includes('browser-360-390-430-768-1440'));
  assert.ok(domain.agents.includes('Hípico Domain'));
  assert.ok(domain.agents.includes('AppSec'));
  assert.ok(domain.agents.includes('QA'));
});
