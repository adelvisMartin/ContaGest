import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const workflow = read('.github/workflows/hipico-domain-snapshot-pg17.yml');
const localRunner = read('scripts/hipico-domain-snapshot-pg17-local.ps1');
const migrationPath =
  'backend/prisma/migrations/20261119144500_hipico_domain_recorded_order_index/migration.sql';
const migration = read(migrationPath);
const query = read('backend/src/modules/hipico-bot/hipico-domain-query.store.ts');
const writer = read('backend/src/modules/hipico-bot/hipico-domain-event.store.ts');
const integration = read('backend/src/modules/hipico-bot/hipico-domain-query.pg17.integration.ts');
const canonicalRoutes = read('backend/src/modules/hipico-bot/hipico-canonical.routes.ts');
const canonicalRouteTests = read('backend/src/modules/hipico-bot/hipico-canonical.routes.test.ts');

test('PG17 auth.uid test fixture uses complete dollar quoting; malformed $ cannot ship', () => {
  const validBody = /CREATE OR REPLACE FUNCTION auth\.uid\(\) RETURNS uuid\s+LANGUAGE sql STABLE AS \$\$[\s\S]+?\$\$;/;
  assert.match(workflow, validBody);
  assert.match(localRunner, validBody);
  assert.doesNotMatch(workflow, /LANGUAGE sql STABLE AS \$\n/);
  assert.match(workflow, /GRANT USAGE ON SCHEMA auth TO authenticated/);
  assert.match(workflow, /GRANT SELECT ON public\.hipico_domain_aggregates,[\s\S]+?TO authenticated/);
});

test('recorded-at index matches exact canonical scope/order without write-blocking migration', () => {
  assert.match(query, /owner_id=\$\{ownerId\}::uuid/);
  assert.match(query, /group_key=\$\{groupKey\}/);
  assert.match(query, /aggregate_kind=\$\{input\.aggregateKind\}/);
  assert.match(query, /aggregate_key=\$\{aggregateKey\}/);
  assert.match(query, /ORDER BY created_at DESC,id DESC/);
  assert.match(migration, /CREATE INDEX CONCURRENTLY IF NOT EXISTS hipico_domain_events_recorded_order_v837/);
  assert.match(migration, /\(owner_id, group_key, aggregate_kind, aggregate_key, created_at DESC, id DESC\)/);
  assert.doesNotMatch(migration, /^(?:BEGIN|COMMIT)\s*;/mi);
  assert.match(migration, /HIPICO_DOMAIN_RECORDED_ORDER_INDEX_NOT_READY/);
  assert.match(migration, /i\.indisvalid AND i\.indisready/);
  assert.ok(workflow.includes(migrationPath));
  assert.ok(localRunner.includes(migrationPath));
  // Both runners must exercise a real nonempty upgrade, not just indexing an empty table.
  assert.ok(workflow.indexOf('Seed pre-index existing canonical row') <
    workflow.indexOf('Upgrade schema with nonblocking recorded-order index'));
  assert.ok(localRunner.indexOf('pre-index canonical upgrade fixture') <
    localRunner.indexOf('apply nonblocking index to existing canonical events'));
  assert.match(workflow, /pg17-upgrade-event-v837/);
  assert.match(localRunner, /pg17-upgrade-event-v837/);
});

test('PG17 QA executes only with ephemeral database and cleans up even on failure', () => {
  assert.match(workflow, /postgres:17-alpine/);
  assert.match(workflow, /HIPICO_E2E_ADMIN_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/postgres/);
  assert.match(workflow, /name: Drop ephemeral database even after failure\s+if: always\(\)/);
  assert.match(localRunner, /finally\s*\{/);
  assert.match(localRunner, /down --volumes --remove-orphans/);
  assert.match(read('ops/qa/hipico-domain-snapshot-pg17.compose.yml'), /host_ip: 127\.0\.0\.1/);
  assert.match(integration, /PG17 synthetic QA refuses DATABASE_RUNTIME_URL overrides/);
  assert.match(integration, /SET LOCAL ROLE authenticated/);
  assert.match(integration, /await denied\('anon', 'read'\)/);
  assert.match(integration, /await denied\('authenticated', 'write'\)/);
  assert.match(integration, /dbError\.meta\?\.code, '42501'/);
  assert.match(integration, /backdated correction recorded after a result cannot be hidden from LAB/);
  assert.match(integration, /index upgrade preserves existing append-only evidence/);
  assert.match(integration, /read and write reject unsafe BIGINT optimistic versions/);
});

test('Windows QA refuses stale or unverified PR SHA instead of certifying old commits', () => {
  assert.match(localRunner, /\[Parameter\(Mandatory = \$true\)\]/);
  assert.match(localRunner, /\[string\]\$CandidateSha/);
  assert.match(localRunner, /git ls-remote --heads origin \$remoteRef/);
  assert.match(localRunner, /\$headSha -ne \$expectedSha -or \$remoteSha -ne \$expectedSha/);
  assert.match(localRunner, /\$remoteShaAfter -ne \$expectedSha/);
  assert.match(localRunner, /Wrong branch for #837 QA/);
  assert.match(read('docs/hipico/QA_CANONICAL_SNAPSHOT_PG17_837.md'), /-CandidateSha \$prHead/);
});

test('canonical API reports permanent version failures without unsafe retries', () => {
  assert.match(canonicalRoutes, /HIPICO_DOMAIN_STATE_VERSION_EXHAUSTED/);
  assert.match(canonicalRoutes, /HIPICO_DOMAIN_STATE_VERSION_UNSAFE/);
  const calls = canonicalRoutes.match(/canonicalPermanentVersionResponse\(error\)/g) || [];
  assert.equal(calls.length, 2, 'Both read and write must classify permanent version errors');
  assert.match(canonicalRoutes, /status:409,body:\{ok:false,retryable:false,error:message\}/);
  assert.match(canonicalRouteTests, /unsafe or exhausted domain versions are nonretryable conflicts/);
});

test('canonical writer takes aggregate lock then timestamps committed evidence', () => {
  const locked = writer.indexOf('FOR UPDATE');
  const insert = writer.indexOf('INSERT INTO public.hipico_domain_events');
  assert.ok(locked >= 0 && insert > locked);
  assert.match(writer.slice(insert), /event_timestamp,operator_confirmed,confirmation_reason,created_at/);
  assert.match(writer.slice(insert), /clock_timestamp\(\)/);
  const safeVersionGuard = writer.indexOf('HIPICO_DOMAIN_STATE_VERSION_EXHAUSTED');
  assert.ok(safeVersionGuard > locked && safeVersionGuard < insert,
    'Version exhaustion must fail before an event is appended');
  assert.match(writer.slice(locked, insert), /current\.stateVersion>=Number\.MAX_SAFE_INTEGER/);
  assert.match(integration, /cannot apply a transition beyond MAX_SAFE_INTEGER or append evidence/);
  assert.match(integration, /A rejected transition must not leave append-only evidence behind/);
  assert.match(integration, /Aggregate updatedAt must not predate the applied result event/);
  assert.match(writer.slice(insert), /updated_at=clock_timestamp\(\)/);
  assert.doesNotMatch(writer.slice(insert), /updated_at=now\(\)/);
  assert.match(integration, /persistHipicoDomainEvent\(\{/);
  assert.match(integration, /assert\.equal\(beforeCorrection\.available, true\)/);
  assert.match(integration, /assert\.equal\(published\.available, false\)/);
});
