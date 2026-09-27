import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { listFiscalRuleVersions } from '../backend/src/modules/fiscal/fiscal.repository.ts';

const RUN = `QA561-${Date.now().toString(36).toUpperCase()}`;
const PERIOD = '2099-06';

function candidateSha() {
  const sha = String(process.env.GITHUB_SHA || '').trim() || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.match(sha, /^[a-f0-9]{40}$/i, 'GITHUB_SHA/candidate SHA must be exact');
  return sha;
}

test('issue #561 keeps fiscal rules historical and numbering unique under concurrent PostgreSQL requests', async (t) => {
  const h = await createRealBackendHarness();
  t.after(async () => h.close());
  const sha = candidateSha();

  const databaseRows = await h.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.match(databaseRows[0]?.name || '', /fiscal_v561_e2e$/, 'issue #561 must run only on disposable *_fiscal_v561_e2e PostgreSQL');

  await h.prisma.closingPeriod.deleteMany({ where: { tenantId: h.tenant.id, period: PERIOD, module: 'fiscal' } });
  await h.ok('/fiscal/periods', { method: 'POST', body: JSON.stringify({ period: PERIOD, module: 'fiscal', note: `${RUN} exact SHA ${sha}` }) });

  const ruleV1 = await h.ok('/fiscal/rules', {
    method: 'POST',
    body: JSON.stringify({
      ruleKey: `${RUN.toLowerCase()}.iva`,
      effectiveFrom: '2099-01-01T00:00:00.000Z',
      effectiveTo: '2099-07-01T00:00:00.000Z',
      source: 'QA Gazette v1',
      documentation: 'QA provenance fixture for historical rule v1',
      definition: { rate: '16.00', basis: 'net' }
    })
  });
  assert.equal(ruleV1.version, 1);

  const concurrent = 12;
  const issued = await Promise.all(Array.from({ length: concurrent }, (_, index) => h.ok('/fiscal/documents/issue', {
    method: 'POST',
    headers: { 'Idempotency-Key': `${RUN}-concurrent-${index}` },
    body: JSON.stringify({
      kind: 'invoice',
      period: PERIOD,
      module: 'fiscal',
      payload: { run: RUN, concurrent: index },
      ruleKeys: [`${RUN.toLowerCase()}.iva`],
      effectiveAt: '2099-06-15T12:00:00.000Z',
      prefix: `${RUN}-`,
      width: 4
    })
  })));
  const numbers = issued.map((row) => String(row.number));
  assert.equal(new Set(numbers).size, concurrent, 'concurrent requests must never obtain the same fiscal number');

  const retryKey = `${RUN}-retry-Idempotency-Key`;
  const retryBody = {
    kind: 'invoice', period: PERIOD, module: 'fiscal', payload: { run: RUN, retry: true },
    ruleKeys: [`${RUN.toLowerCase()}.iva`], effectiveAt: '2099-06-20T12:00:00.000Z', prefix: `${RUN}-`, width: 4
  };
  const first = await h.ok('/fiscal/documents/issue', { method: 'POST', headers: { 'Idempotency-Key': retryKey }, body: JSON.stringify(retryBody) });
  const replay = await h.ok('/fiscal/documents/issue', { method: 'POST', headers: { 'Idempotency-Key': retryKey }, body: JSON.stringify(retryBody) });
  assert.equal(replay.id, first.id, 'Idempotency-Key retry must return the same document');
  assert.equal(replay.number, first.number, 'retry must not consume another fiscal sequence number');

  const historicalBefore = await h.ok(`/fiscal/documents/${first.id}/rules`);
  assert.equal(historicalBefore[0].ruleVersion, 1);
  assert.equal(historicalBefore[0].source, 'QA Gazette v1');

  const ruleV2 = await h.ok('/fiscal/rules', {
    method: 'POST',
    body: JSON.stringify({
      ruleKey: `${RUN.toLowerCase()}.iva`,
      effectiveFrom: '2099-07-01T00:00:00.000Z',
      source: 'QA Gazette v2',
      documentation: 'QA provenance fixture for rule v2; historical documents must keep v1',
      definition: { rate: '17.00', basis: 'net' }
    })
  });
  assert.equal(ruleV2.version, 2);
  const historicalAfter = await h.ok(`/fiscal/documents/${first.id}/rules`);
  assert.equal(historicalAfter[0].ruleVersion, 1, 'historical snapshot must not be reinterpreted with a new rule');
  assert.equal(historicalAfter[0].ruleHash, historicalBefore[0].ruleHash);

  const tenantA = h.tenant.id;
  const tenantB = randomUUID();
  assert.notEqual(tenantA, tenantB);
  assert.deepEqual(await listFiscalRuleVersions(tenantB, `${RUN.toLowerCase()}.iva`), [], 'tenant A rules must be invisible to tenant B');

  const draft = await h.prisma.salesInvoice.create({
    data: { tenantId: h.tenant.id, number: `${RUN}-DRAFT`, fiscalPeriod: PERIOD, status: 'draft' }
  });
  const blocked = await h.status('/fiscal/close-period', 409, {
    method: 'POST',
    headers: { 'Idempotency-Key': `${RUN}-closed-blocked` },
    body: JSON.stringify({ period: PERIOD, module: 'fiscal', note: 'must fail while draft exists' })
  });
  assert.match(JSON.stringify(blocked.payload), /FISCAL_CLOSE_PRECHECK_FAILED|invariantes/i);

  await h.prisma.salesInvoice.update({ where: { id: draft.id }, data: { status: 'issued' } });
  const closeKey = `${RUN}-closed-success`;
  const closeBody = { period: PERIOD, module: 'fiscal', note: 'QA post-close evidence' };
  const closed = await h.ok('/fiscal/close-period', { method: 'POST', headers: { 'Idempotency-Key': closeKey }, body: JSON.stringify(closeBody) });
  const closedReplay = await h.ok('/fiscal/close-period', { method: 'POST', headers: { 'Idempotency-Key': closeKey }, body: JSON.stringify(closeBody) });
  assert.equal(closedReplay.id, closed.id, 'close retry must be idempotent');
  assert.match(String(closed.postCloseHash), /^[a-f0-9]{64}$/i);
  assert.equal(closed.prechecks.draftSalesDocuments, 0);

  const evidence = await h.ok(`/fiscal/close-period/evidence?period=${PERIOD}&module=fiscal`);
  assert.equal(evidence.postCloseHash, closed.postCloseHash);
  assert.equal(evidence.postCloseReport.status, 'closed');

  const afterClose = await h.status('/fiscal/documents/issue', 409, {
    method: 'POST',
    headers: { 'Idempotency-Key': `${RUN}-after-closed` },
    body: JSON.stringify({ ...retryBody, payload: { run: RUN, closed: true } })
  });
  assert.match(JSON.stringify(afterClose.payload), /FISCAL_PERIOD_CLOSED|cerrado/i);
});
