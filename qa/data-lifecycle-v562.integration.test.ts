import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  createLegalHold,
  createRetentionPolicyVersion,
  detectStorageOrphans,
  executePurgeBatch,
  listStorageObjects,
  registerStorageObject,
  releaseLegalHold,
  requestPurgeJob
} from '../backend/src/modules/data-lifecycle/data-lifecycle.service.js';

const prisma = new PrismaClient();
const tenantA = randomUUID();
const tenantB = randomUUID();
const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'contagest-v562-'));

async function insertTenant(id: string, suffix: string) {
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."Tenant" ("id","rif","name","updatedAt") VALUES ($1::uuid,$2,$3,NOW())',
    id,
    `J-V562-${suffix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    `Lifecycle ${suffix}`,
  );
}

async function walk(root: string, relative = ''): Promise<string[]> {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const result: string[] = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await walk(root, child));
    else result.push(child.replace(/\\/g, '/'));
  }
  return result;
}

test.before(async () => {
  await insertTenant(tenantA, 'A');
  await insertTenant(tenantB, 'B');
  await createRetentionPolicyVersion({
    tenantId: tenantA,
    entityType: 'AnalyticsEvent',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    retentionDays: 0,
    deleteSemantics: 'purge',
    purgeable: true,
    source: 'qa-v562',
    documentation: 'Ephemeral QA policy for tenant-safe purge.'
  });
});

test.after(async () => {
  await prisma.$disconnect();
  await rm(sandboxRoot, { recursive: true, force: true });
});

test('generic CRUD cannot delete protected audit evidence', async () => {
  const auditId = randomUUID();
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."AuditLog" ("id","tenantId","action","entity","createdAt") VALUES ($1::uuid,$2::uuid,$3,$4,NOW())',
    auditId,
    tenantA,
    'v562.fixture',
    'LifecycleFixture',
  );
  await assert.rejects(
    () => prisma.$executeRawUnsafe('DELETE FROM public."AuditLog" WHERE "id"=$1::uuid AND "tenantId"=$2::uuid', auditId, tenantA),
    /generic delete denied/i,
  );
});

test('legal hold blocks purge and release preserves authorized evidence', async () => {
  const hold = await createLegalHold({
    tenantId: tenantA,
    scopeType: 'entity',
    entityType: 'AnalyticsEvent',
    reason: 'QA legal hold',
    authorizationRef: 'qa-hold-562'
  });
  await assert.rejects(
    () => requestPurgeJob({ tenantId: tenantA, entityType: 'AnalyticsEvent', idempotencyKey: 'hold-block-562', authorizationRef: 'qa-purge-562' }),
    (error: any) => error?.details?.code === 'LEGAL_HOLD_ACTIVE',
  );
  const released = await releaseLegalHold({ tenantId: tenantA, holdId: hold.id, authorizationRef: 'qa-release-562', reason: 'QA hold released' });
  assert.equal(released.active, false);
  assert.ok(released.releasedAt);
});

test('purge job is tenant-safe, resumable and idempotent without double effect', async () => {
  const a1 = randomUUID();
  const a2 = randomUUID();
  const b1 = randomUUID();
  const old = new Date('2020-01-01T00:00:00Z');
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."AnalyticsEvent" ("id","tenantId","sessionId","type","payload","createdAt") VALUES ($1::uuid,$2::uuid,$3,$4,\'{}\'::jsonb,$5),($6::uuid,$2::uuid,$7,$4,\'{}\'::jsonb,$5)',
    a1, tenantA, 'a-1', 'v562', old, a2, 'a-2',
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."AnalyticsEvent" ("id","tenantId","sessionId","type","payload","createdAt") VALUES ($1::uuid,$2::uuid,$3,$4,\'{}\'::jsonb,$5)',
    b1, tenantB, 'b-1', 'v562', old,
  );

  const firstClaim = await requestPurgeJob({ tenantId: tenantA, entityType: 'AnalyticsEvent', idempotencyKey: 'purge-resume-562', authorizationRef: 'qa-purge-562', batchSize: 1 });
  const retryClaim = await requestPurgeJob({ tenantId: tenantA, entityType: 'AnalyticsEvent', idempotencyKey: 'purge-resume-562', authorizationRef: 'qa-purge-562', batchSize: 1 });
  assert.equal(retryClaim.id, firstClaim.id);

  const firstBatch = await executePurgeBatch({ tenantId: tenantA, jobId: firstClaim.id, batchSize: 1 });
  assert.equal(firstBatch.status, 'pending');
  const secondBatch = await executePurgeBatch({ tenantId: tenantA, jobId: firstClaim.id, batchSize: 1 });
  assert.equal(secondBatch.status, 'pending');
  const terminalBatch = await executePurgeBatch({ tenantId: tenantA, jobId: firstClaim.id, batchSize: 1 });
  assert.equal(terminalBatch.status, 'completed');

  const aCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>('SELECT count(*)::int AS count FROM public."AnalyticsEvent" WHERE "tenantId"=$1::uuid', tenantA);
  const bCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>('SELECT count(*)::int AS count FROM public."AnalyticsEvent" WHERE "tenantId"=$1::uuid', tenantB);
  assert.equal(aCount[0].count, 0);
  assert.equal(bCount[0].count, 1);

  const repeatedTerminal = await executePurgeBatch({ tenantId: tenantA, jobId: firstClaim.id, batchSize: 1 });
  assert.equal(repeatedTerminal.status, 'completed');
  const bCountAfterRetry = await prisma.$queryRawUnsafe<Array<{ count: number }>>('SELECT count(*)::int AS count FROM public."AnalyticsEvent" WHERE "tenantId"=$1::uuid', tenantB);
  assert.equal(bCountAfterRetry[0].count, 1);
});

test('real filesystem storage sandbox detects missing and unregistered objects without crossing tenants', async () => {
  const bucket = 'sandbox';
  const liveKey = `${tenantA}/media/live.txt`;
  const missingKey = `${tenantA}/media/missing.txt`;
  const unregisteredKey = `${tenantA}/media/unregistered.txt`;
  const bKey = `${tenantB}/media/b.txt`;

  await registerStorageObject({ tenantId: tenantA, bucket, objectKey: liveKey, lifecycleEntityType: 'MediaObject', subjectType: 'fixture', subjectId: 'live' });
  await registerStorageObject({ tenantId: tenantA, bucket, objectKey: missingKey, lifecycleEntityType: 'MediaObject', subjectType: 'fixture', subjectId: 'missing' });
  await registerStorageObject({ tenantId: tenantB, bucket, objectKey: bKey, lifecycleEntityType: 'MediaObject', subjectType: 'fixture', subjectId: 'b' });

  for (const key of [liveKey, unregisteredKey]) {
    const file = path.join(sandboxRoot, bucket, ...key.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, key, 'utf8');
  }

  const registered = await listStorageObjects(tenantA, bucket);
  assert.equal(registered.some((row) => row.tenantId === tenantB), false);
  const existing = await walk(path.join(sandboxRoot, bucket));
  const orphans = detectStorageOrphans(registered, existing);
  assert.deepEqual(orphans.missingObjects, [missingKey]);
  assert.deepEqual(orphans.unregisteredObjects, [unregisteredKey]);
  assert.deepEqual(orphans.alignedObjects, [liveKey]);
});
