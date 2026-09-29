import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const canonical = {
  repository: 'backend/src/modules/fiscal/fiscal.repository.ts',
  routes: 'backend/src/modules/fiscal/fiscal.routes.ts',
  migration: 'backend/prisma/migrations/20260927143000_fiscal_authority_v561/migration.sql',
  qa: 'qa/fiscal-authority-v561.test.ts',
  contract: 'tests/fiscal_authority_v561_contract.test.mjs',
  workflow: '.github/workflows/fiscal-authority-v561.yml',
  adr: 'docs/ADR_FISCAL_AUTHORITY_V561.md',
};

const superseded = [
  'backend/src/modules/accounting/fiscal.repository.ts',
  'qa/fiscal-engine-v561.test.ts',
  'tests/fiscal_engine_v561_contract.test.mjs',
  '.github/workflows/fiscal-engine-v561.yml',
];

const retainedHistoricalMigration = 'backend/prisma/migrations/20260927143000_fiscal_engine_v561/migration.sql';

function walkSource(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return walkSource(child);
    return entry.isFile() && /\.(?:ts|mts|cts)$/.test(entry.name) ? [child] : [];
  });
}

test('Fiscal has one canonical source authority and no active legacy engine', () => {
  for (const file of Object.values(canonical)) {
    assert.equal(exists(file), true, `missing canonical fiscal surface: ${file}`);
  }

  for (const file of superseded) {
    assert.equal(exists(file), false, `superseded fiscal authority must be removed: ${file}`);
  }

  assert.equal(exists(retainedHistoricalMigration), true, 'historical Prisma migration must remain immutable');
  assert.match(read(retainedHistoricalMigration), /no-op|superseded/i);
});

test('canonical repository owns rules, sequence, snapshots and close evidence', () => {
  const repository = read(canonical.repository);
  for (const token of ['FiscalRuleVersion', 'FiscalSequence', 'FiscalDocumentRuleSnapshot', 'FiscalCloseEvidence']) {
    assert.match(repository, new RegExp(token), `canonical repository missing ${token}`);
  }
  for (const legacyToken of ['FiscalNumberReservation', 'allocate_fiscal_number']) {
    assert.doesNotMatch(repository, new RegExp(legacyToken), `legacy fiscal primitive leaked into canonical repository: ${legacyToken}`);
  }
});

test('canonical routes use TEXT tenant/document identifiers without UUID casts', () => {
  const routes = read(canonical.routes);
  assert.match(routes, /from '\.\/fiscal\.repository\.js'/);
  assert.match(routes, /runFinancialIdempotentMutation/);
  assert.doesNotMatch(routes, /tenantId[^\n]*::uuid/i, 'tenantId is TEXT in the canonical schema');
  assert.doesNotMatch(routes, /fiscalDocumentId[^\n]*::uuid/i, 'fiscalDocumentId is TEXT in the canonical schema');
});

test('backend source cannot reintroduce the superseded reservation/RPC authority', () => {
  const violations = [];
  for (const file of walkSource('backend/src')) {
    const source = read(file);
    if (/FiscalNumberReservation|allocate_fiscal_number/.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, [], `legacy fiscal authority tokens found in: ${violations.join(', ')}`);
});
