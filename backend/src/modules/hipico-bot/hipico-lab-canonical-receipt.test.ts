import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {reconcileCanonicalLabReceipt,LAB_CANONICAL_RECOVERY_WINDOW_MS} from './hipico-lab-canonical-receipt.js';

const now=Date.parse('2026-10-12T19:00:00.000Z');
const canonical={
  available:true,reason:'CANONICAL_STATE_FOUND',text:'Estado interno verificado: carrera 5 abierta.',
  state:'OPEN',version:3,updatedAt:'2026-10-12T18:58:59.000Z'
};
const defaults={
  ownerId:'11111111-1111-4111-8111-111111111111',
  sourceGroupKey:'club-hipico-triple-crown-official',
  labGroupId:'120363222222222222@g.us',labChannelKey:'control-hipico-lab',
  senderId:'123456789012',externalMessageId:'false_120363222222222222@g.us_message',
  purpose:'status' as const,canonical,
  timestamp:new Date(now-1000).toISOString(),nowMs:now,humanOwned:false
};

function mockStore(){
  let receipt:any=null;
  const writes:any[]=[];
  const store={
    read:async(key:string)=>receipt?.idempotencyKey===key?{...receipt}:null,
    persist:async(plan:any)=>{
      writes.push({...plan});
      const digest=crypto.createHash('sha256').update(plan.text).digest('hex');
      if(!receipt){
        receipt={
          id:'11111111-1111-4111-8111-111111111112',idempotencyKey:plan.responseIdempotencyKey,
          sourceMessageId:plan.sourceMessageId,decisionVersion:plan.decisionVersion,
          correlationId:plan.correlationId,intent:plan.intent,responseHash:digest,
          status:'planned',confirmationVerified:false,
          receiptId:null,transactionId:null,stateId:null
        };
        return{id:receipt.id,idempotencyKey:receipt.idempotencyKey,duplicate:false};
      }
      assert.equal(receipt.responseHash,digest);
      return{id:receipt.id,idempotencyKey:receipt.idempotencyKey,duplicate:true};
    }
  };
  return{store,rows:writes,setReceipt:(v:any)=>{receipt=v},getReceipt:()=>receipt};
}

test('first canonical answer records immutable hash and revision before any HTTP reply',async()=>{
  const m=mockStore();
  const got=await reconcileCanonicalLabReceipt(defaults,m.store);
  assert.equal(got.available,true);
  assert.equal(got.reason,'CANONICAL_STATE_FOUND');
  assert.equal(m.rows.length,1);
  const plan=m.rows[0];
  assert.match(plan.responseIdempotencyKey,/^resp_[a-f0-9]{32}$/);
  assert.match(plan.decisionVersion,/^lab-canonical-v1-[a-f0-9]{48}$/);
  assert.equal(plan.text,canonical.text);
  assert.equal(plan.intent,'ACK_RECEIVED');
  assert.equal(plan.confirmationVerified,false);
  assert.equal(plan.evidence,null);
  assert.equal(got.authority.sourceWriteAllowed,false);
  assert.equal(got.authority.financialAuthority,false);
  assert.doesNotMatch(JSON.stringify(m.getReceipt()),/Estado interno verificado/);
});

test('lost HTTP response after committed receipt is recovered with zero extra writes',async()=>{
  const m=mockStore();
  await reconcileCanonicalLabReceipt(defaults,m.store);
  const duplicate=await reconcileCanonicalLabReceipt(defaults,m.store);
  assert.equal(duplicate.available,true);
  assert.equal(duplicate.reason,'LAB_CANONICAL_RECOVERED');
  assert.equal(duplicate.text,canonical.text);
  assert.equal((duplicate as any).recovery.recovered,true);
  assert.equal(m.rows.length,1);
});

test('same message but changed state revision or changed wording never replays stale result',async()=>{
  const m=mockStore();
  await reconcileCanonicalLabReceipt(defaults,m.store);
  for(const altered of [
    {...canonical,version:4,state:'CLOSED'},
    {...canonical,updatedAt:'2026-10-12T18:59:10.000Z'},
    {...canonical,text:'Otro estado distinto.'},
    {...canonical,reason:'CANONICAL_RESULT_CONFIRMED_INTERNAL',state:'RESULT_RECEIVED',version:4}
  ]){
    const got=await reconcileCanonicalLabReceipt({...defaults,canonical:altered},m.store);
    assert.equal(got.available,false);
    assert.equal(got.reason,altered.reason==='CANONICAL_RESULT_CONFIRMED_INTERNAL'
      ?'LAB_CANONICAL_RECEIPT_NOT_VERIFIABLE':'LAB_CANONICAL_REVISION_CHANGED');
    assert.doesNotMatch(JSON.stringify(got),/Otro estado distinto/);
  }
  assert.equal(m.rows.length,1);
});

