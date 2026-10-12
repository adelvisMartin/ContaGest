import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { before, after, test } from 'node:test';
import crypto from 'node:crypto';
import pg from 'pg';
import { prisma } from '../../database/prisma.js';
import { reconcileCanonicalLabReceipt } from './hipico-lab-canonical-receipt.js';
import { readResponseReceiptForRecovery } from './hipico-handoff.store.js';

const {Client}=pg;
const databaseUrl=String(process.env.HIPICO_E2E_DATABASE_URL||'').trim();
const officialDb=String(process.env.DATABASE_URL||'').trim();
function enforceEphemeral(){
  assert.ok(databaseUrl,'HIPICO_E2E_DATABASE_URL is required');
  assert.equal(officialDb,databaseUrl,'DATABASE_URL must match isolated test DB');
  const url=new URL(databaseUrl);
  assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase()),'Postgres must be loopback');
  assert.match(url.pathname.replace(/^\//,''),/^hipico_autoreply_e2e_[a-z0-9_]{8,63}$/,'Never use a shared/production database');
}
enforceEphemeral();
let admin:pg.Client;
const stamp=Date.now();
const suffix=crypto.randomBytes(8).toString('hex');
const base={
  ownerId:'11111111-1111-4111-8111-111111111111',
  sourceGroupKey:'club-hipico-triple-crown-official',
  labGroupId:'120363222222222222@g.us',labChannelKey:'control-hipico-lab',
  senderId:'123456789012',externalMessageId:'pg-fault-'+suffix,
  purpose:'status' as const,timestamp:new Date(stamp-2000).toISOString(),
  nowMs:stamp,humanOwned:false,
  canonical:{
    available:true,reason:'CANONICAL_STATE_FOUND',
    text:'Estado de carrera interno abierto (sin confirmación externa).',
    state:'OPEN',version:4,updatedAt:new Date(stamp-10_000).toISOString()
  }
};

before(async()=>{
  admin=new Client({connectionString:databaseUrl});
  await admin.connect();
  const sql=await fs.readFile(path.resolve(process.cwd(),
    'prisma/migrations/20260829214500_hipico_response_handoff/migration.sql'),'utf8');
  await admin.query(sql);
});
after(async()=>{try{await prisma.$disconnect();}finally{if(admin)await admin.end();}});

async function receiptsFor(messageId:string){
  const rows=await admin.query(
    'SELECT "id","idempotencyKey","responseHash","decisionVersion","status" FROM public."HipicoResponseReceipt" WHERE "sourceMessageId" LIKE $1',
    ['labq_%']
  );
  const key=crypto.createHash('sha256').update([
    'hipico-lab-canonical-receipt-v1',base.ownerId,base.sourceGroupKey,
    base.labGroupId,base.labChannelKey,base.senderId,messageId
  ].join('\0')).digest('hex').slice(0,32);
  return rows.rows.filter((row:Record<string,unknown>)=>row.idempotencyKey==='resp_'+key);
}

test('real PostgreSQL: committed reply survives HTTP loss with exactly one immutable receipt',async()=>{
  const input={...base,externalMessageId:'committed-'+suffix};
  const simulateNetworkResponseLoss=async()=>{
    const result=await reconcileCanonicalLabReceipt(input);
    assert.equal(result.available,true);
    // Deliberate fault AFTER database has durably committed, BEFORE HTTP client sees payload.
    throw new Error('INJECTED_TCP_CONNECTION_LOST_AFTER_COMMIT');
  };
  await assert.rejects(simulateNetworkResponseLoss(),/INJECTED_TCP_CONNECTION_LOST_AFTER_COMMIT/);
  const beforeRows=await receiptsFor(input.externalMessageId);
  assert.equal(beforeRows.length,1);
  assert.equal(beforeRows[0].status,'planned');
  assert.match(beforeRows[0].responseHash,/^[a-f0-9]{64}$/);
  assert.match(beforeRows[0].decisionVersion,/^lab-canonical-v1-/);
  const replay=await reconcileCanonicalLabReceipt(input);
  assert.equal(replay.available,true);
  assert.equal(replay.reason,'LAB_CANONICAL_RECOVERED');
  assert.equal((replay as any).recovery.receiptId,beforeRows[0].id);
  const afterRows=await receiptsFor(input.externalMessageId);
  assert.deepEqual(afterRows,beforeRows);
  const persisted=await readResponseReceiptForRecovery(String(beforeRows[0].idempotencyKey));
  assert.equal(persisted?.responseHash,beforeRows[0].responseHash);
  assert.equal(JSON.stringify(persisted).includes(base.canonical.text),false);
});

test('real PostgreSQL: transaction ROLLBACK leaves no receipt and permits safe new attempt',async()=>{
  const input={...base,externalMessageId:'rolledback-'+suffix};
  const key='resp_'+crypto.createHash('sha256').update([
    'hipico-lab-canonical-receipt-v1',input.ownerId,input.sourceGroupKey,
    input.labGroupId,input.labChannelKey,input.senderId,input.externalMessageId
  ].join('\0')).digest('hex').slice(0,32);
  await admin.query('BEGIN');
  try{
    await admin.query([
      'INSERT INTO public."HipicoResponseReceipt"',
      '("id","idempotencyKey","sourceMessageId","decisionVersion","correlationId","intent","responseHash","status")',
      "VALUES($1,$2,'injected-partial','injected-policy','injected-correlation','ACK_RECEIVED',$3,'planned')"
    ].join(' '),[
      crypto.randomUUID(),key,crypto.createHash('sha256').update('wrong partial text').digest('hex')
    ]);
    const inTransaction=await admin.query('SELECT count(*)::int AS count FROM public."HipicoResponseReceipt" WHERE "idempotencyKey"=$1',[key]);
    assert.equal(inTransaction.rows[0].count,1);
  }finally{await admin.query('ROLLBACK');}
  assert.equal((await receiptsFor(input.externalMessageId)).length,0);
  const result=await reconcileCanonicalLabReceipt(input);
  assert.equal(result.available,true);
  assert.equal((await receiptsFor(input.externalMessageId)).length,1);
});

test('real PostgreSQL: version change and output change reject reuse without UPDATE',async()=>{
  const input={...base,externalMessageId:'corrected-'+suffix};
  const saved=await reconcileCanonicalLabReceipt(input);
  assert.equal(saved.available,true);
  const beforeRows=await receiptsFor(input.externalMessageId);
  for(const canonical of [
    {...input.canonical,version:5,state:'CLOSED'},
    {...input.canonical,text:'Un dato corregido que no debe salir.'},
    {...input.canonical,updatedAt:new Date(stamp).toISOString()}
  ]){
    const output=await reconcileCanonicalLabReceipt({...input,canonical});
    assert.equal(output.available,false);
    assert.equal(output.reason,'LAB_CANONICAL_REVISION_CHANGED');
    assert.doesNotMatch(output.text,/dato corregido/i);
  }
  assert.deepEqual(await receiptsFor(input.externalMessageId),beforeRows);
});

test('real PostgreSQL: two concurrent same-identity requests keep one immutable row',async()=>{
  const input={...base,externalMessageId:'concurrent-'+suffix};
  const [first,second]=await Promise.all([
    reconcileCanonicalLabReceipt(input),reconcileCanonicalLabReceipt(input)
  ]);
  assert.equal(first.available,true);
  assert.equal(second.available,true);
  assert.equal((await receiptsFor(input.externalMessageId)).length,1);
});

test('real PostgreSQL: incompatible status, stale query and human takeover fail closed',async()=>{
  const input={...base,externalMessageId:'held-'+suffix};
  assert.equal((await reconcileCanonicalLabReceipt({...input,humanOwned:true})).available,false);
  assert.equal((await reconcileCanonicalLabReceipt({...input,timestamp:new Date(stamp-91_000).toISOString()})).available,false);
  assert.equal((await receiptsFor(input.externalMessageId)).length,0);
  await reconcileCanonicalLabReceipt(input);
  const [row]=await receiptsFor(input.externalMessageId);
  await admin.query('UPDATE public."HipicoResponseReceipt" SET "status"=$2 WHERE "idempotencyKey"=$1',[row.idempotencyKey,'ambiguous']);
  const recovered=await reconcileCanonicalLabReceipt(input);
  assert.equal(recovered.available,false);
  assert.equal(recovered.reason,'LAB_CANONICAL_REVISION_CHANGED');
  assert.equal((await receiptsFor(input.externalMessageId))[0].status,'ambiguous');
});
