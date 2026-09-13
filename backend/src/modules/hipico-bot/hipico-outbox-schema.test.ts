import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const supabase=readFileSync(new URL('../../../../supabase/sql/hipico_v21_production_outbox.sql',import.meta.url),'utf8');
const prisma=readFileSync(new URL('../../../prisma/migrations/20260913233000_hipico_production_outbox_v5/migration.sql',import.meta.url),'utf8');

function assertContract(sql:string){
  assert.match(sql,/public\.hipico_outbox/i);
  for(const column of [
    'correlation_id','payload_digest','provider','lease_token','leased_at','leased_until',
    'max_attempts','cooldown_until','accepted_at','delivered_at','read_at','failed_at',
    'last_error_code','updated_at'
  ]) assert.match(sql,new RegExp(column,'i'));
  for(const status of ['queued','sending','accepted','sent','delivered','read','retry','cancelled','failed','reconciliation_required']){
    assert.match(sql,new RegExp(`'${status}'`,'i'));
  }
  assert.match(sql,/create table if not exists public\.hipico_outbox_receipts/i);
  assert.match(sql,/provider_message_id/i);
  assert.match(sql,/receipt_status/i);
  assert.match(sql,/unique[\s\S]+provider_message_id[\s\S]+receipt_status[\s\S]+receipt_timestamp/i);
  assert.match(sql,/where status\s*=\s*'sending'/i);
  assert.match(sql,/max_attempts\s+between\s+1\s+and\s+20/i);
  assert.doesNotMatch(sql,/attempts\s*<=\s*max_attempts/i,'historical attempts may exceed the new default max during additive migration');
  assert.doesNotMatch(sql,/"HipicoBotOutbox"/);
}

test('canonical outbox migration defines lease retry cooldown and receipt evidence',()=>{
  assertContract(supabase);
});

test('Prisma deploy migration mirrors the canonical outbox contract',()=>{
  assertContract(prisma);
});
