import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
const from=source.indexOf('async function resumePendingLabQueries(');
const to=source.indexOf('let labTestProcessing=false;',from);
assert.ok(from>0&&to>from);
const recoveredSource=source.slice(from,to).trim();

function simulatedRecovery({denyAt=0,confirmed=false,offline=false,canonicalAvailable=true}={}){
  const events=[];
  const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
  const messageId='false_120363222222222222@g.us_m1_123456789012@lid';
  const senderId='123456789012@lid';
  const record={messageId,senderId,text:'¿Estado de carrera 5 en La Rinconada el 2026-10-12?',
    purpose:'status',race,messageTimestamp:'2026-10-12T01:00:00.000Z',quotedMessageId:null};
  let eligibilityCalls=0;
  const context={
    labPendingRecoveryOffset:0,BACKEND_SYNC_ENABLED:true,
    backendState:offline?'offline':'online',
    labPendingInbox:{
      list:async(limit)=>{assert.equal(limit,25);return [record];},
      read:async()=>{events.push('freshness-read');return record;},
      remove:async()=>{events.push('remove');}
    },
    labTestTagFor:()=> '[LABTEST:deadbeef12]',
    labTestReplyJournal:{
      read:async()=>{events.push('journal-read');return confirmed?{state:'confirmed'}:null;},
      prepare:async()=>{events.push('prepare');},begin:async()=>{events.push('begin');},
      retryPrepared:async()=>{events.push('retry-prepared');},
      confirm:async()=>{events.push('confirm');}
    },
    rememberLabSeen:()=>events.push('seen'),
    saveLabSeenNow:async()=>events.push('save-seen'),
    rememberConfirmedPendingLabQuote:async()=>{events.push('hint');return true;},
    stableLabSenderKey:()=>senderId,
    labConversationContext:{get:()=>null},
    classifyLocal:()=>({risk:'safe',intent:'conversation'}),
    labConversationInput:()=>({eligible:true}),
    labReadOnlyQueryPurpose:()=>record.purpose,
    labQueryBackoff:{allowed:()=>true,clear:()=>events.push('clear'),fail:()=>1000},
    planLabConversation:()=>({scopeConflict:false,rememberRace:false}),
    checkLabSendEligibility:async args=>{
      assert.deepEqual(args.race,race,'the immutable encrypted race is the handoff scope');
      eligibilityCalls++;events.push('handoff-'+eligibilityCalls);
      return eligibilityCalls===denyAt
        ?{allowed:false,reason:'LAB_HANDOFF_HELD'}
        :{allowed:true,reason:'LAB_HANDOFF_CLEAR'};
    },
    queryCanonicalLab:async()=>{events.push('query');return canonicalAvailable
      ?{available:true,reason:'CANONICAL_STATE_FOUND',text:'Estado verificado'}
      :{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};},
    localLabTestReply:()=> 'SAFE_LAB_ANSWER',
    sendTextInCurrentLab:async()=>events.push('send'),
    log:async()=>events.push('logged'),
    LAB_GROUP_ID:'120363222222222222@g.us',LAB_CHANNEL_KEY:'lab-key',
    INGEST_URL:'http://127.0.0.1:3001/api/v1/hipico-bot/bridge/events',
    TOKEN:'test-credential',BACKEND_TIMEOUT_MS:4000,
    labSeenOutcome:()=> 'AMBIGUOUS'
  };
  return{
    events,
    run:async()=>{
      const fn=vm.runInNewContext('('+recoveredSource+')',context);
      await fn(new Set());
      return events;
    }
  };
}

test('operator takeover BEFORE replay HTTP blocks query, WAL and keyboard',async()=>{
  const f=simulatedRecovery({denyAt:1});
  await f.run();
  assert.deepEqual(f.events,[
    'journal-read','handoff-1','seen','save-seen','remove','logged'
  ]);
});

test('operator takeover AFTER replay HTTP blocks journal and keyboard',async()=>{
  const f=simulatedRecovery({denyAt:2});
  await f.run();
  assert.deepEqual(f.events,[
    'journal-read','handoff-1','query','clear','freshness-read',
    'handoff-2','seen','save-seen','remove','logged'
  ]);
});

test('operator takeover after journal begin rolls back prepared WAL without Enter',async()=>{
  const f=simulatedRecovery({denyAt:3});
  await f.run();
  assert.deepEqual(f.events,[
    'journal-read','handoff-1','query','clear','freshness-read',
    'handoff-2','prepare','begin','handoff-3','retry-prepared',
    'seen','save-seen','remove','logged'
  ]);
});

test('full handoff permit and valid canonical response send once and confirm once',async()=>{
  const f=simulatedRecovery();
  await f.run();
  assert.deepEqual(f.events,[
    'journal-read','handoff-1','query','clear','freshness-read',
    'handoff-2','prepare','begin','handoff-3','send','confirm',
    'seen','save-seen','hint','remove','logged'
  ]);
});

test('backend offline never creates a new send, confirmed ACK finishes offline',async()=>{
  const blocked=simulatedRecovery({offline:true});
  await blocked.run();
  assert.deepEqual(blocked.events,['journal-read']);
  const confirmed=simulatedRecovery({offline:true,confirmed:true});
  await confirmed.run();
  assert.deepEqual(confirmed.events,['journal-read','seen','save-seen','hint','remove']);
});

test('no verified canonical response cannot reach send even when handoff is clear',async()=>{
  const f=simulatedRecovery({canonicalAvailable:false});
  await f.run();
  assert.deepEqual(f.events,['journal-read','handoff-1','query','logged']);
});

test('live LAB uses immutable encrypted race for all post-read handoff and canonical checks',()=>{
  const live=source.slice(source.indexOf('async function processLabTestInput()'),
    source.indexOf('async function visibleLabHasTag(tag)'));
  const first=live.indexOf('const eligibleBefore=');
  const persist=live.indexOf('await labPendingInbox.enqueue(');
  const bind=live.indexOf('eligibilityArgs.race=trustedRace');
  const query=live.indexOf('await queryCanonicalLab({');
  const after=live.indexOf('const eligibleAfter=await checkLabSendEligibility(');
  const ttl=live.indexOf('LAB_PENDING_EXPIRED_BEFORE_SEND');
  const begin=live.indexOf('await labTestReplyJournal.begin(row.id)');
  const third=live.indexOf('const eligibleToSend=await checkLabSendEligibility(');
  const send=live.indexOf('await sendTextInCurrentLab(',third);
  const ack=live.indexOf('await labTestReplyJournal.confirm(row.id',send);
  assert.ok(first>=0&&persist>first&&bind>persist&&query>bind&&ttl>query&&
    after>ttl&&begin>after&&third>begin&&send>third&&ack>send);
});

test('inbox validator and source route recognize bounded read-only race summaries',()=>{
  const inbox=readFileSync(new URL('../src/lab-pending-query-inbox.mjs',import.meta.url),'utf8');
  assert.match(inbox,/const PURPOSES=new Set\(\[[^\]]*'summary'/);
  assert.match(source,/const inquiryPurpose=labReadOnlyQueryPurpose\(body,classification\)/);
  assert.doesNotMatch(recoveredSource,/sendTextInCurrentSource/);
});
