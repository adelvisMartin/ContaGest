import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { before, after, test } from 'node:test';
import crypto from 'node:crypto';
import pg from 'pg';
import { prisma } from '../../database/prisma.js';
import { reconcileCanonicalLabReceipt } from './hipico-lab-canonical-receipt.js';
import { readResponseReceiptForRecovery } from './hipico-handoff.store.js';
import { readScopedLabSchedule } from './hipico-lab-schedule-read.js';

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
  // Minimal lifecycle fixture tables in the GUARDED ephemeral database only.
  // We do not mutate or seed any real tenant/race data.
  await admin.query(`
    CREATE TABLE IF NOT EXISTS public.hipico_meetings(
      id UUID PRIMARY KEY,owner_id UUID NOT NULL,group_key TEXT NOT NULL,
      name TEXT NOT NULL,meeting_date DATE,venue TEXT,external_ref TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS public.hipico_races(
      id UUID PRIMARY KEY,owner_id UUID NOT NULL,group_key TEXT NOT NULL,
      meeting_id UUID NOT NULL REFERENCES public.hipico_meetings(id),
      race_number INTEGER NOT NULL,state TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ,
      state_version INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
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


test('real PostgreSQL: editing a non-displayed race invalidates a previously committed NEXT reply',async()=>{
  const meeting=crypto.randomUUID(),first=crypto.randomUUID(),second=crypto.randomUUID();
  const today=new Date(stamp).toISOString().slice(0,10);
  const clock=stamp;
  await admin.query(`
    INSERT INTO public.hipico_meetings(id,owner_id,group_key,name,meeting_date,venue)
    VALUES($1,$2,$3,'Fixture LAB', $4::date,'La Rinconada')
  `,[meeting,base.ownerId,base.sourceGroupKey,today]);
  await admin.query(`
    INSERT INTO public.hipico_races
      (id,owner_id,group_key,meeting_id,race_number,state,scheduled_at,state_version,updated_at)
    VALUES ($1,$3,$4,$5,1,'ANNOUNCED',$6,1,$8),
           ($2,$3,$4,$5,2,'ANNOUNCED',$7,1,$8)
  `,[first,second,base.ownerId,base.sourceGroupKey,meeting,
    new Date(clock+3_600_000),new Date(clock+7_200_000),new Date(clock-1_000)]);
  const text='¿Cuál es la próxima carrera en la reunión del '+today+' en La Rinconada?';
  const args={ownerId:base.ownerId,groupKey:base.sourceGroupKey,
    purpose:'next' as const,text};
  const initial=await readScopedLabSchedule(args,undefined,clock);
  assert.equal(initial.available,true);
  assert.equal(initial.reason,'CANONICAL_NEXT_RACE');
  assert.match(initial.text,/número 1/);
  assert.match(initial.revisionToken,/^[a-f0-9]{64}$/);
  const input={...base,externalMessageId:'pg-next-'+suffix,purpose:'next' as const,canonical:initial};
  assert.equal((await reconcileCanonicalLabReceipt(input)).available,true);
  const before=await receiptsFor(input.externalMessageId);
  assert.equal(before.length,1);
  const recovered=await reconcileCanonicalLabReceipt(input);
  assert.equal(recovered.reason,'LAB_CANONICAL_RECOVERED');
  // Operator changed a DIFFERENT race. Displayed 'next' text stays identical.
  await admin.query(`
    UPDATE public.hipico_races SET state_version=state_version+1,updated_at=now()
    WHERE id=$1 AND owner_id=$2 AND group_key=$3
  `,[second,base.ownerId,base.sourceGroupKey]);
  const changed=await readScopedLabSchedule(args,undefined,clock);
  assert.equal(changed.available,true);
  assert.equal(changed.text,initial.text);
  assert.notEqual(changed.revisionToken,initial.revisionToken);
  const blocked=await reconcileCanonicalLabReceipt({...input,canonical:changed});
  assert.equal(blocked.available,false);
  assert.equal(blocked.reason,'LAB_CANONICAL_REVISION_CHANGED');
  assert.deepEqual(await receiptsFor(input.externalMessageId),before);
});

test('real PostgreSQL: adding a scheduled race invalidates the old program but permits a NEW message',async()=>{
  const meeting=crypto.randomUUID(),id1=crypto.randomUUID(),id2=crypto.randomUUID();
  const date=new Date(stamp).toISOString().slice(0,10),clock=stamp;
  await admin.query(`
    INSERT INTO public.hipico_meetings(id,owner_id,group_key,name,meeting_date,venue)
    VALUES($1,$2,$3,'Fixture programación',$4::date,'La Rinconada')
  `,[meeting,base.ownerId,base.sourceGroupKey,date]);
  await admin.query(`
    INSERT INTO public.hipico_races(id,owner_id,group_key,meeting_id,race_number,state,scheduled_at,state_version)
    VALUES($1,$2,$3,$4,1,'ANNOUNCED',$5,1)
  `,[id1,base.ownerId,base.sourceGroupKey,meeting,new Date(clock+3_600_000)]);
  const args={ownerId:base.ownerId,groupKey:base.sourceGroupKey,
    purpose:'schedule' as const,text:'¿Cuál es la cartelera de la reunión del '+date+' en La Rinconada?'};
  // Same date/venue can match other test fixture, so isolate via a unique venue
  // when selecting this meeting, while retaining the tenant and group constraints.
  await admin.query('UPDATE public.hipico_meetings SET venue=$2 WHERE id=$1',[meeting,'Hipódromo Fixture Dos']);
  args.text='¿Cuál es la cartelera de la reunión del '+date+' en el hipódromo Hipódromo Fixture Dos?';
  const firstAnswer=await readScopedLabSchedule(args,undefined,clock);
  assert.equal(firstAnswer.available,true);
  const input={...base,externalMessageId:'pg-schedule-'+suffix,
    purpose:'schedule' as const,canonical:firstAnswer};
  await reconcileCanonicalLabReceipt(input);
  await admin.query(`
    INSERT INTO public.hipico_races(id,owner_id,group_key,meeting_id,race_number,state,scheduled_at,state_version)
    VALUES($1,$2,$3,$4,2,'ANNOUNCED',$5,1)
  `,[id2,base.ownerId,base.sourceGroupKey,meeting,new Date(clock+7_200_000)]);
  const secondAnswer=await readScopedLabSchedule(args,undefined,clock);
  assert.equal(secondAnswer.available,true);
  assert.notEqual(secondAnswer.revisionToken,firstAnswer.revisionToken);
  assert.match(secondAnswer.text,/Carrera 2:/);
  const blocked=await reconcileCanonicalLabReceipt({...input,canonical:secondAnswer});
  assert.equal(blocked.reason,'LAB_CANONICAL_REVISION_CHANGED');
  const fresh=await reconcileCanonicalLabReceipt({
    ...input,externalMessageId:'pg-schedule-new-'+suffix,canonical:secondAnswer
  });
  assert.equal(fresh.available,true);
  assert.equal((await receiptsFor(input.externalMessageId)).length,1);
  assert.equal((await receiptsFor('pg-schedule-new-'+suffix)).length,1);
});
