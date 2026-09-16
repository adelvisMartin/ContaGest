import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const supabaseUrl = new URL('../../../../supabase/sql/hipico_v24_shadow_metrics.sql', import.meta.url);
const prismaUrl = new URL('../../../prisma/migrations/20260914194000_hipico_shadow_metrics_v7/migration.sql', import.meta.url);

function load(url: URL) {
  assert.equal(existsSync(url), true, `missing migration ${url.pathname}`);
  return readFileSync(url, 'utf8');
}

function assertContract(sql: string) {
  assert.match(sql, /BEGIN;/i);
  assert.match(sql, /LOCK TABLE public\.hipico_agent_evaluations IN ACCESS EXCLUSIVE MODE/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS abstained boolean/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS race_context_error boolean/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS metric_schema_version text/i);
  assert.match(sql, /legacy-v6/i);
  assert.match(sql, /ALTER COLUMN metric_schema_version SET DEFAULT 'v7'/i);
  assert.match(sql, /ALTER COLUMN metric_schema_version SET NOT NULL/i);
  assert.match(sql, /HIPICO_AGENT_EVALUATION_IMMUTABLE/i);
  assert.match(sql, /new\.race_context_error/i);
  assert.match(sql, /new\.abstained = old\.abstained/i);
  assert.match(sql, /new\.metric_schema_version = old\.metric_schema_version/i);
  assert.match(sql, /new\.policy_disposition = old\.policy_disposition/i);
  assert.match(sql, /new\.policy_reason = old\.policy_reason/i);
  assert.match(sql, /new\.policy_version = old\.policy_version/i);
  assert.match(sql, /new\.policy_evidence_state = old\.policy_evidence_state/i);
  assert.match(sql, /COMMIT;/i);
}

test('v7 Supabase migration is additive, atomic and review-safe', () => {
  assertContract(load(supabaseUrl));
});

test('v7 Prisma migration mirrors the Supabase review/immutability boundary', () => {
  assertContract(load(prismaUrl));
});
