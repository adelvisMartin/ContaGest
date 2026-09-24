import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSourceReplyJournal} from '../src/source-reply-journal.mjs';

async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-source-reply-'));
  let now=Date.UTC(2026,8,24,12,0,0);
  const journal=createSourceReplyJournal({rootDir:root,now:()=>now});
  await journal.initialize();
  return{root,journal,advance:(ms)=>{now+=ms;}};
}

const command={
  commandId:'hsr_11111111-1111-4111-8111-111111111111',
  targetGroupId:'120363111111111111@g.us',
  text:'Próxima carrera: 1ª carrera.',
  sourceMessageId:'source-1',
  reason:'CANONICAL_READ_ONLY_QUERY',
  authority:{domainEffectsAllowed:false,financialAuthority:false,stateMutationAllowed:false}
};

test('source reply journal is idempotent and never accepts changed content for one command',async()=>{
  const f=await fixture();
  assert.equal((await f.journal.queue(command)).duplicate,false);
  assert.equal((await f.journal.queue({...command})).duplicate,true);
  await assert.rejects(()=>f.journal.queue({...command,text:'contenido distinto'}),/SOURCE_REPLY_REPLAY_MISMATCH/);
  await fs.rm(f.root,{recursive:true,force:true});
});

test('successful delivery is terminal and not delivered twice',async()=>{
  const f=await fixture();await f.journal.queue(command);let calls=0;
  const first=await f.journal.flush(async()=>{calls+=1;return{deliveryRef:'waweb-local-1'};});
  assert.equal(first.sent,1);assert.equal(calls,1);
  const second=await f.journal.flush(async()=>{calls+=1;});
  assert.equal(second.attempted,0);assert.equal(calls,1);
  assert.equal((await f.journal.read(command.commandId)).state,'sent');
  await fs.rm(f.root,{recursive:true,force:true});
});

test('unknown failure after send claim becomes ambiguous and is never blindly retried',async()=>{
  const f=await fixture();await f.journal.queue(command);
  const result=await f.journal.flush(async()=>{throw new Error('browser closed after Enter');});
  assert.equal(result.ambiguous,1);
  assert.equal((await f.journal.read(command.commandId)).state,'ambiguous');
  let calls=0;await f.journal.flush(async()=>{calls+=1;});assert.equal(calls,0);
  await fs.rm(f.root,{recursive:true,force:true});
});

test('known pre-send failure can retry autonomously',async()=>{
  const f=await fixture();await f.journal.queue(command);let attempt=0;
  let result=await f.journal.flush(async()=>{attempt+=1;const error=new Error('group not open');error.safeToRetry=true;throw error;});
  assert.equal(result.retryable,1);assert.equal((await f.journal.read(command.commandId)).state,'prepared');
  result=await f.journal.flush(async()=>{attempt+=1;return{deliveryRef:'waweb-local-2'};});
  assert.equal(result.sent,1);assert.equal(attempt,2);
  await fs.rm(f.root,{recursive:true,force:true});
});

test('restart converts an in-flight sending state to ambiguous instead of resending',async()=>{
  const f=await fixture();await f.journal.queue(command);
  const rows=await f.journal.prepared();
  const file=(await fs.readdir(f.root)).find((name)=>name.endsWith('.json'));
  const raw=JSON.parse(await fs.readFile(path.join(f.root,file),'utf8'));
  await fs.writeFile(path.join(f.root,file),JSON.stringify({...raw,state:'sending'}),'utf8');
  const restarted=createSourceReplyJournal({rootDir:f.root});
  const init=await restarted.initialize();
  assert.equal(init.recovered,1);assert.equal((await restarted.read(command.commandId)).state,'ambiguous');
  assert.equal(rows.length,1);
  await fs.rm(f.root,{recursive:true,force:true});
});


test('sent and ambiguous receipts remain pending until backend reconciliation is acknowledged',async()=>{
  const f=await fixture();
  await f.journal.queue(command);
  await f.journal.flush(async()=>({deliveryRef:'waweb-local-receipt'}));
  let pending=await f.journal.receiptPending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].state,'sent');
  await f.journal.markReceiptSynced(command.commandId);
  pending=await f.journal.receiptPending();
  assert.equal(pending.length,0);
  assert.ok((await f.journal.read(command.commandId)).receiptSyncedAt);
  await fs.rm(f.root,{recursive:true,force:true});
});
