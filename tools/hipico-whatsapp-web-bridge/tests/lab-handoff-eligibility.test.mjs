import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkLabSendEligibility, labHandoffEligibilityUrl } from '../src/lab-handoff-eligibility.mjs';

const base={
  ingestUrl:'http://127.0.0.1:3001/api/v1/hipico-bot/bridge/events',
  token:'secret-local-for-unit-tests',
  labGroupId:'120363222222222222@g.us',
  labChannelKey:'control-hipico-lab',
  messageId:'false_120363222222222222@g.us_abc_123456789012@lid',
  senderId:'123456789012@lid'
};
const authority={sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false};
const reply=(body,status=200,contentType='application/json')=>({
  status,headers:{get:key=>key==='content-type'?contentType:null},
  text:async()=>JSON.stringify(body)
});
const ok=(allowed,status)=>reply({ok:true,mode:'shadow',allowed,status,authority});

test('eligibility URL is derived only from pinned Bridge endpoint',()=>{
  assert.equal(labHandoffEligibilityUrl(base.ingestUrl),
    'http://127.0.0.1:3001/api/v1/hipico-bot/bridge/lab/eligibility');
  for(const url of [
    'https://attacker.invalid/bridge/lab/query',
    'http://example.com/bridge/events',
    'https://host.invalid/bridge/events?redirect=1',
    'http://127.0.0.1:3001/api/v1/hipico-bot/bridge/lab/eligibility'
  ])assert.equal(labHandoffEligibilityUrl(url),null,url);
});

test('only explicit authorized allow response permits LAB send',async()=>{
  let request;
  const check=await checkLabSendEligibility({...base,
    race:{raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'},
    fetchImpl:async(url,opts)=>{request={url,opts};return ok(true,'LAB_HANDOFF_CLEAR')}
  });
  assert.deepEqual(check,{allowed:true,reason:'LAB_HANDOFF_CLEAR'});
  assert.equal(request.opts.method,'POST');
  assert.equal(request.opts.redirect,'manual');
  assert.equal(request.opts.cache,'no-store');
  assert.equal(request.opts.headers['x-hipico-bridge-token'],base.token);
  const body=JSON.parse(request.opts.body);
  assert.equal(body.groupId,base.labGroupId);
  assert.equal(body.channelRole,'lab');
  assert.equal(body.shadowMode,true);
  assert.equal(body.senderId,base.senderId);
  assert.equal(body.race.raceNumber,5);
  assert.equal(body.ownerId,undefined);
  assert.equal(body.groupKey,undefined);
  assert.equal(body.operatorId,undefined);
});

test('human takeover holds messages; no local fallback grants send',async()=>{
  for(const status of ['LAB_HANDOFF_HELD','LAB_HANDOFF_SCOPE_INVALID']){
    assert.deepEqual(await checkLabSendEligibility({...base,
      fetchImpl:async()=>ok(false,status)}),{allowed:false,reason:'LAB_HANDOFF_HELD'});
  }
  const forged=await checkLabSendEligibility({...base,fetchImpl:async()=>ok(true,'LAB_HANDOFF_HELD')});
  assert.equal(forged.allowed,false);
});

test('network failure, missing auth, malformed JSON or invalid authority all fail closed',async()=>{
  const cases=[
    {fetchImpl:async()=>{throw new Error('backend offline')}},
    {fetchImpl:async()=>reply({ok:true,mode:'shadow',allowed:true,status:'LAB_HANDOFF_CLEAR',
      authority:{...authority,financialAuthority:true}})},
    {fetchImpl:async()=>reply({ok:true,mode:'source',allowed:true,status:'LAB_HANDOFF_CLEAR',authority})},
    {fetchImpl:async()=>reply({ok:true,mode:'shadow',allowed:true,status:'LAB_HANDOFF_CLEAR',authority},503)},
    {fetchImpl:async()=>reply({},200,'text/html')},
    {fetchImpl:async()=>({status:200,headers:{get:()=> 'application/json'},text:async()=>'{bad'})}
  ];
  for(const input of cases){
    assert.equal((await checkLabSendEligibility({...base,...input})).allowed,false);
  }
  assert.equal((await checkLabSendEligibility({...base,token:''})).allowed,false);
});

test('the Bridge checks handoff before read, before journal and immediately before browser send',()=>{
  const text=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
  const a=text.indexOf('async function processLabTestInput()');
  const b=text.indexOf('async function visibleLabHasTag',a);
  const block=text.slice(a,b);
  const first=block.indexOf('const eligibleBefore=');
  const query=block.indexOf('await queryCanonicalLab(',first);
  const second=block.indexOf('const eligibleAfter=await checkLabSendEligibility(',query);
  const prepare=block.indexOf('await labTestReplyJournal.prepare(row.id)',second);
  const begin=block.indexOf('await labTestReplyJournal.begin(row.id)',prepare);
  const last=block.indexOf('const eligibleToSend=await checkLabSendEligibility(eligibilityArgs)',begin);
  const rollback=block.indexOf('await labTestReplyJournal.retryPrepared(row.id)',last);
  const send=block.indexOf('await sendTextInCurrentLab(',last);
  const ack=block.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',send);
  assert.ok(first>=0&&query>first&&second>query&&prepare>second&&
    begin>prepare&&last>begin&&rollback>last&&send>rollback&&ack>send);
  assert.match(block,/if\(!eligibleToSend\.allowed\)\{/);
  assert.match(block,/eligibleToSend\.reason==='LAB_HANDOFF_HELD'/);
  assert.match(block,/LAB_HANDOFF_SEND_GATE_/);
  // A denied pre-send permit rolls the WAL back without marking delivery.
  const denied=block.slice(last,send);
  assert.doesNotMatch(denied,/labTestReplyJournal\.confirm|page\.keyboard\.press|sendTextInCurrentLab/);
  assert.match(block,/eligibleBefore\.reason==='LAB_HANDOFF_HELD'/);
  assert.match(block,/eligibleAfter\.reason==='LAB_HANDOFF_HELD'/);
  assert.match(block,/canonical\.reason==='LAB_HANDOFF_HELD'/);
  assert.match(block,/rememberLabSeen\(row\.id\)/);
  assert.match(block,/if\(labTestProcessing\)return/);
  assert.match(block,/finally \{labTestProcessing=false;\}/);
  assert.doesNotMatch(block,/sendTextInCurrentSource/);
});
