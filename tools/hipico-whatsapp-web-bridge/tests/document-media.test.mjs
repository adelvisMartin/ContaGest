import test from 'node:test';
import assert from 'node:assert/strict';

async function loadSubject(){return import('../src/document-media.mjs').catch(()=>null);}
const row={id:'A1B2C3',hasMedia:true,mediaKind:'document',mediaName:'Programa La Rinconada.pdf',fromMe:false};
const event={externalMessageId:'A1B2C3',groupId:'120363111111111111@g.us',channelKey:'club-hipico-triple-crown-official',labChannelKey:'control-hipico-lab',senderId:'584121234567',timestamp:'2026-09-13T17:00:00.000Z'};

test('only live PDF documents are auto-ingest eligible',async()=>{
  const subject=await loadSubject();assert.ok(subject,'document-media module must exist');
  assert.equal(subject.shouldAutoIngestPdf(row,{enabled:true,historySync:false}),true);
  assert.equal(subject.shouldAutoIngestPdf({...row,mediaName:'foto.jpg'},{enabled:true,historySync:false}),false);
  assert.equal(subject.shouldAutoIngestPdf({...row,mediaKind:'image'},{enabled:true,historySync:false}),false);
  assert.equal(subject.shouldAutoIngestPdf(row,{enabled:true,historySync:true}),false);
  assert.equal(subject.shouldAutoIngestPdf(row,{enabled:false,historySync:false}),false);
});

test('PDF filename normalization is path-safe and bounded',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  assert.equal(subject.normalizePdfFilename('  Programa La Rinconada.pdf  '),'Programa La Rinconada.pdf');
  assert.equal(subject.normalizePdfFilename('../secreto.pdf'),null);
  assert.equal(subject.normalizePdfFilename('x\u0000y.pdf'),null);
  assert.equal(subject.normalizePdfFilename('x'.repeat(181)+'.pdf'),null);
  assert.equal(subject.normalizePdfFilename('programa.docx'),null);
});

test('Bridge document delivery rejects oversized/non-PDF bytes before network',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  assert.throws(()=>subject.assertPdfPayload(Buffer.from('not pdf')),(error)=>error?.code==='HIPICO_BRIDGE_MEDIA_NOT_PDF');
  const oversized=Buffer.alloc(subject.MAX_DOCUMENT_BYTES+1);oversized.write('%PDF-1.4');
  assert.throws(()=>subject.assertPdfPayload(oversized),(error)=>error?.code==='HIPICO_BRIDGE_MEDIA_TOO_LARGE');
});

test('Bridge document headers preserve provenance but cannot declare authority',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const headers=subject.buildBridgeDocumentHeaders(event,'Programa.pdf','bridge-secret');
  assert.equal(headers['content-type'],'application/pdf');
  assert.equal(headers['x-hipico-bridge-token'],'bridge-secret');
  assert.equal(headers['x-hipico-group-id'],event.groupId);
  assert.equal(headers['x-hipico-external-message-id'],event.externalMessageId);
  assert.equal(headers['x-hipico-filename'],'Programa.pdf');
  assert.equal(headers['x-hipico-document-authority'],undefined);
  assert.equal(headers['x-hipico-owner-id'],undefined);
});

test('backend delivery keeps retry semantics and bounded response parsing',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n');
  const calls=[];
  const fetchOk=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({ok:true,data:{id:'doc-1'}}),{status:201,headers:{'content-type':'application/json'}});};
  const result=await subject.postBridgePdf({url:'https://example.test/api/v1/hipico-bot/bridge/documents',token:'bridge-secret',event,filename:'Programa.pdf',pdf,timeoutMs:5000,fetchImpl:fetchOk});
  assert.equal(result.ok,true);assert.equal(calls.length,1);assert.ok(Buffer.isBuffer(calls[0].options.body));
  const fetchBusy=async()=>new Response(JSON.stringify({ok:false,error:'busy',retryable:true}),{status:503,headers:{'content-type':'application/json'}});
  await assert.rejects(subject.postBridgePdf({url:'https://example.test/api/v1/hipico-bot/bridge/documents',token:'bridge-secret',event,filename:'Programa.pdf',pdf,timeoutMs:5000,fetchImpl:fetchBusy}),(error)=>error?.retryable===true&&error?.status===503);
});
