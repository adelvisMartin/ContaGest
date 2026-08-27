import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const RUN = `QA91-${Date.now().toString(36).toUpperCase()}`;
const PERIOD_MANUAL = '2097-01';
const PERIOD_REVERSE = '2097-02';
const PERIOD_SALE = '2097-03';
const PERIOD_SALE_REVERSE = '2097-04';
const PERIOD_PURCHASE = '2097-05';
const PERIOD_PURCHASE_REVERSE = '2097-06';
const PERIOD_CLOSED = '2097-12';

function snapshotLines(entry: any) {
  return (entry?.lines || [])
    .map((line: any) => ({
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: line.debit.toFixed(2),
      credit: line.credit.toFixed(2),
      currency: line.currency,
      exchangeRate: line.exchangeRate.toFixed(4)
    }))
    .sort((a: any, b: any) => a.accountCode.localeCompare(b.accountCode));
}

function assertExactReversal(original: any, reversal: any) {
  assert.ok(original?.lines?.length, 'Original ledger has no lines');
  assert.ok(reversal?.lines?.length, 'Reversal ledger has no lines');
  assert.equal(reversal.lines.length, original.lines.length, 'Reversal line count differs from original');
  for (const originalLine of original.lines) {
    const reversedLine = reversal.lines.find((line: any) => line.accountCode === originalLine.accountCode);
    assert.ok(reversedLine, `Missing reversal line for ${originalLine.accountCode}`);
    assert.equal(reversedLine.debit.toFixed(2), originalLine.credit.toFixed(2));
    assert.equal(reversedLine.credit.toFixed(2), originalLine.debit.toFixed(2));
    assert.equal(reversedLine.currency, originalLine.currency);
    assert.equal(reversedLine.exchangeRate.toFixed(4), originalLine.exchangeRate.toFixed(4));
  }
}

