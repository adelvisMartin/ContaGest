import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration=readFileSync(
  new URL('../../../prisma/migrations/20260924142000_hipico_autonomous_source_reply_v15/migration.sql',import.meta.url),
  'utf8'
);
const supabase=readFileSync(
  new URL('../../../../supabase/sql/hipico_v26_autonomous_source_reply.sql',import.meta.url),
  'utf8'
);
const route=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
const store=readFileSync(new URL('./hipico-bridge-transport.store.ts',import.meta.url),'utf8');

test('v15 source reply migration is additive, replay-safe and identical across deploy paths',()=>{
  assert.equal(supabase,migration);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS "HipicoBotOutbox_source_reply_event_unique"/);
  assert.match(migration,/WHERE "eventId" IS NOT NULL AND "targetType" = 'source_reply'/);
  assert.doesNotMatch(migration,/\bUPDATE\b/i);
  assert.doesNotMatch(migration,/\bDELETE\b/i);
  assert.doesNotMatch(migration,/\bDROP\s+TABLE\b/i);
});

test('source reply command is persisted before it can be returned as sendable',()=>{
  const eventStart=route.indexOf("router.post('/bridge/events'");
  const eventEnd=route.indexOf('export default router',eventStart);
  const block=route.slice(eventStart,eventEnd);
  const decide=block.indexOf('autonomousReplyService.decide');
  const persist=block.indexOf('ensureSourceReplyOutbox({',decide);
  const expose=block.indexOf('sourceReplyCommand={...decision',persist);
  assert.ok(decide>=0&&persist>decide&&expose>persist);
});

test('duplicate bridge delivery reloads the persisted source reply instead of recomputing a second answer',()=>{
  assert.match(route,/const persistedReply=!event\.inserted\?await getSourceReplyOutbox\(event\.id\):null/);
  assert.match(route,/persistedReply\.status==='planned'\?'SEND':'NONE'/);
  assert.match(route,/persistedReply\.status==='planned'\?persistedReply\.message:null/);
});

test('backend readiness binds safe-auto to the durable source reply schema',()=>{
  assert.match(route,/sourceReplyOutboxReady\(\)/);
  assert.match(route,/SOURCE_REPLY_SCHEMA_NOT_READY/);
  assert.match(route,/sourceSendPossible=autoReplyConfigured&&ready/);
  assert.match(store,/to_regclass\('public\."HipicoBotOutbox_source_reply_event_unique"'\)/);
});

test('money and race-state authority remain absent from autonomous source reply persistence',()=>{
  const start=store.indexOf('export async function ensureSourceReplyOutbox');
  const end=store.indexOf('const SOURCE_REPLY_DELIVERY_STATES',start);
  const sourceReplyStore=store.slice(start,end);
  assert.doesNotMatch(sourceReplyStore,/ledger|balance|race_state|settlement|command\(/i);
  assert.match(sourceReplyStore,/"targetType"='source_reply'/);
});


test('source reply SQL remains Prisma-parameterized and contains no accidental template literal fragments',()=>{
  assert.equal(store.includes('`{input.'),false);
  assert.equal(store.includes('`{eventId}'),false);
  assert.match(store,/WHERE "eventId"=\$\{eventId\}/);
  assert.match(store,/VALUES\s*\([\s\S]*\$\{candidateId\}[\s\S]*\$\{input\.eventId\}/);
});
