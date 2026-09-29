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

test('#626 keeps historical #562 immutable and projects only ephemeral TEXT compatibility', async () => {
  const [legacy, deploy, projector] = await Promise.all([
    read('backend/prisma/migrations/20260927152000_data_lifecycle_v562/migration.sql'),
    read('backend/scripts/prisma-deploy-safe.mjs'),
    read('backend/scripts/migration-compat-v626.mjs')
  ]);
  assert.match(legacy, /"tenantId" uuid REFERENCES public\."Tenant"\("id"\)/);
  assert.match(deploy, /isEphemeralDatabase/);
  assert.match(deploy, /projectHistoricalCompatibility/);
  assert.match(projector, /20260927152000_data_lifecycle_v562/);
  assert.match(projector, /MIGRATION_TYPE_MISMATCH/);
  assert.match(projector, /"tenantId"\\s\+uuid/g);
  assert.match(projector, /p_tenant\\w\*\\s\+uuid/);
  assert.match(projector, /BEGIN/);
  assert.match(projector, /ROLLBACK/);
});

test('#626 workflow runs PostgreSQL 17 from-zero and supported upgrades', async () => {
  const workflow = await read('.github/workflows/migration-chain-v626.yml');
  assert.match(workflow, /postgres:17-alpine/);
  assert.match(workflow, /migration:test:from-zero/);
  assert.match(workflow, /migration:test:upgrade/);
  assert.match(workflow, /migration:manifest/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('#626 documents immutable history and production separation', async () => {
  const docs = await read('docs/database/MIGRATION_CHAIN_V626.md');
  assert.match(docs, /no reescribir|no se reescribe/i);
  assert.match(docs, /#627/);
  assert.match(docs, /PostgreSQL 17/);
  assert.match(docs, /from-zero/i);
  assert.match(docs, /upgrade/i);
});
