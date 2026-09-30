import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FINDING, analyzeTable } from '../scripts/relational-normalization-audit-v633.mjs';

const migrationUrl = new URL(
  '../backend/prisma/migrations/20260930160000_issue_684_budgetwallet_owner_fk_indexes/migration.sql',
  import.meta.url,
);

const policy = {
  expectedPublicTableCount: 1,
  ownershipRules: [{ pattern: '^budgetwallet_', owner: 'budgetwallet' }],
  externalIdColumns: [],
  p1Remediation: { INDEX_GAP: 684 },
  cascadeRiskTablePatterns: [],
  naturalKeyColumns: [],
};

function budgetWalletTable(table, indexes = []) {
  return {
    schema: 'public',
    table,
    columns: [
      { name: 'id', type: 'uuid', nullable: false, default: null },
      { name: 'owner_id', type: 'uuid', nullable: false, default: null },
    ],
    primaryKey: ['id'],
    foreignKeys: [{
      name: `${table}_owner_id_fkey`,
      columns: ['owner_id'],
      referencedTable: 'users',
      referencedColumns: ['id'],
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    }],
    uniqueConstraints: [],
    checks: [],
    indexes,
  };
}

test('#633 classifies both BudgetWallet owner FKs as INDEX_GAP before remediation', () => {
  for (const table of ['budgetwallet_purchase_events', 'budgetwallet_security_events']) {
    const result = analyzeTable(budgetWalletTable(table), policy);
    const finding = result.findings.find((row) => row.category === FINDING.INDEX_GAP);
    assert.equal(finding?.severity, 'P1');
    assert.equal(finding?.remediationIssue, 684);
  }
});

test('owner_id-leading indexes close the #633 INDEX_GAP without requiring uniqueness', () => {
  for (const table of ['budgetwallet_purchase_events', 'budgetwallet_security_events']) {
    const result = analyzeTable(budgetWalletTable(table, [{
      name: `${table}_owner_id_idx`,
      columns: ['owner_id'],
      unique: false,
      valid: true,
    }]), policy);
    assert.equal(result.findings.some((row) => row.category === FINDING.INDEX_GAP), false);
  }
});

test('a non-leading owner_id index remains an INDEX_GAP', () => {
  const result = analyzeTable(budgetWalletTable('budgetwallet_purchase_events', [{
    name: 'wrong_prefix_idx',
    columns: ['purchase_token_hash', 'owner_id'],
    unique: false,
    valid: true,
  }]), policy);
  assert.equal(result.findings.some((row) => row.category === FINDING.INDEX_GAP), true);
});

test('migration is forward-only, exact-scope and guards equivalent leading indexes', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  assert.match(sql, /to_regclass\('public\.budgetwallet_purchase_events'\)/);
  assert.match(sql, /to_regclass\('public\.budgetwallet_security_events'\)/);
  assert.match(sql, /key\.ord\s*=\s*1/);
  assert.match(sql, /a\.attname\s*=\s*'owner_id'/);
  assert.match(sql, /i\.indisvalid/);
  assert.match(sql, /i\.indisready/);
  assert.match(sql, /i\.indpred\s+IS\s+NULL/);
  assert.match(sql, /CREATE INDEX budgetwallet_purchase_events_owner_id_idx\s+ON public\.budgetwallet_purchase_events \(owner_id\)/i);
  assert.match(sql, /CREATE INDEX budgetwallet_security_events_owner_id_idx\s+ON public\.budgetwallet_security_events \(owner_id\)/i);

  const createIndexes = sql.match(/\bCREATE INDEX\b/gi) ?? [];
  assert.equal(createIndexes.length, 2);
});
