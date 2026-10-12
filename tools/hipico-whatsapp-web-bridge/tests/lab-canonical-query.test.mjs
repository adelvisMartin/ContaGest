import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {labCanonicalQueryUrl,explicitLabRaceScope,queryCanonicalLab,labReadOnlyQueryPurpose,resolveQuotedLabRaceScope} from '../src/lab-canonical-query.mjs';

const event='https://example.org/api/v1/hipico-bot/bridge/events';
const base={
  ingestUrl:event,token:'test-secure-token',labGroupId:'120363222222222222@g.us',
  labChannelKey:'control-hipico-lab',messageId:'msg-01',
  senderId:'123456789012@lid',text:'estado de carrera 5'
};
const json=(body,status=200)=>({status,headers:new Headers({'content-type':'application/json'}),text:async()=>JSON.stringify(body)});

test('canonical URL is pinned to existing Bridge origin, rejects token redirects and unsafe schemes',()=>{
  assert.equal(labCanonicalQueryUrl(event),'https://example.org/api/v1/hipico-bot/bridge/lab/query');
  assert.equal(labCanonicalQueryUrl('http://127.0.0.1:3000/api/v1/hipico-bot/bridge/events'),'http://127.0.0.1:3000/api/v1/hipico-bot/bridge/lab/query');
  for(const input of [
    'http://attacker.example/api/v1/hipico-bot/bridge/events',
    'https://example.org/api/v1/hipico-bot/bridge/events?token=x',
    'https://user:secret@example.org/api/v1/hipico-bot/bridge/events',
    'https://example.org/unrelated/events',
    'javascript:alert(1)'
  ])assert.equal(labCanonicalQueryUrl(input),null);
});

