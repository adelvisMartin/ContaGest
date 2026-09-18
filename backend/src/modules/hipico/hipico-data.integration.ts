import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import PDFDocument from 'pdfkit';
import pg from 'pg';
import { prisma } from '../../database/prisma.js';
import { DocumentIngestionService, validatePdfEnvelope, type PdfTextExtractor } from './document-engine.js';
import { createPdfJsDocumentExtractor, documentExtractorCapability } from './document-extractor.js';
import { PostgresDocumentStore } from './document.store.js';
import { ProviderEvidenceStore } from './provider-evidence.store.js';
import { RaceLifecycleStore } from './race.store.js';

const { Client }=pg;
const OWNER='11111111-1111-4111-8111-111111111111';
const GROUP_A='e2e-group-a',GROUP_B='e2e-group-b';
const databaseUrl=String(process.env.HIPICO_E2E_DATABASE_URL||'').trim();
let admin:pg.Client;

function requireIsolatedDatabase(){
  assert.ok(databaseUrl,'HIPICO_E2E_DATABASE_URL is required');
  assert.equal(String(process.env.DATABASE_URL||'').trim(),databaseUrl,'DATABASE_URL must equal the isolated E2E URL');
  const url=new URL(databaseUrl),database=url.pathname.replace(/^\//,'');
  assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase()),'PostgreSQL E2E must be local/ephemeral');
  assert.match(database,/^hipico_e2e_[a-z0-9_]{8,63}$/,'database must be isolated per run');
}
requireIsolatedDatabase();

async function applySql(file:string){const sql=await fs.readFile(path.resolve(process.cwd(),'../supabase/sql',file),'utf8');await admin.query(sql);}
async function pdfBuffer(configure:(doc:PDFKit.PDFDocument)=>void){const doc=new PDFDocument({autoFirstPage:true,compress:false,info:{Title:'Control Hipico E2E'}}),chunks:Buffer[]=[];doc.on('data',(chunk)=>chunks.push(Buffer.from(chunk)));configure(doc);doc.end();await once(doc,'end');return Buffer.concat(chunks);}
const PIXEL_PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3q2pWQAAAABJRU5ErkJggg==','base64');
const fakeExtractor:PdfTextExtractor={capability:()=>({configured:true,nativeText:true,ocr:false,parserVersion:'e2e-fixture'}),async extract(){return{text:'PROGRAMA DE CARRERAS\nHIPODROMO: La Rinconada\nCARRERA 4 - E2E\nPost  Ejemplar  Jockey\n1  UNO  A PEREZ\n2  DOS  B PEREZ',method:'native_text',parserVersion:'e2e-fixture',pageCount:1};}};

before(async()=>{
  admin=new Client({connectionString:databaseUrl});await admin.connect();
  await admin.query(`create schema if not exists auth; do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';`);
  for(const migration of ['hipico_v14_documents.sql','hipico_v15_race_lifecycle.sql','hipico_v17_provider_evidence.sql','hipico_v18_race_result_stages.sql','hipico_v19_race_idempotency.sql','hipico_v20_document_audit.sql','hipico_v21_race_data_conflicts.sql'])await applySql(migration);
});

after(async()=>{
  try{await prisma.$disconnect();}catch{}
  if(admin){
    try{await admin.query('drop table if exists public.hipico_document_events,public.hipico_document_sources,public.hipico_documents,public.hipico_provider_evidence,public.hipico_race_events,public.hipico_races,public.hipico_meetings cascade');}finally{await admin.end();}
  }
});

test('native-text real PDF uses Poppler without OCR and scanned PDF uses OCR only when needed',async()=>{
  const env={...process.env,HIPICO_DOCUMENT_OCR_ENABLED:'true',HIPICO_DOCUMENT_OCR_LANGUAGE:'eng'};
  const capability=documentExtractorCapability(env);assert.equal(capability.nativeText,true,`native parser unavailable: ${capability.reason||'unknown'}`);assert.equal(capability.ocr,true,`OCR unavailable: ${capability.reason||'unknown'}`);
  const extractor=createPdfJsDocumentExtractor(env);assert.ok(extractor);
  const native=await pdfBuffer((doc)=>doc.fontSize(18).text('PROGRAMA DE CARRERAS LA RINCONADA CARRERA 4 EJEMPLAR UNO'));
  const nativeResult=await extractor.extract(native,new AbortController().signal);assert.equal(nativeResult.method,'native_text');assert.match(nativeResult.text,/PROGRAMA DE CARRERAS/i);
  const scanned=await pdfBuffer((doc)=>doc.image(PIXEL_PNG,72,72,{width:320,height:180}));
  const scannedResult=await extractor.extract(scanned,new AbortController().signal);assert.equal(scannedResult.method,'ocr');assert.equal(scannedResult.pageCount,1);
});

