import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// #658 source-level regression: actual PG17/Prisma integration is separately required.
const service = readFileSync('backend/src/modules/data-lifecycle/data-lifecycle.service.ts', 'utf8');
const policy = service.slice(
  service.indexOf('export async function createRetentionPolicyVersion'),
  service.indexOf('export async function listRetentionPolicies')
);

test('#658 retention lock projects a Prisma-supported integer', () => {
  assert.ok(policy.includes('SELECT 1::integer AS "lockAcquired" FROM pg_advisory_xact_lock('));
  assert.equal(policy.includes('SELECT pg_advisory_xact_lock('), false);
});

test('#658 policy version lock stays inside transaction, before allocation and insert', () => {
  const transaction = policy.indexOf('prisma.$transaction(async (tx)');
  const lock = policy.indexOf('FROM pg_advisory_xact_lock(');
  const version = policy.indexOf('SELECT COALESCE(MAX("version"), 0)::integer');
  const insert = policy.indexOf('INSERT INTO public."DataRetentionPolicyVersion"');
  assert.ok(transaction >= 0 && lock > transaction && version > lock && insert > version);
  assert.ok(policy.includes('hashtextextended('));
  assert.ok(policy.includes('input.tenantId'));
  assert.ok(policy.includes('input.entityType'));
});
