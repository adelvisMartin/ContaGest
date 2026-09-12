import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractMessages } from './hipico-bot.service.js';
import { replayMismatchError, sameWebhookReplay, webhookReplaySignature } from './hipico-webhook-replay.js';

const serviceSource=readFileSync(new URL('./hipico-bot.service.ts',import.meta.url),'utf8');
const base={
  providerMessageId:'wamid-1',
  phoneNumberId:'1234567890',
  sender:'584121234567',
  messageType:'text',
  body:'JUEGA 1N 3 CON 30K',
  payload:{id:'wamid-1',from:'584121234567',timestamp:'1789106400',type:'text',text:{body:'JUEGA 1N 3 CON 30K'}}
};

function envelope(message:Record<string,unknown>){
  return{
    entry:[{changes:[{value:{metadata:{phone_number_id:'1234567890'},messages:[{
      id:'wamid-1',
      from:'584121234567',
      type:'text',
      text:{body:'JUEGA 1N 3 CON 30K'},
      ...message
    }]}}]}]
  };
}

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

test('Meta extraction rejects oversized immutable source facts instead of silently truncating them',()=>{
  assert.equal(extractMessages(envelope({})).length,1);
  assert.equal(extractMessages(envelope({type:'x'.repeat(81)})).length,0);
  assert.equal(extractMessages(envelope({text:{body:'x'.repeat(4001)}})).length,0);
  assert.equal(extractMessages(envelope({id:'x'.repeat(321)})).length,0);
  assert.equal(extractMessages(envelope({from:'0412-1234567'})).length,0);
});

test('processIncoming cannot bypass immutable replay validation with a hasEvent shortcut',()=>{
  const processStart=serviceSource.indexOf('export async function processIncoming');
  assert.ok(processStart>=0);
  const processBody=serviceSource.slice(processStart);
  assert.doesNotMatch(processBody,/hasEvent\(message\.providerMessageId\)/);
  assert.match(processBody,/HipicoBotStore\.saveEvent/);
});

test('both durable and memory saveEvent duplicate paths compare immutable webhook evidence',()=>{
  assert.match(serviceSource,/if\(!sameWebhookReplay\(rows\[0\],record\)\)throw replayMismatchError\(\)/);
  assert.match(serviceSource,/if\(!sameWebhookReplay\(existing,record\)\)throw replayMismatchError\(\)/);
  assert.match(serviceSource,/HIPICO_WEBHOOK_DEDUPE_ROW_INVALID/);
  assert.doesNotMatch(serviceSource,/messageType[^\n]*\.slice\(0,MAX_MESSAGE_TYPE\)/);
  assert.doesNotMatch(serviceSource,/const body=[^\n]*\.slice\(0,MAX_INBOUND_TEXT\)/);
});
