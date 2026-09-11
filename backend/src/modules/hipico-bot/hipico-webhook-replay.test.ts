import assert from 'node:assert/strict';
import test from 'node:test';
import { replayMismatchError, sameWebhookReplay, webhookReplaySignature } from './hipico-webhook-replay.js';

const base={
  providerMessageId:'wamid-1',
  phoneNumberId:'1234567890',
  sender:'584121234567',
  messageType:'text',
  body:'JUEGA 1N 3 CON 30K',
  payload:{id:'wamid-1',from:'584121234567',timestamp:'1789106400',type:'text',text:{body:'JUEGA 1N 3 CON 30K'}}
};

test('Meta replay signature is stable across JSON object key order',()=>{
  const reordered={...base,payload:{type:'text',timestamp:'1789106400',from:'584121234567',id:'wamid-1',text:{body:'JUEGA 1N 3 CON 30K'}}};
  assert.equal(webhookReplaySignature(base),webhookReplaySignature(reordered));
});

test('identical Meta retry is accepted as the same immutable webhook source',()=>{
  assert.equal(sameWebhookReplay(base,{...base,payload:{...base.payload}}),true);
});

test('same provider id with changed source semantics is rejected',()=>{
  const mutations=[
    {...base,phoneNumberId:'9999999999'},
    {...base,sender:'584129999999'},
    {...base,messageType:'image'},
    {...base,body:'JUEGA 1N 3 CON 300K'},
    {...base,payload:{...base.payload,timestamp:'1789106401'}}
  ];
  for(const changed of mutations)assert.equal(sameWebhookReplay(base,changed),false);
});

test('replay mismatch exposes the canonical non-retryable error code',()=>{
  const error=replayMismatchError() as Error&{code?:string};
  assert.equal(error.code,'HIPICO_WEBHOOK_REPLAY_MISMATCH');
});
