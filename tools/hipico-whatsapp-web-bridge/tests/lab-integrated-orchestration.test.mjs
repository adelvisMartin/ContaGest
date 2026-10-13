import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import { labOutgoingEvidenceMatches } from '../src/lab-outgoing-evidence.mjs';
import { labReadOnlyQueryPurpose } from '../src/lab-canonical-query.mjs';
import { composeLabAssistantReply } from '../src/lab-assistant-replies.mjs';
import { classifyLocal } from '../src/runtime-utils.mjs';
import { labConversationInput, planLabConversation } from '../src/lab-conversation-context.mjs';

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
  const preEnter=lab.indexOf('const eligibleToSend=await checkLabSendEligibility(eligibilityArgs)',begin);
  const rollback=lab.indexOf('await labTestReplyJournal.retryPrepared(row.id)',preEnter);
  const send=lab.indexOf('await sendTextInCurrentLab(',preEnter);
  const ack=lab.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',send);
  const memo=lab.indexOf('labConversationContext.remember(plan.sender,plan.raceNumber,plan.raceScope',ack);
  assert.ok(sender>=0&&prior>sender&&eligible>prior&&quoted>eligible&&
    plan>quoted&&handoff1>plan&&canonical>handoff1&&handoff2>canonical&&
    prepare>handoff2&&begin>prepare&&preEnter>begin&&rollback>preEnter&&
    send>rollback&&ack>send&&memo>ack);
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

test('human-friendly LAB answer retains strict first-line outgoing proof without quoted-tag ACKs',()=>{
  const marker='function localLabTestReply(',start=bridge.indexOf(marker);
  const end=bridge.indexOf('async function clearComposerSafely(',start);
  assert.ok(start>0&&end>start);
  const tag='[LABTEST:012345abcd]';
  const fn=vm.runInNewContext('('+bridge.slice(start,end).trim()+')',{
    labTestTagFor:()=>tag,
    LAB_ASSISTANT_NAME:'Asistente Hípico',
    selectLabAnswer:()=>({
      text:'Datos validados.',reason:'LAB_CANONICAL_RECOVERED',
      source:'LECTURA_CANÓNICA_LIMITADA'
    }),
    composeLabAssistantReply:()=> '¡Claro! La carrera 5 está abierta según el registro interno.',
    localSuggestion:()=> 'Orientación local.'
  });
  const output=fn({id:'incoming'}, {risk:'safe',intent:'conversation'},
    {raceNumber:5},{available:true,reason:'LAB_CANONICAL_RECOVERED'});
  assert.match(output,/^\[LABTEST:012345abcd\]\n🧪 CONTROL HÍPICO · PRUEBA LAB\n/);
  assert.match(output,/Respuesta: ¡Claro! La carrera 5 está abierta/);
  assert.match(output,/Fuente: LECTURA_CANÓNICA_LIMITADA/);
  assert.equal(labOutgoingEvidenceMatches(output,tag),true);
  assert.equal(labOutgoingEvidenceMatches('Citado:\n'+output,tag),false);
  assert.equal(labOutgoingEvidenceMatches(
    'Respuesta humana.\n'+tag,tag),false);
  assert.equal(labOutgoingEvidenceMatches(output.replace('Fuente:','F:'),tag),false);
});

test('current integrated Bridge verifies pinned LAB outgoing DOM twice and never uses tag substring',()=>{
  const start=bridge.indexOf('async function visibleLabHasTag(tag)');
  const end=bridge.indexOf('async function sendMirrorToLab(',start);
  assert.ok(start>=0&&end>start);
  const code=bridge.slice(start,end);
  assert.equal((code.match(/await assertCurrentLabIdentity\(\)/g)||[]).length,2);
  assert.match(code,/const main=document\.querySelector\('#main'\)/);
  assert.match(code,/main\.querySelectorAll\('\.message-out'\)/);
  assert.match(code,/labOutgoingEvidenceMatches\(text,tag\)/);
  assert.doesNotMatch(code,/\.includes\(needle\)/);
  const mirror=bridge.slice(bridge.indexOf('function localMirrorText('),
    bridge.indexOf('function shouldMirror('));
  assert.doesNotMatch(mirror,/canonical\?\.|plan\?\./);
});

