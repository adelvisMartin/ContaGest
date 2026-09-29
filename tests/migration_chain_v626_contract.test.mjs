import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('#626 exposes one local migration runner and versioned manifest', async () => {
  const [rootPackage, backendPackage, manifest, runner] = await Promise.all([
    read('package.json'),
    read('backend/package.json'),
    read('config/migration-chain-v626.json'),
    read('backend/scripts/migration-chain-v626.mjs')
  ]);
  assert.match(rootPackage, /"migration:test:from-zero"/);
  assert.match(rootPackage, /"migration:test:upgrade"/);
  assert.match(rootPackage, /"migration:manifest"/);
  assert.match(backendPackage, /migration-chain-v626\.mjs/);
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.version, 626);
  assert.ok(Array.isArray(parsed.supportedSnapshots) && parsed.supportedSnapshots.length >= 2);
  assert.ok(parsed.errorCatalog.includes('MIGRATION_TYPE_MISMATCH'));
  assert.match(runner, /FROM_ZERO_SCHEMA_MISMATCH/);
  assert.match(runner, /UPGRADE_DIVERGENCE/);
  assert.match(runner, /SNAPSHOT_PROVENANCE_INVALID/);
});

test('#626 canonical #562 migration matches Tenant TEXT authority without ephemeral projection', async () => {
  const [migration, deploy] = await Promise.all([
    read('backend/prisma/migrations/20260927152000_data_lifecycle_v562/migration.sql'),
    read('backend/scripts/prisma-deploy-safe.mjs')
  ]);
  assert.equal((migration.match(/"tenantId"\s+uuid\b/gi) ?? []).length, 0);
  assert.equal((migration.match(/"tenantId"\s+text\b/gi) ?? []).length, 5);
  assert.match(migration, /\bp_tenant\s+text\b/i);
  assert.doesNotMatch(deploy, /projectHistoricalCompatibility|inspectHistoricalCompatibility|reserving immutable historical migration/);
  assert.match(deploy, /prisma.*migrate.*deploy|migrate', 'deploy/s);
});

test('#626 workflow runs PostgreSQL 17 from-zero and supported upgrades', async () => {
  const workflow = await read('.github/workflows/migration-chain-v626.yml');
  assert.match(workflow, /postgres:17-alpine/);
  assert.match(workflow, /migration:test:from-zero/);
  assert.match(workflow, /migration:test:upgrade/);
  assert.match(workflow, /migration:manifest/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('#626 documents immutable deployed history and the audited exception for unapplied #562', async () => {
  const docs = await read('docs/database/MIGRATION_CHAIN_V626.md');
  assert.match(docs, /no reescribir|no se reescribe/i);
  assert.match(docs, /no desplegada|no aplicada/i);
  assert.match(docs, /#627/);
  assert.match(docs, /PostgreSQL 17/);
  assert.match(docs, /from-zero/i);
  assert.match(docs, /upgrade/i);
});
