import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../backend/prisma/migrations/20260930163000_issue_685_historical_cascade_policy/migration.sql',
  import.meta.url,
);
const manifestUrl = new URL('../config/historical-cascade-policy-v685.json', import.meta.url);

const EXPECTED_CASCADE_KEYS = [
  'AuditLog.AuditLog_tenantId_fkey',
  'FinancialFxLedgerLineSnapshot.FinancialFxLedgerLineSnapshot_line_fkey',
  'FinancialFxLedgerLineSnapshot.FinancialFxLedgerLineSnapshot_tenant_fkey',
  'FiscalCloseEvidence.FiscalCloseEvidence_tenantId_fkey',
  'FiscalDocument.FiscalDocument_tenantId_fkey',
  'FiscalDocumentRuleSnapshot.FiscalDocumentRuleSnapshot_tenantId_fkey',
  'FiscalRuleVersion.FiscalRuleVersion_tenantId_fkey',
  'FiscalSequence.FiscalSequence_tenantId_fkey',
  'LedgerEntry.LedgerEntry_tenantId_fkey',
  'LedgerLine.LedgerLine_entryId_fkey',
  'LegalAcceptance.LegalAcceptance_tenantId_fkey',
  'LegalAcceptance.LegalAcceptance_userId_fkey',
  'TaxDeclaration.TaxDeclaration_periodId_fkey',
  'TaxPeriod.TaxPeriod_tenantId_fkey',
  'budgetwallet_audit_journal.budgetwallet_audit_journal_owner_id_fkey',
  'hipico_audit_events.hipico_audit_events_owner_id_fkey',
  'hipico_audit_events.hipico_audit_events_workspace_id_fkey',
].sort();

const EXPECTED_RETENTION_RISK = [
  'LegalAcceptance.LegalAcceptance_userId_fkey',
  'TaxDeclaration.TaxDeclaration_periodId_fkey',
  'budgetwallet_audit_journal.budgetwallet_audit_journal_owner_id_fkey',
  'hipico_audit_events.hipico_audit_events_owner_id_fkey',
  'hipico_audit_events.hipico_audit_events_workspace_id_fkey',
].sort();

const IMMUTABLE_EXTENSIONS = [
  'FinancialFxLedgerLineSnapshot',
  'FiscalDocumentRuleSnapshot',
  'FiscalRuleVersion',
  'LegalAcceptance',
  'TaxDeclaration',
  'TaxPeriod',
];

test('#685 inventory derives the exact historical CASCADE set and classifies every row', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.equal(manifest.schemaVersion, 685);
  assert.equal(manifest.derivedFromIssue, 633);

  const rows = manifest.cascades;
  assert.deepEqual(
    rows.map((row) => `${row.table}.${row.constraint}`).sort(),
    EXPECTED_CASCADE_KEYS,
  );

  const allowed = new Set([
    'INTENTIONAL_CHILD_CASCADE',
    'RETENTION_RISK',
    'PLATFORM_CLEANUP',
    'TENANT_DELETION_POLICY',
  ]);
  for (const row of rows) {
    assert.ok(allowed.has(row.classification), `${row.table}.${row.constraint} is unclassified`);
    assert.ok(row.retentionDecision?.length > 10, `${row.table}.${row.constraint} lacks retention decision`);
    assert.ok(row.recovery?.length > 10, `${row.table}.${row.constraint} lacks recovery semantics`);
  }

  assert.deepEqual(
    rows.filter((row) => row.classification === 'RETENTION_RISK')
      .map((row) => `${row.table}.${row.constraint}`).sort(),
    EXPECTED_RETENTION_RISK,
  );
});

test('#685 forward-only DDL rewrites only SQL-first audit FKs and extends immutable lifecycle authority', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);

  for (const constraint of [
    'budgetwallet_audit_journal_owner_id_fkey',
    'hipico_audit_events_owner_id_fkey',
    'hipico_audit_events_workspace_id_fkey',
  ]) {
    assert.match(sql, new RegExp(`DROP CONSTRAINT(?: IF EXISTS)? "?${constraint}"?`, 'i'));
    assert.match(sql, new RegExp(`CONSTRAINT "?${constraint}"?[\\s\\S]{0,260}ON DELETE RESTRICT`, 'i'));
  }

  assert.doesNotMatch(sql, /DROP CONSTRAINT "LegalAcceptance_userId_fkey"/i);
  assert.doesNotMatch(sql, /DROP CONSTRAINT "TaxDeclaration_periodId_fkey"/i);

  assert.match(sql, /'immutable'/i);
  for (const entity of IMMUTABLE_EXTENSIONS) {
    assert.match(sql, new RegExp(`'${entity}'`, 'i'));
  }

  assert.match(sql, /data_lifecycle_protected_delete_guard\(\)/);
  assert.match(sql, /data_lifecycle_tax_declaration_delete_guard\(\)/);
  assert.match(sql, /contagest\.lifecycle_authorized/);
  assert.match(sql, /data_lifecycle_assert_not_held/);
});
