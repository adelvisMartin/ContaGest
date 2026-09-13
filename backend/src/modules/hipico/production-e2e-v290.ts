import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { after, test } from 'node:test';
import PDFDocument from 'pdfkit';
import { prisma } from '../../database/prisma.js';
import { HipicoBotStore, processIncoming } from '../hipico-bot/hipico-bot.service.js';
import { createDefaultHipicoAgentEngine } from './agent-engine.js';
import { AutomationStore } from './automation.store.js';
import { DocumentIngestionService, validatePdfEnvelope } from './document-engine.js';
import { createPdfJsDocumentExtractor, documentExtractorCapability } from './document-extractor.js';
import { PostgresDocumentStore } from './document.store.js';
import { TestChannelAdapter, type NormalizedChannelMessage } from './messaging-channel.js';
import { RaceLifecycleStore } from './race.store.js';

const execFileAsync=promisify(execFile);
const OWNER_ID=String(process.env.HIPICO_E2E_OWNER_ID||'11111111-1111-4111-8111-111111111111');
const DATABASE_URL=String(process.env.HIPICO_E2E_DATABASE_URL||process.env.DATABASE_URL||'').trim();
const runKey=`v290-${Date.now()}-${Math.random().toString(16).slice(2,10)}`;
const raceStore=new RaceLifecycleStore();

