import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentIngestionService, authorizeDocumentClassification, strictDocumentMetadata, validatePdfEnvelope, type DocumentStore, type DocumentStoreInput, type PdfTextExtractor } from './document-engine.js';
import { parseHorseRacingDocument } from './document-parser.js';

const pdf=(body='')=>Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Page >>\n${body}\nendobj\n%%EOF\n`,'latin1');
class MemoryStore implements DocumentStore{
  rows=new Map<string,any>();hashes=new Map<string,string>();updates:any[]=[];
  async put(input:DocumentStoreInput){const prior=this.hashes.get(input.envelope.sha256);if(prior)return{id:prior,duplicate:true};const id=`00000000-0000-4000-8000-${String(this.rows.size+1).padStart(12,'0')}`;this.hashes.set(input.envelope.sha256,id);this.rows.set(id,{...input});return{id,duplicate:false};}
  async updateExtraction(id:string,_owner:string,_group:string,input:any){this.updates.push({id,...input});}
  async getRaw(_owner:string,_group:string,id:string){return this.rows.get(id)?.pdf||null;}
  async getAuthority(_owner:string,_group:string,id:string){return this.rows.get(id)?.provenance.authority||'unknown';}
}
const nativeExtractor:PdfTextExtractor={capability:()=>({configured:true,nativeText:true,ocr:false,parserVersion:'fixture'}),async extract(){return{text:'PROGRAMA DE CARRERAS\nHIPODROMO: La Rinconada\nFECHA: 2026-09-13\nCARRERA 3 - Copa Demo\nDISTANCIA: 1200 m\nSUPERFICIE: arena\nPost  Ejemplar  Jockey  Entrenador  Peso  Propietario\n1  UNO  A Perez  J Ruiz  54  Stable A\n2  DOS  B Perez  M Ruiz  55  Stable B',method:'native_text',parserVersion:'fixture',pageCount:1};}};
void test('PDF security validates MIME magic structure size filename and escaped active names',()=>{
  assert.throws(()=>validatePdfEnvelope(pdf(),'programa.pdf','text/plain'),(e:any)=>e?.code==='PDF_MIME_INVALID');
  assert.throws(()=>validatePdfEnvelope(Buffer.from('not-pdf'),'programa.pdf'),(e:any)=>e?.code==='PDF_MAGIC_INVALID');
  assert.throws(()=>validatePdfEnvelope(Buffer.from('%PDF-1.4\n1 0 obj'),'bad.pdf'),(e:any)=>e?.code==='PDF_STRUCTURE_INVALID');
  assert.throws(()=>validatePdfEnvelope(pdf('/Java#53cript 7 0 R'),'escaped-js.pdf'),(e:any)=>e?.code==='PDF_ACTIVE_CONTENT_REJECTED');
  assert.throws(()=>validatePdfEnvelope(pdf('/Open#41ction 7 0 R'),'escaped-action.pdf'),(e:any)=>e?.code==='PDF_ACTIVE_CONTENT_REJECTED');
  assert.throws(()=>validatePdfEnvelope(pdf(),'../programa.pdf'),(e:any)=>e?.code==='PDF_FILENAME_INVALID');
  const oversized=Buffer.alloc(10*1024*1024+1,0x20);oversized.write('%PDF-1.4',0,'latin1');assert.throws(()=>validatePdfEnvelope(oversized,'large.pdf'),(e:any)=>e?.code==='PDF_TOO_LARGE');
});
void test('document metadata limits reject rather than truncate replay/source identities',()=>{
  assert.equal(strictDocumentMetadata('official-feed','sourceChannel',120),'official-feed');
  assert.equal(strictDocumentMetadata('  message-1  ','sourceMessageId',320),'message-1');
  assert.throws(()=>strictDocumentMetadata('x'.repeat(121),'sourceChannel',120),(e:any)=>e?.code==='DOCUMENT_SOURCE_CHANNEL_INVALID');
  assert.throws(()=>strictDocumentMetadata('m'.repeat(321),'sourceMessageId',320),(e:any)=>e?.code==='DOCUMENT_SOURCE_MESSAGE_ID_INVALID');
  assert.throws(()=>strictDocumentMetadata('s'.repeat(221),'sender',220),(e:any)=>e?.code==='DOCUMENT_SENDER_INVALID');
});
void test('official wording never grants official or financial authority by itself',()=>{
  assert.deepEqual(authorizeDocumentClassification({classification:'OFFICIAL_RESULT',confidence:.98},'group_evidence'),{classification:'RESULT',confidence:.9,claimedOfficial:true});
  assert.equal(authorizeDocumentClassification({classification:'OFFICIAL_RESULT',confidence:.98},'official').classification,'OFFICIAL_RESULT');
});
void test('native text extraction parses only present horse-racing fields without OCR',async()=>{
  const store=new MemoryStore(),service=new DocumentIngestionService(store,nativeExtractor);const result=await service.ingest({ownerId:'00000000-0000-4000-8000-000000000001',groupKey:'group-a',pdf:pdf(),filename:'programa.pdf',provenance:{sourceChannel:'operator',receivedAt:'2026-09-11T19:00:00.000Z',authority:'operator'}});
  assert.equal(result.extractionStatus,'extracted');assert.equal(result.classification,'RACE_PROGRAM');assert.equal(store.updates[0].extraction.method,'native_text');assert.equal(store.updates[0].extraction.structured.track,'La Rinconada');assert.equal(store.updates[0].extraction.structured.raceNumber,3);assert.equal(store.updates[0].extraction.structured.runners.length,2);assert.equal(store.updates[0].extraction.reconciliation.financialAuthority,false);assert.equal(store.updates[0].extraction.reconciliation.autoSettlementAllowed,false);
});
void test('parser omits racing fields that are not present',()=>{const parsed=parseHorseRacingDocument('COMUNICADO\nHIPODROMO: Valencia');assert.deepEqual(parsed,{track:'Valencia'});});
void test('duplicate hash produces zero duplicate extraction effects',async()=>{const store=new MemoryStore();let calls=0;const extractor:PdfTextExtractor={...nativeExtractor,async extract(...args){calls+=1;return nativeExtractor.extract(...args);}};const service=new DocumentIngestionService(store,extractor),input={ownerId:'00000000-0000-4000-8000-000000000001',groupKey:'group-a',pdf:pdf('same'),provenance:{sourceChannel:'operator',receivedAt:'2026-09-11T19:00:00.000Z',authority:'operator' as const}};await service.ingest(input);const duplicate=await service.ingest(input);assert.equal(duplicate.duplicate,true);assert.equal(calls,1);});
void test('UNKNOWN stays in human review',async()=>{const store=new MemoryStore(),extractor:PdfTextExtractor={capability:()=>({configured:true,nativeText:true,ocr:false,parserVersion:'fixture'}),async extract(){return{text:'contenido no reconocido',method:'native_text',parserVersion:'fixture'};}};const service=new DocumentIngestionService(store,extractor);await service.ingest({ownerId:'00000000-0000-4000-8000-000000000001',groupKey:'group-a',pdf:pdf('unknown'),provenance:{sourceChannel:'operator',receivedAt:'2026-09-11T19:00:00.000Z',authority:'operator'}});assert.equal(store.updates[0].status,'review');assert.equal(store.updates[0].extraction.reconciliation.reviewRequired,true);});
void test('OCR is accepted only through fallback extractor contract',async()=>{const store=new MemoryStore(),extractor:PdfTextExtractor={capability:()=>({configured:true,nativeText:true,ocr:true,parserVersion:'fixture+ocr'}),async extract(){return{text:'PIZARRA\nLLEGADA: 5-3-1',method:'ocr',parserVersion:'fixture+ocr',pageCount:1};}};const service=new DocumentIngestionService(store,extractor);await service.ingest({ownerId:'00000000-0000-4000-8000-000000000001',groupKey:'group-a',pdf:pdf('scan'),provenance:{sourceChannel:'operator',receivedAt:'2026-09-11T19:00:00.000Z',authority:'operator'}});assert.equal(store.updates[0].extraction.method,'ocr');assert.equal(store.updates[0].classification,'ARRIVAL');assert.deepEqual(store.updates[0].extraction.structured.result.map((r:any)=>r.post),['5','3','1']);});
