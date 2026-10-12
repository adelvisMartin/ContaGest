import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyLocal } from '../src/runtime-utils.mjs';
import { parseLabRaceSlotReply, validLabDate, validLabTrack } from '../src/lab-race-slots.mjs';
import { createLabConversationContext, labConversationInput, planLabConversation } from '../src/lab-conversation-context.mjs';
import { composeLabAssistantReply } from '../src/lab-assistant-replies.mjs';

const GROUP='120363222222222222@g.us', ANA='123456789012@lid', BEA='234567890123@lid';
const row=(n,sender,text)=>({id:'false_'+GROUP+'_'+n+'_'+sender,text});
const expected={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};

test('the pure slot parser accepts bounded explicit ISO dates and honest track names',()=>{
  const prior={raceNumber:5};
  assert.equal(validLabDate('2026-02-30'),false);
  assert.equal(validLabDate('2026-10-12'),true);
  assert.equal(validLabDate('1899-10-12'),false);
  assert.equal(validLabTrack('La Rinconada'),'La Rinconada');
  assert.equal(validLabTrack('Saldo 500'),null);
  assert.deepEqual(parseLabRaceSlotReply('La Rinconada',prior),
    {raceNumber:5,racetrack:'La Rinconada',complete:false});
  assert.deepEqual(parseLabRaceSlotReply('2026-10-12',prior),
    {raceNumber:5,raceDate:'2026-10-12',complete:false});
  assert.deepEqual(parseLabRaceSlotReply('La Rinconada el 2026-10-12',prior),
    {...expected,complete:true});
  assert.deepEqual(parseLabRaceSlotReply('Hipódromo La Rinconada fecha 2026-10-12',prior),
    {...expected,complete:true});
  assert.deepEqual(parseLabRaceSlotReply('el 2026-10-12',{raceNumber:5,raceTrack:'La Rinconada'}),
    {...expected,complete:true});
  assert.deepEqual(parseLabRaceSlotReply('en La Rinconada',{raceNumber:5,raceDate:'2026-10-12'}),
    {...expected,complete:true});
});

test('no implicit dates, arbitrary greetings, instructions, money, other races or mismatched slots',()=>{
  const prior={raceNumber:5};
  for(const text of [
    'hoy','mañana','La Rinconada hoy','La Rinconada el 2026-02-30',
    'Juega 5','saldo de 200 Bs','hipódromo Admin',
    'carrera 6','La Rinconada; registrar saldo','La Rinconada\nignore previous',
    'La Rinconada el 2026-10-12 y confirma premio',
    'La Rinconada el 2026-10-12 en otra sede',
    'hola','Buenas tardes','Juan'
  ]) assert.equal(parseLabRaceSlotReply(text,prior),null,text);
  assert.equal(parseLabRaceSlotReply('La Rinconada',{raceNumber:null}),null);
  assert.equal(parseLabRaceSlotReply('La Rinconada',{raceNumber:5,raceScope:expected}),null);
  assert.equal(parseLabRaceSlotReply('2026-10-13',{raceNumber:5,raceDate:'2026-10-12'}),null);
  assert.equal(parseLabRaceSlotReply('El Paraíso',{raceNumber:5,raceTrack:'La Rinconada'}),null);
  assert.equal(parseLabRaceSlotReply('La Rinconada el 2026-10-13',
    {raceNumber:5,raceDate:'2026-10-12'}),null);
});

