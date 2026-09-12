import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sender=readFileSync(new URL('../frontend/api/hipico/whatsapp-send.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/sql/hipico_v17_outbox_reconciliation_status.sql',import.meta.url),'utf8');

test('ambiguous Meta delivery is parked in a durable reconciliation state, never generic sending',()=>{
  const transitions=[...sender.matchAll(/status:\s*'reconciliation_required'/g)];
  assert.equal(transitions.length,2,'network ambiguity and success-without-message-id must both require reconciliation');
  assert.match(sender,/status=in\.\(queued,retry\)/);
  assert.doesNotMatch(sender,/status=in\.\([^)]*reconciliation_required/);
  assert.match(sender,/RECONCILIATION_REQUIRED:AMBIGUOUS_TRANSPORT_FAILURE/);
  assert.match(sender,/RECONCILIATION_REQUIRED:META_SUCCESS_WITHOUT_MESSAGE_ID/);
});

test('v17 database contract explicitly allows reconciliation_required without weakening other outbox states',()=>{
  assert.match(migration,/DROP CONSTRAINT IF EXISTS hipico_outbox_status_check/i);
  assert.match(migration,/ADD CONSTRAINT hipico_outbox_status_check/i);
  for(const state of ['queued','sending','sent','retry','cancelled','failed','reconciliation_required']){
    assert.match(migration,new RegExp(`'${state}'`));
  }
  assert.doesNotMatch(migration,/UPDATE\s+public\.hipico_outbox/i,'migration must not silently rewrite historical delivery evidence');
});