test('completed multi-turn race reference is passed to the canonical query, not only handoff',()=>{
  const lookup=lab.indexOf('await queryCanonicalLab({');
  const end=lab.indexOf('})',lookup);
  assert.ok(lookup>=0&&end>lookup);
  const request=lab.slice(lookup,end);
  assert.match(request,/race:verifiedRace/);
  assert.doesNotMatch(request,/race:scopedRace/);
  assert.match(lab,/const verifiedRace=plan\.scopeConflict\?null:\(scopedRace\|\|plan\.raceScope\)/);
  assert.match(lab,/inquiryPurpose && sender && !plan\.scopeConflict/);

  const row=(number,text)=>({
    id:'false_120363222222222222@g.us_'+number+'_123456789012@lid',text
  });
  const starter=row(1,'¿Cuál es el estado de la carrera 5?');
  const first=planLabConversation(starter,classifyLocal(starter.text));
  assert.equal(first.raceNumber,5);
  assert.equal(first.raceScope,null);
  const track=row(2,'La Rinconada');
  const trackKind=classifyLocal(track.text);
  assert.equal(labConversationInput(track,trackKind,{raceNumber:5}).eligible,true);
  const partial=planLabConversation(track,trackKind,{raceNumber:5});
  assert.equal(partial.raceTrack,'La Rinconada');
  const day=row(3,'2026-10-12');
  const dayKind=classifyLocal(day.text);
  const completed=planLabConversation(day,dayKind,{
    raceNumber:5,raceTrack:partial.raceTrack
  });
  assert.deepEqual(completed.raceScope,{
    raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'
  });
  const follow=row(4,'¿Y el estado de esa carrera?');
  const classify=classifyLocal(follow.text);
  assert.equal(labReadOnlyQueryPurpose(follow.text,classify),'status');
  const resolved=planLabConversation(follow,classify,{
    raceNumber:5,raceScope:completed.raceScope
  });
  assert.deepEqual(resolved.raceScope,completed.raceScope);
  const conflicting=row(5,'¿Estado de carrera 6 o carrera 5?');
  const unsafe=planLabConversation(conflicting,classifyLocal(conflicting.text),{
    raceNumber:5,raceScope:completed.raceScope
  });
  assert.equal(unsafe.scopeConflict,true);
  assert.equal(unsafe.raceScope,null);
});


test('confirmed LAB ACK recovers context only for a verified informational purpose without re-sending',async()=>{
  const start=lab.indexOf("if (journalRecord?.state === 'confirmed') {");
  const end=lab.indexOf("if (journalRecord?.state === 'ambiguous'",start);
  assert.ok(start>=0&&end>start,'confirmed ACK recovery branch missing');
  const confirmed=lab.slice(start,end);
  assert.match(confirmed,/const verifiedPurpose=labReadOnlyQueryPurpose\(body,classifyLocal\(body\)\)/);
  let seen=0,quoteHints=0,contextCalls=0,recoveredAt=null;
  const scope={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
  const restore=vm.runInNewContext(
    '(async function(row,body,journalRecord){for(const once of [row]){\n'+confirmed+'\n}})',
    {
      stableLabSenderKey:()=> 'sender-stable',
      labReadOnlyQueryPurpose, classifyLocal,
      confirmedLabQuoteHint:()=> scope,
      labQuotedRaceJournal:{remember:async()=>{quoteHints++;}},
      labConversationContext:{recoverConfirmed:async(sender,race,at)=>{
        assert.equal(sender,'sender-stable');
        assert.equal(race.raceNumber,5);
        recoveredAt=at;
        contextCalls++;
      }},
      planLabConversation:()=>({raceScope:scope,scopeConflict:false}),
      rememberLabSeen:()=>{seen++;},
      saveLabSeenNow:async()=>{},
      log:async()=>{}
    }
  );
  const row={id:'false_120363222222222222@g.us_1_123456789012@lid'};
  const journal={state:'confirmed',updatedAt:'2026-10-12T23:00:00.000Z'};
  await restore(row,'¿Cuál es el estado de la carrera 5?',journal);
  assert.equal(contextCalls,1);
  assert.equal(quoteHints,1);
  assert.equal(recoveredAt,journal.updatedAt,'original ACK timestamp must not extend TTL');
  await restore(row,'Registrar apuesta para carrera 5',journal);
  assert.equal(contextCalls,1,'monetary message cannot restore domain context');
  assert.equal(seen,2,'confirmed message is never re-sent, including unsafe intent');
});