test('result board must be confirmed internally with revision to recover, no external officiality',async()=>{
  const m=mockStore();
  const result={
    ...canonical,reason:'CANONICAL_RESULT_CONFIRMED_INTERNAL',
    text:'Llegada confirmada por operador: 7 - 3 - 1.',
    state:'RESULT_RECEIVED',version:4
  };
  const i={...defaults,purpose:'result' as const,canonical:result};
  assert.equal((await reconcileCanonicalLabReceipt(i,m.store)).available,true);
  const replay=await reconcileCanonicalLabReceipt(i,m.store);
  assert.equal(replay.available,true);
  assert.equal(replay.reason,'LAB_CANONICAL_RECOVERED');
  assert.equal(replay.authority.officiality,'NOT_EXTERNALLY_VERIFIED');
  const change=await reconcileCanonicalLabReceipt({...i,canonical:{...result,text:'Llegada corregida: 1 - 3 - 7.',version:5}},m.store);
  assert.equal(change.available,false);
  assert.equal(change.reason,'LAB_CANONICAL_REVISION_CHANGED');
});

test('same external message identity cannot be reused across purpose, sender, source tenant or LAB',async()=>{
  const m=mockStore();
  await reconcileCanonicalLabReceipt(defaults,m.store);
  for(const change of [
    {senderId:'987654321098'},
    {ownerId:'22222222-2222-4222-8222-222222222222'},
    {sourceGroupKey:'another-source'},
    {labGroupId:'120363333333333333@g.us'},
    {labChannelKey:'other-lab'},
    {externalMessageId:'another-message'},
  ]){
    const r=await reconcileCanonicalLabReceipt({...defaults,...change},m.store);
    assert.equal(r.available,true); // each distinct scope obtains its OWN key
    assert.equal(m.rows.at(-1)?.text,canonical.text);
    m.setReceipt(null);
  }
  const original=mockStore();
  await reconcileCanonicalLabReceipt(defaults,original.store);
  const changedPurpose=await reconcileCanonicalLabReceipt({
    ...defaults,purpose:'result',canonical:{...canonical,reason:'CANONICAL_RESULT_CONFIRMED_INTERNAL'}
  },original.store);
  assert.equal(changedPurpose.available,false);
  assert.equal(changedPurpose.reason,'LAB_CANONICAL_REVISION_CHANGED');
});

test('human takeover, stale message and missing canonical revision fail closed without any DB writes',async()=>{
  for(const partial of [
    {humanOwned:true},
    {timestamp:new Date(now-LAB_CANONICAL_RECOVERY_WINDOW_MS-1).toISOString()},
    {timestamp:new Date(now+1000).toISOString()},
    {timestamp:'invalid'},
    {canonical:{...canonical,available:false}},
    {canonical:{...canonical,version:0}},
    {canonical:{...canonical,updatedAt:'not-a-date'}},
    {canonical:{...canonical,reason:'CANONICAL_ENTRIES_UNAVAILABLE'}},
    {canonical:{...canonical,text:''}}
  ]){
    const m=mockStore();
    const r=await reconcileCanonicalLabReceipt({...defaults,...partial},m.store);
    assert.equal(r.available,false,JSON.stringify(partial));
    assert.equal(m.rows.length,0);
  }
});

test('tampered receipts and non-planned/financial evidence reject a duplicate',async()=>{
  for(const override of [
    {status:'sent'},{receiptId:'financial-id'},{transactionId:'tx'}, {stateId:'state'},
    {confirmationVerified:true},{responseHash:'invalid'},{decisionVersion:'old-policy'},
    {sourceMessageId:'wrong'}
  ]){
    const m=mockStore();
    await reconcileCanonicalLabReceipt(defaults,m.store);
    m.setReceipt({...m.getReceipt(),...override});
    const result=await reconcileCanonicalLabReceipt(defaults,m.store);
    assert.equal(result.available,false,JSON.stringify(override));
    assert.equal(result.reason,'LAB_CANONICAL_REVISION_CHANGED');
  }
});

test('two racing first attempts depend on existing immutable UPSERT unique key, not duplicate chat sends',async()=>{
  const m=mockStore();
  const [a,b]=await Promise.all([
    reconcileCanonicalLabReceipt(defaults,m.store),
    reconcileCanonicalLabReceipt(defaults,m.store)
  ]);
  assert.equal(a.available,true);assert.equal(b.available,true);
  assert.equal(a.text,b.text);
  assert.equal(a.authority.sourceWriteAllowed,false);
  assert.equal(m.rows.length,2); // two caller transactions; SQL unique index arbitrates one immutable row
});

