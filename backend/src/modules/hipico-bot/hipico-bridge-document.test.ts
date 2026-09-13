import test from 'node:test';
import assert from 'node:assert/strict';

async function loadSubject(){return import('./hipico-bridge-document.routes.js').catch(()=>null);}
const sourceGroupId='120363111111111111@g.us';
const labGroupId='120363222222222222@g.us';
const ownerId='00000000-0000-4000-8000-000000000001';
const env={HIPICO_SOURCE_GROUP_ID:sourceGroupId,HIPICO_LAB_GROUP_ID:labGroupId,HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY:'club-hipico-triple-crown-official',HIPICO_LAB_CHANNEL_KEY:'control-hipico-lab',HIPICO_BRIDGE_OWNER_ID:ownerId};
const headers={
  'x-hipico-group-id':sourceGroupId,
  'x-hipico-channel-key':'club-hipico-triple-crown-official',
  'x-hipico-lab-channel-key':'control-hipico-lab',
  'x-hipico-external-message-id':'A1B2C3',
  'x-hipico-sender':'584121234567@c.us',
  'x-hipico-filename':'programa.pdf',
  'x-hipico-received-at':'2026-09-13T17:00:00.000Z'
};

test('Bridge PDF metadata derives owner/group/authority server-side',async()=>{
  const subject=await loadSubject();assert.ok(subject,'bridge document route must exist');
  const parsed=subject.parseBridgeDocumentHeaders(headers,env);
  assert.equal(parsed.ownerId,ownerId);
  assert.equal(parsed.groupKey,'club-hipico-triple-crown-official');
  assert.equal(parsed.filename,'programa.pdf');
  assert.deepEqual(parsed.provenance,{sourceChannel:'club-hipico-triple-crown-official',sourceMessageId:'waweb:A1B2C3',sender:'584121234567',receivedAt:'2026-09-13T17:00:00.000Z',authority:'group_evidence'});
  assert.equal('authority' in parsed,false);
});

test('Bridge PDF metadata rejects identity mismatch and missing owner configuration',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  assert.throws(()=>subject.parseBridgeDocumentHeaders({...headers,'x-hipico-group-id':'120363999999999999@g.us'},env),(error:any)=>error?.code==='HIPICO_BRIDGE_DOCUMENT_IDENTITY_MISMATCH');
  assert.throws(()=>subject.parseBridgeDocumentHeaders(headers,{...env,HIPICO_BRIDGE_OWNER_ID:''}),(error:any)=>error?.code==='HIPICO_BRIDGE_OWNER_NOT_CONFIGURED');
});

test('Bridge PDF metadata rejects non-PDF names, control chars and oversized identities',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  assert.throws(()=>subject.parseBridgeDocumentHeaders({...headers,'x-hipico-filename':'programa.docx'},env),(error:any)=>error?.code==='HIPICO_BRIDGE_DOCUMENT_FILENAME_INVALID');
  assert.throws(()=>subject.parseBridgeDocumentHeaders({...headers,'x-hipico-external-message-id':'x\u0000y'},env),(error:any)=>error?.code==='HIPICO_BRIDGE_DOCUMENT_MESSAGE_ID_INVALID');
  assert.throws(()=>subject.parseBridgeDocumentHeaders({...headers,'x-hipico-external-message-id':'x'.repeat(301)},env),(error:any)=>error?.code==='HIPICO_BRIDGE_DOCUMENT_MESSAGE_ID_INVALID');
});

test('Bridge PDF route is fail-closed to application/pdf and 10 MiB raw body',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  assert.equal(subject.BRIDGE_DOCUMENT_MAX_BYTES,10*1024*1024);
  assert.equal(subject.bridgeDocumentMimeAllowed('application/pdf'),true);
  assert.equal(subject.bridgeDocumentMimeAllowed('application/pdf; charset=binary'),true);
  assert.equal(subject.bridgeDocumentMimeAllowed('application/octet-stream'),false);
});
