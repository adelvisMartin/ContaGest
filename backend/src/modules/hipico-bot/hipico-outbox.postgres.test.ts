import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../database/prisma.js';
import {
  canonicalOutboxReadiness,
  claimCanonicalOutbound,
  enqueueCanonicalOutbound,
  markCanonicalAccepted,
  markCanonicalFailed,
  markCanonicalReconciliationRequired,
  recordCanonicalReceipt
} from './hipico-outbox.store.js';

const enabled=Boolean(process.env.HIPICO_TEST_POSTGRES_URL);
const ownerId='11111111-1111-4111-8111-111111111111';
const runId=randomUUID();
const groupKey=`postgres-contract:${runId}`;

function input(key:string,overrides:Record<string,unknown>={}){
  return{
    ownerId,
    groupKey,
    destination:'584121234567',
    idempotencyKey:`pg-contract:${runId}:${key}`,
    replyType:'test',
    payload:{text:'PostgreSQL contract',approvalRequired:false},
    ...overrides
  } as any;
}

test('postgres outbox: migration is ready and idempotency is semantic',{skip:!enabled},async()=>{
  assert.deepEqual(await canonicalOutboxReadiness(),{ready:true,outboxReady:true,receiptsReady:true});
  const first=await enqueueCanonicalOutbound(input('idem'));
  const replay=await enqueueCanonicalOutbound(input('idem'));
  assert.equal(first.inserted,true);
  assert.equal(replay.inserted,false);
  assert.equal(String(first.row.id),String(replay.row.id));
  await assert.rejects(
    ()=>enqueueCanonicalOutbound(input('idem',{payload:{text:'different',approvalRequired:false}})),
    (error:any)=>error?.code==='HIPICO_OUTBOUND_IDEMPOTENCY_MISMATCH'
  );
});

test('postgres outbox: concurrent claim has one winner and reconciliation blocks reclaim',{skip:!enabled},async()=>{
  const queued=await enqueueCanonicalOutbound(input('concurrency'));
  const [a,b]=await Promise.all([
    claimCanonicalOutbound({ownerId,id:String(queued.row.id),leaseMs:30_000}),
    claimCanonicalOutbound({ownerId,id:String(queued.row.id),leaseMs:30_000})
  ]);
  const winners=[a,b].filter(Boolean);
  assert.equal(winners.length,1);
  assert.equal(String(winners[0].status),'sending');
  const reconciled=await markCanonicalReconciliationRequired({
    ownerId,
    id:String(winners[0].id),
    leaseToken:String(winners[0].lease_token),
    error:'Ambiguous provider acceptance during integration test.',
    errorCode:'HIPICO_CLOUD_DELIVERY_AMBIGUOUS'
  });
  assert.equal(String(reconciled?.status),'reconciliation_required');
  assert.equal(await claimCanonicalOutbound({ownerId,id:String(queued.row.id)}),null);
});

test('postgres outbox: approval-required rows need explicit approval claim',{skip:!enabled},async()=>{
  const queued=await enqueueCanonicalOutbound(input('approval',{payload:{text:'needs operator',approvalRequired:true}}));
  assert.equal(await claimCanonicalOutbound({ownerId,id:String(queued.row.id)}),null);
  const approved=await claimCanonicalOutbound({ownerId,id:String(queued.row.id),allowApprovalRequired:true});
  assert.ok(approved);
  assert.equal(String(approved.status),'sending');
  const failed=await markCanonicalFailed({
    ownerId,
    id:String(approved.id),
    leaseToken:String(approved.lease_token),
    error:'Intentional terminal cleanup.',
    errorCode:'TEST_CLEANUP'
  });
  assert.equal(String(failed?.status),'failed');
});

test('postgres outbox: provider receipts are idempotent and monotonic',{skip:!enabled},async()=>{
  const queued=await enqueueCanonicalOutbound(input('receipts'));
  const claimed=await claimCanonicalOutbound({ownerId,id:String(queued.row.id)});
  assert.ok(claimed);
  const providerMessageId=`wamid.pg.contract.${runId}`;
  const accepted=await markCanonicalAccepted({ownerId,id:String(claimed.id),leaseToken:String(claimed.lease_token),providerMessageId});
  assert.equal(String(accepted?.status),'accepted');

  const sentAt=new Date('2026-09-14T00:00:00.000Z');
  const sent=await recordCanonicalReceipt({ownerId,providerMessageId,status:'sent',timestamp:sentAt});
  assert.equal(sent.inserted,true);
  assert.equal(String(sent.row.status),'sent');
  const duplicate=await recordCanonicalReceipt({ownerId,providerMessageId,status:'sent',timestamp:sentAt});
  assert.equal(duplicate.inserted,false);

  const read=await recordCanonicalReceipt({ownerId,providerMessageId,status:'read',timestamp:new Date('2026-09-14T00:00:02.000Z')});
  assert.equal(String(read.row.status),'read');
  const lateDelivered=await recordCanonicalReceipt({ownerId,providerMessageId,status:'delivered',timestamp:new Date('2026-09-14T00:00:01.000Z')});
  assert.equal(String(lateDelivered.row.status),'read');
  const lateFailed=await recordCanonicalReceipt({ownerId,providerMessageId,status:'failed',timestamp:new Date('2026-09-14T00:00:03.000Z'),errorCode:'131047'});
  assert.equal(String(lateFailed.row.status),'read');
});

test.after(async()=>{
  if(!enabled)return;
  await prisma.$disconnect();
});
