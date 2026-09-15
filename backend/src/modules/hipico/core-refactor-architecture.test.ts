import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(name: string) {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}

function botSource(name: string) {
  return readFileSync(new URL(`../hipico-bot/${name}`, import.meta.url), 'utf8');
}

void test('agent contracts and extracted policy modules do not depend on the compatibility facade', () => {
  for (const file of ['agent-contracts.ts', 'agent-tools.ts', 'promotion-policy.ts', 'agent-evaluator.ts']) {
    assert.doesNotMatch(source(file), /from ['"]\.\/agent-policy\.js['"]/);
  }
});

void test('agent-policy is a compatibility facade and no longer duplicates gate/tool implementations', () => {
  const facade = source('agent-policy.ts');
  assert.match(facade, /from ['"]\.\/agent-contracts\.js['"]/);
  assert.match(facade, /from ['"]\.\/agent-tools\.js['"]/);
  assert.match(facade, /from ['"]\.\/promotion-policy\.js['"]/);
  assert.match(facade, /from ['"]\.\/agent-evaluator\.js['"]/);
  assert.doesNotMatch(facade, /PROMOTION_GATES/);
  assert.doesNotMatch(facade, /DANGEROUS_KEY/);
  assert.doesNotMatch(facade, /class HipicoAgentEngine\s*\{/);
});

void test('automation store delegates scope, evidence and metrics while preserving its public class', () => {
  const store = source('automation.store.ts');
  assert.match(store, /from ['"]\.\/automation-scope\.js['"]/);
  assert.match(store, /from ['"]\.\/automation-evidence\.js['"]/);
  assert.match(store, /from ['"]\.\/automation-metrics\.store\.js['"]/);
  assert.match(store, /export class AutomationStore/);
  assert.match(store, /export \{ sanitizeAgentEvidence \}/);
  assert.doesNotMatch(store, /FORBIDDEN_EVIDENCE_KEY/);
  assert.doesNotMatch(store, /readHistoricalMetricWindow\s*\(/);
});

void test('agent routes delegate parsing and policy-safe server context to agent-http', () => {
  const routes = source('agent.routes.ts');
  assert.match(routes, /from ['"]\.\/agent-http\.js['"]/);
  assert.doesNotMatch(routes, /z\.object\(/);
  assert.doesNotMatch(routes, /function serverRiskContext/);
  assert.match(routes, /actions:\s*\[\]/);
  assert.match(routes, /financialAuthority:\s*false/);
  assert.match(routes, /directEffectsApplied:\s*false/);
});

void test('canonical outbox store delegates normalization but keeps database authority and lease semantics', () => {
  const store = botSource('hipico-outbox.store.ts');
  assert.match(store, /from ['"]\.\/hipico-outbox-input\.js['"]/);
  assert.match(store, /from ['"]\.\/hipico-outbox-receipt-input\.js['"]/);
  assert.match(store, /FOR UPDATE SKIP LOCKED/);
  assert.match(store, /status = 'reconciliation_required'/);
  assert.match(store, /status = 'sending' AND lease_token/);
  assert.doesNotMatch(store, /const E164_DIGITS/);
  assert.doesNotMatch(store, /function sameCanonicalOutboundIntent/);
});