test('endpoint and Bridge keep recovery before durable send intent, with handoff and no source route',()=>{
  const src=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
  const start=src.indexOf("router.post('/bridge/lab/query'");
  const end=src.indexOf("router.post('/bridge/events'",start);
  const block=src.slice(start,end);
  assert.match(block,/validateBridgeGroupIdentity\(input\)/);
  assert.match(block,/isLabInformationRequest\(input\.text,input\.purpose,result\)/);
  assert.match(block,/loadHandoff\(input\.channelKey,sender,null\)/);
  assert.match(block,/reconcileCanonicalLabReceipt\(/);
  const commitBeforeHttp=block.indexOf('await reconcileCanonicalLabReceipt({');
  const finalReply=block.indexOf('const verified=receiptProjection||canonical;');
  assert.ok(commitBeforeHttp>=0&&finalReply>commitBeforeHttp&&
    block.indexOf('return res.json({ok:true,mode:',finalReply)>finalReply);
  assert.doesNotMatch(block,/ensureSourceReplyOutbox|sendCloudText|persistBridgeTransportEvent/);
  const adapter=readFileSync(new URL('../../../../tools/hipico-whatsapp-web-bridge/src/lab-canonical-query.mjs',import.meta.url),'utf8');
  assert.match(adapter,/for\(let attempt=0;attempt<2;attempt\+\+\)/);
  assert.match(adapter,/redirect:'manual'/);
});


test('next/active/schedule responses recover only with the same full meeting snapshot',async()=>{
  const purposes=[
    {purpose:'next' as const,reason:'CANONICAL_NEXT_RACE',state:'NEXT_SNAPSHOT'},
    {purpose:'active' as const,reason:'CANONICAL_ACTIVE_RACE',state:'ACTIVE_SNAPSHOT'},
    {purpose:'schedule' as const,reason:'CANONICAL_SCHEDULE_FOUND',state:'SCHEDULE_SNAPSHOT'}
  ];
  for(const {purpose,reason,state} of purposes){
    const receipt=mockStore();
    const read={...canonical,reason,state,
      revisionToken:'f'.repeat(64),version:3,text:'Programación interna del grupo, sin oficialidad externa.'};
    const input={...defaults,purpose,canonical:read};
    const original=await reconcileCanonicalLabReceipt(input,receipt.store);
    assert.equal(original.available,true);
    assert.equal(receipt.rows.length,1);
    assert.match(receipt.rows[0].decisionVersion,/^lab-canonical-v1-/);
    const replay=await reconcileCanonicalLabReceipt(input,receipt.store);
    assert.equal(replay.reason,'LAB_CANONICAL_RECOVERED');
    assert.equal(receipt.rows.length,1);
    for(const altered of [
      {...read,revisionToken:'a'.repeat(64)},
      {...read,version:4},
      {...read,text:'Programación corregida'},
      {...read,updatedAt:'2026-10-12T18:59:00.000Z'}
    ]){
      const fail=await reconcileCanonicalLabReceipt({...input,canonical:altered},receipt.store);
      assert.equal(fail.available,false);
      assert.equal(fail.reason,'LAB_CANONICAL_REVISION_CHANGED');
    }
    assert.equal(receipt.rows.length,1);
  }
});

test('missing snapshot or mismatched LAB purpose cannot create an immutable receipt',async()=>{
  const incorrect=[
    {purpose:'next' as const,canonical:{...canonical,reason:'CANONICAL_NEXT_RACE',state:'NEXT_SNAPSHOT'}},
    {purpose:'active' as const,canonical:{...canonical,reason:'CANONICAL_ACTIVE_RACE',state:'ACTIVE_SNAPSHOT',revisionToken:'x'}},
    {purpose:'schedule' as const,canonical:{...canonical,reason:'CANONICAL_SCHEDULE_FOUND',state:'SCHEDULE_SNAPSHOT',revisionToken:'f'.repeat(64),version:0}},
    {purpose:'next' as const,canonical:{...canonical,reason:'CANONICAL_ACTIVE_RACE',state:'NEXT_SNAPSHOT',revisionToken:'f'.repeat(64)}},
    {purpose:'next' as const,canonical:{...canonical,reason:'CANONICAL_NEXT_RACE',state:'SCHEDULE_SNAPSHOT',revisionToken:'f'.repeat(64)}}
  ];
  for(const input of incorrect){
    const store=mockStore();
    const result=await reconcileCanonicalLabReceipt({...defaults,...input},store.store);
    assert.equal(result.available,false);
    assert.equal(store.rows.length,0);
  }
});

test('race summary shares immutable LAB receipt recovery and rejects corrected result on same message',async()=>{
  const store=mockStore();
  const raceSummary={
    ...canonical,reason:'CANONICAL_RACE_SUMMARY',
    text:'Resumen interno de carrera 5: abierta. Sin llegada confirmada.',
    state:'OPEN',version:3
  };
  const input={...defaults,purpose:'summary' as const,canonical:raceSummary};
  const initial=await reconcileCanonicalLabReceipt(input,store.store);
  assert.equal(initial.available,true);
  assert.equal(initial.reason,'CANONICAL_RACE_SUMMARY');
  assert.equal(store.rows.length,1);
  assert.equal(store.getReceipt()?.responseHash,
    crypto.createHash('sha256').update(raceSummary.text).digest('hex'));
  assert.doesNotMatch(JSON.stringify(store.getReceipt()),/Resumen interno/);

  const recovered=await reconcileCanonicalLabReceipt(input,store.store);
  assert.equal(recovered.available,true);
  assert.equal(recovered.reason,'LAB_CANONICAL_RECOVERED');
  assert.equal(recovered.text,raceSummary.text);
  assert.equal((recovered as any).recovery.recovered,true);
  assert.equal(store.rows.length,1);

  for(const changed of [
    {...raceSummary,text:'Resumen interno de carrera 5: cerrada. Resultado corregido.'},
    {...raceSummary,state:'CLOSED',version:4},
    {...raceSummary,updatedAt:'2026-10-12T18:59:00.000Z'},
    {...raceSummary,text:'Llegada corregida a 1 - 3 - 7.',version:5}
  ]){
    const result=await reconcileCanonicalLabReceipt({...input,canonical:changed},store.store);
    assert.equal(result.available,false);
    assert.equal(result.reason,'LAB_CANONICAL_REVISION_CHANGED');
    assert.equal(store.rows.length,1);
  }
});

test('summary receipts are strictly purpose-bound, time-bound and operator-ownership protected',async()=>{
  const canonicalSummary={...canonical,reason:'CANONICAL_RACE_SUMMARY',text:'Resumen interno confirmado.'};
  const valid={...defaults,purpose:'summary' as const,canonical:canonicalSummary};
  for(const altered of [
    {...valid,canonical:{...canonicalSummary,reason:'CANONICAL_STATE_FOUND'}},
    {...valid,canonical:{...canonicalSummary,available:false}},
    {...valid,canonical:{...canonicalSummary,version:0}},
    {...valid,canonical:{...canonicalSummary,updatedAt:'not-a-date'}},
    {...valid,canonical:{...canonicalSummary,text:''}},
    {...valid,humanOwned:true},
    {...valid,timestamp:new Date(now-LAB_CANONICAL_RECOVERY_WINDOW_MS-1).toISOString()}
  ]){
    const m=mockStore();
    const result=await reconcileCanonicalLabReceipt(altered,m.store);
    assert.equal(result.available,false);
    assert.equal(m.rows.length,0);
  }
  const store=mockStore();
  await reconcileCanonicalLabReceipt(defaults,store.store);
  const cross=await reconcileCanonicalLabReceipt(valid,store.store);
  assert.equal(cross.available,false);
  assert.equal(cross.reason,'LAB_CANONICAL_REVISION_CHANGED');
  assert.equal(store.rows.length,1);
});

test('summary purpose uses immutable receipt endpoint before HTTP reply and supports lost response replay',()=>{
  const source=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
  const from=source.indexOf("router.post('/bridge/lab/query'");
  const to=source.indexOf("router.post('/bridge/events'",from);
  const block=source.slice(from,to);
  assert.match(block,/\['status','result','summary','next','active','schedule'\]\.includes\(input\.purpose\)/);
  assert.match(block,/purpose:input\.purpose as 'status'\|'result'\|'summary'\|'next'\|'active'\|'schedule'/);
  const receipt=block.indexOf('await reconcileCanonicalLabReceipt(');
  const recheck=block.indexOf('const recheck=await checkLabHandoff(');
  const send=block.indexOf('return res.json({ok:true,mode:',recheck);
  assert.ok(receipt>=0&&recheck>receipt&&send>recheck);
  assert.doesNotMatch(block,/sourceWriteAllowed:true|financialAuthority:true/);
});
