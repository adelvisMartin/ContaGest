import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('#751 does not conceal overlapping rules or trust unchecked document snapshot data', async () => {
  const [repository, migration, qa, workflow] = await Promise.all([
    load('backend/src/modules/fiscal/fiscal.repository.ts'),
    load('backend/prisma/migrations/20261022153000_issue_751_fiscal_rule_snapshot_immutability/migration.sql'),
    load('qa/fiscal-authority-v561.test.ts'),
    load('.github/workflows/fiscal-authority-v561.yml'),
  ]);
  assert.equal(repository.includes('SELECT DISTINCT ON ("ruleKey")'), false);
  assert.ok(repository.includes('FISCAL_RULE_AMBIGUOUS'));
  assert.ok(repository.includes('assertFiscalRuleVersionIntegrity(rule, input.tenantId'));
  assert.ok(repository.includes('assertFiscalRuleSnapshotIntegrity(snapshot, tenantId)'));
  assert.ok(repository.includes('SELECT "tenantId", "ruleKey", "ruleVersion"'));
  assert.ok(migration.includes('BEFORE UPDATE OR DELETE ON public."FiscalDocumentRuleSnapshot"'));
  assert.ok(migration.includes("ERRCODE = '55000'"));
  assert.ok(qa.includes('FISCAL_RULE_SNAPSHOT_IMMUTABLE'));
  assert.ok(workflow.includes('fiscal_rule_snapshot_integrity_v751.test.mjs'));
});