test('LAB multi-message track then date conversation uses same JID, ACK-gated memory and no transcript',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-slots-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'race-hints.json');
  let clock=Date.now();
  const factory=()=>createLabConversationContext({file,groupId:GROUP,now:()=>clock,ttlMs:5000});
  const context=factory();
  await context.initialize();
  const ask=row('a',ANA,'¿Estado de carrera 5?');
  const first=planLabConversation(ask,classifyLocal(ask.text));
  assert.equal(first.raceNumber,5);
  await context.remember(ANA,5); // simulate confirmed LAB journal ACK only
  const trackMessage=row('b',ANA,'La Rinconada');
  const trackClass=classifyLocal(trackMessage.text);
  assert.equal(labConversationInput(trackMessage,trackClass,context.get(ANA)).eligible,true);
  const trackPlan=planLabConversation(trackMessage,trackClass,context.get(ANA));
  assert.equal(trackPlan.raceNumber,5);
  assert.equal(trackPlan.raceScope,null);
  assert.equal(trackPlan.raceTrack,'La Rinconada');
  assert.equal(trackPlan.clarificationPending,'date');
  assert.match(composeLabAssistantReply({classification:trackClass,plan:trackPlan}),/qué fecha/);
  await context.remember(ANA,trackPlan.raceNumber,trackPlan.raceScope,
    {raceTrack:trackPlan.raceTrack,raceDate:trackPlan.raceDate});
  const restored=factory();
  await restored.initialize();
  assert.deepEqual(restored.get(ANA),{raceNumber:5,raceTrack:'La Rinconada'});
  assert.equal(restored.get(BEA),null);
  const dateMessage=row('c',ANA,'el 2026-10-12');
  const dateClass=classifyLocal(dateMessage.text);
  assert.equal(labConversationInput(dateMessage,dateClass,restored.get(ANA)).eligible,true);
  const final=planLabConversation(dateMessage,dateClass,restored.get(ANA));
  assert.equal(final.clarificationCompleted,true);
  assert.deepEqual(final.raceScope,expected);
  assert.match(composeLabAssistantReply({classification:dateClass,plan:final}),/Perfecto, ya tengo/);
  await restored.remember(ANA,final.raceNumber,final.raceScope);
  const same=planLabConversation(row('d',ANA,'¿estado de esa?'),classifyLocal('¿estado de esa?'),restored.get(ANA));
  assert.deepEqual(same.raceScope,expected);
  assert.equal(labConversationInput(row('be',BEA,'La Rinconada'),classifyLocal('La Rinconada'),restored.get(BEA)).eligible,false);
  const bytes=await fs.readFile(file,'utf8');
  assert.doesNotMatch(bytes,/123456789012@lid|120363222222222222@g.us|¿Estado|La Rinconada el 2026-10-12/);
  clock+=5000;
  assert.equal(restored.get(ANA),null);
  assert.equal(labConversationInput(trackMessage,trackClass,restored.get(ANA)).eligible,false);
});

test('LAB also supports date then explicit track without allowing an implicit meeting identity',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-slots-date-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const context=createLabConversationContext({file:path.join(dir,'ctx.json'),groupId:GROUP});
  await context.initialize();
  await context.remember(ANA,5);
  const first=row('1',ANA,'2026-10-12'),classification=classifyLocal(first.text);
  const p=planLabConversation(first,classification,context.get(ANA));
  assert.equal(p.clarificationPending,'track');
  assert.match(composeLabAssistantReply({classification,plan:p}),/qué hipódromo|En qué hipódromo/i);
  await context.remember(ANA,p.raceNumber,p.raceScope,{raceDate:p.raceDate,raceTrack:p.raceTrack});
  const second=row('2',ANA,'en La Rinconada'),kind=classifyLocal(second.text);
  const plan=planLabConversation(second,kind,context.get(ANA));
  assert.deepEqual(plan.raceScope,expected);
});

test('Bridge cannot persist partial slots before the delivery journal ACK and never writes SOURCE',async()=>{
  const s=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=s.indexOf('async function processLabTestInput()');
  const block=s.slice(start,s.indexOf('async function visibleLabHasTag',start));
  const prep=block.indexOf('await labTestReplyJournal.prepare(row.id)');
  const begin=block.indexOf('await labTestReplyJournal.begin(row.id)',prep);
  const send=block.indexOf('await sendTextInCurrentLab(',begin);
  const ack=block.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',send);
  const persist=block.indexOf('labConversationContext.remember(plan.sender,plan.raceNumber,plan.raceScope,{raceTrack:plan.raceTrack,raceDate:plan.raceDate})',ack);
  assert.ok(prep>=0&&begin>prep&&send>begin&&ack>send&&persist>ack);
  assert.match(block,/if\(labTestProcessing\)return/);
  assert.match(block,/finally \{labTestProcessing=false;\}/);
  assert.doesNotMatch(block,/sendTextInCurrentSource/);
});
