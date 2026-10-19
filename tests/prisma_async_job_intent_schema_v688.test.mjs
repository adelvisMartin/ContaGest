import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../backend/prisma/migrations/20261015114500_issue_853_job_intent_foundation/migration.sql', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../backend/scripts/sync-employee-prisma-schema.mjs', import.meta.url), 'utf8');
const model = schema.match(/^model AsyncJobIntent \{([\s\S]*?)^\}/gm) ?? [];

test('#688 tenant reverse relation has exactly one resolvable Prisma model', () => {
  assert.match(schema, /\basyncJobIntents\s+AsyncJobIntent\[\]/);
  assert.equal(model.length, 1, 'a missing model fails prisma generate P1012');
  assert.match(model[0], /\btenant\s+Tenant\s+@relation\(fields: \[tenantId\], references: \[id\], onDelete: Restrict\)/);
});

test('#688 Prisma intent fields agree with immutable #853 SQL authority', () => {
  assert.match(migration, /CREATE TABLE public\."AsyncJobIntent"/);
  const pairs = {
    tenantId: /"tenantId" TEXT NOT NULL/,
    handlerKey: /"handlerKey" VARCHAR\(100\) NOT NULL/,
    effectKey: /"effectKey" VARCHAR\(160\) NOT NULL/,
    requestHash: /"requestHash" CHAR\(64\) NOT NULL/,
    payload: /"payload" JSONB NOT NULL/,
    status: /"status" TEXT NOT NULL/,
    runAt: /"runAt" TIMESTAMPTZ NOT NULL/,
    attempts: /"attempts" INT NOT NULL/,
    maxAttempts: /"maxAttempts" INT NOT NULL/,
    leaseOwner: /"leaseOwner" VARCHAR\(160\)/,
    leaseUntil: /"leaseUntil" TIMESTAMPTZ/,
    lastErrorCode: /"lastErrorCode" VARCHAR\(100\)/,
    createdAt: /"createdAt" TIMESTAMPTZ NOT NULL/,
    updatedAt: /"updatedAt" TIMESTAMPTZ NOT NULL/
  };
  for (const [field, sql] of Object.entries(pairs)) {
    assert.match(model[0], new RegExp('\\b' + field + '\\s+'), field);
    assert.match(migration, sql, field);
  }
  assert.match(model[0], /@@unique\(\[tenantId, effectKey\], map: "async_job_intent_effect"\)/);
  assert.match(migration, /CONSTRAINT async_job_intent_effect UNIQUE \("tenantId", "effectKey"\)/);
});

test('#688 guard stays isolated with no second migration or permissive grant', () => {
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\."AsyncJobIntent" FROM PUBLIC/);
  assert.doesNotMatch(migration, /CREATE POLICY/i);
  assert.match(sync, /Prisma sincronizado: Employee/);
  assert.doesNotMatch(sync, /model AsyncJobIntent/);
});
