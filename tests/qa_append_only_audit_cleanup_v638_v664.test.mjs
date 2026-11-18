import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const fixtures = [
  'qa/crud-audit-atomicity-v638.test.ts',
  'qa/erp-operational-crud-v664.test.ts',
];

test('#638/#664 PG17 fixture cleanup never deletes append-only forensic audit history', () => {
  for (const path of fixtures) {
    const source = read(path);
    assert.match(source, /createRealBackendHarness\(\)/, path);
    assert.doesNotMatch(source, /auditLog\.delete(?:Many)?\s*\(/,
      path + ' must not bypass immutable AuditLog policy');
    assert.match(source, /client\.deleteMany\s*\(/, path);
    assert.match(source, /await h\.close\(\)/, path);
  }
});

test('#638/#664 fixtures keep positive, negative and tenant audit assertions', () => {
  const atomic = read(fixtures[0]);
  const operational = read(fixtures[1]);
  assert.match(atomic, /expectAuditFkFailure\('create'/);
  assert.match(atomic, /expectAuditFkFailure\('update'/);
  assert.match(atomic, /expectAuditFkFailure\('delete'/);
  assert.match(operational, /deleteAudit\.length, 1/);
  assert.match(operational, /entry\.tenantId, h\.tenant\.id/);
  assert.match(operational, /rejected update must not create audit or mutate client/);
});
