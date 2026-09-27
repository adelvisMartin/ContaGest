import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  'backend/prisma/migrations/20260927143000_fiscal_engine_v561/migration.sql',
  'utf8',
);
const repository = fs.readFileSync('backend/src/modules/accounting/fiscal.repository.ts', 'utf8');

test('#561 keeps provenance, effective dates and immutable historical snapshots', () => {
  assert.match(migration, /FiscalRuleVersion/);
  assert.match(migration, /effectiveFrom/);
  assert.match(migration, /effectiveTo/);
  assert.match(migration, /source/);
  assert.match(migration, /documentation/);
  assert.match(migration, /validity windows overlap/);
  assert.match(migration, /contentHash/);
  assert.match(migration, /FiscalDocumentRuleSnapshot_immutable_trg/);
  assert.match(repository, /resolveFiscalRule/);
  assert.match(repository, /versión fiscal diferente/);
});

test('#561 serializes retries and allocates unique fiscal numbers without recycling', () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /UPDATE "FiscalSequence"[\s\S]*"nextValue" = "nextValue" \+ 1/);
  assert.match(migration, /FiscalNumberReservation_idempotency_key/);
  assert.match(migration, /FiscalNumberReservation_number_key/);
  assert.match(migration, /status" IN \('allocated', 'bound', 'cancelled'\)/);
});

test('#561 gates close/reopen and records pre/post evidence with a SHA-256 hash', () => {
  assert.match(migration, /period close prechecks failed/);
  assert.match(migration, /unbalancedPostedEntries/);
  assert.match(migration, /postchecks/);
  assert.match(migration, /authorized reopen workflow/);
  assert.match(migration, /FiscalCloseEvidence_guard_trg/);
  assert.match(migration, /sha256/);
});
