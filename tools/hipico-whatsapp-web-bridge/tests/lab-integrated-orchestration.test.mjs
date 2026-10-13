import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { labReadOnlyQueryPurpose } from '../src/lab-canonical-query.mjs';
import { composeLabAssistantReply } from '../src/lab-assistant-replies.mjs';

const bridge=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
const query=readFileSync(new URL('../../../backend/src/modules/hipico-bot/hipico-bridge.routes.ts',import.meta.url),'utf8');
const assistant=readFileSync(new URL('../src/lab-assistant-replies.mjs',import.meta.url),'utf8');

const part=(source,begin,end)=>source.slice(source.indexOf(begin),source.indexOf(end,source.indexOf(begin)));
const lab=part(bridge,'async function processLabTestInput()','async function visibleLabHasTag');
const api=part(query,"router.post('/bridge/lab/query'","router.post('/bridge/events'");

test('unified LAB retains immutable canonical receipts and human takeover gates',()=>{
  const before=api.indexOf('const gate=await checkLabHandoff(');
  const read=api.indexOf('await readCanonicalLabRace(');
  const reconcile=api.indexOf('await reconcileCanonicalLabReceipt(');
  const after=api.indexOf('const recheck=await checkLabHandoff(');
  assert.ok(before>=0&&read>before&&reconcile>read&&after>reconcile);
  assert.match(api,/LAB_HANDOFF_HELD/);
  assert.match(api,/const verified=receiptProjection\|\|canonical/);
  assert.match(api,/sourceGroupKey:OFFICIAL_SOURCE_CHANNEL_KEY/);
  assert.doesNotMatch(api,/sourceWriteAllowed:true|financialAuthority:true/);
});

test('current LAB send reconciles all authorities before the durable journal',()=>{
  const sender=lab.indexOf('const sender = stableLabSenderKey(row.id)');
  const prior=lab.indexOf('const prior = sender ? labConversationContext?.get(sender)');
  const eligible=lab.indexOf('labConversationInput(row, classification, prior)');
  const quoted=lab.indexOf('labQuotedRaceJournal?.lookup(');
  const plan=lab.indexOf('planLabConversation(row, classification, prior, scopedRace)');
  const handoff1=lab.indexOf('const eligibleBefore=');
  const canonical=lab.indexOf('await queryCanonicalLab(');
  const handoff2=lab.indexOf('const eligibleAfter=await checkLabSendEligibility(');
  const prepare=lab.indexOf('await labTestReplyJournal.prepare(row.id)');
  const begin=lab.indexOf('await labTestReplyJournal.begin(row.id)',prepare);
  const send=lab.indexOf('await sendTextInCurrentLab(',begin);
  const ack=lab.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',send);
  const memo=lab.indexOf('labConversationContext.remember(plan.sender,plan.raceNumber,plan.raceScope',ack);
  assert.ok(sender>=0&&prior>sender&&eligible>prior&&quoted>eligible&&
    plan>quoted&&handoff1>plan&&canonical>handoff1&&handoff2>canonical&&
    prepare>handoff2&&begin>prepare&&send>begin&&ack>send&&memo>ack);
  assert.match(lab,/inquiryPurpose && sender && !plan\.scopeConflict/);
  assert.match(lab,/race:verifiedRace/);
  assert.match(lab,/labQuotedRaceJournal\.remember\(/);
  assert.match(lab,/eligibleBefore\.reason==='LAB_HANDOFF_HELD'/);
  assert.match(lab,/eligibleAfter\.reason==='LAB_HANDOFF_HELD'/);
  assert.match(lab,/finally \{labTestProcessing=false;\}/);
  assert.doesNotMatch(lab,/sendTextInCurrentSource/);
});

test('natural replies never promote unverified read-model text to canonical evidence',()=>{
  const classification={risk:'safe',intent:'conversation'};
  const plan={summaryRequested:true,raceNumber:5,
    raceScope:{raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'}};
  const canonical={available:true,reason:'CANONICAL_RACE_SUMMARY',
    text:'Resumen interno: estado abierta, sin llegada confirmada.'};
  const authentic={source:'LECTURA_CANÓNICA_LIMITADA',
    reason:canonical.reason,text:canonical.text};
  assert.equal(composeLabAssistantReply({classification,plan,canonical,answer:authentic}),
    canonical.text);
  const tampered=composeLabAssistantReply({classification,plan,canonical,
    answer:{...authentic,text:'Ganó 5, pago aprobado'}});
  assert.doesNotMatch(tampered,/Ganó 5, pago aprobado/);
  assert.match(tampered,/historial completo/);
  assert.match(assistant,/CANONICAL_NEXT_RACE/);
  assert.match(assistant,/CANONICAL_RACE_SUMMARY/);
});

test('summary intent requires a race and rejects transcripts, money and unsafe confirmation',()=>{
  const safe={intent:'conversation',risk:'safe'};
  assert.equal(labReadOnlyQueryPurpose(
    'Dame un resumen de la carrera 5 en hipódromo La Rinconada el 2026-10-12',safe),
    'summary');
  for(const text of [
    'Hazme un resumen de lo que hablamos',
    'Resume el chat sobre carrera 5',
    'Resúmeme los saldos de carrera 5',
    'Resumen de carrera 5 y registrar apuesta',
    'Confirmar pago de carrera 5'
  ])assert.equal(labReadOnlyQueryPurpose(text,safe),null,text);
  assert.equal(labReadOnlyQueryPurpose('Resumen de carrera 5',
    {intent:'offer_player',risk:'monetary'}),null);
});
