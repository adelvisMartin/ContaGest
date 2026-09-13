import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function loadSubject(){return import('../src/document-spool.mjs').catch(()=>null);}
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n');
const meta={externalMessageId:'A1B2C3',filename:'Programa.pdf',event:{externalMessageId:'A1B2C3',groupId:'120363111111111111@g.us',channelKey:'club-hipico-triple-crown-official',labChannelKey:'control-hipico-lab',senderId:'584121234567',timestamp:'2026-09-13T17:00:00.000Z'}};

async function temp(){return fs.mkdtemp(path.join(os.tmpdir(),'hipico-doc-spool-test-'));}

test('document spool persists PDF and metadata before delivery',async()=>{
  const subject=await loadSubject();assert.ok(subject,'document-spool module must exist');
  const root=await temp();try{
    const spool=subject.createDocumentSpool({rootDir:root});
    const queued=await spool.queue(meta,pdf);
    assert.equal(queued.duplicate,false);
    assert.equal((await spool.snapshot()).pending,1);
    assert.equal((await fs.readFile(queued.pdfPath)).subarray(0,5).toString('latin1'),'%PDF-');
    assert.equal(JSON.parse(await fs.readFile(queued.metaPath,'utf8')).filename,'Programa.pdf');
    const duplicate=await spool.queue(meta,pdf);assert.equal(duplicate.duplicate,true);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('successful delivery removes PDF and metadata atomically from pending',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const root=await temp();try{
    const spool=subject.createDocumentSpool({rootDir:root});await spool.queue(meta,pdf);
    let calls=0;const result=await spool.flush(async(record,bytes)=>{calls+=1;assert.equal(record.externalMessageId,'A1B2C3');assert.deepEqual(bytes,pdf);return{ok:true};});
    assert.equal(calls,1);assert.equal(result.delivered,1);assert.equal((await spool.snapshot()).pending,0);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('retryable delivery keeps PDF pending while terminal failures quarantine it',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const root=await temp();try{
    const spool=subject.createDocumentSpool({rootDir:root,baseBackoffMs:1,maxBackoffMs:2});await spool.queue(meta,pdf);
    await spool.flush(async()=>{const error=new Error('busy');error.retryable=true;throw error;});
    assert.equal((await spool.snapshot()).pending,1);
    await new Promise(resolve=>setTimeout(resolve,4));
    await spool.flush(async()=>{const error=new Error('bad');error.retryable=false;throw error;});
    const snapshot=await spool.snapshot();assert.equal(snapshot.pending,0);assert.equal(snapshot.quarantined,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('corrupt metadata never reaches delivery and is quarantined',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const root=await temp();try{
    const spool=subject.createDocumentSpool({rootDir:root});await fs.mkdir(path.join(root,'pending'),{recursive:true});await fs.mkdir(path.join(root,'quarantine'),{recursive:true});
    await fs.writeFile(path.join(root,'pending','bad.json'),'{not-json','utf8');await fs.writeFile(path.join(root,'pending','bad.pdf'),pdf);
    let calls=0;await spool.flush(async()=>{calls+=1;});assert.equal(calls,0);assert.equal((await spool.snapshot()).quarantined,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('document spool fails closed when the configured pending capacity is exhausted',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const root=await temp();try{
    const spool=subject.createDocumentSpool({rootDir:root,maxPendingDocuments:1});
    await spool.queue(meta,pdf);
    await assert.rejects(
      spool.queue({...meta,externalMessageId:'SECOND',event:{...meta.event,externalMessageId:'SECOND'}},pdf),
      (error)=>error?.code==='HIPICO_BRIDGE_DOCUMENT_SPOOL_FULL'
    );
    const duplicate=await spool.queue(meta,pdf);
    assert.equal(duplicate.duplicate,true,'an existing durable document remains idempotent at capacity');
    assert.equal((await spool.snapshot()).pending,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
