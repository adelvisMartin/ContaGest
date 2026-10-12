import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyLocal } from '../src/runtime-utils.mjs';
import { labConversationInput, planLabConversation, createLabConversationContext } from '../src/lab-conversation-context.mjs';

const row = (id, sender, text, extra = {}) => ({ id, pre: `[09:15, 12/10/2026] ${sender}:`, text, ...extra });

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
  const memory = make('lab@g.us');
  await memory.initialize();
  assert.equal(await memory.remember('Ana', 5), true);
  assert.equal(memory.get('Ana')?.raceNumber, 5);
  assert.equal(memory.get('Bea'), null);
  const raw = await fs.readFile(file, 'utf8');
  assert.equal(raw.includes('Ana'), false);
  assert.equal(raw.includes('lab@g.us'), false);
  const restored = make('lab@g.us');
  await restored.initialize();
  assert.equal(restored.get('Ana')?.raceNumber, 5);
  await assert.rejects(make('other@g.us').initialize(), /LAB_CONTEXT_STORAGE_INVALID/);
  clock += 2000;
  assert.equal(restored.get('Ana'), null);
  assert.equal(await restored.remember('Bea', 0), false);
});

test('LAB memory bounds participants and drops oldest references', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-lab-cap-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let clock = 10000;
  const memory = createLabConversationContext({ file: path.join(dir, 'memory.json'), groupId: 'lab@g.us', now: () => clock++, maxEntries: 2 });
  await memory.initialize();
  await memory.remember('Ana', 4);
  await memory.remember('Bea', 5);
  await memory.remember('Carla', 6);
  assert.equal(memory.get('Ana'), null);
  assert.equal(memory.get('Bea')?.raceNumber, 5);
  assert.equal(memory.get('Carla')?.raceNumber, 6);
});

test('Bridge uses planner only in interactive LAB and acknowledges deliveries before remembering context', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const code = await fs.readFile(path.join(root, 'src', 'index.mjs'), 'utf8');
  const start = code.indexOf('async function processLabTestInput()');
  const end = code.indexOf('async function visibleLabHasTag', start);
  assert.ok(start > 0 && end > start);
  const block = code.slice(start, end);
  assert.match(block, /labConversationInput\(row, classification\)/);
  assert.match(block, /planLabConversation\(row, classification/);
  assert.match(block, /sendTextInCurrentLab\(localLabTestReply\(row, classification, plan\), tag\)/);
  const ack = block.indexOf('rememberLabSeen(row.id); // confirmed delivery');
  const persist = block.indexOf('labConversationContext.remember(');
  assert.ok(ack >= 0 && persist > ack, 'context memory must follow confirmed delivery');
  assert.match(code, /SOURCE_AUTO_REPLY_ACTIVE = SOURCE_AUTO_REPLY_ENABLED && !SOURCE_REPLY_KILL_SWITCH.active/);
});
