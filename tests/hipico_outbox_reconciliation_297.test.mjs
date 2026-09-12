import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { __test__ } from '../frontend/api/hipico/whatsapp-send.js';

const sender=readFileSync(new URL('../frontend/api/hipico/whatsapp-send.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/sql/hipico_v17_outbox_reconciliation_status.sql',import.meta.url),'utf8');

test('ambiguous Meta delivery is parked in a durable reconciliation state, never generic sending',()=>{
  const transitions=[...sender.matchAll(/status:\s*'reconciliation_required'/g)];
  assert.equal(transitions.length,3,'network ambiguity, success-without-message-id and stale sending leases must require reconciliation');
  assert.match(sender,/status=in\.\(queued,retry\)/);
  assert.doesNotMatch(sender,/status=in\.\([^)]*reconciliation_required/);
  assert.match(sender,/RECONCILIATION_REQUIRED:AMBIGUOUS_TRANSPORT_FAILURE/);
  assert.match(sender,/RECONCILIATION_REQUIRED:META_SUCCESS_WITHOUT_MESSAGE_ID/);
  assert.match(sender,/RECONCILIATION_REQUIRED:STALE_SENDING_LEASE/);
});

test('sending claims get a bounded lease and stale claims are quarantined instead of retried',()=>{
  const now=Date.parse('2026-09-12T02:00:00.000Z');
  assert.equal(__test__.SEND_LEASE_MS,120000);
  assert.equal(__test__.sendLeaseExpiryIso(now),'2026-09-12T02:02:00.000Z');
  assert.equal(__test__.STALE_CLAIM_SCAN_LIMIT,50);
  assert.match(sender,/body:\s*JSON\.stringify\(\{ status: 'sending', next_attempt_at: sendLeaseExpiryIso\(\), last_error: null \}\)/);
  assert.match(sender,/status=eq\.sending&next_attempt_at=lte\./);
  assert.match(sender,/const staleSendingQuarantined = await quarantineExpiredSendingClaims\(now\)/);
  assert.doesNotMatch(sender,/STALE_SENDING_LEASE[\s\S]{0,240}status:\s*'retry'/);
});

test('v17 database contract explicitly allows reconciliation_required without weakening other outbox states',()=>{
  assert.match(migration,/DROP CONSTRAINT IF EXISTS hipico_outbox_status_check/i);
  assert.match(migration,/ADD CONSTRAINT hipico_outbox_status_check/i);
  for(const state of ['queued','sending','sent','retry','cancelled','failed','reconciliation_required']){
    assert.match(migration,new RegExp(`'${state}'`));
  }
  assert.doesNotMatch(migration,/UPDATE\s+public\.hipico_outbox/i,'migration must not silently rewrite historical delivery evidence');
});
