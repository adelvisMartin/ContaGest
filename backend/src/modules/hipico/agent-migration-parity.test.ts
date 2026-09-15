import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const supabaseSql = readFileSync(new URL('../../../../supabase/sql/hipico_v22_agent_shadow.sql', import.meta.url), 'utf8');
const prismaSql = readFileSync(new URL('../../../prisma/migrations/20260913230500_hipico_agent_shadow/migration.sql', import.meta.url), 'utf8');
const supabaseV24 = readFileSync(new URL('../../../../supabase/sql/hipico_v24_shadow_metrics.sql', import.meta.url), 'utf8');
const prismaV24 = readFileSync(new URL('../../../prisma/migrations/20260914194000_hipico_shadow_metrics_v7/migration.sql', import.meta.url), 'utf8');

const requiredContracts = [
  'hipico_group_automation',
  'hipico_agent_evaluations',
  'hipico_automation_transition_events',
  'hipico_reject_automation_transition_mutation',
  'HIPICO_AUTOMATION_TRANSITION_APPEND_ONLY',
  'before update or delete on public.hipico_automation_transition_events',
  'enable row level security',
  'hipico_group_automation_select_own',
  'hipico_agent_evaluations_select_own',
  'hipico_automation_transition_events_select_own'
];

void test('Agent/Shadow schema is deployable through Prisma and Supabase with the same safety boundary', () => {
  for (const contract of requiredContracts) {
    assert.ok(supabaseSql.toLowerCase().includes(contract.toLowerCase()), `Supabase migration missing ${contract}`);
    assert.ok(prismaSql.toLowerCase().includes(contract.toLowerCase()), `Prisma migration missing ${contract}`);
  }
});

void test('both Agent/Shadow migrations keep anonymous and authenticated mutation privileges revoked', () => {
  for (const sql of [supabaseSql, prismaSql]) {
    assert.match(sql, /revoke all on public\.hipico_group_automation from anon/i);
    assert.match(sql, /revoke all on public\.hipico_agent_evaluations from anon/i);
    assert.match(sql, /revoke all on public\.hipico_automation_transition_events from anon/i);
    assert.match(sql, /revoke all on public\.hipico_group_automation from authenticated/i);
    assert.match(sql, /revoke all on public\.hipico_agent_evaluations from authenticated/i);
    assert.match(sql, /revoke all on public\.hipico_automation_transition_events from authenticated/i);
  }
});

void test('v24 shadow-metrics migration has exact Prisma/Supabase deployment parity', () => {
  assert.equal(prismaV24.replace(/\r\n/g, '\n'), supabaseV24.replace(/\r\n/g, '\n'));
  for (const contract of [
    'abstained',
    'race_context_error',
    'metric_schema_version',
    'legacy-v6',
    "SET DEFAULT 'v7'",
    'hipico_agent_eval_recent_v7_idx',
    'new.race_context_error',
    'new.abstained = old.abstained',
    'new.metric_schema_version = old.metric_schema_version',
    'HIPICO_AGENT_EVALUATION_IMMUTABLE'
  ]) {
    assert.ok(supabaseV24.includes(contract), `v24 migration missing ${contract}`);
  }
});
