import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareAsyncJobIntent, planAsyncJobFailure, assertAsyncJobTenantId, assertAsyncJobId, assertAsyncJobLeaseToken } from '../backend/src/modules/jobs/job-intent-policy.ts';

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
  assert.match(code, /"leaseUntil" > clock_timestamp\(\)/);
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
  assert.match(code, /assertAsyncJobLeaseToken\(leaseToken\)/);
});

test('last-attempt expired leases transition to dead-letter only under tenant scope', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  assert.match(code, /export async function quarantineExhaustedAsyncJobLeases/);
  assert.match(code, /"leaseUntil" <= clock_timestamp\(\) AND "attempts" >= "maxAttempts"/);
  assert.match(code, /"lastErrorCode"='JOB_LEASE_EXHAUSTED'/);
  assert.match(code, /j\."tenantId"=\$\{tenantId\}/);
});

test('lease deadlines use database clock rather than caller time', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  assert.match(code, /"leaseUntil"=clock_timestamp\(\) \+ \(\$\{leaseSeconds\} \* INTERVAL '1 second'\)/);
  assert.match(code, /"runAt" <= clock_timestamp\(\)/);
  assert.match(code, /"leaseUntil">clock_timestamp\(\)/);
  assert.doesNotMatch(code, /"leaseUntil"\s*[><]=?\s*\$\{now\}/);
});

test('all worker entrypoints enforce the canonical tenant UUID guard', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  assert.equal((code.match(/assertAsyncJobTenantId\(tenantId\);/g) || []).length, 5);
  for (const invalid of [undefined, null, '', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'not-a-tenant']) {
    assert.throws(() => assertAsyncJobTenantId(invalid), /JOB_TENANT_INVALID/);
  }
  assert.doesNotThrow(() => assertAsyncJobTenantId(base().tenantId));
});

test('retry deadlines and audit timestamps are chosen by PostgreSQL, not worker clock', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  assert.match(code, /"runAt"=CASE WHEN \$\{decision\.status\} = 'retry'/);
  assert.match(code, /THEN clock_timestamp\(\) \+ \(\$\{retryDelaySeconds\}::integer \* INTERVAL '1 second'\)/);
  assert.doesNotMatch(code, /COALESCE\(\$\{decision\.runAt\}/);
  assert.doesNotMatch(code, /"updatedAt"=\$\{now\}/);
  assert.match(code, /"updatedAt"=clock_timestamp\(\)/);
});


test('heartbeats are fenced by tenant, job ID, unique claim token and live database lease', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  const start = code.indexOf('export async function heartbeatClaimedAsyncJob(');
  const end = code.indexOf('// Read-only reconciler view', start);
  assert.ok(start > 0 && end > start);
  const heartbeat = code.slice(start, end);
  assert.match(heartbeat, /assertAsyncJobTenantId\(tenantId\)/);
  assert.match(heartbeat, /assertAsyncJobId\(id\)/);
  assert.match(heartbeat, /assertAsyncJobLeaseToken\(leaseToken\)/);
  assert.match(heartbeat, /JOB_LEASE_INVALID/);
  assert.match(heartbeat, /"tenantId"=\$\{tenantId\} AND "id"=\$\{id\}/);
  assert.match(heartbeat, /"status"='running' AND "leaseOwner"=\$\{leaseToken\}/);
  assert.match(heartbeat, /"leaseUntil">clock_timestamp\(\)/);
  assert.match(heartbeat, /ASYNC_JOB_LEASE_LOST/);
  assert.doesNotMatch(heartbeat, /"status"='queued'/);
});

test('heartbeat cannot extend beyond bounded SQL lease interval or trust worker clock', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  const heartbeat = code.split('export async function heartbeatClaimedAsyncJob(')[1]?.split('// Read-only reconciler view')[0];
  assert.ok(heartbeat);
  assert.match(heartbeat, /leaseSeconds < 15 \|\| leaseSeconds > 900/);
  assert.match(heartbeat, /"leaseUntil"=GREATEST\("leaseUntil", clock_timestamp\(\) \+ \(\$\{leaseSeconds\} \* INTERVAL '1 second'\)\)/);
  assert.match(heartbeat, /RETURNING "id", "leaseUntil"/);
  assert.doesNotMatch(heartbeat, /\$\{now\}/);
});


