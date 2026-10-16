import test from 'node:test';
import assert from 'node:assert/strict';
import {queryCanonicalLab} from '../src/lab-canonical-query.mjs';

const BASE={
  ingestUrl:'https://canonical.example.test/api/v1/hipico-bot/bridge/events',
  token:'synthetic-server-only-token',labGroupId:'120363222222222222@g.us',
  labChannelKey:'control-hipico-lab',senderId:'123456789012@lid',
  messageId:'false_120363222222222222@g.us_m-1_123456789012@lid',
  timestamp:'2026-10-16T12:00:00.000Z',text:'¿Estado de carrera 5?',
  purpose:'status'
};
const SAFE={ok:true,mode:'shadow',status:'CANONICAL_STATE_FOUND',
  text:'Estado canónico en LAB, sin escrituras.',
  authority:{sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false}};
const okResponse=()=>({status:200,headers:new Headers({'content-type':'application/json'}),
  text:async()=>JSON.stringify(SAFE)});
async function denied(candidate){
  let requests=0;
  const result=await queryCanonicalLab({...BASE,...candidate,
    fetchImpl:async()=>{requests++;return okResponse();}});
  assert.deepEqual(result,{available:false,reason:'LAB_CANONICAL_DISABLED'});
  assert.equal(requests,0,'invalid envelope must not touch canonical API');
}
const validRace={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-16'};

test('#892 canonical LAB accepts original complete message and ID without mutations',async()=>{
  let sent;
  const longText='¿'+('carrera 5 '.repeat(105))+'?'; // <=1200 units
  const longId='i'.repeat(320);
  assert.ok(longText.length<=1200);
  const result=await queryCanonicalLab({...BASE,messageId:longId,text:longText,
    race:validRace,fetchImpl:async(url,args)=>{sent={url,payload:JSON.parse(args.body)};return okResponse();}});
  assert.equal(result.available,true);
  assert.equal(sent.payload.externalMessageId,longId);
  assert.equal(sent.payload.text,longText);
  assert.deepEqual(sent.payload.race,validRace);
  assert.equal(sent.payload.channelRole,'lab');
  assert.equal(sent.payload.shadowMode,true);
});

test('#892 rejects >320 event ID without collision-producing truncation',async()=>{
  await denied({messageId:'a'.repeat(320)+'-unique-A'});
  await denied({messageId:'a'.repeat(320)+'-unique-B'});
});
test('#892 rejects >1200 text with dangerous trailing qualifiers instead of silently clipping',async()=>{
  await denied({text:'¿Estado de carrera 5? '+'X'.repeat(1200)+' registrar saldo'});
  await denied({text:'X'.repeat(1201)});
});
test('#892 preserves legitimate multiline questions as submitted',async()=>{
  let payload;
  const question='¿Cuál es el estado de la carrera 5?\n¿Se confirmó el resultado?';
  const result=await queryCanonicalLab({...BASE,text:question,
    fetchImpl:async(_url,args)=>{payload=JSON.parse(args.body);return okResponse();}});
  assert.equal(result.available,true);
  assert.equal(payload.text,question);
});
test('#892 exact upper length limits are accepted',async()=>{
  let calls=0;
  const res=await queryCanonicalLab({...BASE,messageId:'i'.repeat(320),text:'a'.repeat(1200),
    fetchImpl:async()=>{calls++;return okResponse();}});
  assert.equal(res.available,true);
  assert.equal(calls,1);
});
test('#892 rejects blank IDs and nonstring envelope identity',async()=>{
  for(const candidate of [
    {messageId:'  '},{messageId:''},{messageId:42},{messageId:{toString(){return 'id'}}},
    {senderId:' '},{senderId:null},{labChannelKey:'  '},{labGroupId:[]},{token:{}}
  ])await denied(candidate);
});
test('#892 rejects injection of NUL or CR in trusted identity fields',async()=>{
  await denied({messageId:'event\nother'});
  await denied({senderId:'sender\0other'});
  await denied({labChannelKey:'lab\rsource'});
});
test('#892 rejects malformed or impossible canonical timestamps',async()=>{
  for(const timestamp of ['2026-10-16T12:00:00Z','2026-10-16T08:00:00.000-04:00',
    '2026-02-30T12:00:00.000Z','2026-10-16T12:00:00',{},'bad']){
    await denied({timestamp});
  }
});
test('#892 rejects race with missing or extra keys before backend',async()=>{
  await denied({race:{raceNumber:5,racetrack:'La Rinconada'}});
  await denied({race:{...validRace,amount:100}});
  await denied({race:[]});
  await denied({race:'race 5'});
});
test('#892 rejects out-of-range race numbers and wrong value types',async()=>{
  for(const raceNumber of [0,-1,100,999,'5',1.5,Infinity])await denied({race:{...validRace,raceNumber}});
});
test('#892 rejects incorrect date and dangerous racetrack tokens',async()=>{
  for(const raceDate of ['2026-02-30','2026-10-16T00:00:00Z','2026-2-16','0000-00-00'])
    await denied({race:{...validRace,raceDate}});
  for(const racetrack of ['X','La Rinconada; UPDATE account','La Rinconada\nnuevo',' '.repeat(2)])
    await denied({race:{...validRace,racetrack}});
});
test('#892 accepts harmless race dates that exist in calendar',async()=>{
  const result=await queryCanonicalLab({...BASE,race:{...validRace,raceDate:'2024-02-29'},
    fetchImpl:async()=>okResponse()});
  assert.equal(result.available,true);
});
test('#892 rejects invalid quoted identity and oversized quote',async()=>{
  await denied({quotedMessageId:''});
  await denied({quotedMessageId:'z'.repeat(321)});
  await denied({quotedMessageId:['prior']});
});
test('#892 accepts legitimate quote identity without truncation',async()=>{
  let payload;
  const quote='q'.repeat(320);
  const result=await queryCanonicalLab({...BASE,quotedMessageId:quote,
    fetchImpl:async(_url,args)=>{payload=JSON.parse(args.body);return okResponse();}});
  assert.equal(result.available,true);
  assert.equal(payload.quotedExternalMessageId,quote);
});
test('#892 rejects malformed timeout before HTTP, preserves finite bounded budgets',async()=>{
  for(const timeoutMs of [Infinity,NaN,-1,30_001,'4500',null])await denied({timeoutMs});
  const result=await queryCanonicalLab({...BASE,timeoutMs:4500,fetchImpl:async()=>okResponse()});
  assert.equal(result.available,true);
});
test('#892 known read-only purpose survives; unknown/write purpose never sends',async()=>{
  const res=await queryCanonicalLab({...BASE,purpose:'status',fetchImpl:async()=>okResponse()});
  assert.equal(res.available,true);
  await denied({purpose:'transfer'});
  await denied({purpose:'settlement'});
});
