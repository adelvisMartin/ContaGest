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
  await assert.rejects(
    () => requestPurgeJob({
      tenantId: tenantA, entityType: 'AnalyticsEvent', idempotencyKey: 'purge-resume-562',
      authorizationRef: 'qa-purge-562', batchSize: 2
    }),
    (error: any) => error?.details?.code === 'IDEMPOTENCY_CONFLICT',
    'the same job key cannot change its batch configuration'
  );
  await assert.rejects(
    () => executePurgeBatch({ tenantId: tenantB, jobId: firstClaim.id, batchSize: 1 }),
    /Job de lifecycle no encontrado en el tenant/i,
    'tenant B must not execute tenant A job by ID'
  );

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


test('legal hold activated after claim blocks the destructive job and preserves its row', async () => {
  const eventId = randomUUID();
  const key = `hold-after-claim-${eventId}`;
  let hold: Awaited<ReturnType<typeof createLegalHold>> | undefined;
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."AnalyticsEvent" ("id","tenantId","sessionId","type","payload","createdAt") VALUES ($1::uuid,$2::uuid,$3,$4,\'{}\'::jsonb,$5)',
    eventId, tenantA, key, 'v658-hold', new Date('2020-01-01T00:00:00Z'),
  );
  try {
    const job = await requestPurgeJob({
      tenantId: tenantA, entityType: 'AnalyticsEvent', idempotencyKey: key,
      authorizationRef: 'qa-hold-after-claim-658', batchSize: 1
    });
    hold = await createLegalHold({
      tenantId: tenantA, scopeType: 'entity', entityType: 'AnalyticsEvent',
      reason: 'Synthetic claim-time hold', authorizationRef: 'qa-hold-658'
    });
    await assert.rejects(
      () => executePurgeBatch({ tenantId: tenantA, jobId: job.id, batchSize: 1 }),
      (error: any) => error?.details?.code === 'LEGAL_HOLD_ACTIVE',
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      'SELECT count(*)::int AS count FROM public."AnalyticsEvent" WHERE "id"=$1::uuid AND "tenantId"=$2::uuid',
      eventId, tenantA,
    );
    assert.equal(rows[0].count, 1, 'the held record must survive the blocked purge');
    await assert.rejects(
      () => executePurgeBatch({ tenantId: tenantA, jobId: job.id, batchSize: 1 }),
      (error: any) => error?.details?.code === 'LIFECYCLE_JOB_BLOCKED',
    );
  } finally {
    try {
      if (hold) await releaseLegalHold({
        tenantId: tenantA, holdId: hold.id, authorizationRef: 'qa-release-658',
        reason: 'Synthetic hold teardown'
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'DELETE FROM public."AnalyticsEvent" WHERE "id"=$1::uuid AND "tenantId"=$2::uuid',
        eventId, tenantA,
      );
    }
  }
});


test('purge failure after DELETE rolls back rows, evidence and cursor; retry is safe', async () => {
  const eventId = randomUUID();
  const idempotencyKey = `rollback-v658-${eventId}`;
  const functionName = 'qa_lifecycle_v658_injected_evidence_failure';
  const triggerName = 'qa_lifecycle_v658_injected_evidence_failure_trg';
  let triggerInstalled = false;
  let functionInstalled = false;
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."AnalyticsEvent" ("id","tenantId","sessionId","type","payload","createdAt") VALUES ($1::uuid,$2::uuid,$3,$4,\'{}\'::jsonb,$5)',
    eventId, tenantA, idempotencyKey, 'v658-rollback', new Date('2020-01-01T00:00:00Z'),
  );
  try {
    const job = await requestPurgeJob({
      tenantId: tenantA, entityType: 'AnalyticsEvent', idempotencyKey,
      authorizationRef: 'qa-rollback-658', batchSize: 1
    });
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION public.${functionName}() RETURNS trigger
      LANGUAGE plpgsql AS $function$
      BEGIN RAISE EXCEPTION 'QA_658_INJECTED_EVIDENCE_FAILURE'; END
      $function$
    `);
    functionInstalled = true;
    // The job UUID is generated locally, never derived from user input.
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON public."DataLifecycleEvidence"
      FOR EACH ROW WHEN (NEW."jobId" = '${job.id}'::uuid)
      EXECUTE FUNCTION public.${functionName}()
    `);
    triggerInstalled = true;
    await assert.rejects(
      () => executePurgeBatch({ tenantId: tenantA, jobId: job.id, batchSize: 1 }),
      /QA_658_INJECTED_EVIDENCE_FAILURE/,
    );
    const [eventRows, evidenceRows, jobRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ count: number }>>(
        'SELECT count(*)::int AS count FROM public."AnalyticsEvent" WHERE "id"=$1::uuid AND "tenantId"=$2::uuid',
        eventId, tenantA,
      ),
      prisma.$queryRawUnsafe<Array<{ count: number }>>(
        'SELECT count(*)::int AS count FROM public."DataLifecycleEvidence" WHERE "jobId"=$1::uuid AND "tenantId"=$2::uuid',
        job.id, tenantA,
      ),
      prisma.$queryRawUnsafe<Array<{ status: string; lastError: string | null }>>(
        'SELECT "status","lastError" FROM public."DataLifecycleJob" WHERE "id"=$1::uuid AND "tenantId"=$2::uuid',
        job.id, tenantA,
      ),
    ]);
    assert.equal(eventRows[0].count, 1, 'DELETE cannot commit before its evidence');
    assert.equal(evidenceRows[0].count, 0, 'failed batch cannot leave phantom evidence');
    assert.equal(jobRows[0].status, 'failed');
    assert.equal(jobRows[0].lastError, 'PURGE_BATCH_FAILED');
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON public."DataLifecycleEvidence"`);
    triggerInstalled = false;
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${functionName}()`);
    functionInstalled = false;

    const resumed = await executePurgeBatch({ tenantId: tenantA, jobId: job.id, batchSize: 1 });
    assert.equal(resumed.status, 'pending');
    const terminal = await executePurgeBatch({ tenantId: tenantA, jobId: job.id, batchSize: 1 });
    assert.equal(terminal.status, 'completed');
    const finalRows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      'SELECT count(*)::int AS count FROM public."AnalyticsEvent" WHERE "id"=$1::uuid AND "tenantId"=$2::uuid',
      eventId, tenantA,
    );
    assert.equal(finalRows[0].count, 0);
  } finally {
    if (triggerInstalled) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON public."DataLifecycleEvidence"`);
    if (functionInstalled) await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${functionName}()`);
    await prisma.$executeRawUnsafe(
      'DELETE FROM public."AnalyticsEvent" WHERE "id"=$1::uuid AND "tenantId"=$2::uuid',
      eventId, tenantA,
    );
  }
});

