import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyLocal } from '../src/runtime-utils.mjs';
import { labConversationInput, planLabConversation, createLabConversationContext, stableLabSenderKey } from '../src/lab-conversation-context.mjs';

const PARTICIPANTS={Ana:'123456789012@lid',Bea:'234567890123@lid',Carla:'345678901234@lid',A:'456789012345@lid',B:'567890123456@lid'};
const row=(id,sender,text,extra={})=>({id:`false_120363222222222222@g.us_${id}_${PARTICIPANTS[sender]||'678901234567@lid'}`,pre:`[09:15, 12/10/2026] ${sender}:`,text,...extra});

test('ignores own messages, media, bot echoes and ordinary conversation', () => {
  for (const incoming of [row('a','A','hola',{fromMe:true}), row('a','A','hola',{hasMedia:true}), row('a','A','[LABTEST:123] hola'), row('a','A','Que bien todo')]) {
    assert.equal(labConversationInput(incoming, classifyLocal(incoming.text)).eligible, false);
  }
  assert.equal(labConversationInput(row('b','B','¿Qué carrera sigue?'), classifyLocal('¿Qué carrera sigue?')).eligible, true);
  assert.equal(labConversationInput(row('b','B','Juega 20 al caballo 3'), classifyLocal('Juega 20 al caballo 3')).eligible, true);
});

test('same sender followups use only an explicit race reference and never infer for monetary intents', () => {
  const first = row('1','Ana','¿Quiénes corren en la carrera 5?');
  const plan = planLabConversation(first, classifyLocal(first.text));
  assert.equal(plan.raceNumber, 5);
  assert.equal(plan.rememberRace, true);
  const next = row('2','Ana','¿y los participantes de esa?');
  assert.equal(planLabConversation(next, classifyLocal(next.text), { raceNumber: 5 }).raceNumber, 5);
  assert.match(planLabConversation(next, classifyLocal(next.text)).guidance, /¿A cuál carrera/);
  const money = row('3','Ana','Juega 20 al caballo 3');
  const denied = planLabConversation(money, classifyLocal(money.text), { raceNumber: 5 });
  assert.equal(denied.raceNumber, null);
  assert.equal(denied.rememberRace, false);
  assert.match(denied.guidance, /requiere revisión/);
});

test('LAB memory is durable, isolated, expiring and contains no raw identity or messages', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-lab-ctx-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let clock = 1800000000000;
  const file = path.join(dir, 'memory.json');
  const make = (groupId) => createLabConversationContext({ file, groupId, now: () => clock, ttlMs: 2000, maxEntries: 2 });
  const memory = make('120363222222222222@g.us');
  await memory.initialize();
  assert.equal(await memory.remember(PARTICIPANTS.Ana, 5), true);
  assert.equal(memory.get(PARTICIPANTS.Ana)?.raceNumber, 5);
  assert.equal(memory.get(PARTICIPANTS.Bea), null);
  const raw = await fs.readFile(file, 'utf8');
  assert.equal(raw.includes('Ana'), false);
  assert.equal(raw.includes(PARTICIPANTS.Ana),false);
  assert.equal(raw.includes('120363222222222222@g.us'), false);
  const restored = make('120363222222222222@g.us');
  await restored.initialize();
  assert.equal(restored.get(PARTICIPANTS.Ana)?.raceNumber, 5);
  await assert.rejects(make('120363333333333333@g.us').initialize(), /LAB_CONTEXT_STORAGE_INVALID/);
  clock += 2000;
  assert.equal(restored.get(PARTICIPANTS.Ana), null);
  assert.equal(await restored.remember(PARTICIPANTS.Bea, 0), false);
});

