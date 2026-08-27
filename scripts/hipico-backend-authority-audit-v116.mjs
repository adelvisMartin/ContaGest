import fs from 'node:fs/promises';

const files = {
  config: 'frontend/public/hipico-control/assets/js/config.js',
  client: 'frontend/public/hipico-control/assets/js/supabase.js',
  migration: 'backend/prisma/migrations/20260827220500_hipico_backend_authority/migration.sql'
};
const read = async (name) => fs.readFile(files[name], 'utf8');
const [config, client, migration] = await Promise.all([read('config'), read('client'), read('migration')]);

const checks = [
  ['production-default', /String\(value \|\| "production"\)/.test(config)],
  ['lab-fallback-explicit', /deploymentMode === "lab" && CLOUD_CONFIG\.allowLabDirectTableFallback === true/.test(config)],
  ['typed-rpc-required', /HIPICO_RPC_REQUIRED/.test(client)],
  ['role-authoritative', (() => {
    const start = client.indexOf('export function sessionRole');
    const end = client.indexOf('export function isAdminSession', start);
    const block = client.slice(start, end);
    return block.includes('app_metadata') && !block.includes('user_metadata');
  })()],
  ['profile-fail-closed', /requireRpcOrLabFallback\(error, "profile\.read"\)/.test(client)],
  ['workspace-read-fail-closed', /requireRpcOrLabFallback\(error, "workspace\.read"\)/.test(client)],
  ['workspace-write-fail-closed', /requireRpcOrLabFallback\(error, "workspace\.write"\)/.test(client)],
  ['audit-fail-closed', /requireRpcOrLabFallback\(error, "audit\.append"\)/.test(client)],
  ['shadow-rpc-first', /recentShadowRpc/.test(client) && /shadow\.read_recent/.test(client)],
  ['force-rls', /FORCE ROW LEVEL SECURITY/.test(migration)],
  ['restrictive-owner-policy', /AS RESTRICTIVE/.test(migration) && /owner_id = auth\.uid\(\)/.test(migration)],
  ['no-service-role-client', !/SUPABASE_SERVICE_ROLE_KEY|service_role|sb_secret_/i.test(config + client)]
];

const failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
const report = {
  schemaVersion: 1,
  ticket: 116,
  status: failures.length ? 'FAIL' : 'PASS',
  checks: Object.fromEntries(checks),
  failures
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
