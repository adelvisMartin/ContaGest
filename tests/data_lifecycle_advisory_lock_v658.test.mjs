import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-backed regression for #658. PostgreSQL/Prisma integration remains
// a separate mandatory gate and is deliberately not simulated here.
const service = readFileSync('backend/src/modules/data-lifecycle/data-lifecycle.service.ts', 'utf8');
const policy = service.slice(
  service.indexOf('export async function createRetentionPolicyVersion'),
  service.indexOf('export async function listRetentionPolicies')
);

test('#658 retention lock projection uses a Prisma-supported integer', () => {
  assert.match(policy, /SELECT\\s+1::integer\\s+AS\\s+"lockAcquired"\\s+FROM\\s+pg_advisory_xact_lock\\(hashtextextended\\(/);
  assert.doesNotMatch(policy, /SELECT\\s+pg_advisory_xact_lock\\(/);
});

test('#658 policy version lock remains transaction-scoped and precedes version allocation', () => {
  const transaction = policy.indexOf('prisma.$transaction(async (tx)');
  const lock = policy.indexOf('FROM pg_advisory_xact_lock(');
  const version = policy.indexOf('SELECT COALESCE(MAX("version"), 0)::integer');
  const insert = policy.indexOf('INSERT INTO public."DataRetentionPolicyVersion"');
  assert.ok(transaction >= 0 && lock > transaction && version > lock && insert > version);
  assert.match(policy, /hashtextextended\\(\\$\\{\\`\\$\\{input\\.tenantId\\}:\\$\\{input\\.entityType\\}\\`\\}, 562\\)/);
});
