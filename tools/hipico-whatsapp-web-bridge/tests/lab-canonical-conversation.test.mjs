import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labCanonicalEvent, selectCanonicalLabReply } from '../src/lab-canonical-conversation.mjs';

const SOURCE='120363111111111111@g.us';
const LAB='120363222222222222@g.us';
const config={labGroupId:LAB,sourceGroupId:SOURCE,labChannelKey:'control-hipico-lab',labGroupName:'Control hípico lab',bridgeVersion:'test-v1'};
const row=(extra={})=>({id:'lab-event-0001',pre:'[9:15, 12/10/2026] Participante:',text:'¿Qué carrera sigue?',fromMe:false,hasMedia:false,quotedId:'quoted-01',...extra});
const response=(overrides={})=>({
  ok:true,duplicate:false,
  data:{risk:'safe',intent:'conversation'},
  conversationDecision:{decision:'ACK_RECEIVED',decisionReason:'SAFE_INFORMATIONAL_INTENT',effectsAllowed:false,transportAction:'NONE'},
  responsePlan:{intent:'ACK_RECEIVED',reason:'SAFE_INFORMATIONAL_INTENT',text:'Consulta recibida; estado por verificar.',canSend:true,confirmationVerified:false,handoffRequired:false},
  ...overrides
});

test('LAB normalized event reuses canonical Bridge event schema without SOURCE writes',()=>{
  const normalized=labCanonicalEvent(row(),config);
  assert.equal(normalized.eligible,true);
  assert.equal(normalized.event.groupId,LAB);
  assert.equal(normalized.event.channelKey,config.labChannelKey);
  assert.equal(normalized.event.labChannelKey,config.labChannelKey);
  assert.equal(normalized.event.channelRole,'lab');
  assert.equal(normalized.event.shadowMode,true);
  assert.equal(normalized.event.historySync,false);
  assert.equal(normalized.event.quotedExternalMessageId,'quoted-01');
  assert.equal(normalized.event.senderId,'Participante');
  assert.equal(normalized.event.fromMe,false);
  assert.equal(normalized.event.rawMeta,'');
  assert.match(normalized.event.timestamp,/^2026-10-12T/);
});

test('untrusted and unbound LAB events cannot reach backend',()=>{
  for(const example of [
    row({fromMe:true}),row({hasMedia:true}),row({text:''}),row({id:''}),row({pre:''})
  ])assert.equal(labCanonicalEvent(example,config).eligible,false);
  for(const invalid of [{...config,labGroupId:SOURCE},{...config,labGroupId:''},{...config,labGroupId:'wrong'},{...config,labChannelKey:''}]){
    assert.equal(labCanonicalEvent(row(),invalid).eligible,false);
  }
});

test('only canonical response plans authorize a LAB reply; backend replay remains recoverable',()=>{
  const good=selectCanonicalLabReply(response(),{risk:'safe'});
  assert.deepEqual(good,{kind:'SEND_LAB',reason:'SAFE_INFORMATIONAL_INTENT',text:'Consulta recibida; estado por verificar.'});
  assert.equal(selectCanonicalLabReply(response({duplicate:true}),{risk:'safe'}).kind,'SEND_LAB');
  assert.equal(selectCanonicalLabReply(response({responsePlan:{...response().responsePlan,canSend:false}}),{risk:'safe'}).kind,'NO_RESPONSE');
  assert.equal(selectCanonicalLabReply(response({responsePlan:{...response().responsePlan,handoffRequired:true}}),{risk:'safe'}).kind,'NO_RESPONSE');
  assert.equal(selectCanonicalLabReply(response({conversationDecision:{...response().conversationDecision,decision:'NO_RESPONSE'}}),{risk:'safe'}).kind,'NO_RESPONSE');
  assert.equal(selectCanonicalLabReply(null,{risk:'safe'}).kind,'BLOCKED');
});

test('agent/backend cannot escalate privileges or silently approve financial work',()=>{
  assert.equal(selectCanonicalLabReply(response({conversationDecision:{...response().conversationDecision,effectsAllowed:true}}),{risk:'safe'}).kind,'BLOCKED');
  assert.equal(selectCanonicalLabReply(response({conversationDecision:{...response().conversationDecision,transportAction:'SEND'}}),{risk:'safe'}).kind,'BLOCKED');
  assert.equal(selectCanonicalLabReply(response({responsePlan:{...response().responsePlan,confirmationVerified:true}}),{risk:'safe'}).kind,'BLOCKED');
  assert.equal(selectCanonicalLabReply(response({data:{risk:'monetary',intent:'offer_player'}}),{risk:'monetary'}).kind,'BLOCKED');
  const held=response({data:{risk:'monetary',intent:'offer_player'},conversationDecision:{...response().conversationDecision,decision:'HELD_FOR_REVIEW'}});
  assert.equal(selectCanonicalLabReply(held,{risk:'monetary'}).kind,'SEND_LAB');
  assert.equal(selectCanonicalLabReply(response({data:{risk:'monetary'},responsePlan:{...response().responsePlan,intent:'CONFIRMED'}}),{risk:'monetary'}).kind,'BLOCKED');
  assert.equal(selectCanonicalLabReply(response({data:{risk:'safe'}}),{risk:'monetary'}).kind,'BLOCKED');
});

test('live Bridge uses existing canonical ingest and preserves durable LAB acknowledgement order',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const code=await fs.readFile(path.join(root,'src','index.mjs'),'utf8');
  const start=code.indexOf('async function processLabTestInput()');
  const end=code.indexOf('async function visibleLabHasTag',start);
  const block=code.slice(start,end);
  const call=block.indexOf('await backendPost(normalized.event)');
  const prepared=block.indexOf('await labTestReplyJournal.prepare(row.id)');
  const begin=block.indexOf('await labTestReplyJournal.begin(row.id)');
  const send=block.indexOf('await sendTextInCurrentLab(localLabTestReply');
  const confirmed=block.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',send);
  const ack=block.indexOf('rememberLabSeen(row.id); // confirmed delivery/tag');
  const context=block.indexOf('labConversationContext.remember(');
  assert.ok(start>=0&&end>start&&call>=0&&call<prepared&&prepared<begin&&begin<send&&send<confirmed&&confirmed<ack&&ack<context);
  assert.match(block,/selectCanonicalLabReply\(await backendPost\(normalized.event\), classification\)/);
  assert.match(block,/canonical.kind !== 'SEND_LAB'/);
  assert.match(block,/journalRecord\?\.state === 'ambiguous'/);
  assert.match(block,/await visibleLabHasTag\(tag\)/);
  assert.match(code,/SOURCE_AUTO_REPLY_ACTIVE = SOURCE_AUTO_REPLY_ENABLED && !SOURCE_REPLY_KILL_SWITCH.active/);
});
