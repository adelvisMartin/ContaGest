import test from 'node:test';
import assert from 'node:assert/strict';

async function loadSubject(){return import('../src/document-runtime-hook.mjs').catch(()=>null);}

const config={
  pdfAutoIngestEnabled:true,
  documentIngestUrl:'https://example.test/api/v1/hipico-bot/bridge/documents',
  documentBackendTimeoutMs:15000,
  token:'a'.repeat(64),
  sourceMatches:['CLUB HIPICO TRIPLE CROWN'],
  sourceGroupId:'120363111111111111@g.us',
  sourceChannelKey:'club-hipico-triple-crown-official',
  labChannelKey:'control-hipico-lab',
  dataDir:'C:/tmp/hipico',
  pollMs:1000,
  backoffBaseMs:1000,
  backoffMaxMs:60000,
  pdfSpoolMaxDocuments:50
};
const row={id:'MSG-1',pre:'[5:00 p. m., 13/9/2026] Turf Admin: ',text:'Programa',fromMe:false,hasMedia:true,mediaKind:'document',mediaName:'Programa.pdf'};
const snapshot={currentTitle:'CLUB HIPICO TRIPLE CROWN',groupIds:[config.sourceGroupId],rows:[row]};

function memorySpool(){
  const queued=[];return{
    queued,
    async queue(meta,pdf){queued.push({meta,pdf});return{duplicate:false,key:meta.externalMessageId};},
    async flush(deliver){for(const item of queued.splice(0)){await deliver({externalMessageId:item.meta.externalMessageId,filename:item.meta.filename,event:item.meta.event},item.pdf);}return{delivered:0,retried:0,quarantined:0};},
    async snapshot(){return{pending:queued.length,quarantined:0,maxPendingDocuments:50};}
  };
}

test('first document scan establishes a no-history baseline without downloading visible PDFs',async()=>{
  const subject=await loadSubject();assert.ok(subject,'document-runtime-hook module must exist');
  const spool=memorySpool();let downloads=0,saves=0;
  const controller=await subject.createDocumentAutomationController({config,spool,initialSeen:[],downloadPdf:async()=>{downloads+=1;return{pdf:Buffer.from('%PDF-1.4'),filename:'Programa.pdf'};},postPdf:async()=>({ok:true}),saveSeen:async()=>{saves+=1;}});
  const result=await controller.processSnapshot({},snapshot);
  assert.equal(result.baseline,true);assert.equal(downloads,0);assert.equal(controller.hasSeen('MSG-1'),true);assert.equal(saves,1);
});

test('after baseline a new PDF is downloaded, durably queued, then marked seen and delivered',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const spool=memorySpool();const order=[];
  const controller=await subject.createDocumentAutomationController({
    config,spool,initialSeen:['OLD'],
    downloadPdf:async()=>{order.push('download');return{pdf:Buffer.from('%PDF-1.4\n%%EOF'),filename:'Programa.pdf'};},
    postPdf:async(input)=>{order.push('post');assert.equal(input.event.externalMessageId,'MSG-1');return{ok:true};},
    saveSeen:async()=>order.push('seen-persisted')
  });
  const result=await controller.processSnapshot({},snapshot);
  assert.equal(result.queued,1);assert.equal(controller.hasSeen('MSG-1'),true);
  assert.deepEqual(order,['download','seen-persisted','post']);
});

test('unauthorized group snapshots never download or queue documents',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const spool=memorySpool();let downloads=0;
  const controller=await subject.createDocumentAutomationController({config,spool,initialSeen:['OLD'],downloadPdf:async()=>{downloads+=1;throw new Error('should not run');},postPdf:async()=>({ok:true}),saveSeen:async()=>{}});
  const result=await controller.processSnapshot({}, {...snapshot,currentTitle:'OTRO GRUPO'});
  assert.equal(result.authorized,false);assert.equal(downloads,0);assert.equal(spool.queued.length,0);
});

test('spool capacity is checked before browser download to avoid repeated large downloads',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const spool=memorySpool();spool.snapshot=async()=>({pending:50,quarantined:0,maxPendingDocuments:50});let downloads=0;
  const controller=await subject.createDocumentAutomationController({config,spool,initialSeen:['OLD'],downloadPdf:async()=>{downloads+=1;throw new Error('should not run');},postPdf:async()=>({ok:true}),saveSeen:async()=>{}});
  const result=await controller.processSnapshot({},snapshot);
  assert.equal(result.spoolFull,true);assert.equal(downloads,0);assert.equal(controller.hasSeen('MSG-1'),false);
});

test('hook upgrades only acceptDownloads and starts one monitor per persistent context',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  const calls=[];const fakeContext={pages:()=>[],on:()=>{}};
  const chromium={launchPersistentContext:async(profile,options)=>{calls.push({profile,options});return fakeContext;}};
  let timers=0;
  subject.installDocumentRuntimeHook(chromium,{config,createController:async()=>({processPage:async()=>{}}),setIntervalFn:()=>{timers+=1;return{unref(){}};},clearIntervalFn:()=>{}});
  const result=await chromium.launchPersistentContext('/profile',{headless:false,acceptDownloads:false,chromiumSandbox:true});
  assert.equal(result,fakeContext);assert.equal(calls.length,1);assert.equal(calls[0].options.acceptDownloads,true);assert.equal(calls[0].options.headless,false);assert.equal(calls[0].options.chromiumSandbox,true);assert.equal(timers,1);
});
