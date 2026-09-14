import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const storeSource = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('./agent.routes.ts', import.meta.url), 'utf8');
const supabaseUrl = new URL('../../../../supabase/sql/hipico_v23_risk_policy.sql', import.meta.url);
const prismaUrl = new URL('../../../prisma/migrations/20260914122000_hipico_risk_policy_v6/migration.sql', import.meta.url);

test('risk policy decision is persisted as first-class evaluation evidence', () => {
  assert.match(storeSource, /policy_disposition/);
  assert.match(storeSource, /policy_reason/);
  assert.match(storeSource, /policy_version/);
  assert.match(storeSource, /policy_evidence_state/);
  assert.match(storeSource, /riskPolicy/);
});

test('agent evaluation route derives server-only policy context and returns persisted policy', () => {
  assert.match(routeSource, /sourceReadOnly/);
  assert.match(routeSource, /serverRiskContext/);
  assert.match(routeSource, /riskPolicy/);
  assert.doesNotMatch(routeSource, /body\.policyContext/);
});

test('Supabase and Prisma migrations add bounded policy columns without changing financial authority', () => {
  assert.equal(existsSync(supabaseUrl), true, 'Supabase v23 risk policy migration must exist');
  assert.equal(existsSync(prismaUrl), true, 'Prisma risk policy migration must exist');
  for (const url of [supabaseUrl, prismaUrl]) {
    const sql = readFileSync(url, 'utf8');
    assert.match(sql, /hipico_agent_evaluations/i);
    assert.match(sql, /policy_disposition/i);
    assert.match(sql, /policy_reason/i);
    assert.match(sql, /policy_version/i);
    assert.match(sql, /policy_evidence_state/i);
    assert.match(sql, /AUTO/);
    assert.match(sql, /SUGGEST/);
    assert.match(sql, /HUMAN_REQUIRED/);
    assert.match(sql, /DENY/);
    assert.doesNotMatch(sql, /financial_authority\s*=\s*true/i);
  }
});

test('risk policy migration cannot bypass one-time review immutability', () => {
  for (const url of [supabaseUrl, prismaUrl]) {
    const sql = readFileSync(url, 'utf8');
    assert.match(sql, /LOCK TABLE public\.hipico_agent_evaluations IN ACCESS EXCLUSIVE MODE/i);
    assert.match(sql, /DROP TRIGGER IF EXISTS hipico_agent_evaluations_review_once/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hipico_guard_agent_evaluation_mutation/i);
    assert.match(sql, /new\.policy_disposition\s*=\s*old\.policy_disposition/i);
    assert.match(sql, /new\.policy_reason\s*=\s*old\.policy_reason/i);
    assert.match(sql, /new\.policy_version\s*=\s*old\.policy_version/i);
    assert.match(sql, /new\.policy_evidence_state\s*=\s*old\.policy_evidence_state/i);
    assert.match(sql, /CREATE TRIGGER hipico_agent_evaluations_review_once/i);
  }
});