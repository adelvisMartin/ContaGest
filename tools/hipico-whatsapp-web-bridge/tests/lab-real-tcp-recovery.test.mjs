import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {queryCanonicalLab} from '../src/lab-canonical-query.mjs';
import {createLabTestReplyJournal} from '../src/lab-test-reply-journal.mjs';

const LAB='120363222222222222@g.us';
const SOURCE='120363111111111111@g.us';
const input={
  token:'local-fixture-token-never-log',
  labGroupId:LAB,labChannelKey:'control-hipico-lab',
  messageId:'false_'+LAB+'_network-fault_123456789012@lid',
  senderId:'123456789012@lid',text:'¿Cuál es el estado de la carrera?',
  purpose:'status',timestamp:'2026-10-12T20:00:00.000Z',
  race:{raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'},
  timeoutMs:1500
};
const safeResponse={
  ok:true,mode:'shadow',status:'CANONICAL_STATE_FOUND',
  text:'Estado interno de carrera: ABIERTA. No es confirmación externa.',
  authority:{
    sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false
  }
};

async function withLoopbackServer(onRequest,fn){
  const server=http.createServer((request,response)=>{
    Promise.resolve(onRequest(request,response)).catch(()=>response.destroy());
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const ingestUrl='http://127.0.0.1:'+address.port+'/api/v1/hipico-bot/bridge/events';
  try{return await fn(ingestUrl);}
  finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
}

async function readPayload(req){
  let raw='';
  for await(const part of req){
    raw+=part.toString('utf8');
    if(raw.length>4096)throw new Error('INVALID_TEST_REQUEST_SIZE');
  }
  assert.equal(req.method,'POST');
  assert.equal(req.url,'/api/v1/hipico-bot/bridge/lab/query');
  assert.equal(req.headers['x-hipico-bridge-token'],input.token);
  assert.match(String(req.headers['content-type']),/application\/json/);
  const body=JSON.parse(raw);
  assert.equal(body.groupId,LAB);
  assert.equal(body.channelRole,'lab');
  assert.equal(body.shadowMode,true);
  assert.equal(body.purpose,'status');
  return {raw,body};
}

test('real TCP FIN/RST after backend commit: same request and scope retries once; no second receipt',async()=>{
  const received=[];
  let receipt=null;
  await withLoopbackServer(async(req,res)=>{
    const packet=await readPayload(req);
    received.push(packet);
    const fingerprint=crypto.createHash('sha256').update(packet.raw).digest('hex');
    if(receipt!==null)assert.equal(receipt,fingerprint,'immutable response receipt changed');
    else receipt=fingerprint; // simulate commit before transport closes
    if(received.length===1){
      req.socket.destroy(); // real TCP connection dropped, no HTTP response
      return;
    }
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(safeResponse));
  },async(ingestUrl)=>{
    const result=await queryCanonicalLab({...input,ingestUrl});
    assert.equal(result.available,true);
    assert.equal(result.reason,'CANONICAL_STATE_FOUND');
    assert.equal(result.text,safeResponse.text);
  });
  assert.equal(received.length,2);
  assert.equal(received[0].raw,received[1].raw);
  assert.equal(received[0].body.externalMessageId,input.messageId);
  assert.equal(received[1].body.externalMessageId,input.messageId);
  assert.match(receipt,/^[a-f0-9]{64}$/);
});

test('two actual socket drops are bounded to two POSTs and fail closed',async()=>{
  let connections=0;
  await withLoopbackServer(async(req,_res)=>{
    await readPayload(req);
    connections++;
    req.socket.destroy();
  },async(ingestUrl)=>{
    const result=await queryCanonicalLab({...input,ingestUrl});
    assert.deepEqual(result,{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'});
  });
  assert.equal(connections,2);
});

test('partial JSON response lost mid-body cannot authorize a canonical answer',async()=>{
  let calls=0;
  await withLoopbackServer(async(req,res)=>{
    await readPayload(req);
    calls++;
    if(calls===1){
      res.writeHead(200,{'Content-Type':'application/json','Content-Length':'9999'});
      res.write('{"ok":true,"mode":"shadow","status":"CANO');
      res.socket?.destroy(); // transfer incomplete; fetch .text() must fail
      return;
    }
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify(safeResponse));
  },async(ingestUrl)=>{
    const result=await queryCanonicalLab({...input,ingestUrl});
    assert.equal(result.available,true);
    assert.equal(result.text,safeResponse.text);
  });
  assert.equal(calls,2);
});

test('HTTP 503 and redirects never retry credentials to a different destination',async()=>{
  for(const [status,headers] of [
    [503,{'Content-Type':'application/json'}],
    [302,{'Location':'https://attacker.example/steal-token'}]
  ]){
    let calls=0;
    await withLoopbackServer(async(req,res)=>{
      await readPayload(req);
      calls++;
      res.writeHead(status,headers);
      res.end(status===503?'{"error":"backend-down"}':'');
    },async(ingestUrl)=>{
      const result=await queryCanonicalLab({...input,ingestUrl});
      assert.equal(result.available,false);
      assert.equal(result.reason,'LAB_CANONICAL_UNAVAILABLE');
    });
    assert.equal(calls,1);
  }
});

test('real connection loss happens before LAB send journal is prepared; ambiguous Enter survives restart',async()=>{
  let requests=0;
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-tcp-wal-'));
  try{
    const rootDir=path.join(dir,'lab-ack');
    const make=()=>createLabTestReplyJournal({rootDir,labGroupId:LAB,sourceGroupId:SOURCE});
    const journal=make();
    await journal.initialize();
    const id=input.messageId;
    assert.equal(await journal.read(id),null);
    await withLoopbackServer(async(req,res)=>{
      await readPayload(req);
      requests++;
      if(requests===1){req.socket.destroy();return;}
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify(safeResponse));
    },async(ingestUrl)=>{
      const canonical=await queryCanonicalLab({...input,ingestUrl});
      assert.equal(canonical.available,true);
      assert.equal(await journal.read(id),null,'no WhatsApp intent before HTTP recovery');
      await journal.prepare(id);
      assert.equal((await journal.begin(id)).state,'sending');
      // Simulate a process crash after Enter intent but before visible tag.
    });
    const restarted=make();
    assert.equal((await restarted.initialize()).recovered,1);
    assert.equal((await restarted.read(id)).state,'ambiguous');
    const reread=await restarted.prepare(id);
    assert.equal(reread.created,false);
    assert.equal(reread.record.state,'ambiguous');
    await assert.rejects(()=>restarted.begin(id),/LAB_TEST_JOURNAL_STATE_CONFLICT/);
    await assert.rejects(()=>restarted.confirm(id),/LAB_TEST_VISIBLE_TAG_REQUIRED/);
    assert.equal((await restarted.confirm(id,{visibleTag:true})).state,'confirmed');
    assert.equal((await make().read(id)).state,'confirmed');
    assert.equal(requests,2,'no backend retry triggered by confirming an ambiguous send');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('transport integrity contract preserves one canonical query before journal and never retries Enter',async()=>{
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const a=source.indexOf('async function processLabTestInput()');
  const b=source.indexOf('async function visibleLabHasTag(tag)',a);
  const section=source.slice(a,b);
  assert.ok(a>=0&&b>a);
  const query=section.indexOf('await queryCanonicalLab({');
  const prepare=section.indexOf('await labTestReplyJournal.prepare(row.id)');
  const begin=section.indexOf('await labTestReplyJournal.begin(row.id)');
  const send=section.indexOf('await sendTextInCurrentLab(');
  const confirm=section.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',send);
  assert.ok(query>0&&prepare>query&&begin>prepare&&send>begin&&confirm>send);
  assert.match(section,/journalRecord\?\.state === 'ambiguous'/);
  assert.match(section,/visibleLabHasTag\(tag\)/);
  assert.doesNotMatch(section,/sendTextInCurrentSource\(/);
});


test('independent Node process restart quarantines persisted sending before any new Enter',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-real-restart-'));
  try{
    const rootDir=path.join(dir,'ack');
    const id='false_'+LAB+'_child-restart_123456789012@lid';
    const original=createLabTestReplyJournal({rootDir,labGroupId:LAB,sourceGroupId:SOURCE});
    await original.initialize();
    await original.prepare(id);
    await original.begin(id);
    const moduleFile=fileURLToPath(new URL('../src/lab-test-reply-journal.mjs',import.meta.url));
    const code=[
      "import {pathToFileURL} from 'node:url';",
      'const args=process.argv.slice(1);',
      'const {createLabTestReplyJournal}=await import(pathToFileURL(args[0]).href);',
      'const journal=createLabTestReplyJournal({rootDir:args[1],labGroupId:args[2],sourceGroupId:args[3]});',
      'const init=await journal.initialize();',
      'const row=await journal.read(args[4]);',
      'let replayBlocked=false;',
      'try { await journal.begin(args[4]); }',
      "catch(error){replayBlocked=error.message==='LAB_TEST_JOURNAL_STATE_CONFLICT';}",
      'process.stdout.write(JSON.stringify({recovered:init.recovered,state:row.state,replayBlocked}));'
    ].join('\n');
    const run=promisify(execFile);
    const result=await run(process.execPath,[
      '--input-type=module','-e',code,moduleFile,rootDir,LAB,SOURCE,id
    ],{timeout:10_000,maxBuffer:16_384});
    assert.deepEqual(JSON.parse(result.stdout),{
      recovered:1,state:'ambiguous',replayBlocked:true
    });
    assert.equal((await createLabTestReplyJournal({
      rootDir,labGroupId:LAB,sourceGroupId:SOURCE
    }).read(id)).state,'ambiguous');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
