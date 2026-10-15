import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareAsyncJobIntent, planAsyncJobFailure } from '../backend/src/modules/jobs/job-intent-policy.ts';

const base = () => ({ tenantId: '96a5f951-03ef-44f6-a3de-984e9b29cf52', handlerKey: 'reports.refresh.v1', effectKey: 'report:42', payload: { amount: '0.01', id: '42' }, maxAttempts: 3, runAt: new Date('2026-10-15T15:00:00Z') });

test('stable request hash ignores JSON property insertion order and uses exact string amounts', () => {
  const a = prepareAsyncJobIntent(base());
  const b = prepareAsyncJobIntent({ ...base(), payload: { id: '42', amount: '0.01' } });
  assert.equal(a.requestHash, b.requestHash);
  assert.equal(a.payloadJson, '{"amount":"0.01","id":"42"}');
  assert.match(a.requestHash, /^[0-9a-f]{64}$/);
});

test('different effect meaning changes fingerprint', () => {
  const a = prepareAsyncJobIntent(base());
  for (const mutated of [ { payload: { amount: '0.02' } }, { runAt: new Date('2026-10-15T16:00:00Z') }, { handlerKey: 'reports.refresh.v2' }, { maxAttempts: 4 } ]) {
    assert.notEqual(a.requestHash, prepareAsyncJobIntent({ ...base(), ...mutated }).requestHash);
  }
});

test('fail closed on invalid identity, handler, key, attempt or schedule', () => {
  for (const mutated of [ { tenantId: 'other' }, { handlerKey: '__proto__' }, { handlerKey: 'send' }, { effectKey: '../ with spaces' }, { maxAttempts: 0 }, { maxAttempts: 21 }, { runAt: new Date('invalid') } ]) {
    assert.throws(() => prepareAsyncJobIntent({ ...base(), ...mutated }), /^Error: JOB_/);
  }
});

test('reject unbounded, non-object, non-JSON and deeply nested payload', () => {
  for (const payload of [ null, [], new Date(), { x: BigInt(1) }, { x: undefined }, { x: Number.POSITIVE_INFINITY }, { x: 'x'.repeat(17_000) } ]) {
    assert.throws(() => prepareAsyncJobIntent({ ...base(), payload }), /^Error: JOB_/);
  }
  let deep = {}; for (let i = 0; i < 14; i++) deep = { deep };
  assert.throws(() => prepareAsyncJobIntent({ ...base(), payload: deep }), /JOB_PAYLOAD_DEPTH_EXCEEDED/);
});

test('explicit retry only, bounded exponential backoff and terminal dead-letter', () => {
  const now = new Date('2026-10-15T15:00:00Z');
  assert.deepEqual(planAsyncJobFailure({ attempts: 1, maxAttempts: 5, retryable: true, now }), { status: 'retry', runAt: new Date(now.getTime() + 5000) });
  assert.deepEqual(planAsyncJobFailure({ attempts: 2, maxAttempts: 5, retryable: true, now }), { status: 'retry', runAt: new Date(now.getTime() + 10000) });
  assert.deepEqual(planAsyncJobFailure({ attempts: 5, maxAttempts: 5, retryable: true, now }), { status: 'dead', runAt: null });
  assert.deepEqual(planAsyncJobFailure({ attempts: 1, maxAttempts: 5, retryable: false, now }), { status: 'dead', runAt: null });
  assert.throws(() => planAsyncJobFailure({ attempts: 1, maxAttempts: 5, now }), /JOB_RETRY_CLASSIFICATION_REQUIRED/);
});

test('migration retains atomic claim, tenant RLS, dedupe and bounded lease', () => {
  const sql = readFileSync(new URL('../backend/prisma/migrations/20261015114500_issue_853_job_intent_foundation/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  // The canonical sidecar provisions the tenant policy after Prisma deploy.
  // The table must deny runtime access until that sidecar actually runs.
  assert.doesNotMatch(sql, /\bCREATE\s+POLICY\b/i);
  assert.match(sql, /No policy here: the v845 sidecar/);
  assert.match(sql, /UNIQUE\s*\("tenantId",\s*"effectKey"\)/);
  assert.match(sql, /CHECK\s*\("maxAttempts" BETWEEN 1 AND 20\)/);
});

test('service requires an existing transaction and keeps CAS/atomic claim guards', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  assert.match(code, /enqueueAsyncJobIntent\(tx: Prisma\.TransactionClient/);
  assert.match(code, /FOR UPDATE SKIP LOCKED/);
  assert.match(code, /"tenantId" = \$\{tenantId\}/);
  assert.match(code, /"leaseOwner" = \$\{leaseToken\}/);
  assert.match(code, /"leaseUntil" > \$\{now\}/);
  assert.match(code, /"leaseOwner"=\$\{workerId\} \|\| '\:' \|\| gen_random_uuid\(\)::text/);
  assert.match(code, /quarantineExhaustedAsyncJobLeases\(/);
  assert.match(code, /"attempts" >= "maxAttempts"/);
  assert.match(code, /ON CONFLICT \("tenantId", "effectKey"\)/);
});


test('fencing tokens are unique per claim and cannot be reused by a restarted worker name', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  assert.match(code, /"leaseOwner"=\$\{workerId\} \|\| ':' \|\| gen_random_uuid\(\)::text/);
  assert.match(code, /RETURNING j\."id".+j\."leaseOwner"/);
  assert.match(code, /"leaseOwner"=\$\{leaseToken\}/);
  assert.match(code, /JOB_LEASE_TOKEN_INVALID/);
});

test('last-attempt expired leases transition to dead-letter only under tenant scope', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  assert.match(code, /export async function quarantineExhaustedAsyncJobLeases/);
  assert.match(code, /"leaseUntil" <= \$\{now\} AND "attempts" >= "maxAttempts"/);
  assert.match(code, /"lastErrorCode"='JOB_LEASE_EXHAUSTED'/);
  assert.match(code, /j\."tenantId"=\$\{tenantId\}/);
});