test('two simultaneous workers serialize one tenant purge job without double deletion', async () => {
  const firstId = randomUUID();
  const secondId = randomUUID();
  const idempotencyKey = `concurrent-v658-${firstId}`;
  const old = new Date('2020-01-01T00:00:00Z');
  for (const id of [firstId, secondId]) {
    await prisma.$executeRawUnsafe(
      'INSERT INTO public."AnalyticsEvent" ("id","tenantId","sessionId","type","payload","createdAt") VALUES ($1::uuid,$2::uuid,$3,$4,\'{}\'::jsonb,$5)',
      id, tenantA, id, 'v658-concurrency', old,
    );
  }
  const job = await requestPurgeJob({
    tenantId: tenantA, entityType: 'AnalyticsEvent', idempotencyKey,
    authorizationRef: 'qa-concurrent-658', batchSize: 1
  });
  const results = await Promise.all([
    executePurgeBatch({ tenantId: tenantA, jobId: job.id, batchSize: 1 }),
    executePurgeBatch({ tenantId: tenantA, jobId: job.id, batchSize: 1 }),
  ]);
  assert.equal(results.every((row) => row.status === 'pending'), true);
  const evidence = await prisma.$queryRawUnsafe<Array<{ count: number; total: number }>>(
    'SELECT count(*)::int AS count, coalesce(sum("recordCount"),0)::int AS total FROM public."DataLifecycleEvidence" WHERE "jobId"=$1::uuid AND "tenantId"=$2::uuid',
    job.id, tenantA,
  );
  assert.equal(evidence[0].total, 2, 'each deleted subject must have one evidence count');
  assert.equal(evidence[0].count, 2, 'each worker must append one immutable batch');
  const finished = await executePurgeBatch({ tenantId: tenantA, jobId: job.id, batchSize: 1 });
  assert.equal(finished.status, 'completed');
  const remaining = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    'SELECT count(*)::int AS count FROM public."AnalyticsEvent" WHERE "id" IN ($1::uuid, $2::uuid) AND "tenantId"=$3::uuid',
    firstId, secondId, tenantA,
  );
  assert.equal(remaining[0].count, 0);
});


test('future-dated analytics cannot be purged by a zero-day policy', async () => {
  const id = randomUUID();
  const key = `future-retention-v658-${id}`;
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."AnalyticsEvent" ("id","tenantId","sessionId","type","payload","createdAt") VALUES ($1::uuid,$2::uuid,$3,$4,\'{}\'::jsonb,$5)',
    id, tenantA, key, 'v658-retention-boundary', new Date('2099-01-01T00:00:00Z'),
  );
  try {
    const job = await requestPurgeJob({
      tenantId: tenantA, entityType: 'AnalyticsEvent', idempotencyKey: key,
      authorizationRef: 'qa-retention-boundary-658', batchSize: 100
    });
    const terminal = await executePurgeBatch({ tenantId: tenantA, jobId: job.id, batchSize: 100 });
    assert.equal(terminal.status, 'completed');
    assert.equal((terminal.result as Record<string, unknown>).deletedCount, 0);
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      'SELECT count(*)::int AS count FROM public."AnalyticsEvent" WHERE "id"=$1::uuid AND "tenantId"=$2::uuid',
      id, tenantA,
    );
    assert.equal(rows[0].count, 1, 'a future record must survive cutoff comparison');
  } finally {
    await prisma.$executeRawUnsafe(
      'DELETE FROM public."AnalyticsEvent" WHERE "id"=$1::uuid AND "tenantId"=$2::uuid',
      id, tenantA,
    );
  }
});
