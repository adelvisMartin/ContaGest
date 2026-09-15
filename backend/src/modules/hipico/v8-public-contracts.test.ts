import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as agentPolicy from './agent-policy.js';
import * as automationStore from './automation.store.js';
import * as golden from './agent-golden.js';

const requiredAgentExports = [
  'AUTOMATION_STATES',
  'AGENT_TOOLS',
  'AUTO_EXECUTABLE_TOOLS',
  'MIN_AUTO_CONFIDENCE',
  'canPromoteAutomation',
  'validateModelCandidate',
  'agentCanAct',
  'safeToolRequest',
  'HipicoAgentEngine'
] as const;

test('v8 preserves public Hípico façade exports', () => {
  for (const key of requiredAgentExports) {
    assert.ok(key in agentPolicy, `missing export ${key}`);
  }
  assert.ok('AutomationStore' in automationStore);
  assert.ok('sanitizeAgentEvidence' in automationStore);
  assert.ok('scoreGoldenCorpus' in golden);
});

test('v8 preserves Agent automation route paths and no-store contract', () => {
  const source = readFileSync(new URL('./agent.routes.ts', import.meta.url), 'utf8');
  for (const route of [
    "router.get('/groups/:groupId/automation'",
    "router.post('/groups/:groupId/automation'",
    "router.get('/groups/:groupId/automation/transitions'",
    "router.get('/groups/:groupId/automation/evaluations'",
    "router.post('/groups/:groupId/automation/evaluate'",
    "router.post('/groups/:groupId/automation/evaluations/:id/review'"
  ]) {
    assert.ok(source.includes(route), `missing route ${route}`);
  }
  assert.match(source, /Cache-Control', 'no-store, max-age=0'/);
});

test('v8 keeps SOURCE and financial authority fail-closed contracts visible', () => {
  const routeSource = readFileSync(new URL('./agent.routes.ts', import.meta.url), 'utf8');
  const storeSource = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');
  assert.match(storeSource, /SOURCE_SHADOW_ONLY/);
  assert.match(routeSource, /financialAuthority:\s*false/);
  assert.match(routeSource, /directEffectsApplied:\s*false/);
});
