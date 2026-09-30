import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tenantA = randomUUID();
const tenantB = randomUUID();
const periodA = randomUUID();
const periodB = randomUUID();
const declarationA = randomUUID();
const declarationB = randomUUID();

async function createFixture(tenantId: string, periodId: string, declarationId: string, suffix: string) {
  await prisma.tenant.create({
    data: {
      id: tenantId,
      rif: `J-V685-${suffix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: `Historical Cascade ${suffix}`,
    },
  });
  await prisma.taxPeriod.create({
    data: {
      id: periodId,
      tenantId,
      period: `2099-${suffix === 'A' ? '01' : '02'}`,
    },
  });
  await prisma.taxDeclaration.create({
    data: {
      id: declarationId,
      periodId,
      kind: 'iva',
      amount: 1,
      status: 'filed',
    },
  });
}

test.before(async () => {
  await createFixture(tenantA, periodA, declarationA, 'A');
  await createFixture(tenantB, periodB, declarationB, 'B');
});

test.after(async () => {
  // The canonical PG17 runner destroys the isolated database after the suite.
  // Protected history is deliberately not bypassed merely to clean fixtures.
  await prisma.$disconnect();
});

test('#685 registers immutable lifecycle policies and delete guards for historical gaps', async () => {
  const policies = await prisma.$queryRawUnsafe<Array<{ entityType: string; deleteSemantics: string; purgeable: boolean }>>(`
    SELECT "entityType", "deleteSemantics", "purgeable"
    FROM public."DataRetentionPolicyVersion"
    WHERE "tenantId" IS NULL
      AND "entityType" = ANY(ARRAY[
        'FinancialFxLedgerLineSnapshot',
        'FiscalDocumentRuleSnapshot',
        'FiscalRuleVersion',
        'LegalAcceptance',
        'TaxDeclaration',
        'TaxPeriod'
      ]::text[])
      AND "version" = 1
    ORDER BY "entityType"
  `);
  assert.equal(policies.length, 6);
  for (const policy of policies) {
    assert.equal(policy.deleteSemantics, 'immutable');
    assert.equal(policy.purgeable, false);
  }

  const triggers = await prisma.$queryRawUnsafe<Array<{ trigger_name: string }>>(`
    SELECT t.tgname AS trigger_name
    FROM pg_trigger t
    WHERE NOT t.tgisinternal
      AND t.tgname = ANY(ARRAY[
        'FinancialFxLedgerLineSnapshot_lifecycle_delete_guard',
        'FiscalDocumentRuleSnapshot_lifecycle_delete_guard',
        'FiscalRuleVersion_lifecycle_delete_guard',
        'LegalAcceptance_lifecycle_delete_guard',
        'TaxDeclaration_lifecycle_delete_guard',
        'TaxPeriod_lifecycle_delete_guard'
      ]::text[])
    ORDER BY t.tgname
  `);
  assert.equal(triggers.length, 6);
});

test('tenant A cascade is fail-closed and tenant B history remains intact', async () => {
  await assert.rejects(() => prisma.tenant.delete({ where: { id: tenantA } }));

  const [aPeriod, aDeclaration, bPeriod, bDeclaration] = await Promise.all([
    prisma.taxPeriod.count({ where: { id: periodA, tenantId: tenantA } }),
    prisma.taxDeclaration.count({ where: { id: declarationA, periodId: periodA } }),
    prisma.taxPeriod.count({ where: { id: periodB, tenantId: tenantB } }),
    prisma.taxDeclaration.count({ where: { id: declarationB, periodId: periodB } }),
  ]);

  assert.deepEqual([aPeriod, aDeclaration, bPeriod, bDeclaration], [1, 1, 1, 1]);
});

test('direct tax history deletes are denied, including an explicitly authorized lifecycle session', async () => {
  await assert.rejects(() => prisma.taxDeclaration.delete({ where: { id: declarationA } }));
  await assert.rejects(() => prisma.taxPeriod.delete({ where: { id: periodA } }));

  await assert.rejects(() => prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe("SELECT set_config('contagest.lifecycle_authorized','true',true)");
    await tx.taxPeriod.delete({ where: { id: periodA } });
  }));

  assert.equal(await prisma.taxPeriod.count({ where: { id: periodA } }), 1);
  assert.equal(await prisma.taxDeclaration.count({ where: { id: declarationA } }), 1);
});
