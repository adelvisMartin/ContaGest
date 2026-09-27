import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('issue #561 installs versioned fiscal rules, concurrent sequences and evidenced close', async () => {
  const [pkgText, migration, repository, routes, qa, workflow, adr] = await Promise.all([
    read('package.json'),
    read('backend/prisma/migrations/20260927143000_fiscal_authority_v561/migration.sql'),
    read('backend/src/modules/fiscal/fiscal.repository.ts'),
    read('backend/src/modules/fiscal/fiscal.routes.ts'),
    read('qa/fiscal-authority-v561.test.ts'),
    read('.github/workflows/fiscal-authority-v561.yml'),
    read('docs/ADR_FISCAL_AUTHORITY_V561.md')
  ]);

  const pkg = JSON.parse(pkgText);
  assert.equal(pkg.scripts['test:backend:fiscal:authority:real'], 'npm --workspace backend exec -- tsx --test ../qa/fiscal-authority-v561.test.ts');

  for (const token of ['FiscalRuleVersion', 'FiscalSequence', 'FiscalDocumentRuleSnapshot', 'FiscalCloseEvidence', 'effectiveFrom', 'effectiveTo', 'source', 'documentation', 'version']) {
    assert.match(migration, new RegExp(token, 'i'), `migration missing ${token}`);
  }
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/i);

  for (const token of ['Prisma.sql', 'allocateFiscalNumber', 'resolveFiscalRules', 'recordDocumentRuleSnapshots', 'buildCloseEvidence', 'tenantId']) {
    assert.match(repository, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `repository missing ${token}`);
  }
  assert.doesNotMatch(repository, /\$queryRawUnsafe|\$executeRawUnsafe/);

  for (const token of ['/rules', '/documents/issue', '/close-period', 'Idempotency-Key', 'runFinancialIdempotentMutation', 'assertFiscalClosePreconditions', 'postCloseHash']) {
    assert.ok(routes.includes(token), `fiscal routes missing ${token}`);
  }
  assert.match(routes, /fiscal\.reopen/);

  for (const token of ['concurrent', 'Promise.all', 'Idempotency-Key', 'closed', 'historical', 'tenant A', 'tenant B', 'GITHUB_SHA']) {
    assert.match(qa, new RegExp(token, 'i'), `real PostgreSQL regression missing ${token}`);
  }

  assert.match(workflow, /postgres:17-alpine/);
  assert.match(workflow, /test:backend:fiscal:authority:real/);
  assert.match(workflow, /upload-artifact@v7/);
  assert.match(workflow, /CANDIDATE_SHA/);
  assert.match(adr, /vigencia/i);
  assert.match(adr, /provenance/i);
  assert.match(adr, /concurrencia/i);
  assert.match(adr, /cierre/i);
});
