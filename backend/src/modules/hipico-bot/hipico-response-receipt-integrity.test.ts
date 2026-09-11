import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const store=readFileSync(new URL('./hipico-handoff.store.ts',import.meta.url),'utf8');
const persist=store.slice(store.indexOf('export async function persistResponsePlan'));

test('response receipt keeps the first persisted decision immutable on replay',()=>{
  assert.match(persist,/ON CONFLICT \("idempotencyKey"\) DO NOTHING/);
  assert.doesNotMatch(persist,/"intent"=EXCLUDED\."intent"/);
  assert.doesNotMatch(persist,/"responseHash"=EXCLUDED\."responseHash"/);
  assert.match(persist,/HIPICO_RESPONSE_RECEIPT_IDEMPOTENCY_MISMATCH/);
});

test('response receipt duplicate identity remains bound to source, decision version and correlation id',()=>{
  assert.match(persist,/row\.sourceMessageId!==plan\.sourceMessageId/);
  assert.match(persist,/row\.decisionVersion!==plan\.decisionVersion/);
  assert.match(persist,/row\.correlationId!==plan\.correlationId/);
});
