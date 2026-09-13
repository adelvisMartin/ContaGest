import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentAutomationController } from '../tools/hipico-whatsapp-web-bridge/src/document-runtime-hook.mjs';
import { buildBridgeDocumentHeaders } from '../tools/hipico-whatsapp-web-bridge/src/document-media.mjs';

function mulberry32(seed){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const random=mulberry32(0x285305);
const config={
  pdfAutoIngestEnabled:true,
  documentIngestUrl:'https://hipico.example.test/api/v1/hipico-bot/bridge/documents',
  documentBackendTimeoutMs:15000,
  token:'b'.repeat(64),
  sourceMatches:['CLUB HIPICO TRIPLE CROWN'],
  sourceGroupId:'120363111111111111@g.us',
  sourceChannelKey:'club-hipico-triple-crown-official',
  labChannelKey:'control-hipico-lab',
  dataDir:'/tmp/not-used',pollMs:1000,backoffBaseMs:1000,backoffMaxMs:60000,pdfSpoolMaxDocuments:50
};
const snapshotBase={currentTitle:'CLUB HIPICO TRIPLE CROWN',groupIds:[config.sourceGroupId]};

function memorySpool(){
  const queue=[];
  return{
    async queue(meta,pdf){queue.push({meta,pdf});return{duplicate:false,key:meta.externalMessageId};},
    async snapshot(){return{pending:queue.length,quarantined:0,maxPendingDocuments:50};},
    async flush(deliver){let delivered=0;while(queue.length){const item=queue.shift();await deliver({externalMessageId:item.meta.externalMessageId,filename:item.meta.filename,event:item.meta.event},item.pdf);delivered+=1;}return{delivered,retried:0,quarantined:0};}
  };
}

void test('2000 deterministic WhatsApp PDF events preserve SOURCE isolation, provenance and zero financial authority',async()=>{
  const spool=memorySpool();const delivered=[];let downloadCount=0,seenWrites=0;
  const controller=await createDocumentAutomationController({
    config,spool,initialSeen:['baseline-complete'],
    downloadPdf:async(_page,row)=>{downloadCount+=1;return{pdf:Buffer.from(`%PDF-1.4\n% ${row.id}\n%%EOF\n`),filename:row.mediaName};},
    postPdf:async({event,filename,pdf})=>{
      const headers=buildBridgeDocumentHeaders(event,filename,config.token);
      assert.equal(event.groupId,config.sourceGroupId);
      assert.equal(event.channelKey,config.sourceChannelKey);
      assert.equal(event.labChannelKey,config.labChannelKey);
      assert.equal(event.channelRole,'source');
      assert.equal(event.shadowMode,true);
      assert.equal(event.historySync,false);
      assert.equal(headers['x-hipico-group-id'],config.sourceGroupId);
      assert.equal(headers['x-hipico-document-authority'],undefined);
      assert.equal(headers['x-hipico-owner-id'],undefined);
      assert.equal(headers.recipient,undefined);
      assert.equal(event.financialAuthority,undefined);
      assert.equal(event.settlementApplied,undefined);
      assert.ok(pdf.subarray(0,5).equals(Buffer.from('%PDF-')));
      delivered.push(event.externalMessageId);
      return{ok:true,data:{financialAuthority:false}};
    },
    saveSeen:async()=>{seenWrites+=1;}
  });

  let sequence=0;
  for(let batch=0;batch<50;batch+=1){
    const rows=[];
    for(let i=0;i<40;i+=1){
      const id=`pdf-${String(sequence).padStart(4,'0')}-${Math.floor(random()*1e9)}`;
      const horse=1+Math.floor(random()*12);
      rows.push({
        id,
        pre:`[${1+(i%12)}:0${i%6} p. m., 13/9/2026] Participante ${i}: `,
        text:`Programa carrera ${1+(i%10)} caballo ${horse}`,
        fromMe:false,hasMedia:true,mediaKind:'document',mediaName:`Programa-${batch}-${i}.pdf`
      });
      sequence+=1;
    }
    const result=await controller.processSnapshot({}, {...snapshotBase,rows});
    assert.equal(result.authorized,true);assert.equal(result.queued,40);assert.equal(result.delivery.delivered,40);
    const replay=await controller.processSnapshot({}, {...snapshotBase,rows});
    assert.equal(replay.queued,0,'same-message replay must have zero duplicate side effects');
  }

  assert.equal(sequence,2000);assert.equal(downloadCount,2000);assert.equal(delivered.length,2000);assert.equal(new Set(delivered).size,2000);assert.equal(seenWrites,2000);

  const before=delivered.length;
  const foreign={...snapshotBase,currentTitle:'OTRO GRUPO',groupIds:['120363999999999999@g.us'],rows:[{id:'foreign-pdf',pre:'',text:'',fromMe:false,hasMedia:true,mediaKind:'document',mediaName:'foreign.pdf'}]};
  const rejected=await controller.processSnapshot({},foreign);
  assert.equal(rejected.authorized,false);assert.equal(delivered.length,before,'foreign group must never reach document backend');
});
