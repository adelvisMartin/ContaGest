import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('ops/release/production-config-v566.json', 'utf8'));
const preflight = fs.readFileSync('scripts/production-config-preflight-v566.mjs', 'utf8');
const artifact = fs.readFileSync('scripts/release-artifact-manifest-v566.mjs', 'utf8');
const smoke = fs.readFileSync('scripts/production-smoke-v566.mjs', 'utf8');
const authSmoke = fs.readFileSync('scripts/production-auth-smoke-v566.ts', 'utf8');
const migration = fs.readFileSync('scripts/migration-state-v566.mjs', 'utf8');
const health = fs.readFileSync('backend/src/shared/observability/health.ts', 'utf8');
const workflow = fs.readFileSync('.github/workflows/production-ops-v566.yml', 'utf8');
const runbook = fs.readFileSync('docs/RUNBOOK_PRODUCTION_V566.md', 'utf8');

test('#566 versioned environment contract separates runtime and migration credentials', () => {
  assert.equal(config.parity.productionRuntimeDatabaseVariable, 'DATABASE_RUNTIME_URL');
  assert.equal(config.parity.migrationDatabaseVariable, 'DIRECT_DATABASE_URL');
  assert.ok(config.environments.production.requiredSecret.includes('JWT_SECRET'));
  assert.ok(config.environments.production.requiredSecret.includes('LICENSE_HASH_SECRET'));
  assert.ok(config.environments.test.requiredSecret.includes('DATABASE_URL'));
  assert.match(preflight, /INVALID_OR_MISSING/);
  assert.doesNotMatch(preflight, /console\.log\([^\n]*process\.env\[/);
});

test('#566 exact SHA is carried by artifacts, health and both smoke modes', () => {
  assert.match(artifact, /candidateSha/);
  assert.match(artifact, /sha256/);
  assert.match(health, /buildCommit/);
  assert.match(smoke, /buildCommit === expectedSha/);
  assert.match(authSmoke, /\/api\/v1\/health\/db/);
  assert.match(authSmoke, /tokenPersisted: false/);
});

test('#566 migration promotion is fail-closed and deployment workflow has isolated restore/app rollback drills', () => {
  assert.match(migration, /finished_at IS NULL/);
  assert.match(migration, /duplicates/);
  assert.match(workflow, /prisma:deploy/);
  assert.match(workflow, /migration-state-v566\.mjs/);
  assert.match(workflow, /contagest_recovery_v566/);
  assert.match(workflow, /pg_dump/);
  assert.match(workflow, /pg_restore/);
  assert.match(workflow, /restore-count/);
  assert.match(workflow, /git worktree add/);
  assert.match(workflow, /rollback-parent-health\.json/);
});

test('#566 runbook documents forward-only DB recovery, app rollback, rotation and provider outage', () => {
  assert.match(runbook, /forward-only/i);
  assert.match(runbook, /rollback de aplicación/i);
  assert.match(runbook, /rotación de secretos/i);
  assert.match(runbook, /provider outage/i);
  assert.match(runbook, /expand.*migrate.*contract/is);
});
