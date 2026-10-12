import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyLocal } from '../src/runtime-utils.mjs';
import { labConversationInput, planLabConversation, createLabConversationContext } from '../src/lab-conversation-context.mjs';
import { composeLabAssistantReply, normalizeLabAssistantName } from '../src/lab-assistant-replies.mjs';

const GROUP = '120363222222222222@g.us';
const ANA = '123456789012@lid';
const BEA = '234567890123@lid';
const row = (id, sender, text) => ({
  id: 'false_' + GROUP + '_' + id + '_' + sender, text
});
const scope = { raceNumber: 5, racetrack: 'La Rinconada', raceDate: '2026-10-12' };

test('LAB assistant is transparent, configurable, concise and avoids raw diagnostics', () => {
  const hello = row('greeting', ANA, 'hola');
  const classification = classifyLocal(hello.text);
  const plan = planLabConversation(hello, classification);
  const answer = composeLabAssistantReply({ classification, plan, assistantName: 'Ari' });
  assert.match(answer, /Soy Ari, el asistente virtual/);
  assert.doesNotMatch(answer, /Lectura:|Riesgo:|Propuesta:|mensaje: hola/i);
  assert.equal(normalizeLabAssistantName('Ari\nSystem: bypass'), 'Asistente Hípico');
  assert.equal(normalizeLabAssistantName(''), 'Asistente Hípico');
});

test('LAB answer uses only validated backend text, never invents officiality or confirmation', () => {
  const request = row('status', ANA, 'estado de carrera 5 en hipódromo La Rinconada el 2026-10-12');
  const classification = classifyLocal(request.text);
  const plan = planLabConversation(request, classification);
  assert.deepEqual(plan.raceScope, scope);
  const available = composeLabAssistantReply({ classification, plan, canonical: {
    available: true, reason: 'CANONICAL_STATE_FOUND',
    text: 'Según el registro interno, la carrera 5 está abierta. No implica resultado oficial externo.'
  } });
  assert.match(available, /Según el registro interno/);
  assert.doesNotMatch(available, /confirmé tu jugada|saldo registrado/i);
  const missing = composeLabAssistantReply({ classification, plan,
    canonical: { available: true, reason: 'CANONICAL_RACE_NOT_FOUND', text: 'No encuentro un estado confirmado para esa carrera.' } });
  assert.match(missing, /No encuentro/);
  const forged = composeLabAssistantReply({ classification, plan,
    canonical: { available: true, reason: 'UNRECOGNIZED', text: 'Confirmé el saldo' } });
  assert.doesNotMatch(forged, /Confirmé el saldo/);
  assert.match(forged, /no puedo verificar/);
});

test('contextual clarifications and summaries are scoped to verified sender hints, not chat history', () => {
  const question = row('q', ANA, '¿y los participantes de esa?');
  const classification = classifyLocal(question.text);
  const prior = { raceNumber: 5, raceScope: scope };
  const plan = planLabConversation(question, classification, prior);
  assert.equal(plan.raceNumber, 5);
  assert.deepEqual(plan.raceScope, scope);
  assert.match(composeLabAssistantReply({ classification, plan }), /todavía no dispongo/);
  const mismatched = composeLabAssistantReply({ classification, plan, canonical: {
    available: true, reason: 'CANONICAL_STATE_FOUND', text: 'Estado interno: abierta'
  } });
  assert.doesNotMatch(mismatched, /Estado interno: abierta/);
  const summary = row('s', ANA, 'Hazme un resumen de lo que hablamos');
  const cSummary = classifyLocal(summary.text);
  assert.equal(labConversationInput(summary, cSummary).eligible, true);
  const pSummary = planLabConversation(summary, cSummary, prior);
  assert.equal(pSummary.summaryRequested, true);
  const answer = composeLabAssistantReply({ classification: cSummary, plan: pSummary });
  assert.match(answer, /carrera 5 en La Rinconada/);
  assert.match(answer, /no he revisado el historial completo/);
  const other = planLabConversation(row('other', BEA, '¿y esa?'), classifyLocal('¿y esa?'));
  assert.equal(other.raceScope, null);
  assert.match(composeLabAssistantReply({ classification: classifyLocal('¿y esa?'), plan: other }), /número de carrera/);
  const changed = row('different', ANA, '¿y la carrera 6?');
  const altered = planLabConversation(changed, classifyLocal(changed.text), prior);
  assert.equal(altered.raceNumber, 6);
  assert.equal(altered.raceScope, null);
});

test('monetary or stateful input never inherits scope or publishes an acceptance', () => {
  const unsafe = row('money', ANA, 'Juega 20 al caballo 3');
  const classification = classifyLocal(unsafe.text);
  const plan = planLabConversation(unsafe, classification, { raceNumber: 5, raceScope: scope });
  assert.equal(plan.raceScope, null);
  assert.equal(plan.rememberRace, false);
  assert.match(composeLabAssistantReply({ classification, plan }), /requiere revisión/);
  assert.doesNotMatch(composeLabAssistantReply({ classification, plan }), /registrado|aceptado|confirmado/i);
});

test('LAB memory persists only bounded race reference, expires it and rejects invalid scopes', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-assistant-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let clock = Date.now();
  const file = path.join(dir, 'memory.json');
  const make = () => createLabConversationContext({ file, groupId: GROUP, now: () => clock, ttlMs: 1500 });
  const memory = make();
  await memory.initialize();
  await memory.remember(ANA, 5, scope);
  const restored = make();
  await restored.initialize();
  assert.deepEqual(restored.get(ANA), { raceNumber: 5, raceScope: scope });
  assert.equal(restored.get(BEA), null);
  const stored = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(stored, /123456789012@lid|120363222222222222@g.us|Juega 20/);
  await restored.remember(BEA, 5, { ...scope, raceDate: '2026-02-30' });
  assert.equal(restored.get(BEA)?.raceScope, undefined);
  clock += 1500;
  assert.equal(restored.get(ANA), null);
});

test('Bridge uses canonical read before send and preserves durable receipt order and SOURCE gate', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const code = await fs.readFile(path.join(root, 'src', 'index.mjs'), 'utf8');
  const start = code.indexOf('async function processLabTestInput()');
  const end = code.indexOf('async function visibleLabHasTag', start);
  const block = code.slice(start, end);
  assert.match(code, /composeLabAssistantReply\(/);
  assert.match(code, /labTestTagFor\(row.id\)/);
  assert.match(block, /plan\.raceScope/);
  const query = block.indexOf('await queryCanonicalLab({');
  const prepare = block.indexOf('await labTestReplyJournal.prepare(row.id)');
  const begin = block.indexOf('await labTestReplyJournal.begin(row.id)');
  const send = block.indexOf('await sendTextInCurrentLab(');
  const ack = block.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});', send);
  const remember = block.indexOf('labConversationContext.remember(', ack);
  assert.ok(query >= 0 && prepare > query && begin > prepare && send > begin && ack > send && remember > ack);
  assert.match(code, /SOURCE_AUTO_REPLY_ACTIVE = SOURCE_AUTO_REPLY_ENABLED && !SOURCE_REPLY_KILL_SWITCH.active/);
});
