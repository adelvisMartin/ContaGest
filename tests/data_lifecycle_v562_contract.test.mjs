import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('issue #562 installs a tenant-safe lifecycle authority with legal holds and idempotent purge', async () => {
  const [repository, routes, qa, adr, manifest] = await Promise.all([
    read('backend/src/modules/data-lifecycle/data-lifecycle.repository.ts'),
    read('backend/src/modules/data-lifecycle/data-lifecycle.routes.ts'),
    read('qa/data-lifecycle-v562.test.ts'),
    read('docs/ADR_DATA_LIFECYCLE_V562.md'),
    read('backend/src/modules/route-manifest.ts')
  ]);

  for (const token of ['RETENTION_MATRIX', 'immutable', 'soft-delete', 'purgeable', 'legalHold', 'tenantId', 'Idempotency-Key']) {
    assert.match(`${repository}\n${routes}`, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `lifecycle implementation missing ${token}`);
  }
  assert.doesNotMatch(repository, /\$queryRawUnsafe|\$executeRawUnsafe/);
  assert.doesNotMatch(repository, /DELETE\s+FROM\s+public\.\"(LedgerEntry|LedgerLine|AuditLog|FiscalDocument|FiscalCloseEvidence)\"/i);

  for (const token of ['legal hold', 'tenant A', 'tenant B', 'retry', 'immutable', 'purge', 'GITHUB_SHA']) {
    assert.match(qa, new RegExp(token, 'i'), `PostgreSQL regression missing ${token}`);
  }

  assert.match(manifest, /data-lifecycle/);
  assert.match(adr, /forward-only/i);
  assert.match(adr, /evidence/i);
  assert.match(adr, /storage/i);
  assert.match(adr, /tenant/i);
});
