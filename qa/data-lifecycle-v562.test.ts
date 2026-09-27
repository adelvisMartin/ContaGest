import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import {
  createLegalHold,
  executeLifecyclePurge,
  reconcileStorageOrphans,
  releaseLegalHold
} from '../backend/src/modules/data-lifecycle/data-lifecycle.repository.ts';

const RUN = `QA562-${Date.now().toString(36).toUpperCase()}`;

function candidateSha() {
  const sha = String(process.env.GITHUB_SHA || '').trim() || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.match(sha, /^[a-f0-9]{40}$/i, 'GITHUB_SHA/candidate SHA must be exact');
  return sha;
}

function oldDate(days = 500) {
  return new Date(Date.now() - days * 86_400_000);
}

test('issue #562 blocks immutable data, honors legal hold, isolates tenant purge and makes retry idempotent', async (t) => {
  const h = await createRealBackendHarness();
  t.after(async () => h.close());
  const sha = candidateSha();

  const databaseRows = await h.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.match(databaseRows[0]?.name || '', /lifecycle_v562_e2e$/, 'issue #562 must run only on disposable *_lifecycle_v562_e2e PostgreSQL');

  const tenantB = await h.prisma.tenant.create({
    data: { rif: `J-${Date.now()}-B`, name: `${RUN} Tenant B`, legalName: `${RUN} Tenant B` }
  });
  t.after(async () => { await h.prisma.tenant.deleteMany({ where: { id: tenantB.id } }); });

  const preflight = await h.ok('/data-lifecycle/tenant-exit/preflight');
  assert.equal(preflight.tenantId, h.tenant.id);
  assert.equal(preflight.exportRequired, true);
  assert.equal(typeof preflight.hardDeleteAllowed, 'boolean');
  assert.ok(preflight.blockers && preflight.immutableEvidence && preflight.exportInventory);

  const old = oldDate();
  const a1 = await h.prisma.analyticsEvent.create({ data: { tenantId: h.tenant.id, sessionId: `${RUN}-A1`, type: 'qa.lifecycle', createdAt: old } });
  const a2 = await h.prisma.analyticsEvent.create({ data: { tenantId: h.tenant.id, sessionId: `${RUN}-A2`, type: 'qa.lifecycle', createdAt: old } });
  const b1 = await h.prisma.analyticsEvent.create({ data: { tenantId: tenantB.id, sessionId: `${RUN}-B1`, type: 'qa.lifecycle', createdAt: old } });

  await assert.rejects(
    () => h.prisma.$transaction((tx) => executeLifecyclePurge(tx, { tenantId: h.tenant.id, entityType: 'ledger-entry', execute: true })),
    /no permite purge|purge físico/i
  );

  const hold = await createLegalHold({ tenantId: h.tenant.id, entityType: 'analytics-event', reason: 'QA legal hold must block purge' });
  await assert.rejects(
    () => h.prisma.$transaction((tx) => executeLifecyclePurge(tx, { tenantId: h.tenant.id, entityType: 'analytics-event', execute: true })),
    /legal hold/i
  );

  await releaseLegalHold({ tenantId: h.tenant.id, holdId: hold.id, reason: 'QA legal hold released after preservation check' });
  const preview = await h.prisma.$transaction((tx) => executeLifecyclePurge(tx, { tenantId: h.tenant.id, entityType: 'analytics-event', execute: false }));
  assert.ok(preview.candidates >= 2);
  assert.equal(preview.deleted, 0);
  assert.equal(await h.prisma.analyticsEvent.count({ where: { id: { in: [a1.id, a2.id] } } }), 2);

  const auditBefore = await h.prisma.auditLog.count({ where: { tenantId: h.tenant.id, action: 'data.lifecycle.purge.executed' } });
  const key = `${RUN}-Idempotency-Key`;
  const body = JSON.stringify({ entityType: 'analytics-event', execute: true });
  const first = await h.ok('/data-lifecycle/purge', { method: 'POST', headers: { 'Idempotency-Key': key }, body });
  const retry = await h.ok('/data-lifecycle/purge', { method: 'POST', headers: { 'Idempotency-Key': key }, body });
  assert.equal(retry.jobId, first.jobId, 'retry with the same Idempotency-Key must replay the same purge job');
  assert.equal(retry.deleted, first.deleted, 'retry must not create a double effect');
  assert.equal(await h.prisma.auditLog.count({ where: { tenantId: h.tenant.id, action: 'data.lifecycle.purge.executed' } }), auditBefore + 1, 'retry must not create a second audit effect');
  assert.equal(await h.prisma.analyticsEvent.count({ where: { id: { in: [a1.id, a2.id] } } }), 0, 'tenant A eligible rows must be purged');
  assert.equal(await h.prisma.analyticsEvent.count({ where: { id: b1.id, tenantId: tenantB.id } }), 1, 'tenant A purge must never touch tenant B');

  const jobs = await h.prisma.moduleRecord.findMany({ where: { tenantId: h.tenant.id, moduleSlug: 'data-lifecycle-job' }, orderBy: { createdAt: 'desc' }, take: 10 });
  assert.ok(jobs.some((job) => JSON.stringify(job.payload).includes('counts-and-cutoff-only')), 'evidence must record counts/cutoff without retaining purged row payloads');

  const removed: string[] = [];
  const storage = {
    async list(prefix: string) {
      assert.equal(prefix, `${h.tenant.id}/`);
      return [`${h.tenant.id}/profile/known/avatar.webp`, `${h.tenant.id}/profile/orphan/orphan.webp`];
    },
    async remove(paths: string[]) { removed.push(...paths); }
  };
  const storageResult = await reconcileStorageOrphans({
    tenantId: h.tenant.id,
    referencedPaths: [`${h.tenant.id}/profile/known/avatar.webp`, `${tenantB.id}/profile/foreign/avatar.webp`],
    adapter: storage,
    execute: true
  });
  assert.deepEqual(removed, [`${h.tenant.id}/profile/orphan/orphan.webp`]);
  assert.equal(storageResult.orphanCount, 1, 'storage sandbox must detect and remediate only tenant-scoped orphan media');
  assert.ok(sha, 'candidate SHA is bound to this PostgreSQL + storage sandbox run');
});
