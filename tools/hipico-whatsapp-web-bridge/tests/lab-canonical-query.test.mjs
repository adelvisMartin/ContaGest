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

test('visible quote context rejects ambiguous original and conflicting ordinal follow-ups',()=>{
  const sender='123456789012@lid';
  const target={id:'false_120363222222222222@g.us_q-1_'+sender,
    text:'Consulta: carrera 5 en La Rinconada el 2026-10-12',fromMe:false,hasMedia:false};
  const reply={id:'false_120363222222222222@g.us_q-2_'+sender,
    text:'¿Y el estado de esa carrera?',quotedId:target.id};
  const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
  assert.deepEqual(resolveQuotedLabRaceScope(reply,[target,reply]),race);
  for(const text of [
    target.text+' o carrera 6',
    target.text+' o la sexta',
    target.text+' o 6ta',
    target.text+' y pagar 200 Bs',
    target.text+' para registrar saldo'
  ]){
    const modified={...target,text};
    assert.equal(resolveQuotedLabRaceScope(reply,[modified,reply]),null,text);
  }
  for(const text of [
    '¿Y el estado de carrera 6?',
    '¿Y el resultado de la sexta?',
    '¿Y el resultado de 6ta?',
    '¿Y el resultado de carrera 5 o carrera 6?'
  ]){
    assert.equal(resolveQuotedLabRaceScope({...reply,text},[target,reply]),null,text);
  }
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


test('lost LAB canonical HTTP after backend commit retries identical request identity before journal',async()=>{
  let calls=0;
  const seen=[];
  const result=await queryCanonicalLab({...base,purpose:'result',
    race:{raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'},
    fetchImpl:async(url,options)=>{
      calls++;
      seen.push({url,headers:options.headers,body:options.body});
      if(calls===1)throw new Error('ECONNRESET after backend committed response receipt');
      return json({ok:true,mode:'shadow',status:'LAB_CANONICAL_RECOVERED',
        text:'Resultado interno previamente validado, versión idéntica.',
        authority:{sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false}});
    }});
  assert.equal(calls,2);
  assert.equal(result.available,true);
  assert.equal(result.reason,'LAB_CANONICAL_RECOVERED');
  assert.equal(seen[0].url,seen[1].url);
  assert.equal(seen[0].body,seen[1].body);
  assert.equal(seen[0].headers['x-hipico-bridge-token'],seen[1].headers['x-hipico-bridge-token']);
  assert.equal(JSON.parse(seen[1].body).externalMessageId,base.messageId);
});

test('twice lost HTTP fails closed, never assumes the response was delivered to WhatsApp',async()=>{
  let calls=0;
  const result=await queryCanonicalLab({...base,fetchImpl:async()=>{
    calls++;throw new Error('lost-response');
  }});
  assert.equal(calls,2);
  assert.deepEqual(result,{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'});
});

test('backend canonical revision mismatch is returned as non-authoritative fallback',async()=>{
  let attempts=0;
  const result=await queryCanonicalLab({...base,fetchImpl:async()=>{
    attempts++;
    return json({ok:true,mode:'shadow',status:'LAB_CANONICAL_REVISION_CHANGED',
      text:'La carrera cambió. Vuelve a consultar.',
      authority:{sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false}});
  }});
  assert.equal(attempts,1);
  assert.equal(result.reason,'LAB_CANONICAL_REVISION_CHANGED');
  assert.equal(result.available,true); // informational fallback, not an authorization to send money
});

test('LAB supports only explicit race summaries, not whole-chat or monetary summaries',async()=>{
  const safe={intent:'conversation',risk:'safe'};
  for(const message of [
    'Hazme un resumen de la carrera 5 en hipódromo La Rinconada el 2026-10-12',
    '¿Resumen de la carrera 5?',
    'Dame una sintesis de carrera 5'
  ])assert.equal(labReadOnlyQueryPurpose(message,safe),'summary',message);
  for(const message of [
    'hazme un resumen de lo que hablamos',
    'hazme un resumen de lo que hablamos sobre carrera 5',
    'resume los mensajes del chat de carrera 5',
    'resumen de los saldos de carrera 5',
    'resumen de apuesta de carrera 5',
    'resumen de carrera 5 y registra la jugada',
    'resumen de carrera 5 y cobrar premio'
  ])assert.equal(labReadOnlyQueryPurpose(message,safe),null,message);
  assert.equal(labReadOnlyQueryPurpose('¿Estado de carrera 5?',safe),'status');
  assert.equal(labReadOnlyQueryPurpose('¿Resultado carrera 5?',{intent:'conversation',risk:'review'}),'result');
  assert.equal(labReadOnlyQueryPurpose('resumen de carrera 5', {intent:'betting_or_balance',risk:'monetary'}),null);
});

test('LAB summary transport preserves pinned identity, no SOURCE write, and strict read-only purpose',async()=>{
  let submitted=null;
  const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
  const res=await queryCanonicalLab({...base,race,purpose:'summary',
    text:'resumen de carrera 5 en hipódromo La Rinconada el 2026-10-12',
    fetchImpl:async(_url,options)=>{
      submitted={url:_url,options};
      return json({ok:true,mode:'shadow',status:'CANONICAL_RACE_SUMMARY',
        text:'Resumen del registro interno de carrera 5: estado abierta.',
        authority:{sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false}});
    }});
  assert.equal(res.available,true);
  assert.equal(res.reason,'CANONICAL_RACE_SUMMARY');
  assert.equal(submitted.options.redirect,'manual');
  assert.equal(JSON.parse(submitted.options.body).purpose,'summary');
  assert.equal(JSON.parse(submitted.options.body).channelRole,'lab');
  assert.deepEqual(JSON.parse(submitted.options.body).race,race);
});
