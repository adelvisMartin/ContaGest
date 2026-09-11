import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(url:string)=>readFileSync(new URL(url,import.meta.url),'utf8');
const botBase=read('../../../prisma/migrations/0014_v1126_hipico_bot/migration.sql');
const groupOutbox=read('../../../prisma/migrations/0016_hipico_bot_group_outbox_idempotency/migration.sql');
const domain=read('../../../prisma/migrations/20260827211500_hipico_domain_state_integrity/migration.sql');
const money=read('../../../prisma/migrations/20260827212500_hipico_money_ledger/migration.sql');
const handoff=read('../../../prisma/migrations/20260829214500_hipico_response_handoff/migration.sql');
const operations=read('../../../../supabase/sql/hipico_v12_operations.sql');
const groupBridge=read('../../../../supabase/sql/hipico_v12_group_bridge.sql');
const shadow=read('../../../../supabase/sql/hipico_v12_shadow_validation.sql');
const lab=read('../../../../supabase/sql/hipico_v13_lab_channel_bootstrap.sql');
const transportStore=read('./hipico-bridge-transport.store.ts');
const canonicalStore=read('./hipico-canonical-shadow.store.ts');
const handoffStore=read('./hipico-handoff.store.ts');
const moneyStore=read('./hipico-money-ledger.store.ts');

test('transport provider identity and group shadow outbox conflicts are backed by matching unique constraints',()=>{
  assert.match(botBase,/"providerMessageId" TEXT NOT NULL UNIQUE/);
  assert.match(groupOutbox,/CREATE UNIQUE INDEX IF NOT EXISTS "HipicoBotOutbox_group_event_unique"[\s\S]*\("eventId", "targetType"\)[\s\S]*"targetType" = 'group_bridge'/i);
  assert.match(transportStore,/ON CONFLICT \("providerMessageId"\) DO NOTHING/);
  assert.match(transportStore,/ON CONFLICT \("eventId","targetType"\)[\s\S]*"targetType"='group_bridge'[\s\S]*DO NOTHING/);
});

test('canonical bridge conflict keys exactly match persisted unique indexes',()=>{
  assert.match(operations,/unique\(owner_id, group_key\)/i);
  assert.match(operations,/hipico_messages_external_unique[\s\S]*\(owner_id, channel_key, external_message_id\)[\s\S]*external_message_id is not null/i);
  assert.match(operations,/unique\(owner_id, event_key\)/i);
  assert.match(canonicalStore,/ON CONFLICT \(owner_id,group_key\) DO NOTHING/);
  assert.match(canonicalStore,/ON CONFLICT \(owner_id,channel_key,external_message_id\) WHERE external_message_id IS NOT NULL[\s\S]*DO NOTHING/);
  assert.match(canonicalStore,/ON CONFLICT \(owner_id,event_key\) DO NOTHING/);
});

test('web_bridge is explicitly allowed by schema and LAB active identity is unique',()=>{
  assert.match(groupBridge,/channel_type in \('manual_export','android_share','meta_direct','meta_group','web_bridge'\)/i);
  assert.match(lab,/create unique index if not exists hipico_single_active_lab_channel_idx[\s\S]*group_key = 'control-hipico-lab'[\s\S]*channel_type = 'web_bridge'[\s\S]*status = 'active'/i);
});

test('shadow prediction upsert key has a matching unique schema contract',()=>{
  assert.match(shadow,/unique\(owner_id, source_group_key, source_external_message_id, prediction_type\)/i);
  assert.match(canonicalStore,/ON CONFLICT \(owner_id,source_group_key,source_external_message_id,prediction_type\)/);
});

test('response handoff optimistic concurrency and receipt idempotency are physically represented in schema',()=>{
  assert.match(handoff,/"conversationKey" TEXT PRIMARY KEY/);
  assert.match(handoff,/"version" INTEGER NOT NULL DEFAULT 1/);
  assert.match(handoff,/"idempotencyKey" TEXT NOT NULL UNIQUE/);
  assert.match(handoffStore,/WHERE "conversationKey"=\$\{state\.conversationKey\}[\s\S]*AND "version"=\$\{expectedVersion\}/);
  assert.match(handoffStore,/ON CONFLICT \("idempotencyKey"\) DO NOTHING/);
});

test('domain and monetary evidence remain append-only at the database boundary',()=>{
  assert.match(domain,/BEFORE UPDATE OR DELETE ON public\.hipico_domain_events/i);
  assert.match(domain,/HIPICO_DOMAIN_EVENTS_APPEND_ONLY/);
  assert.match(domain,/UNIQUE \(owner_id, group_key, aggregate_kind, aggregate_key, source_message_key, event_type\)/i);
  assert.match(money,/amount_minor NUMERIC\(30,0\) NOT NULL/i);
  assert.match(money,/UNIQUE \(owner_id, group_key, idempotency_key\)/i);
  assert.match(money,/hipico_money_single_settlement_idx/i);
  assert.match(money,/hipico_money_single_reversal_idx/i);
  assert.match(money,/BEFORE UPDATE OR DELETE ON public\.hipico_money_ledger_entries/i);
  assert.match(moneyStore,/pg_advisory_xact_lock/);
});