test('read-only tenant job health exposes bounded fields without payload, PII or cross-tenant sums', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  const begin = code.indexOf('export async function inspectTenantAsyncJobHealth(');
  const finish = code.indexOf('// Expired last-attempt claims', begin);
  assert.ok(begin >= 0 && finish > begin);
  const health = code.slice(begin, finish);
  assert.match(health, /assertAsyncJobTenantId\(input\.tenantId\)/);
  assert.match(health, /WHERE "tenantId"=\$\{tenantId\}/);
  assert.match(health, /"staleRunning"/);
  assert.match(health, /"exhaustedRunning"/);
  assert.match(health, /"oldestDueAt"/);
  assert.match(health, /statement_timestamp\(\)/);
  assert.match(health, /::text AS "queued"/);
  assert.doesNotMatch(health, /RETURNING|\bUPDATE\b|\bDELETE\b|"payload"|"lastErrorCode"/);
});


test('claim IDs and lease tokens reject malformed values before accessing the database', () => {
  const jobId = '4b4cb382-e839-4bf0-87c5-ff414cd5c46b';
  const token = `worker:v2:${jobId}`;
  assert.doesNotThrow(() => assertAsyncJobId(jobId));
  assert.doesNotThrow(() => assertAsyncJobLeaseToken(token));
  for (const id of [undefined, 42, '', '00000000-0000-0000-0000-000000000000', '4b4cb382-e839-4bf0-87c5-ff414cd5c46g']) {
    assert.throws(() => assertAsyncJobId(id), /JOB_ID_INVALID/);
  }
  for (const token of [undefined, null, '', jobId, `:${jobId}`, `worker:${jobId.slice(0,-1)}x`, `worker:${'a'.repeat(36)}`, `worker${'x'.repeat(120)}:${jobId}`]) {
    assert.throws(() => assertAsyncJobLeaseToken(token), /JOB_LEASE_TOKEN_INVALID/);
  }
});

test('completion, failure and heartbeat share exact job and claim token validators', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  assert.equal((code.match(/assertAsyncJobId\(id\);/g) || []).length, 3);
  assert.equal((code.match(/assertAsyncJobLeaseToken\(leaseToken\);/g) || []).length, 3);
  assert.doesNotMatch(code, /\[0-9a-f-\]\{36\}/);
});


test('atomic enqueue requires trusted, versioned handler allowlist before database insert', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  const start = code.indexOf('export async function enqueueAsyncJobIntent(');
  const next = code.indexOf('// Only the already tenant-bound worker', start);
  assert.ok(start >= 0 && next > start);
  const enqueue = code.slice(start,next);
  assert.match(enqueue, /handlerRegistry: AsyncJobHandlerRegistry/);
  assert.match(enqueue, /assertApprovedAsyncJobHandler\(handlerRegistry, request\.handlerKey, JSON\.parse\(request\.payloadJson\)\)/);
  assert.ok(enqueue.indexOf('assertApprovedAsyncJobHandler(') < enqueue.indexOf('tx.$queryRaw'));
  assert.match(code, /from '\.\/async-handler-registry\.js'/);
});

test('failure persistence depends on central safe classification', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  const start = code.indexOf('export async function failClaimedAsyncJob(');
  const end = code.indexOf('// Heartbeat is a fenced', start);
  assert.ok(start > 0 && end > start);
  const failure = code.slice(start, end);
  assert.ok(failure.includes('failure: unknown; idempotentRetryVerified: boolean;'));
  assert.ok(failure.includes('classifyAsyncJobFailure(failure, { idempotentRetryVerified })'));
  assert.ok(failure.includes('retryable:failureDecision.retryable'));
  assert.ok(failure.includes('"lastErrorCode"=${failureDecision.safeErrorCode}'));
  assert.ok(failure.indexOf('classifyAsyncJobFailure(') < failure.indexOf('tx.$queryRaw'));
  assert.ok(!failure.includes('retryable: boolean; safeErrorCode: string;'));
  assert.ok(code.includes("from './async-failure-policy.js'"));
});


test('claimed jobs carry the original effect key required by handler idempotency', () => {
  const code = readFileSync(new URL('../backend/src/modules/jobs/async-job-intent.service.ts', import.meta.url), 'utf8');
  const start = code.indexOf('export async function claimDueAsyncJobs(');
  const end = code.indexOf('export async function completeClaimedAsyncJob(', start);
  assert.ok(start >= 0 && end > start);
  const claim = code.slice(start, end);
  assert.ok(claim.includes('effectKey: string; payload: unknown;'));
  assert.ok(claim.includes('j."handlerKey", j."effectKey", j."payload"'));
  assert.ok(claim.includes('j."tenantId"=${tenantId}'));
  assert.ok(claim.includes('FOR UPDATE SKIP LOCKED'));
});
