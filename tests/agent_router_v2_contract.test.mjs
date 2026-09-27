import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DOMAIN_RISK_CATALOG, gatesForFiles } from '../qa/support/domain-risk-catalog.mjs';

const requiredDomains = ['agent-system','hipico-automation','data-lifecycle','api-governance','observability','supply-chain','vertical-runtime','privacy-sensitive'];
const validAgentIds = new Set(['orchestrator','accounting','backend-api','dbre','appsec-iam','frontend-pwa-ux','hipico-reliability','qa-release']);

const byId = new Map(DOMAIN_RISK_CATALOG.map((domain) => [domain.id, domain]));

test('router v2 exposes the required new risk domains', () => {
  for (const id of requiredDomains) assert.ok(byId.has(id), `missing domain ${id}`);
});

test('every domain emits stable agent ids that resolve to profiles', () => {
  for (const domain of DOMAIN_RISK_CATALOG) {
    assert.ok(Array.isArray(domain.agentIds) && domain.agentIds.length > 0, `${domain.id} missing agentIds`);
    for (const id of domain.agentIds) {
      assert.ok(validAgentIds.has(id), `${domain.id} emitted unknown agent id ${id}`);
      assert.ok(fs.existsSync(path.join(process.cwd(), `.agents/agents/${id}.md`)), `missing profile for ${id}`);
    }
  }
});

test('agent-system domain covers all agent-governance surfaces', () => {
  const samples = ['AGENTS.md','.agents/context/BOOTSTRAP.md','agent-skills.lock.json','scripts/agent-gate-router.mjs','scripts/verify-agent-skills.mjs','qa/support/domain-risk-catalog.mjs'];
  for (const sample of samples) {
    const ids = gatesForFiles([sample]).map((d) => d.id);
    assert.ok(ids.includes('agent-system'), `${sample} did not route to agent-system`);
  }
});

test('representative files route to each new domain', () => {
  const cases = new Map([
    ['backend/src/modules/hipico/outbox.ts','hipico-automation'],
    ['backend/src/modules/data-lifecycle/retention.ts','data-lifecycle'],
    ['backend/src/modules/api/contracts.ts','api-governance'],
    ['backend/src/observability/tracing.ts','observability'],
    ['.github/workflows/supply-chain-v550.yml','supply-chain'],
    ['qa/vertical-runtime-v590.spec.mjs','vertical-runtime'],
    ['backend/src/modules/health/privacy.ts','privacy-sensitive'],
  ]);
  for (const [file, expected] of cases) {
    const ids = gatesForFiles([file]).map((d) => d.id);
    assert.ok(ids.includes(expected), `${file} did not route to ${expected}`);
  }
});