test('invalid malformed oversized and hostile PDFs fail closed',()=>{
  assert.throws(()=>validatePdfEnvelope(Buffer.from('not-pdf'),'bad.pdf'),/PDF_MAGIC_INVALID/);
  assert.throws(()=>validatePdfEnvelope(Buffer.from('%PDF-1.4\n1 0 obj'),'bad.pdf'),/PDF_STRUCTURE_INVALID/);
  const hostile=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page /Open#41ction 2 0 R >> endobj\n%%EOF\n','latin1');assert.throws(()=>validatePdfEnvelope(hostile,'hostile.pdf'),/PDF_ACTIVE_CONTENT_REJECTED/);
  const oversized=Buffer.alloc(10*1024*1024+1,0x20);oversized.write('%PDF-1.4',0,'latin1');assert.throws(()=>validatePdfEnvelope(oversized,'oversized.pdf'),/PDF_TOO_LARGE/);
});

test('document duplicate is idempotent, revision is traceable and processing history is append-only',async()=>{
  const store=new PostgresDocumentStore(),service=new DocumentIngestionService(store,fakeExtractor),firstPdf=await pdfBuffer((doc)=>doc.text('PROGRAMA DE CARRERAS A'));
  const provenance={sourceChannel:'e2e',sourceMessageId:'doc-first',sender:'operator-e2e',receivedAt:new Date().toISOString(),authority:'operator' as const};
  const first=await service.ingest({ownerId:OWNER,groupKey:GROUP_A,pdf:firstPdf,filename:'programa-a.pdf',provenance});assert.equal(first.duplicate,false);assert.ok('structured' in first,'configured extraction must return structured document data');assert.equal(first.structured.runners?.length,2);
  const eventsBefore=await store.events(OWNER,GROUP_A,first.id);assert.equal((eventsBefore as any[]).length,2);
  const duplicate=await service.ingest({ownerId:OWNER,groupKey:GROUP_A,pdf:firstPdf,filename:'copy.pdf',provenance:{...provenance,sourceMessageId:'doc-copy'}});assert.equal(duplicate.duplicate,true);assert.equal(duplicate.id,first.id);
  assert.equal((await store.events(OWNER,GROUP_A,first.id) as any[]).length,2,'duplicate must create zero processing/domain effects');
  const revisionPdf=await pdfBuffer((doc)=>doc.text('PROGRAMA DE CARRERAS A REVISION 2'));
  const revision=await service.ingest({ownerId:OWNER,groupKey:GROUP_A,pdf:revisionPdf,filename:'programa-a-r2.pdf',supersedesId:first.id,provenance:{...provenance,sourceMessageId:'doc-r2'}});assert.notEqual(revision.id,first.id);
  const stored:any=await store.get(OWNER,GROUP_A,revision.id);assert.equal(stored.supersedesId,first.id);
  await service.reprocessExisting({id:revision.id,ownerId:OWNER,groupKey:GROUP_A,filename:'programa-a-r2.pdf'});assert.equal((await store.events(OWNER,GROUP_A,revision.id) as any[]).length,3);
  await assert.rejects(store.approve(OWNER,GROUP_A,revision.id,'OFFICIAL_RESULT','operator-e2e'),/HIPICO_DOCUMENT_OFFICIAL_AUTHORITY_REQUIRED/);
});

test('provider normalized provenance persists hash/timestamps with financial authority false and no invented confidence',async()=>{
  const store=new ProviderEvidenceStore();const fetchedAt=new Date().toISOString();
  await store.record({ownerId:OWNER,groupKey:GROUP_A,capability:'getResult',externalId:'sr:stage:123',record:{data:{raceId:'sr:stage:123',status:'closed',positions:[{position:1,runnerId:'runner-1',runnerName:'UNO'}]},provenance:{provider:'sportradar-uof',source:'sportradar-uof:sr:stage:123',sourceTimestamp:fetchedAt,fetchedAt,freshness:'LIVE',officiality:'verified',authority:'external_provider',confidence:null,financialAuthority:false}}});
  const rows:any[]=await store.recent(OWNER,GROUP_A,10);assert.equal(rows.length,1);assert.equal(rows[0].sourceProvider,'sportradar-uof');assert.equal(rows[0].financialAuthority,false);assert.equal(rows[0].confidence,null);assert.match(rows[0].payloadHash,/^[a-f0-9]{64}$/);
});

function raceCommand(command:any,expectedState:any,requestId:string,idempotencyKey:string,payload:Record<string,unknown>={},evidence:any[]=[]){return{command,expectedState,requestId,idempotencyKey,actorId:'operator-e2e',actorType:'operator' as const,correlationId:`corr-${requestId}`,payload,evidence};}

