import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { getFxEvent } from '../backend/src/modules/currency/fx.repository.ts';

const RUN = `QA560-${Date.now().toString(36).toUpperCase()}`;
const OPEN_PERIOD = '2099-11';
const CLOSED_PERIOD = '2099-12';

function exact(value: unknown, scale = 2) {
  if (value && typeof value === 'object' && 'toFixed' in value && typeof (value as any).toFixed === 'function') {
    return (value as any).toFixed(scale);
  }
  const source = String(value ?? '0').trim();
  const negative = source.startsWith('-');
  const unsigned = negative ? source.slice(1) : source;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  return `${negative ? '-' : ''}${whole || '0'}.${fraction.padEnd(scale, '0').slice(0, scale)}`;
}

function candidateSha() {
  const sha = String(process.env.GITHUB_SHA || '').trim() || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.match(sha, /^[a-f0-9]{40}$/i, 'GITHUB_SHA/candidate SHA must be exact');
  return sha;
}

test('issue #560 reconciles original and functional currency with audited FX lifecycle on isolated PostgreSQL', async (t) => {
  const h = await createRealBackendHarness();
  t.after(async () => h.close());

  const sha = candidateSha();
  const dbRows = await h.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.match(dbRows[0]?.name || '', /fx_v560_e2e$/, 'issue #560 must run only on the disposable *_fx_v560_e2e database');

  await h.prisma.closingPeriod.deleteMany({ where: { tenantId: h.tenant.id, period: { in: [OPEN_PERIOD, CLOSED_PERIOD] } } });
  await h.prisma.closingPeriod.create({
    data: { tenantId: h.tenant.id, period: CLOSED_PERIOD, module: 'accounting', status: 'closed', closedAt: new Date(), closedBy: h.admin.id, note: `#560 ${sha}` }
  });

  const policy = await h.ok('/currency/fx/policy');
  assert.equal(policy.policyVersion, 1);
  assert.equal(policy.functionalCurrency, 'VES');
  assert.equal(policy.roundingMode, 'ROUND_HALF_UP');

  const saleBody = {
    number: `${RUN}-SALE`,
    fiscalPeriod: OPEN_PERIOD,
    status: 'issued',
    currency: 'USD',
    exchangeRate: '40.0000',
    exchangeRateDate: '2099-11-01T12:00:00.000Z',
    exchangeRateSource: 'QA-USD-HISTORICAL',
    lines: [{ description: `${RUN} USD sale`, quantity: '1.000', unitPrice: '100.00', taxRate: '0.00' }]
  };
  const saleKey = `${RUN}-sale`;
  const sale = await h.ok('/sales', { method: 'POST', headers: { 'Idempotency-Key': saleKey }, body: JSON.stringify(saleBody) });
  const saleReplay = await h.ok('/sales', { method: 'POST', headers: { 'Idempotency-Key': saleKey }, body: JSON.stringify(saleBody) });
  assert.equal(saleReplay.id, sale.id, 'Idempotency-Key must replay the same sales document');
  assert.equal(saleReplay.ledgerEntryId, sale.ledgerEntryId, 'retry must not duplicate the sales ledger entry');

  const saleLedger = await h.prisma.ledgerEntry.findUniqueOrThrow({ where: { id: sale.ledgerEntryId }, include: { lines: true } });
  assert.ok(saleLedger.lines.length >= 2);
  assert.ok(saleLedger.lines.every((line) => line.currency === 'VES'));
  assert.ok(saleLedger.lines.every((line) => exact(line.exchangeRate, 4) === '1.0000'));
  const saleDebit = saleLedger.lines.reduce((sum, line) => sum + BigInt(exact(line.debit).replace('.', '')), 0n);
  const saleCredit = saleLedger.lines.reduce((sum, line) => sum + BigInt(exact(line.credit).replace('.', '')), 0n);
  assert.equal(saleDebit, saleCredit, 'functional ledger must remain exactly balanced');

  const initialExposure = await h.ok(`/currency/fx/exposure?sourceType=sales&sourceId=${sale.id}`);
  assert.equal(initialExposure.exposures.length, 1);
  assert.equal(initialExposure.exposures[0].original.currency, 'USD');
  assert.equal(exact(initialExposure.exposures[0].original.total), '100.00');
  assert.equal(exact(initialExposure.exposures[0].original.exchangeRate, 4), '40.0000');
  assert.equal(initialExposure.exposures[0].original.rateSource, 'QA-USD-HISTORICAL');
  assert.equal(initialExposure.exposures[0].functional.currency, 'VES');
  assert.equal(exact(initialExposure.exposures[0].functional.total), '4000.00');

  const purchaseBody = {
    number: `${RUN}-PURCHASE`,
    fiscalPeriod: OPEN_PERIOD,
    status: 'issued',
    currency: 'USD',
    exchangeRate: '40.0000',
    exchangeRateDate: '2099-11-01T12:00:00.000Z',
    exchangeRateSource: 'QA-USD-HISTORICAL',
    lines: [{ description: `${RUN} USD purchase`, quantity: '1.000', unitCost: '25.00', taxRate: '0.00' }]
  };
  const purchase = await h.ok('/purchases', { method: 'POST', headers: { 'Idempotency-Key': `${RUN}-purchase` }, body: JSON.stringify(purchaseBody) });
  const purchaseExposure = await h.ok(`/currency/fx/exposure?sourceType=purchase&sourceId=${purchase.id}`);
  assert.equal(purchaseExposure.exposures[0].original.currency, 'USD');
  assert.equal(exact(purchaseExposure.exposures[0].original.total), '25.00');
  assert.equal(exact(purchaseExposure.exposures[0].functional.total), '1000.00');

  const bankAccount = await h.ok('/banking/accounts', {
    method: 'POST',
    headers: { 'Idempotency-Key': `${RUN}-bank-account` },
    body: JSON.stringify({ bankName: 'QA FX Bank', accountNo: `${RUN}-USD`, currency: 'USD', openingBalance: '0.00' })
  });
  const postingAccount = await h.prisma.chartAccount.findFirst({
    where: { tenantId: h.tenant.id, allowPosting: true, code: { startsWith: '1.' } },
    orderBy: { code: 'asc' }
  });
  assert.ok(postingAccount, 'seed must provide an asset posting account for FX bank mapping');
  await h.ok(`/currency/fx/bank-accounts/${bankAccount.id}/ledger-account`, {
    method: 'PUT',
    body: JSON.stringify({ ledgerAccountCode: postingAccount.code })
  });

  const collection = await h.ok('/banking/movements', {
    method: 'POST',
    headers: { 'Idempotency-Key': `${RUN}-collection` },
    body: JSON.stringify({ accountId: bankAccount.id, description: `${RUN} partial collection`, reference: sale.id, type: 'income', currency: 'USD', amount: '60.00' })
  });
  const settlementBody = {
    sourceType: 'sales',
    sourceId: sale.id,
    bankMovementId: collection.id,
    appliedOriginalAmount: '60.00',
    settlementAmount: '60.00',
    currentRate: '42.0000',
    rateDate: '2099-11-10T12:00:00.000Z',
    rateSource: 'QA-USD-SETTLEMENT',
    fiscalPeriod: OPEN_PERIOD
  };
  const settlementKey = `${RUN}-settlement`;
  const settlement = await h.ok('/currency/fx/settlements', { method: 'POST', headers: { 'Idempotency-Key': settlementKey }, body: JSON.stringify(settlementBody) });
  const settlementReplay = await h.ok('/currency/fx/settlements', { method: 'POST', headers: { 'Idempotency-Key': settlementKey }, body: JSON.stringify(settlementBody) });
  assert.equal(settlementReplay.id, settlement.id, 'partial settlement retry must replay the same FX event');
  assert.equal(settlement.kind, 'realized');
  assert.equal(exact(settlement.originalAmount), '60.00');
  assert.equal(exact(settlement.historicalFunctionalAmount), '2400.00');
  assert.equal(exact(settlement.currentFunctionalAmount), '2520.00');
  assert.equal(exact(settlement.difference), '120.00');

  const eventCount = await h.prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM "FinancialFxEvent" WHERE "tenantId"=${h.tenant.id}::uuid AND "sourceId"=${sale.id}::uuid AND "kind"='realized'
  `;
  assert.equal(Number(eventCount[0]?.count || 0n), 1, 'retry must not duplicate FX events');

  const partialExposure = await h.ok(`/currency/fx/exposure?sourceType=sales&sourceId=${sale.id}`);
  assert.equal(exact(partialExposure.exposures[0].realizedOriginalAmount), '60.00');
  assert.equal(exact(partialExposure.exposures[0].outstandingOriginalAmount), '40.00');

  const revaluationBody = {
    sourceType: 'sales',
    sourceId: sale.id,
    currentRate: '43.0000',
    rateDate: '2099-11-30T12:00:00.000Z',
    rateSource: 'QA-USD-REVALUATION',
    fiscalPeriod: OPEN_PERIOD
  };
  const revaluation = await h.ok('/currency/fx/revaluations', { method: 'POST', headers: { 'Idempotency-Key': `${RUN}-revaluation` }, body: JSON.stringify(revaluationBody) });
  assert.equal(revaluation.kind, 'unrealized');
  assert.equal(exact(revaluation.originalAmount), '40.00');
  assert.equal(exact(revaluation.historicalFunctionalAmount), '1600.00');
  assert.equal(exact(revaluation.currentFunctionalAmount), '1720.00');
  assert.equal(exact(revaluation.difference), '120.00');

  const reversed = await h.ok(`/currency/fx/events/${revaluation.id}/reverse`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `${RUN}-revaluation-reverse` },
    body: JSON.stringify({ fiscalPeriod: OPEN_PERIOD, reversalDate: '2099-11-30T18:00:00.000Z', reason: 'QA reversalOfId audit regression' })
  });
  assert.ok(reversed.reversalLedgerEntryId, 'reversal must retain reversalOfId-linked ledger evidence');
  assert.ok(reversed.reversedAt, 'reversal must preserve audit timestamp');
  const reversalLedger = await h.prisma.ledgerEntry.findUniqueOrThrow({ where: { id: reversed.reversalLedgerEntryId } });
  assert.equal(reversalLedger.reversalOfId, revaluation.ledgerEntryId);

  const closed = await h.status('/currency/fx/revaluations', 409, {
    method: 'POST',
    headers: { 'Idempotency-Key': `${RUN}-closed-period` },
    body: JSON.stringify({ ...revaluationBody, fiscalPeriod: CLOSED_PERIOD, currentRate: '44.0000', rateDate: '2099-12-01T12:00:00.000Z' })
  });
  assert.match(JSON.stringify(closed.payload), /cerrado/i, 'closed period must be enforced server-side');

  // tenant A owns the event; tenant B must not be able to retrieve it through the repository boundary.
  const tenantA = h.tenant.id;
  const tenantB = randomUUID();
  assert.notEqual(tenantA, tenantB);
  assert.equal(await getFxEvent({ tenantId: tenantB, eventId: settlement.id }), null, 'tenant A event must be invisible to tenant B');

  const finalExposure = await h.ok(`/currency/fx/exposure?sourceType=sales&sourceId=${sale.id}`);
  assert.equal(finalExposure.exposures[0].original.currency, 'USD');
  assert.equal(finalExposure.exposures[0].functional.currency, 'VES');
  assert.equal(exact(finalExposure.exposures[0].outstandingOriginalAmount), '40.00');
  assert.equal(finalExposure.exposures[0].activeRevaluation, null, 'reversed unrealized FX must not remain active');
});
