import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const prismaMigration=readFileSync(
  new URL('../../../prisma/migrations/20260912022000_hipico_operator_audit_outbox_reconciliation/migration.sql',import.meta.url),
  'utf8'
);
const supabaseV16=readFileSync(
  new URL('../../../../supabase/sql/hipico_v16_operator_confirmation_audit.sql',import.meta.url),
  'utf8'
);
const supabaseV17=readFileSync(
  new URL('../../../../supabase/sql/hipico_v17_outbox_reconciliation_status.sql',import.meta.url),
  'utf8'
);

test('Prisma deploy path carries canonical operator confirmation audit required by Supabase v16',()=>{
  for(const token of [
    'operator_confirmed',
    'confirmation_reason',
    'hipico_domain_events_confirmation_audit_check'
  ]){
    assert.match(prismaMigration,new RegExp(token,'i'),token);
    assert.match(supabaseV16,new RegExp(token,'i'),token);
  }
  assert.match(prismaMigration,/char_length\(btrim\(coalesce\(confirmation_reason, ''\)\)\) BETWEEN 5 AND 500/i);
});

test('Prisma deploy path carries ambiguous outbox reconciliation state required by Supabase v17',()=>{
  assert.match(prismaMigration,/hipico_outbox_status_check/i);
  assert.match(prismaMigration,/'reconciliation_required'/i);
  assert.match(supabaseV17,/'reconciliation_required'/i);
  for(const status of ['queued','sending','sent','retry','cancelled','failed']){
    assert.match(prismaMigration,new RegExp(`'${status}'`,'i'),status);
  }
});

test('deploy parity migration is additive/replay-safe and never rewrites historical Hípico evidence',()=>{
  assert.match(prismaMigration,/ADD COLUMN IF NOT EXISTS operator_confirmed/i);
  assert.match(prismaMigration,/ADD COLUMN IF NOT EXISTS confirmation_reason/i);
  assert.match(prismaMigration,/DROP CONSTRAINT IF EXISTS hipico_outbox_status_check/i);
  assert.doesNotMatch(prismaMigration,/\bUPDATE\s+public\.hipico_/i);
  assert.doesNotMatch(prismaMigration,/\bDELETE\s+FROM\s+public\.hipico_/i);
  assert.doesNotMatch(prismaMigration,/\bDROP\s+TABLE\b/i);
});
