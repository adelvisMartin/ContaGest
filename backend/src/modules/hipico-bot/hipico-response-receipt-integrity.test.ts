import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { __test__ } from './hipico-handoff.store.js';
import type { SafeResponsePlan } from './hipico-response-safety.js';

const store=readFileSync(new URL('./hipico-handoff.store.ts',import.meta.url),'utf8');
const persist=store.slice(store.indexOf('export async function persistResponsePlan'));

function plan(overrides:Partial<SafeResponsePlan>={}):SafeResponsePlan{
  return{
    intent:'CONFIRMED',
    text:'Jugada confirmada',
    canSend:true,
    confirmationVerified:true,
    responseIdempotencyKey:'resp-1',
    decisionVersion:'decision-v1',
    correlationId:'corr-1',
    sourceMessageId:'source-1',
    evidence:{receiptId:'receipt-1',transactionId:'tx-1',stateId:'state-1',persisted:true,sourceMessageId:'source-1',correlationId:'corr-1'},
    handoffRequired:false,
    reason:'CONFIRMATION_VERIFIED',
    ...overrides
  };
}

function persisted(input:SafeResponsePlan){
  const evidence=__test__.responseReceiptEvidence(input);
  return{id:'receipt-row-1',...evidence};
}

test('response receipt keeps the first persisted decision immutable on replay',()=>{
  assert.match(persist,/ON CONFLICT \("idempotencyKey"\) DO NOTHING/);
  assert.doesNotMatch(persist,/"intent"=EXCLUDED\."intent"/);
  assert.doesNotMatch(persist,/"responseHash"=EXCLUDED\."responseHash"/);
  assert.match(persist,/HIPICO_RESPONSE_RECEIPT_IDEMPOTENCY_MISMATCH/);
});

test('response receipt exact replay accepts the same persisted response evidence',()=>{
  const original=plan();
  assert.doesNotThrow(()=>__test__.assertResponseReceiptReplay(persisted(original),original));
});

test('response receipt replay rejects changed decision identity, response, evidence or sendability',()=>{
  const original=plan();
  const row=persisted(original);
  const mutations:SafeResponsePlan[]=[
    plan({sourceMessageId:'source-2'}),
    plan({decisionVersion:'decision-v2'}),
    plan({correlationId:'corr-2'}),
    plan({intent:'REJECTED'}),
    plan({text:'Texto distinto'}),
    plan({confirmationVerified:false}),
    plan({canSend:false}),
    plan({evidence:{...original.evidence,receiptId:'receipt-2'}}),
    plan({evidence:{...original.evidence,transactionId:'tx-2'}}),
    plan({evidence:{...original.evidence,stateId:'state-2'}})
  ];
  for(const changed of mutations){
    assert.throws(()=>__test__.assertResponseReceiptReplay(row,changed),(error:any)=>error?.code==='HIPICO_RESPONSE_RECEIPT_IDEMPOTENCY_MISMATCH');
  }
});

test('response receipt evidence stores only durable fields used by the database receipt',()=>{
  const evidence=__test__.responseReceiptEvidence(plan());
  assert.deepEqual(Object.keys(evidence).sort(),[
    'confirmationVerified','correlationId','decisionVersion','intent','receiptId','responseHash','sourceMessageId','stateId','status','transactionId'
  ].sort());
  assert.equal(evidence.status,'planned');
  assert.match(String(evidence.responseHash),/^[a-f0-9]{64}$/);
});