test('only full explicit race, track and date creates a canonical scope',()=>{
  assert.deepEqual(explicitLabRaceScope('estado de carrera 5 en hipódromo La Rinconada el 2026-10-12'),
    {raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'});
  assert.equal(explicitLabRaceScope('estado carrera 5'),null);
  assert.equal(explicitLabRaceScope('¿Quién ganó?'),null);
  assert.equal(explicitLabRaceScope('carrera 0 en La Rinconada el 2026-10-12'),null);
});

test('LAB adapter sends read-only envelope with same-origin token and no redirects',async()=>{
  let sent;
  const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
  const output=await queryCanonicalLab({...base,race,fetchImpl:async(url,options)=>{
    sent={url,options};return json({
      ok:true,mode:'shadow',status:'CANONICAL_STATE_FOUND',text:'Estado interno: abierta.',
      authority:{sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false}
    });
  }});
  assert.equal(output.available,true);
  assert.equal(output.text,'Estado interno: abierta.');
  assert.equal(sent.options.method,'POST');
  assert.equal(sent.options.redirect,'manual');
  assert.equal(sent.options.headers['x-hipico-bridge-token'],base.token);
  const payload=JSON.parse(sent.options.body);
  assert.equal(payload.channelRole,'lab');
  assert.equal(payload.shadowMode,true);
  assert.equal(payload.race.raceNumber,5);
  assert.equal(payload.groupId,base.labGroupId);
  assert.equal(payload.senderId,base.senderId);
  assert.equal(sent.url,labCanonicalQueryUrl(event));
});

test('untrusted response cannot confer financial authority or SOURCE writing',async()=>{
  const malicious={ok:true,mode:'shadow',status:'CANONICAL_STATE_FOUND',text:'Mensaje inseguro',
    authority:{sourceWriteAllowed:true,financialAuthority:false,domainEffectsAllowed:false}};
  const result=await queryCanonicalLab({...base,fetchImpl:async()=>json(malicious)});
  assert.equal(result.available,false);
  assert.equal(result.reason,'LAB_CANONICAL_INVALID_RESPONSE');
  const other=await queryCanonicalLab({...base,fetchImpl:async()=>json({...malicious,authority:{
    sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false
  }},302)});
  assert.equal(other.available,false);
});

test('offline, absent credentials and malformed response fail safe with no raw error leakage',async()=>{
  assert.equal((await queryCanonicalLab({...base,token:''})).reason,'LAB_CANONICAL_DISABLED');
  const failure=await queryCanonicalLab({...base,fetchImpl:async()=>{throw new Error('Bearer super-private-token');}});
  assert.deepEqual(failure,{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'});
  const html=await queryCanonicalLab({...base,fetchImpl:async()=>({
    status:200,headers:new Headers({'content-type':'text/html'}),text:async()=>'<h1>200</h1>'
  })});
  assert.equal(html.available,false);
});

test('live Bridge queries only safe LAB input before journal send intent',async()=>{
  const src=await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','src','index.mjs'),'utf8');
  const start=src.indexOf('async function processLabTestInput()');
  const end=src.indexOf('async function visibleLabHasTag',start);
  const body=src.slice(start,end);
  const query=body.indexOf('await queryCanonicalLab({');
  const prepare=body.indexOf('await labTestReplyJournal.prepare(row.id)');
  const send=body.indexOf('await sendTextInCurrentLab(');
  assert.ok(query>=0&&prepare>query&&send>prepare);
  assert.match(body,/labReadOnlyQueryPurpose\(body,classification\)/);
  assert.match(body,/resolveQuotedLabRaceScope\(row,visible\)/);
  assert.match(body,/labConversationInput\(row, classification\)/);
  assert.match(src,/sourceSendPossible: SOURCE_AUTO_REPLY_ACTIVE && backendState === 'online'/);
});


test('read-only question classifier asks for specific results, entries or state only',()=>{
  const reviewed={intent:'conversation',risk:'review'};
  assert.equal(labReadOnlyQueryPurpose('¿Cuál es el resultado?',reviewed),'result');
  assert.equal(labReadOnlyQueryPurpose('¿Qué caballos corren?',reviewed),'participants');
  assert.equal(labReadOnlyQueryPurpose('¿Estado de carrera 5?',{intent:'status_non_monetary',risk:'safe'}),'status');
  assert.equal(labReadOnlyQueryPurpose('RESULTADO 7-3-1',{intent:'race_result',risk:'review'}),null);
  assert.equal(labReadOnlyQueryPurpose('¿Resultado y pagar premio?',reviewed),null);
  assert.equal(labReadOnlyQueryPurpose('¿saldo y resultados?',{intent:'betting_or_balance',risk:'monetary'}),null);
});

test('quoted race context requires exact prior visible LAB message and the same stable sender',()=>{
  const scope='Consulta: carrera 5 en hipódromo La Rinconada el 2026-10-12';
  const sender='123456789012@lid';
  const prior={id:'false_120363222222222222@g.us_m-1_'+sender,text:scope,fromMe:false,hasMedia:false};
  const reply={id:'false_120363222222222222@g.us_m-2_'+sender,text:'¿Cuál fue el resultado?',quotedId:prior.id};
  assert.deepEqual(resolveQuotedLabRaceScope(reply,[prior,reply]),
    {raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'});
  assert.equal(resolveQuotedLabRaceScope({...reply,quotedId:reply.id},[prior,reply]),null);
  assert.equal(resolveQuotedLabRaceScope({...reply,quotedId:'unknown'},[prior,reply]),null);
  assert.equal(resolveQuotedLabRaceScope({...reply,id:'false_120363222222222222@g.us_m-2_234567890123@lid'},[prior,reply]),null);
  assert.equal(resolveQuotedLabRaceScope({...reply,text:'¿Resultado de carrera 8?'},[prior,reply]),null);
  assert.equal(resolveQuotedLabRaceScope(reply,[{...prior,fromMe:true},reply]),null);
  assert.equal(resolveQuotedLabRaceScope(reply,[{...prior,hasMedia:true},reply]),null);
});

test('query adapter sends purpose and verified quoted identity only in the LAB query payload',async()=>{
  let sent;
  const prior={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
  await queryCanonicalLab({...base,purpose:'result',race:prior,quotedMessageId:'quoted-verified',
    fetchImpl:async(_url,opts)=>{
      sent=JSON.parse(opts.body);
      return json({ok:true,mode:'shadow',status:'CANONICAL_RESULT_CONFIRMED_INTERNAL',
        text:'Llegada interna: 7 - 3 - 1.',authority:{
          sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false
        }});
    }});
  assert.equal(sent.purpose,'result');
  assert.equal(sent.quotedExternalMessageId,'quoted-verified');
  assert.deepEqual(sent.race,prior);
  assert.equal(sent.channelRole,'lab');
});


test('safe local next/active/program questions use existing LAB read-only envelope',()=>{
  const reviewed={intent:'conversation',risk:'review'};
  assert.equal(labReadOnlyQueryPurpose('¿Qué carrera sigue?',reviewed),'next');
  assert.equal(labReadOnlyQueryPurpose('¿Cuál es la próxima carrera?',reviewed),'next');
  assert.equal(labReadOnlyQueryPurpose('¿Cuál es la carrera activa?',reviewed),'active');
  assert.equal(labReadOnlyQueryPurpose('¿Cuál es la cartelera?',reviewed),'schedule');
  assert.equal(labReadOnlyQueryPurpose('¿Qué carrera sigue y pagar premio?',reviewed),null);
  assert.equal(labReadOnlyQueryPurpose('REGISTRA CARTELERA',reviewed),null);
});

test('lost HTTP response retries read-only lookup once with identical message identity',async()=>{
  let calls=0;const envelopes=[];
  const result=await queryCanonicalLab({...base,fetchImpl:async(_url,options)=>{
    calls++;
    envelopes.push(JSON.parse(options.body));
    if(calls===1)throw new TypeError('network socket dropped after backend read');
    return json({ok:true,mode:'shadow',status:'CANONICAL_STATE_FOUND',text:'Estado interno verificado.',
      authority:{sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false}});
  }});
  assert.equal(calls,2);
  assert.deepEqual(envelopes[0],envelopes[1]);
  assert.equal(result.available,true);
  assert.equal(result.text,'Estado interno verificado.');
});

test('only transient gateway failures are retried: never replay auth, rate-limit or invalid authority',async()=>{
  for(const status of [502,503,504]){
    let calls=0;
    const result=await queryCanonicalLab({...base,fetchImpl:async()=>{
      calls++;
      if(calls===1)return json({},status);
      return json({ok:true,mode:'shadow',status:'CANONICAL_RACE_NOT_FOUND',
        text:'No se ha confirmado esa carrera.',authority:{
          sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false}});
    }});
    assert.equal(calls,2);
    assert.equal(result.available,true);
  }
  for(const status of [401,403,404,429]){
    let calls=0;
    const result=await queryCanonicalLab({...base,fetchImpl:async()=>{calls++;return json({},status);}});
    assert.equal(calls,1);
    assert.equal(result.available,false);
  }
  let invalidCalls=0;
  const invalid=await queryCanonicalLab({...base,fetchImpl:async()=>{
    invalidCalls++;return json({ok:true,mode:'shadow',status:'CANONICAL_STATE_FOUND',text:'unsafe',
      authority:{sourceWriteAllowed:true,financialAuthority:false,domainEffectsAllowed:false}});
  }});
  assert.equal(invalidCalls,1);
  assert.equal(invalid.reason,'LAB_CANONICAL_INVALID_RESPONSE');
});

test('exhausted network recovery does not create an ACK or send intent for a canonical question',async()=>{
  let calls=0;
  const result=await queryCanonicalLab({...base,fetchImpl:async()=>{calls++;throw new TypeError('network');}});
  assert.equal(calls,2);
  assert.deepEqual(result,{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'});
  const source=await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','src','index.mjs'),'utf8');
  const section=source.slice(source.indexOf('async function processLabTestInput()'),source.indexOf('async function visibleLabHasTag'));
  const lookup=section.indexOf('await queryCanonicalLab({');
  const hold=section.indexOf("if(inquiryPurpose && BACKEND_SYNC_ENABLED && canonical.available!==true)");
  const prepare=section.indexOf('await labTestReplyJournal.prepare(row.id)');
  const send=section.indexOf('await sendTextInCurrentLab(');
  assert.ok(lookup>=0&&hold>lookup&&prepare>hold&&send>prepare);
  assert.match(section,/LAB_CANONICAL_QUERY_PENDING/);
  assert.match(section,/if\(inquiryPurpose && BACKEND_SYNC_ENABLED && !sender\)/);
});


test('blank canonical response never authorizes a LAB send or local factual fallback',async()=>{
  for(const text of ['', '  \t  ']){
    let calls=0;
    const result=await queryCanonicalLab({...base,fetchImpl:async()=>{
      calls++;
      return json({ok:true,mode:'shadow',status:'CANONICAL_STATE_FOUND',text,
        authority:{sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false}});
    }});
    assert.equal(calls,1);
    assert.deepEqual(result,{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'});
  }
});