test('race lifecycle is transactional, replay-safe, auditable and official result requires official evidence',async()=>{
  const store=new RaceLifecycleStore(),meeting=await store.createMeeting({ownerId:OWNER,groupKey:GROUP_A,name:'Meeting E2E'}),race=await store.createRace({ownerId:OWNER,groupKey:GROUP_A,meetingId:meeting.id,number:4,name:'Carrera 4'});
  const open=await store.command(OWNER,GROUP_A,race.id,raceCommand('OPEN','DISCOVERED','req-open-0001','idem-open-0001'));assert.equal(open.transition.to,'OPEN');
  const replay=await store.command(OWNER,GROUP_A,race.id,raceCommand('OPEN','DISCOVERED','req-open-0002','idem-open-0001'));assert.equal(replay.duplicate,true);assert.equal((await store.history(OWNER,GROUP_A,race.id)).length,1);
  await assert.rejects(store.command(OWNER,GROUP_A,race.id,raceCommand('ANNOUNCE','DISCOVERED','req-bad-0001','idem-open-0001')),/RACE_COMMAND_IDEMPOTENCY_MISMATCH/);
  const beforeConflict:any=await store.getRace(OWNER,GROUP_A,race.id);
  const conflict=await store.command(OWNER,GROUP_A,race.id,raceCommand('RECORD_DATA_CONFLICT','OPEN','req-conflict-01','idem-conflict-01',{conflictType:'RESULT',candidates:['provider:A','document:B']},[{source:'provider-result',authority:'trusted',confidence:.95},{source:'document-result',authority:'official',confidence:.99}]));assert.equal(conflict.transition.allowed,true);assert.equal(conflict.transition.reason,'DATA_CONFLICT');
  const conflictReplay=await store.command(OWNER,GROUP_A,race.id,raceCommand('RECORD_DATA_CONFLICT','OPEN','req-conflict-02','idem-conflict-01',{conflictType:'RESULT',candidates:['provider:A','document:B']},[{source:'provider-result',authority:'trusted',confidence:.95},{source:'document-result',authority:'official',confidence:.99}]));assert.equal(conflictReplay.duplicate,true);
  const afterConflict:any=await store.getRace(OWNER,GROUP_A,race.id);assert.equal(afterConflict.state,'OPEN');assert.equal(afterConflict.stateVersion,beforeConflict.stateVersion,'audit-only conflict must not mutate race state version');assert.equal((await store.history(OWNER,GROUP_A,race.id)).filter((event:any)=>event.command==='RECORD_DATA_CONFLICT').length,1);
  assert.equal((await store.command(OWNER,GROUP_A,race.id,raceCommand('CLOSE','OPEN','req-close-01','idem-close-01'))).transition.to,'CLOSED');
  assert.equal((await store.command(OWNER,GROUP_A,race.id,raceCommand('RECORD_PROVISIONAL_RESULT','CLOSED','req-prov-0001','idem-prov-0001',{order:[3,1,5]}))).transition.to,'PROVISIONAL_RESULT');
  const denied=await store.command(OWNER,GROUP_A,race.id,raceCommand('MARK_OFFICIAL_RESULT','PROVISIONAL_RESULT','req-off-deny1','idem-off-deny1',{order:[3,1,5]},[{source:'arrival-board',authority:'trusted',confidence:.99}]));assert.equal(denied.transition.allowed,false);assert.equal((await store.getRace(OWNER,GROUP_A,race.id))?.state,'PROVISIONAL_RESULT');
  const official=await store.command(OWNER,GROUP_A,race.id,raceCommand('MARK_OFFICIAL_RESULT','PROVISIONAL_RESULT','req-off-ok001','idem-off-ok001',{order:[3,1,5]},[{source:'official-feed',authority:'official',confidence:.99}]));assert.equal(official.transition.to,'OFFICIAL_RESULT');assert.equal((await store.getRace(OWNER,GROUP_A,race.id))?.resultStage,'official');
  const history:any[]=await store.history(OWNER,GROUP_A,race.id);assert.ok(history.every((event)=>event.idempotencyKey));assert.ok(history.some((event)=>event.disposition==='rejected'));
});

test('postpone/cancel conflicts are explicit and multi-group reads never cross scope',async()=>{
  const store=new RaceLifecycleStore(),meetingA=await store.createMeeting({ownerId:OWNER,groupKey:GROUP_A,name:'Meeting A'}),meetingB=await store.createMeeting({ownerId:OWNER,groupKey:GROUP_B,name:'Meeting B'}),raceA=await store.createRace({ownerId:OWNER,groupKey:GROUP_A,meetingId:meetingA.id,number:7,name:'A-7'}),raceB=await store.createRace({ownerId:OWNER,groupKey:GROUP_B,meetingId:meetingB.id,number:7,name:'B-7'});
  assert.equal((await store.command(OWNER,GROUP_A,raceA.id,raceCommand('POSTPONE','DISCOVERED','req-post-0001','idem-post-0001'))).transition.to,'POSTPONED');
  const conflict=await store.command(OWNER,GROUP_A,raceA.id,raceCommand('OPEN','POSTPONED','req-open-bad1','idem-open-bad1'));assert.equal(conflict.transition.allowed,false);assert.equal(conflict.transition.reason,'INVALID_TRANSITION');
  assert.equal((await store.command(OWNER,GROUP_A,raceA.id,raceCommand('CANCEL','POSTPONED','req-cancel-01','idem-cancel-01'))).transition.to,'CANCELLED');
  const rowsA=await store.listRaces(OWNER,GROUP_A),rowsB=await store.listRaces(OWNER,GROUP_B);assert.ok(rowsA.some((row:any)=>row.id===raceA.id));assert.ok(!rowsA.some((row:any)=>row.id===raceB.id));assert.ok(rowsB.some((row:any)=>row.id===raceB.id));assert.equal(await store.getRace(OWNER,GROUP_B,raceA.id),null);
});
