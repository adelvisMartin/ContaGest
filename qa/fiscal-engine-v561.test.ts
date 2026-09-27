import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tenantId = randomUUID();
const rif = `J-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function sql<T = unknown>(query: string, ...params: unknown[]) {
  return prisma.$queryRawUnsafe<T>(query, ...params);
}

test.before(async () => {
  await prisma.$executeRawUnsafe(
    'INSERT INTO "Tenant" ("id","rif","name","updatedAt") VALUES ($1::uuid,$2,$3,NOW())',
    tenantId,
    rif,
    'Fiscal V561',
  );
});

test.after(async () => {
  await prisma.$executeRawUnsafe('DELETE FROM "Tenant" WHERE "id"=$1::uuid', tenantId).catch(() => undefined);
  await prisma.$disconnect();
});

test('versioned rules preserve provenance/history and reject overlapping validity windows', async () => {
  const v1 = await sql<any[]>(
    'INSERT INTO "FiscalRuleVersion" ("tenantId","code","version","effectiveFrom","effectiveTo","source","documentation","payload","contentHash") VALUES ($1::uuid,$2,1,$3,$4,$5,$6,$7::jsonb,\'pending\') RETURNING *',
    tenantId,
    'VAT',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-07-01T00:00:00Z'),
    'SENIAT',
    'Providencia fixture v1',
    JSON.stringify({ rate: '16.00' }),
  );

  await prisma.$executeRawUnsafe(
    'INSERT INTO "FiscalRuleVersion" ("tenantId","code","version","effectiveFrom","source","documentation","payload","contentHash") VALUES ($1::uuid,$2,2,$3,$4,$5,$6::jsonb,\'pending\')',
    tenantId,
    'VAT',
    new Date('2026-07-01T00:00:00Z'),
    'SENIAT',
    'Providencia fixture v2',
    JSON.stringify({ rate: '17.00' }),
  );

  await assert.rejects(
    () => prisma.$executeRawUnsafe(
      'INSERT INTO "FiscalRuleVersion" ("tenantId","code","version","effectiveFrom","effectiveTo","source","documentation","payload","contentHash") VALUES ($1::uuid,$2,3,$3,$4,$5,$6,$7::jsonb,\'pending\')',
      tenantId,
      'VAT',
      new Date('2026-06-15T00:00:00Z'),
      new Date('2026-07-15T00:00:00Z'),
      'SENIAT',
      'Overlapping fixture',
      JSON.stringify({ rate: '99.00' }),
    ),
    /validity windows overlap/i,
  );

  const documentId = randomUUID();
  await prisma.$executeRawUnsafe(
    'INSERT INTO "FiscalDocumentRuleSnapshot" ("tenantId","documentType","documentId","ruleCode","ruleVersion","ruleId","ruleHash","rulePayload") VALUES ($1::uuid,\'sales\',$2::uuid,\'VAT\',1,$3::uuid,$4,$5::jsonb)',
    tenantId,
    documentId,
    v1[0].id,
    v1[0].contentHash,
    JSON.stringify({ rate: '16.00' }),
  );

  const snap = await sql<any[]>(
    'SELECT "ruleVersion","rulePayload" FROM "FiscalDocumentRuleSnapshot" WHERE "documentId"=$1::uuid',
    documentId,
  );
  assert.equal(snap[0].ruleVersion, 1);
  assert.equal(snap[0].rulePayload.rate, '16.00');

  await assert.rejects(
    () => prisma.$executeRawUnsafe(
      'UPDATE "FiscalDocumentRuleSnapshot" SET "ruleVersion"=2 WHERE "documentId"=$1::uuid',
      documentId,
    ),
    /immutable/i,
  );
});

test('concurrent distinct requests never receive duplicate numbers and retries are idempotent', async () => {
  const keys = Array.from({ length: 24 }, (_, index) => `distinct-${index}`);
  const rows = await Promise.all(
    keys.map((key) => sql<any[]>('SELECT * FROM allocate_fiscal_number($1::uuid,$2,$3,$4)', tenantId, 'sales', 'A', key)),
  );
  const numbers = rows.map((row) => row[0].allocatedNumber);
  assert.equal(new Set(numbers).size, keys.length);

  const firstRetry = await sql<any[]>(
    'SELECT * FROM allocate_fiscal_number($1::uuid,$2,$3,$4)',
    tenantId,
    'sales',
    'A',
    keys[0],
  );
  assert.equal(firstRetry[0].allocatedNumber, rows[0][0].allocatedNumber);

  const reservations = await sql<any[]>(
    'SELECT count(*)::int AS count FROM "FiscalNumberReservation" WHERE "tenantId"=$1::uuid AND "documentType"=\'sales\' AND "series"=\'A\'',
    tenantId,
  );
  assert.equal(reservations[0].count, keys.length);
});

test('concurrent retries with the same key consume one reservation and no extra sequence value', async () => {
  const retryRows = await Promise.all(
    Array.from({ length: 12 }, () =>
      sql<any[]>('SELECT * FROM allocate_fiscal_number($1::uuid,$2,$3,$4)', tenantId, 'sales', 'RETRY', 'same-key'),
    ),
  );
  const firstValue = BigInt(retryRows[0][0].sequenceValue);
  assert.equal(new Set(retryRows.map((row) => row[0].allocatedNumber)).size, 1);

  const next = await sql<any[]>(
    'SELECT * FROM allocate_fiscal_number($1::uuid,$2,$3,$4)',
    tenantId,
    'sales',
    'RETRY',
    'next-key',
  );
  assert.equal(BigInt(next[0].sequenceValue), firstValue + 1n);

  const sameKeyCount = await sql<any[]>(
    'SELECT count(*)::int AS count FROM "FiscalNumberReservation" WHERE "tenantId"=$1::uuid AND "documentType"=\'sales\' AND "series"=\'RETRY\' AND "idempotencyKey"=\'same-key\'',
    tenantId,
  );
  assert.equal(sameKeyCount[0].count, 1);
});

test('cancelled fiscal number is preserved and never recycled', async () => {
  const one = await sql<any[]>(
    'SELECT * FROM allocate_fiscal_number($1::uuid,\'sales\',\'B\',\'cancel-me\')',
    tenantId,
  );
  await prisma.$executeRawUnsafe(
    'UPDATE "FiscalNumberReservation" SET "status"=\'cancelled\',"cancelledAt"=NOW() WHERE "id"=$1::uuid',
    one[0].reservationId,
  );
  const two = await sql<any[]>(
    'SELECT * FROM allocate_fiscal_number($1::uuid,\'sales\',\'B\',\'next\')',
    tenantId,
  );
  assert.notEqual(BigInt(two[0].sequenceValue), BigInt(one[0].sequenceValue));
  assert.notEqual(two[0].allocatedNumber, one[0].allocatedNumber);
});

test('period close is period-scoped, fails on pending invariants and requires authorized reopen', async () => {
  const pendingEntryId = randomUUID();
  const otherPeriodEntryId = randomUUID();
  const closeId = randomUUID();

  await prisma.$executeRawUnsafe(
    'INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026-09\',\'pending\',\'manual\',false,NOW())',
    pendingEntryId,
    tenantId,
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026-10\',\'other period pending\',\'manual\',false,NOW())',
    otherPeriodEntryId,
    tenantId,
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO "ClosingPeriod" ("id","tenantId","period","module","status","updatedAt") VALUES ($1::uuid,$2::uuid,\'2026-09\',\'accounting\',\'open\',NOW())',
    closeId,
    tenantId,
  );

  await assert.rejects(
    () => prisma.$executeRawUnsafe(
      'UPDATE "ClosingPeriod" SET "status"=\'closed\',"closedBy"=$2::uuid,"updatedAt"=NOW() WHERE "id"=$1::uuid',
      closeId,
      randomUUID(),
    ),
    /prechecks failed/i,
  );

  await prisma.$executeRawUnsafe('DELETE FROM "LedgerEntry" WHERE "id"=$1::uuid', pendingEntryId);
  await prisma.$executeRawUnsafe(
    'UPDATE "ClosingPeriod" SET "status"=\'closed\',"closedBy"=$2::uuid,"updatedAt"=NOW() WHERE "id"=$1::uuid',
    closeId,
    randomUUID(),
  );

  const evidence = await sql<any[]>(
    'SELECT "evidenceHash","prechecks","postchecks" FROM "FiscalCloseEvidence" WHERE "tenantId"=$1::uuid AND "period"=\'2026-09\'',
    tenantId,
  );
  assert.match(evidence[0].evidenceHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence[0].prechecks, {
    unpostedLedgerEntries: 0,
    unbalancedPostedEntries: 0,
    draftSales: 0,
    draftPurchases: 0,
  });
  assert.equal(typeof evidence[0].postchecks.postedLedgerEntries, 'number');

  await assert.rejects(
    () => prisma.$executeRawUnsafe(
      'UPDATE "ClosingPeriod" SET "status"=\'open\',"updatedAt"=NOW() WHERE "id"=$1::uuid',
      closeId,
    ),
    /authorized reopen workflow/i,
  );

  await assert.rejects(
    () => prisma.$executeRawUnsafe(
      'UPDATE "FiscalCloseEvidence" SET "reopenReason"=\'bypass\' WHERE "tenantId"=$1::uuid AND "period"=\'2026-09\'',
      tenantId,
    ),
    /authorized workflow/i,
  );

  const actor = randomUUID();
  await prisma.$executeRawUnsafe(
    'SELECT reopen_fiscal_period($1::uuid,$2,$3,$4::uuid,$5,$6)',
    tenantId,
    '2026-09',
    'accounting',
    actor,
    'approval-236-fixture',
    'validated correction fixture',
  );

  const reopened = await sql<any[]>(
    'SELECT "status" FROM "ClosingPeriod" WHERE "id"=$1::uuid',
    closeId,
  );
  assert.equal(reopened[0].status, 'open');

  const reopenedEvidence = await sql<any[]>(
    'SELECT "reopenedAt","reopenedBy","reopenAuthorizationRef","reopenReason" FROM "FiscalCloseEvidence" WHERE "tenantId"=$1::uuid AND "period"=\'2026-09\'',
    tenantId,
  );
  assert.ok(reopenedEvidence[0].reopenedAt);
  assert.equal(reopenedEvidence[0].reopenedBy, actor);
  assert.equal(reopenedEvidence[0].reopenAuthorizationRef, 'approval-236-fixture');

  await prisma.$executeRawUnsafe('DELETE FROM "LedgerEntry" WHERE "id"=$1::uuid', otherPeriodEntryId);
});
