import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const supabaseSql = readFileSync(new URL('../../../../supabase/sql/hipico_v22_agent_shadow.sql', import.meta.url), 'utf8');
const prismaSql = readFileSync(new URL('../../../prisma/migrations/20260913230500_hipico_agent_shadow/migration.sql', import.meta.url), 'utf8');

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