function requireIsolatedDatabase(){
  assert.ok(DATABASE_URL,'HIPICO_E2E_DATABASE_URL is required for production E2E');
  const url=new URL(DATABASE_URL);
  assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase()),'E2E PostgreSQL must be loopback-only');
  assert.match(url.pathname.replace(/^\//,''),/^hipico_e2e_[a-z0-9_]{8,63}$/,'E2E PostgreSQL must use a hipico_e2e_ database');
}
requireIsolatedDatabase();
after(async()=>{await prisma.$disconnect();});

function botMessage(message:NormalizedChannelMessage){
  return{providerMessageId:message.externalMessageId,phoneNumberId:`test-channel:${message.channel}`,sender:message.senderId,messageType:message.type,body:message.text,payload:{groupId:message.groupId,historySync:message.historySync,channel:message.channel,quotedExternalMessageId:message.quotedExternalMessageId||null,sentAt:message.sentAt}};
}
async function countTable(table:'HipicoWebhookEvent'|'HipicoBotOutbox'){
  const rows=await prisma.$queryRawUnsafe<Array<{count:bigint}>>(`SELECT COUNT(*)::bigint AS count FROM public."${table}"`);
  return Number(rows[0]?.count||0);
}
function command(command:any,expectedState:any,requestId:string,payload:Record<string,unknown>={},evidence:any[]=[]){
  return{command,expectedState,requestId,actorId:'operator-e2e',actorType:'operator' as const,correlationId:`trace-${requestId}`.slice(0,120),payload,evidence};
}
async function pdfBuffer(text:string){
  const doc=new PDFDocument({autoFirstPage:true,compress:true,margin:48,info:{Title:'Control Hipico E2E'}});const chunks:Buffer[]=[];
  doc.on('data',(chunk)=>chunks.push(Buffer.from(chunk)));doc.fontSize(24).text(text);doc.fontSize(14).text('Carrera 3 · Ejemplar UNO · evidencia de producción');doc.end();await once(doc,'end');return Buffer.concat(chunks);
}
async function scannedPdfBuffer(text:string){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-scan-fixture-'));
  try{
    const sourcePdf=path.join(directory,'source.pdf');const prefix=path.join(directory,'page');await fs.writeFile(sourcePdf,await pdfBuffer(text),{mode:0o600});
    await execFileAsync('pdftoppm',['-singlefile','-png','-r','220',sourcePdf,prefix],{timeout:30000,maxBuffer:12*1024*1024,windowsHide:true});
    const doc=new PDFDocument({autoFirstPage:true,compress:true,margin:0,info:{Title:'Control Hipico Scan E2E'}});const chunks:Buffer[]=[];doc.on('data',(chunk)=>chunks.push(Buffer.from(chunk)));doc.image(`${prefix}.png`,18,18,{fit:[576,756],align:'center',valign:'center'});doc.end();await once(doc,'end');return Buffer.concat(chunks);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
}

test('TestChannel adapter -> classifier -> persistent PostgreSQL outbox -> response is replay-safe',async()=>{
  assert.equal(await HipicoBotStore.dbReady(true),true,'memory fallback is forbidden in production E2E');
  const channel=new TestChannelAdapter('production-e2e');await channel.connect();
  const beforeEvents=await countTable('HipicoWebhookEvent');const beforeOutbox=await countTable('HipicoBotOutbox');let result:any=null;
  const unsubscribe=channel.receive(async(message)=>{result=await processIncoming(botMessage(message));if(!result?.duplicate&&result?.outbox?.message)await channel.send(message.groupId,result.outbox.message);});
  const inbound:NormalizedChannelMessage={channel:'production-e2e',groupId:`${runKey}-group-a`,externalMessageId:`${runKey}-status`,senderId:'584121234567',senderLabel:'Operador E2E',sentAt:new Date().toISOString(),type:'text',text:'estatus',quotedExternalMessageId:null,historySync:false,fromMe:false,hasMedia:false};
  await channel.inject(inbound);assert.equal(result?.duplicate,false);assert.equal(await countTable('HipicoWebhookEvent'),beforeEvents+1);assert.equal(await countTable('HipicoBotOutbox'),beforeOutbox+1);assert.equal(channel.sent.length,1);assert.equal(channel.sent[0].groupId,inbound.groupId);
  await channel.inject(inbound);assert.equal(result?.duplicate,true);assert.equal(await countTable('HipicoWebhookEvent'),beforeEvents+1);assert.equal(await countTable('HipicoBotOutbox'),beforeOutbox+1);assert.equal(channel.sent.length,1);
  unsubscribe();await channel.disconnect();
});

test('canonical race lifecycle separates close from result and preserves replay result stage',async()=>{
  const groupKey=`${runKey}-race`;const meeting=await raceStore.createMeeting({ownerId:OWNER_ID,groupKey,name:'E2E Meeting',meetingDate:new Date().toISOString()});const race=await raceStore.createRace({ownerId:OWNER_ID,groupKey,meetingId:meeting.id,number:1,name:'E2E Race'});
  const steps:[string,string,string,Record<string,unknown>,any[]][]=[
    ['OPEN','DISCOVERED','open',{},[]],['CLOSE','OPEN','close',{},[]],['START','CLOSED','start',{},[]],['RECORD_PROVISIONAL_RESULT','RUNNING','provisional',{arrival:['5','3','1']},[]],['MARK_OFFICIAL_RESULT','PROVISIONAL_RESULT','official',{arrival:['5','3','1']},[{source:'official-e2e',authority:'official',confidence:.99}]]
  ];
  let last:any;
  for(const [name,state,key,payload,evidence] of steps){last=await raceStore.command(OWNER_ID,groupKey,race.id,command(name,state,`${runKey}-${key}`,payload,evidence));assert.equal(last.duplicate,false);}
  const row=await raceStore.getRace(OWNER_ID,groupKey,race.id);assert.equal(row.state,'OFFICIAL_RESULT');assert.equal(row.resultStage,'official');assert.equal(Number(row.stateVersion),5);
  const replay=await raceStore.command(OWNER_ID,groupKey,race.id,command('MARK_OFFICIAL_RESULT','PROVISIONAL_RESULT',`${runKey}-official`,{arrival:['5','3','1']},[{source:'official-e2e',authority:'official',confidence:.99}]));assert.equal(replay.duplicate,true);assert.equal(replay.transition.resultStage,'official');assert.equal((await raceStore.history(OWNER_ID,groupKey,race.id)).length,5);
});

test('two groups can operate the same race number concurrently with zero cross-group reads',async()=>{
  const groupA=`${runKey}-A`;const groupB=`${runKey}-B`;
  const [meetingA,meetingB]=await Promise.all([raceStore.createMeeting({ownerId:OWNER_ID,groupKey:groupA,name:'Meeting A'}),raceStore.createMeeting({ownerId:OWNER_ID,groupKey:groupB,name:'Meeting B'})]);
  const [raceA,raceB]=await Promise.all([raceStore.createRace({ownerId:OWNER_ID,groupKey:groupA,meetingId:meetingA.id,number:1,name:'Shared number'}),raceStore.createRace({ownerId:OWNER_ID,groupKey:groupB,meetingId:meetingB.id,number:1,name:'Shared number'})]);
  await Promise.all([raceStore.command(OWNER_ID,groupA,raceA.id,command('OPEN','DISCOVERED',`${runKey}-A-open`)),raceStore.command(OWNER_ID,groupB,raceB.id,command('OPEN','DISCOVERED',`${runKey}-B-open`))]);
  assert.equal((await raceStore.listRaces(OWNER_ID,groupA,meetingA.id)).length,1);assert.equal((await raceStore.listRaces(OWNER_ID,groupB,meetingB.id)).length,1);assert.equal(await raceStore.getRace(OWNER_ID,groupA,raceB.id),null);assert.equal(await raceStore.getRace(OWNER_ID,groupB,raceA.id),null);
});

test('native/scanned/corrupt/hostile/oversized/duplicate/revision PDFs execute through canonical document engine',async()=>{
  const runtime={...process.env,HIPICO_DOCUMENT_OCR_ENABLED:'true',HIPICO_DOCUMENT_OCR_LANGUAGE:'eng'};const capability=documentExtractorCapability(runtime);assert.equal(capability.nativeText,true,capability.reason||'native unavailable');assert.equal(capability.ocr,true,capability.reason||'ocr unavailable');const extractor=createPdfJsDocumentExtractor(runtime);assert.ok(extractor);
  const store=new PostgresDocumentStore();const service=new DocumentIngestionService(store,extractor,30000);const groupKey=`${runKey}-docs`.slice(0,120);
  const corrupt=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >>','latin1');assert.throws(()=>validatePdfEnvelope(corrupt,'corrupt.pdf'),(error:any)=>error?.code==='PDF_STRUCTURE_INVALID');
  const hostile=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page /Java#53cript 2 0 R >>\nendobj\n%%EOF\n','latin1');assert.throws(()=>validatePdfEnvelope(hostile,'hostile.pdf'),(error:any)=>error?.code==='PDF_ACTIVE_CONTENT_REJECTED');
  const oversized=Buffer.alloc(10*1024*1024+1,0x20);oversized.write('%PDF-1.4',0,'latin1');assert.throws(()=>validatePdfEnvelope(oversized,'oversized.pdf'),(error:any)=>error?.code==='PDF_TOO_LARGE');
  const native=await pdfBuffer('PROGRAMA OFICIAL DE CARRERAS');
  const first=await service.ingest({ownerId:OWNER_ID,groupKey,pdf:native,filename:'programa.pdf',provenance:{sourceChannel:'e2e',sourceMessageId:`${runKey}:native`,sender:'operator-e2e',receivedAt:new Date().toISOString(),authority:'operator'}});assert.equal(first.duplicate,false);assert.equal(first.classification,'RACE_PROGRAM');
  const duplicate=await service.ingest({ownerId:OWNER_ID,groupKey,pdf:native,filename:'copy.pdf',provenance:{sourceChannel:'e2e',sourceMessageId:`${runKey}:dup`,sender:'operator-e2e',receivedAt:new Date().toISOString(),authority:'operator'}});assert.equal(duplicate.duplicate,true);assert.equal(duplicate.id,first.id);
  const revision=await service.ingest({ownerId:OWNER_ID,groupKey,pdf:await pdfBuffer('RESULTADO OFICIAL CARRERA 3'),filename:'revision.pdf',supersedesId:first.id,provenance:{sourceChannel:'e2e',sourceMessageId:`${runKey}:revision`,sender:'group-source',receivedAt:new Date().toISOString(),authority:'group_evidence'}});assert.equal(revision.classification,'RESULT');const revisionRow=await store.get(OWNER_ID,groupKey,revision.id);assert.equal(revisionRow?.supersedesId,first.id);assert.equal(revisionRow?.extraction?.claimedOfficial,true);
  await assert.rejects(prisma.$executeRaw`UPDATE public.hipico_documents SET raw_pdf=${Buffer.from('changed')} WHERE id=${revision.id}::uuid`,/HIPICO_DOCUMENT_IMMUTABLE_EVIDENCE/);
  const scan=await extractor.extract(await scannedPdfBuffer('PIZARRA RESULTADO CARRERA CINCO TRES UNO'),new AbortController().signal);assert.equal(scan.method,'ocr');assert.ok(scan.text.replace(/\s/g,'').length>=10);
});

test('source-group automation defaults to SHADOW and persists evaluation without ledger authority',async()=>{
  const groupKey=`${runKey}-agent`;const groupId='120363111111111111@g.us';const previous=process.env.HIPICO_SOURCE_GROUP_ID;process.env.HIPICO_SOURCE_GROUP_ID=groupId;
  try{
    const store=new AutomationStore();const mode=await store.get(OWNER_ID,groupKey,groupId);assert.equal(mode.mode,'SHADOW');const engine=createDefaultHipicoAgentEngine();const evaluation=await engine.evaluate('¿Cuál es la próxima carrera?','SHADOW');assert.equal(evaluation.canAct,false);assert.equal(evaluation.candidate.source,'deterministic');
    const ledgerBefore=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT COUNT(*)::bigint AS count FROM public.hipico_ledger_entries WHERE owner_id=${OWNER_ID}::uuid AND group_key=${groupKey}`;await store.recordEvaluation({ownerId:OWNER_ID,groupKey,groupId,text:'¿Cuál es la próxima carrera?',candidate:evaluation.candidate,canAct:evaluation.canAct,evidence:{run:runKey}});const rows=await store.evaluations(OWNER_ID,groupKey,groupId,10);assert.equal(rows.length,1);assert.equal(rows[0].canAct,false);const ledgerAfter=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT COUNT(*)::bigint AS count FROM public.hipico_ledger_entries WHERE owner_id=${OWNER_ID}::uuid AND group_key=${groupKey}`;assert.equal(Number(ledgerAfter[0]?.count||0),Number(ledgerBefore[0]?.count||0));
  }finally{if(previous===undefined)delete process.env.HIPICO_SOURCE_GROUP_ID;else process.env.HIPICO_SOURCE_GROUP_ID=previous;}
});
