import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { __test__ as receiptTest } from './hipico-handoff.store.js';

const store=readFileSync(new URL('./hipico-handoff.store.ts',import.meta.url),'utf8');
const persist=store.slice(store.indexOf('export async function persistResponsePlan'));

function plan(overrides:Record<string,unknown>={}){
  return {
    intent:'ACK_RECEIVED',text:'Recibido',canSend:true,confirmationVerified:false,
    responseIdempotencyKey:'resp_key',decisionVersion:'decision-v1',correlationId:'corr-1',sourceMessageId:'msg-1',
    evidence:{receiptId:'receipt-1',transactionId:null,stateId:'state-1'},handoffRequired:false,reason:'ACK',...overrides
  } as any;
}
function row(overrides:Record<string,unknown>={}){
  return {
    id:'row-1',sourceMessageId:'msg-1',decisionVersion:'decision-v1',correlationId:'corr-1',intent:'ACK_RECEIVED',
    responseHash:'hash-1',receiptId:'receipt-1',transactionId:null,stateId:'state-1',confirmationVerified:false,status:'planned',...overrides
  } as any;
}
function mismatch(action:()=>void){
  assert.throws(action,(error:any)=>error?.code==='HIPICO_RESPONSE_RECEIPT_IDEMPOTENCY_MISMATCH');
}

test('response receipt keeps the first persisted decision immutable on replay',()=>{
  assert.match(persist,/ON CONFLICT \("idempotencyKey"\) DO NOTHING/);
  assert.doesNotMatch(persist,/"intent"=EXCLUDED\."intent"/);
  assert.doesNotMatch(persist,/"responseHash"=EXCLUDED\."responseHash"/);
  assert.match(persist,/assertResponseReceiptReplay\(row,plan,responseHash\)/);
});

test('identical response receipt replay is accepted as an idempotent duplicate',()=>{
  assert.doesNotThrow(()=>receiptTest.assertResponseReceiptReplay(row(),plan(),'hash-1'));
});

test('response receipt replay rejects changed identity, response, evidence, confirmation or status',()=>{
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({sourceMessageId:'other'}),plan(),'hash-1'));
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({decisionVersion:'other'}),plan(),'hash-1'));
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({correlationId:'other'}),plan(),'hash-1'));
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({intent:'CONFIRMED'}),plan(),'hash-1'));
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({responseHash:'other'}),plan(),'hash-1'));
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({receiptId:'other'}),plan(),'hash-1'));
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({transactionId:'tx-1'}),plan(),'hash-1'));
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({stateId:'other'}),plan(),'hash-1'));
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({confirmationVerified:true}),plan(),'hash-1'));
  mismatch(()=>receiptTest.assertResponseReceiptReplay(row({status:'held'}),plan(),'hash-1'));
});
