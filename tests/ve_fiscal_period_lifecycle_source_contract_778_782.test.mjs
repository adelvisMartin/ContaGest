import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../backend/src/modules/fiscal/fiscal.routes.ts', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../backend/src/modules/fiscal/fiscal.repository.ts', import.meta.url), 'utf8');
const close = route.split("router.post('/close-period'")[1]?.split("router.get('/close-period/evidence'")[0];
const reopen = route.split("router.post('/reopen-period'")[1]?.split("router.post('/documents/issue'")[0];
const issue = route.split("router.post('/documents/issue'")[1]?.split("router.post('/documents',")[0];

test('#778/#782 close and reopen guard against different-key concurrent transitions', () => {
  assert.ok(close && reopen);
  assert.match(close, /FOR UPDATE/);
  assert.match(reopen, /FOR UPDATE/);
  assert.match(close, /await runFinancialIdempotentMutation/);
  assert.match(reopen, /await runFinancialIdempotentMutation/);
  assert.match(close, /normalizeIdempotencyKey/);
  assert.match(reopen, /normalizeIdempotencyKey/);
  assert.match(close, /tx\.auditLog\.create/);
  assert.match(reopen, /tx\.auditLog\.create/);
  assert.doesNotMatch(close, /await writeAudit\(/);
  assert.doesNotMatch(reopen, /await writeAudit\(/);
});

test('#778 document issuance must block missing retry key and tampered version/hash', () => {
  assert.ok(issue);
  assert.match(issue, /normalizeIdempotencyKey/);
  assert.match(issue, /FISCAL_IDEMPOTENCY_REQUIRED/);
  assert.match(issue, /assertFiscalEffectivePeriod\(req\.body\.period, effectiveAt\)/);
  assert.match(issue, /resolveFiscalRules\(tx/);
  assert.match(repository, /FISCAL_RULE_VERSION_HASH_MISMATCH/);
  assert.match(repository, /fiscalEvidenceHash\(\{/);
});
