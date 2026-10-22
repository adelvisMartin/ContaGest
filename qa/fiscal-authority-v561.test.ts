import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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


  // The review flow uses real session-bound users with independent fiscal roles.
  // All data stays in the disposable *_fiscal_v561_e2e test database.
  const actorSuffix = randomUUID().slice(0, 8);
  const roles = await h.prisma.userRole.findMany({ where: { userId: h.admin.id }, select: { roleId: true } });
  const reviewer = await h.prisma.userProfile.create({ data: {
    tenantId: h.tenant.id, email: `qa-rule-review-${actorSuffix}@example.invalid`,
    fullName: 'Synthetic fiscal rule reviewer'
  } });
  const activator = await h.prisma.userProfile.create({ data: {
    tenantId: h.tenant.id, email: `qa-rule-activate-${actorSuffix}@example.invalid`,
    fullName: 'Synthetic fiscal rule activator'
  } });
  await h.prisma.userRole.createMany({ data: [
    ...roles.map(({ roleId }) => ({ userId: reviewer.id, roleId })),
    ...roles.map(({ roleId }) => ({ userId: activator.id, roleId }))
  ] });
  const reviewerToken = await h.issueSessionTokenFor(reviewer);
  const activatorToken = await h.issueSessionTokenFor(activator);
  t.after(async () => {
    await h.prisma.userRole.deleteMany({ where: { userId: { in: [reviewer.id, activator.id] } } });
    await h.prisma.userProfile.deleteMany({ where: { id: { in: [reviewer.id, activator.id] } } });
  });

  async function createReviewedRule(definition: {
    reference: string; effectiveFrom: string; effectiveTo?: string | null;
    numerator: number; supersedesId?: string;
  }) {
    const digest = createHash('sha256').update(`fixture-${actorSuffix}-${definition.reference}`).digest('hex');
    const source = await h.ok('/fiscal/legal-sources', { method: 'POST', body: JSON.stringify({
      sourceType: 'official_gazette', reference: definition.reference,
      title: 'Synthetic source - no legal effect',
      sourceUrl: 'https://example.org/synthetic-only', contentSha256: digest
    }) });
    await h.status(`/fiscal/legal-sources/${source.id}/review`, 409, {
      method: 'POST', body: JSON.stringify({ approved: true, reason: 'Creator may not review own legal capture.' })
    });
    await h.ok(`/fiscal/legal-sources/${source.id}/review`, {
      method: 'POST', body: JSON.stringify({ approved: true, reason: 'Independent source review for synthetic test only.' })
    }, reviewerToken);
    const rule = await h.ok('/fiscal/rules', { method: 'POST', body: JSON.stringify({
      ruleKey: `${RUN.toLowerCase()}.iva`,
      effectiveFrom: definition.effectiveFrom,
      effectiveTo: definition.effectiveTo || null,
      source: definition.reference,
      documentation: 'Synthetic fixture; not statutory law or an approved rate.',
      legalSourceId: source.id,
      ...(definition.supersedesId ? { supersedesId: definition.supersedesId } : {}),
      definition: { formula: 'RATIO_MINOR_UNITS', numerator: definition.numerator,
        denominator: 100, basis: 'taxable_minor' }
    }) });
    assert.equal(rule.status, 'DRAFT');
    await h.status('/fiscal/documents/issue', 422, { method: 'POST',
      headers: { 'Idempotency-Key': `${RUN}-draft-rejected-${rule.version}` },
      body: JSON.stringify({ kind: 'invoice', period: PERIOD, module: 'fiscal',
        ruleKeys: [rule.ruleKey], effectiveAt: definition.effectiveFrom, payload: { synthetic: true } })
    });
    await h.status(`/fiscal/rules/${rule.id}/review`, 409, { method: 'POST',
      body: JSON.stringify({ reason: 'Creator cannot approve the same rule version.' }) });
    await h.ok(`/fiscal/rules/${rule.id}/review`, { method: 'POST',
      body: JSON.stringify({ reason: 'Reviewed synthetic ratio DSL and source digest.' }) }, reviewerToken);
    await h.status(`/fiscal/rules/${rule.id}/activate`, 409, { method: 'POST',
      body: JSON.stringify({ reason: 'Same reviewer cannot activate fiscal rule.' }) }, reviewerToken);
    const active = await h.ok(`/fiscal/rules/${rule.id}/activate`, { method: 'POST',
      body: JSON.stringify({ reason: 'Third actor validates synthetic activation.' }) }, activatorToken);
    assert.equal(active.status, 'ACTIVE');
    return { ...active, legalSourceSha256: digest, sourceId: source.id };
  }

  const ruleV1 = await createReviewedRule({
    reference: `QA-GAZETTE-V1-${actorSuffix}`,
    effectiveFrom: '2099-01-01T00:00:00.000Z',
    effectiveTo: '2099-07-01T00:00:00.000Z',
    numerator: 16
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
  assert.equal(historicalBefore[0].source, ruleV1.source);
  assert.equal(historicalBefore[0].legalSourceId, ruleV1.sourceId);
  assert.equal(historicalBefore[0].legalSourceSha256, ruleV1.legalSourceSha256);

  const ruleV2 = await createReviewedRule({
    reference: `QA-GAZETTE-V2-${actorSuffix}`,
    // This window overlaps v1 intentionally. Supersession is explicit and
    // commits atomically; old documents continue to replay v1 snapshots.
    effectiveFrom: '2099-06-25T00:00:00.000Z', numerator: 17,
    supersedesId: ruleV1.id
  });
  assert.equal(ruleV2.version, 2);
  const firstVersion = (await h.ok(`/fiscal/rules?ruleKey=${encodeURIComponent(ruleV1.ruleKey)}`))
    .find((row: { id: string }) => row.id === ruleV1.id);
  assert.equal(firstVersion?.status, 'SUPERSEDED');
  const successorDocs = await h.ok('/fiscal/documents/issue', { method: 'POST',
    headers: { 'Idempotency-Key': `${RUN}-successor-rule` },
    body: JSON.stringify({ kind: 'invoice', period: PERIOD, module: 'fiscal',
      payload: { syntheticSuccessor: true }, ruleKeys: [ruleV1.ruleKey],
      effectiveAt: '2099-06-26T12:00:00.000Z', prefix: `${RUN}-`, width: 4 })
  });
  assert.equal(successorDocs.appliedRules[0].ruleVersion, 2);

  const historicalAfter = await h.ok(`/fiscal/documents/${first.id}/rules`);
  assert.equal(historicalAfter[0].ruleVersion, 1, 'historical snapshot must not be reinterpreted with a new rule');
  assert.equal(historicalAfter[0].ruleHash, historicalBefore[0].ruleHash);
  // Regression on isolated PostgreSQL 17: historical rows must be immutable
  // below the API boundary, including for a session with write capability.
  await assert.rejects(
    h.prisma.$executeRaw`UPDATE public."FiscalDocumentRuleSnapshot"
      SET "source" = 'tampered QA source'
      WHERE "tenantId" = ${h.tenant.id} AND "fiscalDocumentId" = ${first.id}`,
    /FISCAL_RULE_SNAPSHOT_IMMUTABLE/i
  );
  await assert.rejects(
    h.prisma.$executeRaw`DELETE FROM public."FiscalDocumentRuleSnapshot"
      WHERE "tenantId" = ${h.tenant.id} AND "fiscalDocumentId" = ${first.id}`,
    /FISCAL_RULE_SNAPSHOT_IMMUTABLE/i
  );
  assert.equal((await h.ok(`/fiscal/documents/${first.id}/rules`))[0].ruleHash, historicalBefore[0].ruleHash);


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