test('issue #91 ledger lifecycle is immutable, reversible and tenant-scoped on real PostgreSQL', async (t) => {
  const h = await createRealBackendHarness();
  t.after(async () => h.close());

  const database = await h.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.match(database[0]?.name || '', /_v91$/, 'Issue #91 real test must run only on the disposable *_v91 database');

  let manualPostedId = '';
  let manualReversalId = '';

  await t.test('manual DRAFT can be edited, does not affect trial balance, then posts exactly once', async () => {
    const draft = await h.ok('/accounting/entries', {
      method: 'POST',
      body: JSON.stringify({
        fiscalPeriod: PERIOD_MANUAL,
        description: `${RUN} manual draft`,
        source: 'manual',
        lines: [
          { accountCode: `${RUN}.D`, accountName: 'QA debit', debit: '0.30', currency: 'USD', exchangeRate: '36.1234' },
          { accountCode: `${RUN}.C`, accountName: 'QA credit', credit: '0.30', currency: 'USD', exchangeRate: '36.1234' }
        ]
      })
    });
    assert.equal(draft.posted, false);
    assert.equal(draft.postedAt, null);
    assert.equal(draft.postedBy, null);

    let trial = await h.ok('/accounting/trial-balance');
    assert.equal(trial.some((row: any) => row.accountCode === `${RUN}.D`), false, 'DRAFT leaked into trial balance');

    const edited = await h.ok(`/accounting/entries/${draft.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fiscalPeriod: PERIOD_MANUAL,
        description: `${RUN} manual draft edited`,
        source: 'manual',
        lines: [
          { accountCode: `${RUN}.D`, accountName: 'QA debit', debit: '1.25', currency: 'USD', exchangeRate: '36.1234' },
          { accountCode: `${RUN}.C`, accountName: 'QA credit', credit: '1.25', currency: 'USD', exchangeRate: '36.1234' }
        ]
      })
    });
    assert.equal(edited.posted, false);
    assert.equal(edited.description, `${RUN} manual draft edited`);

    const posted = await h.ok(`/accounting/entries/${draft.id}/post`, { method: 'POST' });
    manualPostedId = posted.id;
    assert.equal(posted.posted, true);
    assert.ok(posted.postedAt);
    assert.equal(posted.postedBy, h.admin.id);

    trial = await h.ok('/accounting/trial-balance');
    const row = trial.find((item: any) => item.accountCode === `${RUN}.D`);
    assert.ok(row, 'POSTED ledger missing from trial balance');
    assert.equal(row.debitExact, '1.25');
    assert.equal(row.balanceExact, '1.25');

    const audit = await h.prisma.auditLog.findFirst({
      where: { tenantId: h.tenant.id, action: 'ledger.entry.posted', entity: 'LedgerEntry', entityId: posted.id },
      orderBy: { createdAt: 'desc' }
    });
    assert.ok(audit, 'Posting audit was not persisted atomically');
    assert.equal(audit.userId, h.admin.id);

    await h.status(`/accounting/entries/${draft.id}/post`, 409, { method: 'POST' });
    await h.status(`/accounting/entries/${draft.id}`, 409, {
      method: 'PATCH',
      body: JSON.stringify({
        fiscalPeriod: PERIOD_MANUAL,
        description: 'forbidden posted edit',
        lines: [
          { accountCode: `${RUN}.D`, accountName: 'QA debit', debit: '1.00' },
          { accountCode: `${RUN}.C`, accountName: 'QA credit', credit: '1.00' }
        ]
      })
    });
    await h.status(`/accounting/entries/${draft.id}`, 409, { method: 'DELETE' });
  });

  await t.test('DRAFT delete is allowed and source spoofing is rejected', async () => {
    const draft = await h.ok('/accounting/entries', {
      method: 'POST',
      body: JSON.stringify({
        fiscalPeriod: PERIOD_MANUAL,
        description: `${RUN} deletable draft`,
        lines: [
          { accountCode: `${RUN}.TMPD`, accountName: 'Temporary debit', debit: '2.00' },
          { accountCode: `${RUN}.TMPC`, accountName: 'Temporary credit', credit: '2.00' }
        ]
      })
    });
    const deleted = await h.ok(`/accounting/entries/${draft.id}`, { method: 'DELETE' });
    assert.equal(deleted.deleted, true);
    assert.equal(await h.prisma.ledgerEntry.findUnique({ where: { id: draft.id } }), null);

    await h.status('/accounting/entries', 422, {
      method: 'POST',
      body: JSON.stringify({
        fiscalPeriod: PERIOD_MANUAL,
        description: `${RUN} forged source`,
        source: 'sales',
        lines: [
          { accountCode: `${RUN}.FD`, accountName: 'Forged debit', debit: '1.00' },
          { accountCode: `${RUN}.FC`, accountName: 'Forged credit', credit: '1.00' }
        ]
      })
    });
  });

  await t.test('reversal creates a new POSTED inverse, leaves original intact and cannot chain', async () => {
    const originalBefore = await h.prisma.ledgerEntry.findUnique({ where: { id: manualPostedId }, include: { lines: true } });
    assert.ok(originalBefore);
    const beforeLines = snapshotLines(originalBefore);

    const reversal = await h.ok(`/accounting/entries/${manualPostedId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ fiscalPeriod: PERIOD_REVERSE, description: `${RUN} manual reversal` })
    });
    manualReversalId = reversal.id;
    assert.equal(reversal.posted, true);
    assert.equal(reversal.reversalOfId, manualPostedId);
    assert.equal(reversal.postedBy, h.admin.id);

    const storedReversal = await h.prisma.ledgerEntry.findUnique({ where: { id: reversal.id }, include: { lines: true } });
    const originalAfter = await h.prisma.ledgerEntry.findUnique({ where: { id: manualPostedId }, include: { lines: true } });
    assert.ok(storedReversal);
    assert.ok(originalAfter);
    assertExactReversal(originalBefore, storedReversal);
    assert.equal(originalAfter.description, originalBefore.description);
    assert.deepEqual(snapshotLines(originalAfter), beforeLines, 'Original ledger mutated after reversal');

    const audit = await h.prisma.auditLog.findFirst({
      where: { tenantId: h.tenant.id, action: 'ledger.entry.reversed', entityId: reversal.id },
      orderBy: { createdAt: 'desc' }
    });
    assert.ok(audit, 'Reversal audit was not persisted atomically');
    assert.equal(audit.userId, h.admin.id);

    await h.status(`/accounting/entries/${manualPostedId}/reverse`, 409, {
      method: 'POST',
      body: JSON.stringify({ fiscalPeriod: PERIOD_REVERSE })
    });
    await h.status(`/accounting/entries/${manualReversalId}/reverse`, 409, {
      method: 'POST',
      body: JSON.stringify({ fiscalPeriod: PERIOD_REVERSE })
    });
  });

  await t.test('closed period rejects both posting and reversal', async () => {
    const draft = await h.ok('/accounting/entries', {
      method: 'POST',
      body: JSON.stringify({
        fiscalPeriod: PERIOD_CLOSED,
        description: `${RUN} closed-period draft`,
        lines: [
          { accountCode: `${RUN}.CLOSED.D`, accountName: 'Closed debit', debit: '5.00' },
          { accountCode: `${RUN}.CLOSED.C`, accountName: 'Closed credit', credit: '5.00' }
        ]
      })
    });
    const period = await h.ok('/accounting/closing-periods', {
      method: 'POST',
      body: JSON.stringify({ period: PERIOD_CLOSED, note: `${RUN} QA closed` })
    });
    await h.ok(`/accounting/closing-periods/${period.id}/close`, { method: 'POST', body: JSON.stringify({ note: `${RUN} QA close` }) });

    await h.status(`/accounting/entries/${draft.id}/post`, 409, { method: 'POST' });

    const openDraft = await h.ok('/accounting/entries', {
      method: 'POST',
      body: JSON.stringify({
        fiscalPeriod: PERIOD_REVERSE,
        description: `${RUN} reverse-closed-source`,
        lines: [
          { accountCode: `${RUN}.RCD`, accountName: 'Reverse closed debit', debit: '3.00' },
          { accountCode: `${RUN}.RCC`, accountName: 'Reverse closed credit', credit: '3.00' }
        ]
      })
    });
    const openPosted = await h.ok(`/accounting/entries/${openDraft.id}/post`, { method: 'POST' });
    await h.status(`/accounting/entries/${openPosted.id}/reverse`, 409, {
      method: 'POST',
      body: JSON.stringify({ fiscalPeriod: PERIOD_CLOSED })
    });
  });

  await t.test('issued sale is POSTED atomically and can reverse into a later open period after original close', async () => {
    const sale = await h.ok('/sales', {
      method: 'POST',
      body: JSON.stringify({
        number: `${RUN}-SALE`,
        fiscalPeriod: PERIOD_SALE,
        status: 'issued',
        currency: 'USD',
        exchangeRate: '36.1234',
        lines: [{ description: 'QA91 sale line', quantity: '1.000', unitPrice: '10.00', taxRate: '16.00' }]
      })
    });
    assert.ok(sale.ledgerEntryId);
    const original = await h.prisma.ledgerEntry.findUnique({ where: { id: sale.ledgerEntryId }, include: { lines: true } });
    assert.ok(original);
    assert.equal(original.posted, true);
    assert.ok(original.postedAt);
    assert.equal(original.postedBy, h.admin.id);
    assert.equal(original.source, 'sales');
    assert.equal(original.sourceId, sale.id);

    const postAudit = await h.prisma.auditLog.findFirst({ where: { action: 'ledger.entry.posted', entityId: original.id } });
    assert.ok(postAudit);

    const closing = await h.ok('/accounting/closing-periods', { method: 'POST', body: JSON.stringify({ period: PERIOD_SALE }) });
    await h.ok(`/accounting/closing-periods/${closing.id}/close`, { method: 'POST', body: JSON.stringify({}) });

    const cancelled = await h.ok(`/sales/${sale.id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({
        reason: `${RUN} reverse sale after close`,
        reversalFiscalPeriod: PERIOD_SALE_REVERSE,
        reversalDate: '2097-04-15T12:00:00.000Z'
      })
    });
    assert.equal(cancelled.sale.status, 'cancelled');
    assert.ok(cancelled.reversalId);
    const reversal = await h.prisma.ledgerEntry.findUnique({ where: { id: cancelled.reversalId }, include: { lines: true } });
    assert.ok(reversal);
    assert.equal(reversal.posted, true);
    assert.equal(reversal.reversalOfId, original.id);
    assert.equal(reversal.fiscalPeriod, PERIOD_SALE_REVERSE);
    assertExactReversal(original, reversal);

    const repeated = await h.ok(`/sales/${sale.id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: `${RUN} repeat sale cancellation`, reversalFiscalPeriod: PERIOD_SALE_REVERSE })
    });
    assert.equal(repeated.alreadyCancelled, true);
    assert.equal(repeated.reversalId, cancelled.reversalId);
  });

  await t.test('issued purchase is POSTED atomically and cancellation creates a linked inverse', async () => {
    const purchase = await h.ok('/purchases', {
      method: 'POST',
      body: JSON.stringify({
        number: `${RUN}-PURCHASE`,
        fiscalPeriod: PERIOD_PURCHASE,
        status: 'issued',
        lines: [{ description: 'QA91 purchase line', quantity: '2.000', unitCost: '7.50', taxRate: '16.00' }]
      })
    });
    assert.ok(purchase.ledgerEntryId);
    const original = await h.prisma.ledgerEntry.findUnique({ where: { id: purchase.ledgerEntryId }, include: { lines: true } });
    assert.ok(original);
    assert.equal(original.posted, true);
    assert.ok(original.postedAt);
    assert.equal(original.postedBy, h.admin.id);
    assert.equal(original.source, 'purchase');
    assert.equal(original.sourceId, purchase.id);

    const cancelled = await h.ok(`/purchases/${purchase.id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: `${RUN} reverse purchase`, reversalFiscalPeriod: PERIOD_PURCHASE_REVERSE })
    });
    assert.equal(cancelled.purchase.status, 'cancelled');
    assert.ok(cancelled.reversalId);
    const reversal = await h.prisma.ledgerEntry.findUnique({ where: { id: cancelled.reversalId }, include: { lines: true } });
    assert.ok(reversal);
    assert.equal(reversal.posted, true);
    assert.equal(reversal.reversalOfId, original.id);
    assertExactReversal(original, reversal);
  });

  await t.test('tenant A↔B direct IDs cannot cross the tenant scope', async () => {
    const tenantB = await h.prisma.tenant.create({
      data: { rif: `${RUN}-RIF-B`, name: `${RUN} Tenant B`, legalName: `${RUN} Tenant B` }
    });
    const entryB = await h.prisma.ledgerEntry.create({
      data: {
        tenantId: tenantB.id,
        fiscalPeriod: PERIOD_MANUAL,
        description: `${RUN} tenant B draft`,
        source: 'manual',
        posted: false,
        lines: {
          create: [
            { accountCode: `${RUN}.BD`, accountName: 'Tenant B debit', debit: '4.00', credit: '0.00' },
            { accountCode: `${RUN}.BC`, accountName: 'Tenant B credit', debit: '0.00', credit: '4.00' }
          ]
        }
      }
    });

    await h.status(`/accounting/entries/${entryB.id}/post`, 404, { method: 'POST' });
    await h.status(`/accounting/entries/${entryB.id}/reverse`, 404, {
      method: 'POST',
      body: JSON.stringify({ fiscalPeriod: PERIOD_REVERSE })
    });
    await h.status(`/accounting/entries/${entryB.id}`, 404, {
      method: 'PATCH',
      body: JSON.stringify({
        fiscalPeriod: PERIOD_MANUAL,
        description: 'forbidden cross-tenant edit',
        lines: [
          { accountCode: `${RUN}.BD`, accountName: 'Tenant B debit', debit: '4.00' },
          { accountCode: `${RUN}.BC`, accountName: 'Tenant B credit', credit: '4.00' }
        ]
      })
    });
    await h.status(`/accounting/entries/${entryB.id}`, 404, { method: 'DELETE' });

    const tenantBHeaders = { 'x-tenant-id': tenantB.id };
    await h.status(`/accounting/entries/${manualPostedId}/post`, 404, { method: 'POST', headers: tenantBHeaders }, '');
    await h.status(`/accounting/entries/${manualPostedId}/reverse`, 404, {
      method: 'POST',
      headers: tenantBHeaders,
      body: JSON.stringify({ fiscalPeriod: PERIOD_REVERSE })
    }, '');
    const visibleToB = await h.ok('/accounting/entries', { headers: tenantBHeaders }, '');
    assert.equal(visibleToB.some((entry: any) => entry.id === manualPostedId), false, 'Tenant B enumerated Tenant A ledger');
  });

  await t.test('unauthenticated accounting access is denied', async () => {
    await h.status('/accounting/entries', 401, { method: 'GET' }, '');
    await h.status(`/accounting/entries/${manualPostedId}/reverse`, 401, {
      method: 'POST',
      body: JSON.stringify({ fiscalPeriod: PERIOD_REVERSE })
    }, '');
  });
});
