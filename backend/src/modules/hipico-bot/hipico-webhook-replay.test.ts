import test from 'node:test';
import assert from 'node:assert/strict';
import { replayMismatchError, sameWebhookReplay, webhookReplaySignature } from './hipico-webhook-replay.js';

const base={
  providerMessageId:'wamid.HBgMNTg0MTIzNDU2Nzg5FQIAERgSNTQxMjM0NTY3ODkwMTIzNDU2AA==',
  phoneNumberId:'1234567890',
  sender:'584123456789',
  messageType:'text',
  body:'Hola grupo',
  payload:{id:'wamid.HBgMNTg0',type:'text',text:{body:'Hola grupo'},nested:{b:2,a:1}}
};

test('Meta replay signature is stable across JSON object key order',()=>{
  const reordered={...base,payload:{nested:{a:1,b:2},text:{body:'Hola grupo'},type:'text',id:'wamid.HBgMNTg0'}};
  assert.equal(webhookReplaySignature(base),webhookReplaySignature(reordered));
  assert.equal(sameWebhookReplay(base,reordered),true);
});

test('identical Meta retry is accepted as the same immutable webhook source',()=>{
  assert.equal(sameWebhookReplay(base,structuredClone(base)),true);
});

test('same provider id with changed source semantics is rejected',()=>{
  for(const mutated of [
    {...base,sender:'584999999999'},
    {...base,phoneNumberId:'9999999999'},
    {...base,messageType:'button'},
    {...base,body:'texto alterado'},
    {...base,payload:{...base.payload,text:{body:'texto alterado'}}}
  ])assert.equal(sameWebhookReplay(base,mutated),false);
});

test('replay mismatch exposes the canonical non-retryable error code',()=>{
  const error=replayMismatchError() as Error&{code?:string};
  assert.equal(error.code,'HIPICO_WEBHOOK_REPLAY_MISMATCH');
  assert.match(error.message,/providerMessageId/i);
});
