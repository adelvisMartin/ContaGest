import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const configPath = 'frontend/public/hipico-control/assets/js/config.js';
const runtimeConfigPath = 'frontend/public/hipico-control/runtime-config.js';
const supabasePath = 'frontend/public/hipico-control/assets/js/supabase.js';
const migrationPath = 'backend/prisma/migrations/20260827220500_hipico_backend_authority/migration.sql';

test('production defaults fail closed and direct table fallback is LAB-only plus explicit opt-in', async () => {
  const [source, runtime] = await Promise.all([
    fs.readFile(configPath, 'utf8'), fs.readFile(runtimeConfigPath, 'utf8')
  ]);
  assert.match(source, /normalizeDeploymentMode\(runtime\.deploymentMode\)/);
  assert.match(source, /String\(value \|\| "production"\)/);
  assert.match(source, /CLOUD_CONFIG\.deploymentMode === "lab" && CLOUD_CONFIG\.allowLabDirectTableFallback === true/);
  assert.match(runtime, /"deploymentMode": "production"/);
  assert.match(runtime, /"allowLabDirectTableFallback": false/);
  assert.match(runtime, /"recentShadowRpc": "hipico_recent_shadow_evaluations"/);
});

test('privileged role never trusts user_metadata', async () => {
  const source = await fs.readFile(supabasePath, 'utf8');
  const start = source.indexOf('export function sessionRole');
  const end = source.indexOf('export function isAdminSession', start);
  assert.ok(start >= 0 && end > start);
  const roleBlock = source.slice(start, end);
  assert.match(roleBlock, /app_metadata/);
  assert.doesNotMatch(roleBlock, /user_metadata/);
  assert.match(roleBlock, /operator/);
});

test('missing sensitive RPC becomes a typed non-retryable production error', async () => {
  const source = await fs.readFile(supabasePath, 'utf8');
  assert.match(source, /class BackendAuthorityError/);
  assert.match(source, /HIPICO_RPC_REQUIRED/);
  assert.match(source, /retryable = false/);
  for (const capability of ['profile.read', 'workspace.read', 'workspace.write', 'audit.append', 'shadow.read_recent']) {
    assert.match(source, new RegExp(`requireRpcOrLabFallback\\(error, "${capability.replace('.', '\\.')}"\\)`));
  }
});

test('shadow history uses an authoritative RPC before any LAB fallback', async () => {
  const source = await fs.readFile(supabasePath, 'utf8');
  const start = source.indexOf('export async function fetchRecentShadowEvaluations');
  const end = source.indexOf('export async function saveCloudWorkspace', start);
  const block = source.slice(start, end);
  assert.ok(block.indexOf('recentShadowRpc') < block.indexOf('shadowTable'));
  assert.match(block, /requireRpcOrLabFallback/);
});

test('RLS hardening is forced and restrictive without embedding service-role credentials', async () => {
  const [migration, config, runtime, client] = await Promise.all([
    fs.readFile(migrationPath, 'utf8'), fs.readFile(configPath, 'utf8'), fs.readFile(runtimeConfigPath, 'utf8'), fs.readFile(supabasePath, 'utf8')
  ]);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /AS RESTRICTIVE/);
  assert.match(migration, /owner_id = auth\.uid\(\)/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
  assert.doesNotMatch(config + runtime + client, /SUPABASE_SERVICE_ROLE_KEY|service_role|sb_secret_/i);
});
