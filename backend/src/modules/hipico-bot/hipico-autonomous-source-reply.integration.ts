import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { prisma } from '../../database/prisma.js';
import {
  ensureSourceReplyOutbox,
  getSourceReplyOutbox,
  recordSourceReplyDelivery,
  sourceReplyOutboxReady
} from './hipico-bridge-transport.store.js';

const { Client } = pg;
const databaseUrl=String(process.env.HIPICO_E2E_DATABASE_URL||'').trim();
let admin:pg.Client;

function requireIsolatedDatabase(){
  assert.ok(databaseUrl,'HIPICO_E2E_DATABASE_URL is required');
  assert.equal(String(process.env.DATABASE_URL||'').trim(),databaseUrl,'DATABASE_URL must equal the isolated E2E URL');
  const url=new URL(databaseUrl);
  const database=url.pathname.replace(/^\//,'');
  assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase()),'autonomous reply E2E database must be local/ephemeral');
  assert.match(database,/^hipico_autoreply_e2e_[a-z0-9_]{8,63}$/,'autonomous reply E2E database must be isolated per run');
}
requireIsolatedDatabase();

async function applyMigration(relative:string){
  const sql=await fs.readFile(path.resolve(process.cwd(),'prisma/migrations',relative,'migration.sql'),'utf8');
  await admin.query(sql);
}

before(async()=>{
  admin=new Client({connectionString:databaseUrl});
  await admin.connect();
  await applyMigration('0014_v1126_hipico_bot');
  await applyMigration('0016_hipico_bot_group_outbox_idempotency');
  await applyMigration('20260924142000_hipico_autonomous_source_reply_v15');
});

after(async()=>{
  try{await prisma.$disconnect();}catch{}
  if(admin)await admin.end();
});

async function seedEvent(id:string,providerMessageId:string){
  await admin.query(`
    INSERT INTO public."HipicoWebhookEvent"
      ("id","providerMessageId","messageType","intent","risk","status","confidence","payload")
    VALUES($1,$2,'chat','query:NEXT_RACE','safe','classified',0.995,'{}'::jsonb)
  `,[id,providerMessageId]);
}

test('source-reply schema readiness requires the dedicated idempotency index',async()=>{
  assert.equal(await sourceReplyOutboxReady(),true);
  await admin.query('DROP INDEX public."HipicoBotOutbox_source_reply_event_unique"');
  assert.equal(await sourceReplyOutboxReady(),false);
  await applyMigration('20260924142000_hipico_autonomous_source_reply_v15');
  assert.equal(await sourceReplyOutboxReady(),true);
});

test('one transport event produces one immutable source reply command',async()=>{
  await seedEvent('hwe-auto-1','waweb:auto-1');
  const input={
    eventId:'hwe-auto-1',
    recipient:'120363111111111111@g.us',
    message:'Próxima carrera: 1ª carrera · Primera.',
    intent:'query:NEXT_RACE',
    risk:'safe'
  };
  const first=await ensureSourceReplyOutbox(input);
  assert.equal(first.inserted,true);
  assert.match(first.row.id,/^hsr_[0-9a-f-]{36}$/i);
  assert.equal(first.row.status,'planned');

  const replay=await ensureSourceReplyOutbox({...input});
  assert.equal(replay.inserted,false);
  assert.equal(replay.row.id,first.row.id);

  await assert.rejects(
    ensureSourceReplyOutbox({...input,message:'texto cambiado'}),
    (error:any)=>error?.code==='HIPICO_SOURCE_REPLY_REPLAY_MISMATCH'
  );

  const count=await admin.query(
    'select count(*)::int as count from public."HipicoBotOutbox" where "eventId"=$1 and "targetType"=\'source_reply\'',
    [input.eventId]
  );
  assert.equal(count.rows[0].count,1);
});

test('delivery reconciliation is monotonic: sent is terminal while ambiguous never becomes an automatic resend command',async()=>{
  await seedEvent('hwe-auto-2','waweb:auto-2');
  const created=await ensureSourceReplyOutbox({
    eventId:'hwe-auto-2',
    recipient:'120363111111111111@g.us',
    message:'Necesito que indiques la carrera exacta para responder sin adivinar.',
    intent:'query:RACE_STATUS',
    risk:'safe'
  });

  const ambiguous=await recordSourceReplyDelivery({
    id:created.row.id,
    status:'ambiguous',
    error:'PROCESS_RESTART_DURING_SEND'
  });
  assert.equal(ambiguous.status,'ambiguous');
  assert.equal((await getSourceReplyOutbox('hwe-auto-2'))?.status,'ambiguous');

  const sent=await recordSourceReplyDelivery({
    id:created.row.id,
    status:'sent',
    providerMessageId:'waweb-local:test-2'
  });
  assert.equal(sent.status,'sent');
  assert.ok(sent.sentAt);
  const duplicate=await recordSourceReplyDelivery({
    id:created.row.id,
    status:'sent',
    providerMessageId:'waweb-local:test-2'
  });
  assert.equal(duplicate.duplicate,true);

  await assert.rejects(
    recordSourceReplyDelivery({id:created.row.id,status:'ambiguous',error:'late ambiguity'}),
    (error:any)=>error?.code==='HIPICO_SOURCE_REPLY_TERMINAL'
  );
});