test('LAB memory bounds participants and drops oldest references', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-lab-cap-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let clock = 10000;
  const memory = createLabConversationContext({ file: path.join(dir, 'memory.json'), groupId: '120363222222222222@g.us', now: () => clock++, maxEntries: 2 });
  await memory.initialize();
  await memory.remember(PARTICIPANTS.Ana, 4);
  await memory.remember(PARTICIPANTS.Bea, 5);
  await memory.remember(PARTICIPANTS.Carla, 6);
  assert.equal(memory.get(PARTICIPANTS.Ana), null);
  assert.equal(memory.get(PARTICIPANTS.Bea)?.raceNumber, 5);
  assert.equal(memory.get(PARTICIPANTS.Carla)?.raceNumber, 6);
});

test('Bridge uses planner only in interactive LAB and acknowledges deliveries before remembering context', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const code = await fs.readFile(path.join(root, 'src', 'index.mjs'), 'utf8');
  const start = code.indexOf('async function processLabTestInput()');
  const end = code.indexOf('async function visibleLabHasTag', start);
  assert.ok(start > 0 && end > start);
  const block = code.slice(start, end);
  assert.match(block, /labConversationInput\(row, classification, prior\)/);
  assert.match(block, /planLabConversation\(row, classification/);
  assert.match(block, /sendTextInCurrentLab\(localLabTestReply\(row, classification, plan, canonical\), tag\)/);
  assert.match(block, /labConversationInput\(row, classification, prior\)/);
  const delivered=block.indexOf('await sendTextInCurrentLab(');
  const ack = block.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',delivered);
  const persist = block.indexOf('labConversationContext.remember(');
  assert.ok(delivered>=0 && ack > delivered && persist > ack, 'context memory must follow confirmed delivery');
  assert.match(code, /SOURCE_AUTO_REPLY_ACTIVE = SOURCE_AUTO_REPLY_ENABLED && !SOURCE_REPLY_KILL_SWITCH.active/);
  assert.ok(block.indexOf('await labTestReplyJournal.prepare(row.id)')<block.indexOf('await sendTextInCurrentLab('));
  assert.ok(block.indexOf('await labTestReplyJournal.begin(row.id)')<block.indexOf('await sendTextInCurrentLab('));
  assert.match(block,/body\.includes\('\[LABTEST:'/);
  assert.match(block,/body\.includes\('\[SHADOW:'/);
});

test('LAB context rejects invalid group pins, excessive TTL/entries and unsafe symlink files', async (t) => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-lab-hardening-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'memory.json');
  for(const options of [
    {groupId:'not-a-group'}, {groupId:'120363222222222222@g.us',ttlMs:21*60*1000},
    {groupId:'120363222222222222@g.us',maxEntries:301}
  ]){
    assert.throws(()=>createLabConversationContext({file,...options}),/LAB_CONTEXT_/);
  }
  if(process.platform!=='win32'){
    const target=path.join(dir,'outside.txt');
    await fs.writeFile(target,'{}');
    await fs.symlink(target,file);
    await assert.rejects(
      createLabConversationContext({file,groupId:'120363222222222222@g.us'}).initialize(),
      /LAB_CONTEXT_STORAGE_INVALID/
    );
  }
});

test('planner cannot reuse nickname-only or ambiguous participant identities',()=>{
  const alice=row('m-1','Ana','¿Quién corre en carrera 5?');
  const alias=row('m-2','Bea','¿y los participantes de esa?');
  assert.equal(stableLabSenderKey(alice.id),PARTICIPANTS.Ana);
  assert.equal(stableLabSenderKey(alias.id),PARTICIPANTS.Bea);
  const unverified={...alias,id:'false_120363222222222222@g.us_opaque'};
  assert.equal(stableLabSenderKey(unverified.id),'');
  const plan=planLabConversation(unverified,classifyLocal(unverified.text),{raceNumber:5});
  assert.equal(plan.raceNumber,null);
  assert.equal(plan.rememberRace,false);
  const double={...alias,id:'id_123456789012@lid_234567890123@lid'};
  assert.equal(stableLabSenderKey(double.id),'');
});
