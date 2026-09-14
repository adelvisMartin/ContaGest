import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
    assert.ok(domain.skills.includes('contagest-hipico-platform'));
    assert.ok(domain.skills.includes('contagest-release-evidence'));
    assert.ok(domain.skills.includes('contagest-secure-verification'));
    assert.ok(domain.gates.includes('hipico-tests'));
    assert.ok(domain.gates.includes('exact-sha'));
  }
});

test('Hípico workflows, release scripts, product policy, docs and skill edits cannot bypass the Hípico critical domain', () => {
  const files = [
    '.github/workflows/hipico-production-gates-v290.yml',
    '.github/workflows/hipico-data-engines.yml',
    'scripts/hipico-release-guard-v290.mjs',
    'scripts/hipico-secret-scan-v290.mjs',
    'products/hipico-control/release-policy.json',
    'docs/hipico/SECURITY_THREAT_MODEL.md',
    '.agents/skills/contagest-hipico-platform/SKILL.md'
  ];

  for (const file of files) {
    const domain = domainFor(file);
    assert.ok(domain, `critical Hípico routing must include ${file}`);
    assert.ok(domain.gates.includes('source-read-only'));
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

test('Hípico skill keeps exact evidence vocabulary and bounded self-improvement safety', () => {
  const skill = fs.readFileSync('.agents/skills/contagest-hipico-platform/SKILL.md', 'utf8');
  assert.match(skill, /SOURCE is read-only/i);
  assert.match(skill, /LAB is the only automation\/simulation target/i);
  assert.match(skill, /financialAuthority=false/);
  assert.match(skill, /directEffectsApplied=false/);
  assert.match(skill, /PASS.*FAIL.*BLOCKED.*NOT_EXECUTED/s);
  assert.match(skill, /runner_id=0/);
  assert.match(skill, /Never create recursive self-edit loops/i);
  assert.match(skill, /regression test or deterministic contract/i);
  assert.match(skill, /not used retroactively to declare the same failing candidate PASS/i);
});
