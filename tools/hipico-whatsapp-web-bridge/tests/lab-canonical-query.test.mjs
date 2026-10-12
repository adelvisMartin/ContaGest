import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {labCanonicalQueryUrl,explicitLabRaceScope,queryCanonicalLab} from '../src/lab-canonical-query.mjs';

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
  assert.match(body,/classification\.risk === 'safe'/);
  assert.match(body,/labConversationInput\(row, classification\)/);
  assert.match(src,/sourceSendPossible: SOURCE_AUTO_REPLY_ACTIVE && backendState === 'online'/);
});
