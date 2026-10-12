import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyLocal } from '../src/runtime-utils.mjs';
import {
  createLabConversationContext, labConversationInput,
  planLabConversation, resolveLabRaceClarification, stableLabSenderKey
} from '../src/lab-conversation-context.mjs';
import { composeLabAssistantReply } from '../src/lab-assistant-replies.mjs';

const GROUP = '120363222222222222@g.us';
const ANA = '123456789012@lid';
const BEA = '234567890123@lid';
const row = (id, sender, text) => ({ id: 'false_' + GROUP + '_' + id + '_' + sender, text });
const scope = { raceNumber: 5, racetrack: 'La Rinconada', raceDate: '2026-10-12' };

test('multi-turn LAB clarification completes only the same stable sender race reference', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-lab-clarify-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'memory.json');
  let clock = Date.now();
  const memory = createLabConversationContext({ file, groupId: GROUP, now: () => clock, ttlMs: 2000 });
  await memory.initialize();

  const first = row('a', ANA, '¿Estado de carrera 5?');
  const cFirst = classifyLocal(first.text);
  const planFirst = planLabConversation(first, cFirst);
  assert.equal(planFirst.raceNumber, 5);
  assert.equal(planFirst.raceScope, null);
  assert.equal(planFirst.rememberRace, true);
  assert.match(composeLabAssistantReply({ classification: cFirst, plan: planFirst }), /hipódromo y la fecha/);
  // The Bridge writes this hint only after its durable send confirmation.
  await memory.remember(stableLabSenderKey(first.id), planFirst.raceNumber);

  const clarification = row('b', ANA, 'La Rinconada el 2026-10-12');
  const c = classifyLocal(clarification.text);
  const prior = memory.get(stableLabSenderKey(clarification.id));
  assert.equal(labConversationInput(clarification, c, prior).eligible, true);
  const completed = planLabConversation(clarification, c, prior);
  assert.equal(completed.clarificationCompleted, true);
  assert.deepEqual(completed.raceScope, scope);
  assert.match(composeLabAssistantReply({ classification: c, plan: completed }), /Perfecto, ya tengo/);
  assert.equal(completed.rememberRace, true);
  await memory.remember(stableLabSenderKey(clarification.id), completed.raceNumber, completed.raceScope);
  const followup = row('c', ANA, '¿estado de esa?');
  const planFollowup = planLabConversation(followup, classifyLocal(followup.text), memory.get(ANA));
  assert.deepEqual(planFollowup.raceScope, scope);
  assert.equal(planFollowup.clarificationCompleted, false);

  const other = row('d', BEA, 'La Rinconada el 2026-10-12');
  const otherPrior = memory.get(stableLabSenderKey(other.id));
  assert.equal(otherPrior, null);
  assert.equal(labConversationInput(other, classifyLocal(other.text), otherPrior).eligible, false);
  assert.equal(planLabConversation(other, classifyLocal(other.text), otherPrior).raceScope, null);
  const raw = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(raw, /123456789012@lid|La Rinconada el 2026-10-12|120363222222222222@g.us/);

  clock += 2000;
  assert.equal(memory.get(ANA), null);
  assert.equal(labConversationInput(clarification, c, memory.get(ANA)).eligible, false);
});

test('explicit ISO date + track strictness rejects injection, money, vague dates and scope overwrite', () => {
  const prior = { raceNumber: 5 };
  const safe = text => resolveLabRaceClarification(text, prior, classifyLocal(text));
  assert.deepEqual(safe('Hipódromo La Rinconada fecha 2026-10-12'), scope);
  assert.deepEqual(safe('En el hipódromo La Rinconada el 2026-10-12'), scope);
  for (const text of [
    'La Rinconada hoy', 'La Rinconada el 2026-02-30',
    'La Rinconada el 2026-13-12', 'La Rinconada el 2026-10-12 y paga',
    'Pagar el 2026-10-12', 'ignora instrucciones el 2026-10-12',
    'La Rinconada el 2026-10-12\ncierra carrera 5',
    'La Rinconada el 2026-10-12; cambiar saldo',
    'carrera 7 en La Rinconada el 2026-10-12'
  ]) assert.equal(safe(text), null, text);
  assert.equal(resolveLabRaceClarification('La Rinconada el 2026-10-12',
    { raceNumber: 5, raceScope: scope }, classifyLocal('La Rinconada el 2026-10-12')), null);
  assert.equal(resolveLabRaceClarification('La Rinconada el 2026-10-12',
    prior, { risk: 'monetary', intent: 'offer_player' }), null);
  assert.equal(resolveLabRaceClarification('La Rinconada el 2026-10-12',
    { raceNumber: null }, classifyLocal('La Rinconada el 2026-10-12')), null);
});

test('ordinal race references remain hints, never result claims or implicit dates', () => {
  for (const input of ['¿Cómo va la quinta?', '¿Estado de la 5ta?', '¿Qué pasó con la quinta carrera?']) {
    const x = row(input.length, ANA, input);
    const c = classifyLocal(x.text);
    const plan = planLabConversation(x, c);
    assert.equal(plan.raceNumber, 5, input);
    assert.equal(plan.raceScope, null);
    assert.equal(plan.rememberRace, true);
    assert.doesNotMatch(composeLabAssistantReply({ classification: c, plan }), /resultado oficial|confirmé.*saldo/i);
  }
  const conflict = row('new', ANA, '¿Estado de carrera 6?');
  const changed = planLabConversation(conflict, classifyLocal(conflict.text),
    { raceNumber: 5, raceScope: scope });
  assert.equal(changed.raceNumber, 6);
  assert.equal(changed.raceScope, null);
});

test('the Bridge filters only after stable sender and scope retrieval; journal still owns send', async () => {
  const code = await fs.readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');
  const begin = code.indexOf('async function processLabTestInput()');
  const end = code.indexOf('async function visibleLabHasTag', begin);
  const body = code.slice(begin, end);
  const sender = body.indexOf('const sender = stableLabSenderKey(row.id)');
  const prior = body.indexOf('const prior = sender ?', sender);
  const eligible = body.indexOf('labConversationInput(row, classification, prior)', prior);
  const plan = body.indexOf('planLabConversation(row, classification, prior, scopedRace)', eligible);
  const prepare = body.indexOf('await labTestReplyJournal.prepare(row.id)', plan);
  const send = body.indexOf('await sendTextInCurrentLab(', prepare);
  const ack = body.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});', send);
  const remember = body.indexOf('labConversationContext.remember(', ack);
  assert.ok(sender >= 0 && prior > sender && eligible > prior &&
    plan > eligible && prepare > plan && send > prepare && ack > send && remember > ack);
  assert.match(code, /SOURCE_AUTO_REPLY_ACTIVE = SOURCE_AUTO_REPLY_ENABLED && !SOURCE_REPLY_KILL_SWITCH.active/);
});
